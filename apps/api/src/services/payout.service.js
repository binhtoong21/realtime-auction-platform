import stripe from '../config/stripe.js';
import { pool } from '../config/database.js';
import { v7 as uuidv7 } from 'uuid';
import { writeAuditLog } from './payment.service.js';
import { emitToUser } from './socket.service.js';

const CURRENCY = process.env.STRIPE_CURRENCY || 'usd';

/**
 * Transfer captured funds to the seller's Stripe Connected Account.
 *
 * Flow:
 *   1. Validate payment is captured and not yet transferred
 *   2. Check no active disputes block payout
 *   3. Verify seller has completed Stripe Connect onboarding
 *   4. Create Stripe Transfer (with idempotency key for crash recovery)
 *   5. Update payment status to transferred
 *   6. Write audit log + notify seller
 *
 * @param {string} paymentId
 * @returns {{ transferred: true } | { transferred: false, reason: string, retry: boolean }}
 */
export const createPayout = async (paymentId) => {
  // 1. Lookup payment
  const paymentResult = await pool.query(
    `SELECT id, auction_id, buyer_id, seller_id, amount,
            platform_fee_amount, stripe_pi_id, stripe_transfer_id, status
     FROM payments WHERE id = $1`,
    [paymentId]
  );

  if (paymentResult.rows.length === 0 || paymentResult.rows[0].status !== 'captured') {
    const currentStatus = paymentResult.rows[0]?.status || 'not_found';
    console.log(`[Payout] Payment ${paymentId} is '${currentStatus}', not captured. Skipping.`);
    return { transferred: false, reason: 'not_capturable', retry: false };
  }

  const payment = paymentResult.rows[0];

  // 2. Already transferred (idempotent)
  if (payment.stripe_transfer_id) {
    console.log(`[Payout] Payment ${paymentId} already transferred. Skipping.`);
    return { transferred: false, reason: 'already_transferred', retry: false };
  }

  // 3. Dispute guard: block payout if active dispute exists
  try {
    const disputeResult = await pool.query(
      `SELECT id FROM disputes
       WHERE payment_id = $1 AND status IN ('open', 'under_review')
       LIMIT 1`,
      [paymentId]
    );
    if (disputeResult.rowCount > 0) {
      console.log(`[Payout] Payment ${paymentId} has active dispute. Payout blocked.`);
      return { transferred: false, reason: 'dispute_active', retry: true };
    }
  } catch (err) {
    if (err.code === '42P01') {
      // disputes table not yet created (Phase 11 not deployed) — no disputes possible
    } else {
      throw err;
    }
  }

  // 4. Lookup seller Connect status
  const sellerResult = await pool.query(
    'SELECT connect_status, stripe_acct_id FROM users WHERE id = $1',
    [payment.seller_id]
  );

  if (sellerResult.rows.length === 0) {
    console.error(`[Payout] Seller ${payment.seller_id} not found for payment ${paymentId}.`);
    return { transferred: false, reason: 'seller_not_found', retry: false };
  }

  const seller = sellerResult.rows[0];

  if (seller.connect_status !== 'payouts_enabled') {
    console.log(`[Payout] Seller ${payment.seller_id} connect_status='${seller.connect_status}'. Payout deferred.`);
    return { transferred: false, reason: 'connect_not_ready', retry: true };
  }

  if (!seller.stripe_acct_id) {
    console.log(`[Payout] Seller ${payment.seller_id} has no Stripe account ID. Payout deferred.`);
    return { transferred: false, reason: 'no_stripe_account', retry: true };
  }

  // 5. Calculate net amount (gross - platform fee)
  const grossAmount = Number(payment.amount);
  const feeAmount = Number(payment.platform_fee_amount);
  const netAmount = grossAmount - feeAmount;

  if (netAmount <= 0) {
    console.error(`[Payout] Invalid net amount for payment ${paymentId}: gross=${grossAmount}, fee=${feeAmount}`);

    await writeAuditLog({
      referenceId: paymentId,
      referenceType: 'payment',
      action: 'payout_failed',
      deltaState: {
        reason: 'invalid_net_amount',
        gross_amount: grossAmount,
        platform_fee: feeAmount,
        net_amount: netAmount,
      },
      actorId: null,
    });

    return { transferred: false, reason: 'invalid_net_amount', retry: false };
  }

  // 6. Stripe Transfer (idempotency key prevents duplicates on crash recovery)
  let transfer;
  try {
    transfer = await stripe.transfers.create(
      {
        amount: netAmount,
        currency: CURRENCY,
        destination: seller.stripe_acct_id,
        transfer_group: `auction_${payment.auction_id}`,
        metadata: {
          payment_id: payment.id,
          auction_id: payment.auction_id,
          seller_id: payment.seller_id,
          platform_fee: String(feeAmount),
          platform: 'realtime-auction',
        },
      },
      { idempotencyKey: `payout-${payment.id}` }
    );
  } catch (err) {
    console.error(`[Payout] Stripe Transfer failed for payment ${paymentId}:`, err.message);

    const isPermanent = err.type === 'StripeInvalidRequestError';

    await writeAuditLog({
      referenceId: paymentId,
      referenceType: 'payment',
      action: 'payout_failed',
      deltaState: {
        error: err.message,
        stripe_code: err.code || null,
        permanent: isPermanent,
        seller_stripe_acct: seller.stripe_acct_id,
        auction_id: payment.auction_id,
      },
      actorId: null,
    });

    if (isPermanent) {
      // Account disabled/restricted — notify seller, don't retry
      try {
        await emitToUser(payment.seller_id, 'payment:status', {
          auctionId: payment.auction_id,
          status: 'payout_blocked',
          message: 'Payout failed. Please check your Stripe Connect account settings.',
        });
      } catch (_) { /* best-effort */ }

      return { transferred: false, reason: 'stripe_account_error', retry: false };
    }

    // Transient error — throw for BullMQ retry
    throw err;
  }

  // 7. Update payment status (atomic guard on captured)
  const updateResult = await pool.query(
    `UPDATE payments
     SET status = 'transferred',
         stripe_transfer_id = $1,
         transferred_at = NOW(),
         updated_at = NOW()
     WHERE id = $2 AND status = 'captured'
     RETURNING id`,
    [transfer.id, paymentId]
  );

  if (updateResult.rowCount === 0) {
    console.warn(`[Payout] Payment ${paymentId} status changed during transfer! Ensuring transfer ID ${transfer.id} is persisted.`);
    
    // Best-effort persist of transfer.id to avoid losing record of funds moved
    try {
      await pool.query(
        `UPDATE payments SET stripe_transfer_id = $1 WHERE id = $2 AND stripe_transfer_id IS NULL`,
        [transfer.id, paymentId]
      );
    } catch (persistErr) {
      console.error(`[Payout] Critical: Failed to persist transfer ID ${transfer.id} for payment ${paymentId}`, persistErr.message);
    }

    // Write a durable reconciliation log
    await writeAuditLog({
      referenceId: paymentId,
      referenceType: 'payment',
      action: 'payout_race_condition',
      deltaState: {
        stripe_transfer_id: transfer.id,
        transfer_amount: netAmount,
        message: 'Status changed while Stripe Transfer was processing. Transfer was created but payment status update failed.'
      },
      actorId: null,
    });

    return { transferred: false, reason: 'status_changed_during_transfer', retry: false };
  }

  // 8. Audit log
  await writeAuditLog({
    referenceId: paymentId,
    referenceType: 'payment',
    action: 'payout_completed',
    deltaState: {
      from_status: 'captured',
      to_status: 'transferred',
      stripe_transfer_id: transfer.id,
      transfer_amount: netAmount,
      platform_fee: feeAmount,
      gross_amount: grossAmount,
      seller_stripe_acct: seller.stripe_acct_id,
      auction_id: payment.auction_id,
    },
    actorId: null,
  });

  // 9. Notifications (isolated side effects)
  try {
    // WS notification (best-effort, seller may be offline)
    await emitToUser(payment.seller_id, 'payment:status', {
      auctionId: payment.auction_id,
      status: 'transferred',
      amount: grossAmount,
      platformFee: feeAmount,
      netAmount,
    });

    // DB notification (guaranteed, forward-compat with Phase 13)
    try {
      await pool.query(
        `INSERT INTO notifications (id, user_id, type, payload, created_at)
         VALUES ($1, $2, 'payout_completed', $3, NOW())`,
        [
          uuidv7(),
          payment.seller_id,
          JSON.stringify({
            auctionId: payment.auction_id,
            grossAmount,
            platformFee: feeAmount,
            netAmount,
            transferId: transfer.id,
          }),
        ]
      );
    } catch (notifErr) {
      if (notifErr.code === '42P01') {
        // notifications table not yet created (Phase 13)
      } else {
        console.error(`[Payout] Failed to insert notification for payment ${paymentId}:`, notifErr.message);
      }
    }
  } catch (notifyErr) {
    console.error(`[Payout] Notification failed for payment ${paymentId}:`, notifyErr.message);
  }

  console.log(`[Payout] Transfer completed for payment ${paymentId}: ${transfer.id} (net: ${netAmount})`);

  return { transferred: true };
};
