import { pool } from '../config/database.js';
import { v7 as uuidv7 } from 'uuid';
import { EventNames, DisputeStatus, PaymentStatus } from '@auction/shared-constants';
import { emitToUser } from './socket.service.js';
import { validateDisputeCooldown } from '../utils/dispute-cooldown.js';
import { removeDeliveryJobs, rescheduleDeliveryJobs, schedulePayoutJob } from '../jobs/queue.js';
import stripe from '../config/stripe.js';

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

export const openDispute = async ({ buyerId, paymentId, reason, description, evidenceUrls }) => {
  const client = await pool.connect();
  let createdDispute;
  let auctionId;

  try {
    await client.query('BEGIN');

    // 1. Fetch payment and auction
    const paymentRes = await client.query(
      `SELECT p.id, p.buyer_id, p.status as payment_status, 
              a.id as auction_id, a.shipped_at 
       FROM payments p
       JOIN auctions a ON p.auction_id = a.id
       WHERE p.id = $1 FOR UPDATE`,
      [paymentId]
    );

    if (paymentRes.rowCount === 0) {
      const err = new Error('Payment not found');
      err.statusCode = 404;
      throw err;
    }

    const payment = paymentRes.rows[0];
    auctionId = payment.auction_id;

    // 2. Validate ownership and state
    if (payment.buyer_id !== buyerId) {
      const err = new Error('Unauthorized');
      err.statusCode = 403;
      throw err;
    }

    if (payment.payment_status !== PaymentStatus.AUTHORIZED) {
      const err = new Error('Payment is not in a valid state to open a dispute. Disputes are only allowed during Escrow (Authorized).');
      err.statusCode = 422;
      err.errorCode = 'INVALID_PAYMENT_STATE';
      throw err;
    }

    // 3. Cooldown check
    const cooldown = validateDisputeCooldown(reason, payment.shipped_at);
    if (!cooldown.allowed) {
      const err = new Error('Dispute cooldown period has not elapsed');
      err.statusCode = 403;
      err.errorCode = 'DISPUTE_COOLDOWN';
      err.details = { canOpenAt: cooldown.canOpenAt };
      throw err;
    }

    // 4. Create dispute (relies on idx_disputes_one_per_payment to prevent duplicates)
    try {
      const disputeRes = await client.query(
        `INSERT INTO disputes (
           id, payment_id, auction_id, opened_by, reason, description, evidence_urls, status, deadline_at, seller_evidence_deadline_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW() + INTERVAL '7 days', NOW() + INTERVAL '72 hours')
         RETURNING *`,
        [uuidv7(), paymentId, auctionId, buyerId, reason, description, evidenceUrls || [], DisputeStatus.OPEN]
      );
      createdDispute = disputeRes.rows[0];
    } catch (dbErr) {
      if (dbErr.code === '23505') { // unique violation
        const err = new Error('A dispute already exists for this payment');
        err.statusCode = 409;
        throw err;
      }
      throw dbErr;
    }

    // 5. Freeze payment
    await client.query(
      `UPDATE payments SET status = $1, updated_at = NOW() WHERE id = $2`,
      [PaymentStatus.FROZEN, paymentId]
    );

    // 6. Audit log
    await writeAuditLog({
      referenceId: createdDispute.id,
      referenceType: 'dispute',
      action: 'dispute_opened',
      deltaState: { reason, status: DisputeStatus.OPEN },
      actorId: buyerId,
    }, client);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // Side effects (fire-and-forget, do not fail the API request)
  try {
    await removeDeliveryJobs(auctionId);
    emitToUser(buyerId, EventNames.DISPUTE_OPENED, { disputeId: createdDispute.id });
    // Emit to seller/admin...
  } catch (sideErr) {
    console.error('Failed to execute side effects for openDispute:', sideErr);
  }
  
  return {
    id: createdDispute.id,
    status: createdDispute.status,
    reason: createdDispute.reason,
    deadlineAt: createdDispute.deadline_at,
  };
};

export const getDisputeById = async ({ disputeId, userId, userRole }) => {
  const res = await pool.query(
    `SELECT d.*, 
            p.buyer_id, p.seller_id,
            a.title as auction_title,
            u.display_name as opened_by_name
     FROM disputes d
     JOIN payments p ON d.payment_id = p.id
     JOIN auctions a ON d.auction_id = a.id
     JOIN users u ON d.opened_by = u.id
     WHERE d.id = $1`,
    [disputeId]
  );

  if (res.rowCount === 0) {
    const err = new Error('Dispute not found');
    err.statusCode = 404;
    throw err;
  }

  const dispute = res.rows[0];

  // Ownership guard
  if (userRole !== 'admin' && userId !== dispute.buyer_id && userId !== dispute.seller_id) {
    const err = new Error('Unauthorized');
    err.statusCode = 403;
    throw err;
  }

  return {
    id: dispute.id,
    auctionId: dispute.auction_id,
    auctionTitle: dispute.auction_title,
    paymentId: dispute.payment_id,
    openedBy: { id: dispute.opened_by, displayName: dispute.opened_by_name },
    reason: dispute.reason,
    description: dispute.description,
    evidenceUrls: dispute.evidence_urls,
    status: dispute.status,
    resolutionNote: dispute.resolution_note,
    policyRule: dispute.policy_rule,
    deadlineAt: dispute.deadline_at,
    createdAt: dispute.created_at,
  };
};

export const addEvidence = async ({ disputeId, userId, evidenceUrls }) => {
  const client = await pool.connect();
  let updatedEvidence;

  try {
    await client.query('BEGIN');

    const res = await client.query(
      `SELECT d.id, d.status, d.evidence_urls, p.buyer_id, p.seller_id 
       FROM disputes d
       JOIN payments p ON d.payment_id = p.id
       WHERE d.id = $1 FOR UPDATE`,
      [disputeId]
    );

    if (res.rowCount === 0) {
      const err = new Error('Dispute not found');
      err.statusCode = 404;
      throw err;
    }

    const dispute = res.rows[0];

    // Ownership & state guards
    if (userId !== dispute.buyer_id && userId !== dispute.seller_id) {
      const err = new Error('Unauthorized');
      err.statusCode = 403;
      throw err;
    }

    if (![DisputeStatus.OPEN, DisputeStatus.UNDER_REVIEW].includes(dispute.status)) {
      const err = new Error('Cannot add evidence to a resolved or closed dispute');
      err.statusCode = 422;
      throw err;
    }

    // Limit array size to 10
    const currentUrls = dispute.evidence_urls || [];
    if (currentUrls.length + evidenceUrls.length > 10) {
      const err = new Error('Cannot exceed maximum of 10 evidence URLs per dispute');
      err.statusCode = 400;
      throw err;
    }

    const updateRes = await client.query(
      `UPDATE disputes 
       SET evidence_urls = array_cat(evidence_urls, $1), updated_at = NOW() 
       WHERE id = $2 
       RETURNING evidence_urls`,
      [evidenceUrls, disputeId]
    );
    
    updatedEvidence = updateRes.rows[0].evidence_urls;
    
    await writeAuditLog({
      referenceId: disputeId,
      referenceType: 'dispute',
      action: 'dispute_evidence_added',
      deltaState: { added: evidenceUrls },
      actorId: userId,
    }, client);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return { evidenceUrls: updatedEvidence };
};

export const withdrawDispute = async ({ disputeId, buyerId }) => {
  const client = await pool.connect();
  let auctionId;
  let originalShippedAt;
  let newDeadlineAt;

  try {
    await client.query('BEGIN');

    const res = await client.query(
      `SELECT d.id, d.status, d.payment_id, d.auction_id, p.buyer_id, a.shipped_at, a.delivery_deadline_at
       FROM disputes d
       JOIN payments p ON d.payment_id = p.id
       JOIN auctions a ON d.auction_id = a.id
       WHERE d.id = $1 FOR UPDATE`,
      [disputeId]
    );

    if (res.rowCount === 0) {
      const err = new Error('Dispute not found');
      err.statusCode = 404;
      throw err;
    }

    const dispute = res.rows[0];
    auctionId = dispute.auction_id;
    originalShippedAt = dispute.shipped_at;

    // Ownership & state guards
    if (dispute.buyer_id !== buyerId) {
      const err = new Error('Unauthorized');
      err.statusCode = 403;
      throw err;
    }

    if (dispute.status !== DisputeStatus.OPEN) {
      const err = new Error('Dispute cannot be withdrawn in its current state');
      err.statusCode = 422;
      throw err;
    }

    // 1. Withdraw dispute
    await client.query(
      `UPDATE disputes SET status = $1, updated_at = NOW() WHERE id = $2`,
      [DisputeStatus.WITHDRAWN, disputeId]
    );

    // 2. Unfreeze payment (revert to authorized)
    // Assert: Payment was AUTHORIZED before dispute (we enforce this in openDispute).
    // Once payout (captured) happens, the escrow lifecycle ends.
    await client.query(
      `UPDATE payments SET status = $1, updated_at = NOW() WHERE id = $2`,
      [PaymentStatus.AUTHORIZED, dispute.payment_id]
    );

    // 3. Reschedule auto-confirm with 24h buffer if overdue
    const now = Date.now();
    let currentDeadline = new Date(dispute.delivery_deadline_at);
    
    if (currentDeadline.getTime() <= now) {
      currentDeadline = new Date(now + 24 * 60 * 60 * 1000); // 24h buffer
      await client.query(
        `UPDATE auctions SET delivery_deadline_at = $1 WHERE id = $2`,
        [currentDeadline, auctionId]
      );
    }
    newDeadlineAt = currentDeadline;

    await writeAuditLog({
      referenceId: disputeId,
      referenceType: 'dispute',
      action: 'dispute_withdrawn',
      deltaState: { status: DisputeStatus.WITHDRAWN },
      actorId: buyerId,
    }, client);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // Reschedule BullMQ Jobs
  try {
    await rescheduleDeliveryJobs(auctionId, newDeadlineAt, originalShippedAt);
    emitToUser(buyerId, EventNames.DISPUTE_WITHDRAWN, { disputeId });
  } catch (sideErr) {
    console.error('Failed to execute side effects for withdrawDispute:', sideErr);
  }

  return { success: true };
};

/**
 * Admin starts reviewing a dispute
 */
export const reviewDispute = async ({ disputeId, adminId }) => {
  const client = await pool.connect();
  let updatedDispute;
  let dispute;

  try {
    await client.query('BEGIN');

    const res = await client.query(
      `SELECT d.id, d.status, p.buyer_id, p.seller_id 
       FROM disputes d
       JOIN payments p ON d.payment_id = p.id
       WHERE d.id = $1 FOR UPDATE OF d`,
      [disputeId]
    );

    if (res.rowCount === 0) {
      const err = new Error('Dispute not found');
      err.statusCode = 404;
      throw err;
    }

    dispute = res.rows[0];

    // State guard
    if (dispute.status !== DisputeStatus.OPEN) {
      const err = new Error('Dispute is not in open state');
      err.statusCode = 409;
      err.errorCode = 'INVALID_DISPUTE_STATE';
      throw err;
    }

    // Self-dispute guard (best effort)
    if (adminId === dispute.buyer_id || adminId === dispute.seller_id) {
      const err = new Error('Admin cannot resolve their own dispute');
      err.statusCode = 403;
      err.errorCode = 'SELF_DISPUTE_FORBIDDEN';
      throw err;
    }

    const updateRes = await client.query(
      `UPDATE disputes SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [DisputeStatus.UNDER_REVIEW, disputeId]
    );
    
    updatedDispute = updateRes.rows[0];

    await writeAuditLog({
      referenceId: disputeId,
      referenceType: 'dispute',
      action: 'dispute_review_started',
      deltaState: { status: DisputeStatus.UNDER_REVIEW },
      actorId: adminId,
    }, client);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // Side effects
  const eventPayload = {
    disputeId,
    status: DisputeStatus.UNDER_REVIEW,
  };
  emitToUser(dispute.buyer_id, EventNames.DISPUTE_UPDATED, eventPayload);
  emitToUser(dispute.seller_id, EventNames.DISPUTE_UPDATED, eventPayload);

  return updatedDispute;
};

/**
 * Admin resolves a dispute with Stripe integration
 */
export const resolveDispute = async ({ disputeId, adminId, outcome, resolutionNote, policyRule, rejectionReason, ipAddress }) => {
  let dispute;
  let payment;
  let originalPaymentStatus;

  const client1 = await pool.connect();
  try {
    await client1.query('BEGIN');

    // STEP 1: SELECT + Validate
    const res = await client1.query(
      `SELECT d.*, p.id as p_id, p.status as p_status, p.stripe_pi_id, p.buyer_id, p.seller_id, p.amount 
       FROM disputes d
       JOIN payments p ON d.payment_id = p.id
       WHERE d.id = $1 FOR UPDATE OF d`,
      [disputeId]
    );

    if (res.rowCount === 0) {
      const err = new Error('Dispute not found');
      err.statusCode = 404;
      throw err;
    }

    const row = res.rows[0];
    dispute = { id: row.id, status: row.status, auction_id: row.auction_id };
    payment = {
      id: row.p_id,
      status: row.p_status,
      stripe_pi_id: row.stripe_pi_id,
      buyer_id: row.buyer_id,
      seller_id: row.seller_id,
      amount: row.amount
    };

    if (dispute.status !== DisputeStatus.UNDER_REVIEW) {
      const err = new Error('Dispute must be under review to be resolved');
      err.statusCode = 409;
      err.errorCode = 'INVALID_DISPUTE_STATE';
      throw err;
    }

    if (adminId === payment.buyer_id || adminId === payment.seller_id) {
      const err = new Error('Admin cannot resolve their own dispute');
      err.statusCode = 403;
      err.errorCode = 'SELF_DISPUTE_FORBIDDEN';
      throw err;
    }

    // STEP 2: DB Lock (intermediate state)
    originalPaymentStatus = payment.status;
    if (outcome === 'buyer_wins') {
      if (payment.status === PaymentStatus.FROZEN || payment.status === PaymentStatus.CAPTURED) {
        const updateRes = await client1.query(
          `UPDATE payments SET status = $1, updated_at = NOW() WHERE id = $2 AND status = $3 RETURNING id`,
          [PaymentStatus.RELEASING, payment.id, payment.status]
        );
        if (updateRes.rowCount === 0) {
          const err = new Error('Payment state changed concurrently');
          err.statusCode = 409;
          err.errorCode = 'INVALID_PAYMENT_STATE';
          throw err;
        }
      }
    } else if (outcome === 'seller_wins') {
      if (payment.status === PaymentStatus.FROZEN) {
        const updateRes = await client1.query(
          `UPDATE payments SET status = $1, updated_at = NOW() WHERE id = $2 AND status = $3 RETURNING id`,
          [PaymentStatus.CAPTURE_PENDING, payment.id, PaymentStatus.FROZEN]
        );
        if (updateRes.rowCount === 0) {
          const err = new Error('Payment state changed concurrently');
          err.statusCode = 409;
          err.errorCode = 'INVALID_PAYMENT_STATE';
          throw err;
        }
      }
    }

    await client1.query('COMMIT');
  } catch (err) {
    await client1.query('ROLLBACK');
    throw err;
  } finally {
    client1.release();
  }

  // STEP 3: Stripe call (OUTSIDE transaction)
  let stripeRefundId = null;
  try {
    if (outcome === 'buyer_wins') {
      if (payment.status === PaymentStatus.FROZEN) {
        await stripe.paymentIntents.cancel(payment.stripe_pi_id);
      } else if (payment.status === PaymentStatus.CAPTURED) {
        const refund = await stripe.refunds.create({ payment_intent: payment.stripe_pi_id });
        stripeRefundId = refund.id;
      }
    } else if (outcome === 'seller_wins') {
      if (payment.status === PaymentStatus.FROZEN) {
        await stripe.paymentIntents.capture(payment.stripe_pi_id);
      }
    }
  } catch (stripeErr) {
    console.error(`[DisputeResolution] Stripe call failed for dispute ${dispute.id}:`, stripeErr.message);
    throw stripeErr;
  }

  // STEP 4: DB Confirm (in transaction)
  const client2 = await pool.connect();
  let updatedDispute;
  const newDisputeStatus = outcome === 'buyer_wins' ? DisputeStatus.RESOLVED_BUYER_WINS : DisputeStatus.RESOLVED_SELLER_WINS;
  
  try {
    await client2.query('BEGIN');

    const updateDisputeRes = await client2.query(
      `UPDATE disputes SET 
        status = $1, 
        resolution_note = $2, 
        policy_rule = $3, 
        rejection_reason = $4,
        resolved_by = $5,
        resolved_at = NOW(),
        updated_at = NOW()
       WHERE id = $6 AND status = $7 RETURNING *`,
      [
        newDisputeStatus, 
        resolutionNote, 
        outcome === 'buyer_wins' ? policyRule : null, 
        outcome === 'seller_wins' ? rejectionReason : null,
        adminId,
        dispute.id,
        DisputeStatus.UNDER_REVIEW
      ]
    );

    if (updateDisputeRes.rowCount === 0) {
      await client2.query('ROLLBACK');
      const err = new Error('Dispute is no longer under review and may have been resolved concurrently');
      err.statusCode = 409;
      err.errorCode = 'INVALID_DISPUTE_STATE';
      throw err;
    }

    updatedDispute = updateDisputeRes.rows[0];

    if (outcome === 'buyer_wins') {
      await client2.query(
        `UPDATE payments SET status = $1, updated_at = NOW() WHERE id = $2`,
        [PaymentStatus.REFUNDED, payment.id]
      );
      await client2.query(
        `UPDATE auctions SET status = 'refunded', updated_at = NOW() WHERE id = $1`,
        [dispute.auction_id]
      );
    } else if (outcome === 'seller_wins') {
      if (originalPaymentStatus === PaymentStatus.FROZEN) {
        await client2.query(
          `UPDATE payments SET status = $1, updated_at = NOW() WHERE id = $2`,
          [PaymentStatus.CAPTURED, payment.id]
        );
      }
      await client2.query(
        `UPDATE auctions SET status = 'completed', delivered_at = COALESCE(delivered_at, NOW()), updated_at = NOW() WHERE id = $1`,
        [dispute.auction_id]
      );
    }

    await writeAuditLog({
      referenceId: dispute.id,
      referenceType: 'dispute',
      action: outcome === 'buyer_wins' ? 'dispute_resolved_buyer_wins' : 'dispute_resolved_seller_wins',
      deltaState: { 
        status: newDisputeStatus,
        policyRule,
        rejectionReason,
        payment_id: payment.id,
        stripe_refund_id: stripeRefundId
      },
      actorId: adminId,
      ipAddress
    }, client2);

    await client2.query('COMMIT');
  } catch (err) {
    await client2.query('ROLLBACK');
    throw err;
  } finally {
    client2.release();
  }

  // STEP 5: Side effects
  try {
    if (outcome === 'seller_wins') {
      await schedulePayoutJob(payment.id, dispute.auction_id);
    }
    await removeDeliveryJobs(dispute.auction_id);

    emitToUser(payment.buyer_id, EventNames.DISPUTE_RESOLVED, {
      disputeId: dispute.id,
      outcome,
      resolutionNote
    });
    emitToUser(payment.seller_id, EventNames.DISPUTE_RESOLVED, {
      disputeId: dispute.id,
      outcome,
      resolutionNote
    });

    // Send DB notification to buyer and seller
    const payloadStr = JSON.stringify({ outcome, resolutionNote, status: newDisputeStatus });
    await pool.query(
      `INSERT INTO notifications (id, user_id, type, reference_id, reference_type, payload)
       VALUES ($1, $2, $3, $4, $5, $6), ($7, $8, $9, $10, $11, $12)`,
      [
        uuidv7(), payment.buyer_id, 'dispute', dispute.id, 'dispute', payloadStr,
        uuidv7(), payment.seller_id, 'dispute', dispute.id, 'dispute', payloadStr
      ]
    );
  } catch (sideErr) {
    console.error(`[DisputeResolution] Side effects failed for dispute ${dispute.id}:`, sideErr);
  }

  return updatedDispute;
};
