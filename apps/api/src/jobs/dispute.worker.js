import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { pool } from '../config/database.js';
import stripe from '../config/stripe.js';
import { v7 as uuidv7 } from 'uuid';
import { DisputeStatus, PaymentStatus, EventNames } from '@auction/shared-constants';
import { emitToUser, emitToAdmin } from '../services/socket.service.js';
import { schedulePayoutJob } from './queue.js';

const connection = new IORedis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

/**
 * Write an immutable financial audit log entry.
 */
const writeAuditLog = async ({ referenceId, referenceType, action, deltaState, actorId, ipAddress }, client) => {
  const queryFn = client || pool;
  await queryFn.query(
    `INSERT INTO financial_audit_logs (id, reference_id, reference_type, action, delta_state, actor_id, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [uuidv7(), referenceId, referenceType, action, JSON.stringify(deltaState), actorId, ipAddress || null]
  );
};

const expireDispute = async (disputeInfo) => {
  console.log(`[DisputeWorker] Expiring dispute: ${disputeInfo.id}`);
  
  let payment;
  let originalPaymentStatus;

  const client1 = await pool.connect();
  try {
    await client1.query('BEGIN');
    
    // DB Lock
    const res = await client1.query(
      `SELECT d.*, p.status as p_status, p.stripe_pi_id, p.buyer_id, p.seller_id, p.amount, p.id as p_id
       FROM disputes d
       JOIN payments p ON d.payment_id = p.id
       WHERE d.id = $1 FOR UPDATE OF d`,
      [disputeInfo.id]
    );

    if (res.rowCount === 0) {
      await client1.query('ROLLBACK');
      return;
    }

    const row = res.rows[0];
    payment = {
      id: row.p_id,
      status: row.p_status,
      stripe_pi_id: row.stripe_pi_id,
      buyer_id: row.buyer_id,
      seller_id: row.seller_id,
      amount: row.amount
    };
    originalPaymentStatus = payment.status;

    if (row.status !== DisputeStatus.OPEN && row.status !== DisputeStatus.UNDER_REVIEW) {
      await client1.query('ROLLBACK');
      return;
    }

    if (payment.status === PaymentStatus.FROZEN) {
      const updateRes = await client1.query(
        `UPDATE payments SET status = $1, updated_at = NOW() WHERE id = $2 AND status = $3 RETURNING id`,
        [PaymentStatus.CAPTURE_PENDING, payment.id, PaymentStatus.FROZEN]
      );
      if (updateRes.rowCount === 0) {
        await client1.query('ROLLBACK');
        return;
      }
    }

    await client1.query('COMMIT');
  } catch (err) {
    await client1.query('ROLLBACK');
    throw err;
  } finally {
    client1.release();
  }

  // Stripe Capture if needed
  if (originalPaymentStatus === PaymentStatus.FROZEN) {
    try {
      await stripe.paymentIntents.capture(payment.stripe_pi_id);
    } catch (stripeErr) {
      console.error(`[DisputeWorker] Stripe capture failed for dispute expiry ${disputeInfo.id}:`, stripeErr.message);
      throw stripeErr;
    }
  }

  // DB Confirm
  const client2 = await pool.connect();
  try {
    await client2.query('BEGIN');

    const lockRes = await client2.query(
      `SELECT d.status as d_status, p.status as p_status 
       FROM disputes d
       JOIN payments p ON d.payment_id = p.id
       WHERE d.id = $1 FOR UPDATE OF d, p`,
      [disputeInfo.id]
    );

    if (lockRes.rowCount === 0) {
      await client2.query('ROLLBACK');
      return;
    }

    const { d_status, p_status } = lockRes.rows[0];

    if (d_status !== DisputeStatus.OPEN && d_status !== DisputeStatus.UNDER_REVIEW) {
      await client2.query('ROLLBACK');
      return;
    }

    if (originalPaymentStatus !== PaymentStatus.FROZEN) {
      if (p_status === PaymentStatus.CAPTURE_PENDING) {
        await client2.query('ROLLBACK');
        throw new Error(`Payment ${payment.id} is stuck in capture_pending. Aborting dispute expiry so sweeper can retry.`);
      }
      if (p_status !== PaymentStatus.CAPTURED) {
        await client2.query('ROLLBACK');
        throw new Error(`Payment ${payment.id} is not CAPTURED (status: ${p_status}). Aborting dispute expiry.`);
      }
    }

    await client2.query(
      `UPDATE disputes SET 
        status = $1, 
        resolved_at = NOW(),
        updated_at = NOW()
       WHERE id = $2`,
      [DisputeStatus.EXPIRED, disputeInfo.id]
    );

    if (originalPaymentStatus === PaymentStatus.FROZEN) {
      await client2.query(
        `UPDATE payments SET status = $1, updated_at = NOW() WHERE id = $2`,
        [PaymentStatus.CAPTURED, payment.id]
      );
    }

    await client2.query(
      `UPDATE auctions SET status = 'completed', delivered_at = COALESCE(delivered_at, NOW()), updated_at = NOW() WHERE id = $1`,
      [disputeInfo.auction_id]
    );

    await writeAuditLog({
      referenceId: disputeInfo.id,
      referenceType: 'dispute',
      action: 'dispute_expired_auto_resolve',
      deltaState: { 
        status: DisputeStatus.EXPIRED,
        payment_id: payment.id
      },
      actorId: null
    }, client2);

    const payloadStr = JSON.stringify({ status: DisputeStatus.EXPIRED, message: 'Dispute expired automatically' });
    await client2.query(
      `INSERT INTO notifications (id, user_id, type, reference_id, reference_type, payload)
       VALUES ($1, $2, $3, $4, $5, $6), ($7, $8, $9, $10, $11, $12)`,
      [
        uuidv7(), payment.buyer_id, 'dispute', disputeInfo.id, 'dispute', payloadStr,
        uuidv7(), payment.seller_id, 'dispute', disputeInfo.id, 'dispute', payloadStr
      ]
    );

    await client2.query('COMMIT');
  } catch (err) {
    await client2.query('ROLLBACK');
    throw err;
  } finally {
    client2.release();
  }

  // Side effects
  try {
    await schedulePayoutJob(payment.id, disputeInfo.auction_id);
    
    emitToAdmin('dispute:expired', {
      disputeId: disputeInfo.id,
      auctionId: disputeInfo.auction_id,
    });

    emitToUser(payment.buyer_id, EventNames.DISPUTE_UPDATED, {
      disputeId: disputeInfo.id,
      status: DisputeStatus.EXPIRED,
      message: 'Dispute has expired and was automatically resolved in favor of the seller.'
    });
    
    emitToUser(payment.seller_id, EventNames.DISPUTE_UPDATED, {
      disputeId: disputeInfo.id,
      status: DisputeStatus.EXPIRED,
      message: 'Dispute has expired and was automatically resolved in your favor.'
    });
  } catch (err) {
    console.error(`[DisputeWorker] Side effects failed for expiry of dispute ${disputeInfo.id}`, err);
  }
};

const processDisputeExpirySweeper = async () => {
  console.log('[DisputeWorker] Running dispute expiry sweeper...');
  const res = await pool.query(
    `SELECT id, auction_id 
     FROM disputes 
     WHERE status IN ($1, $2) AND deadline_at < NOW()`,
    [DisputeStatus.OPEN, DisputeStatus.UNDER_REVIEW]
  );

  for (const row of res.rows) {
    try {
      await expireDispute(row);
    } catch (err) {
      console.error(`[DisputeWorker] Failed to expire dispute ${row.id}:`, err);
    }
  }
};

export const disputeWorker = new Worker('dispute', async (job) => {
  if (job.name === 'dispute-expiry-sweeper') {
    await processDisputeExpirySweeper();
  }
}, { connection });

disputeWorker.on('completed', (job) => {
  if (job.name !== 'dispute-expiry-sweeper') {
    console.log(`[DisputeWorker] Job ${job.id} (${job.name}) completed successfully.`);
  }
});

disputeWorker.on('failed', (job, err) => {
  console.error(`[DisputeWorker] Job ${job?.id} (${job?.name}) failed:`, err);
});

console.log('[DisputeWorker] Started and listening to dispute queue');
