import { pool } from '../config/database.js';
import stripe from '../config/stripe.js';
import {
  applyChargeSuccess,
  applyChargeFailure,
  claimChargeAttempt,
  releaseChargeAttempt,
  classifyChargePaymentIntent,
  refundOrphanChargeIfNeeded,
  processOrphanRefund,
  schedulePostHoldJobs,
} from './payment.service.js';
import { emitToAdmin, emitToUser } from './socket.service.js';

/** Retry recorded refund obligations independently of attempt and webhook lifetimes. */
export const retryOrphanRefunds = async () => {
  const { rows } = await pool.query(
    `SELECT stripe_pi_id
     FROM orphan_refunds
     WHERE status IN ('pending', 'refund_pending') AND updated_at < NOW() - INTERVAL '5 minutes'`
  );
  for (const obligation of rows) {
    try {
      const { rows: claimed } = await pool.query(
        `UPDATE orphan_refunds
         SET updated_at = NOW()
         WHERE stripe_pi_id = $1 AND status IN ('pending', 'refund_pending')
           AND updated_at < NOW() - INTERVAL '5 minutes'
         RETURNING *`,
        [obligation.stripe_pi_id]
      );
      const current = claimed[0];
      if (!current) {
        continue;
      }
      if (Date.now() - new Date(current.created_at).getTime() > 60 * 60 * 1000) {
        try {
          await emitToAdmin('payment:reconciliation-alert', {
            attemptId: current.attempt_id,
            stripePaymentIntentId: current.stripe_pi_id,
            reason: 'orphan_refund_pending_over_one_hour',
          });
        } catch (err) {
          console.error(`[PaymentReconciler] Refund alert failed for ${current.stripe_pi_id}:`, err.message);
        }
      }
      await processOrphanRefund(current.stripe_pi_id);
    } catch (err) {
      console.error(`[PaymentReconciler] Failed to retry orphan refund ${obligation.stripe_pi_id}:`, err.message);
    }
  }
};

/** Recover idle attempts under the same execution lease used by inline requests. */
export const reconcilePendingAttempts = async () => {
  const { rows } = await pool.query(
    `SELECT pa.*, p.auction_id
     FROM payment_attempts pa
     JOIN payments p ON p.id = pa.payment_id
     WHERE pa.status = 'pending' AND pa.updated_at < NOW() - INTERVAL '5 minutes'
       AND p.status = 'hold_pending'`
  );
  for (const attempt of rows) {
    let current;
    try {
      current = await claimChargeAttempt(attempt.id);
      if (!current) {
        continue;
      }

      const pi = current.stripe_pi_id
        ? await stripe.paymentIntents.retrieve(current.stripe_pi_id)
        : (await stripe.paymentIntents.search({ query: `metadata['attempt_id']:'${current.id}'` })).data[0];
      if (pi?.id) {
        await pool.query(
          `UPDATE payment_attempts
           SET stripe_pi_id = $2
           WHERE id = $1 AND status = 'pending' AND locked_until = $3::timestamptz`,
          [current.id, pi.id, current.lease_token]
        );
      }

      let resolved = false;
      let success = false;
      if (pi) {
        const result = await classifyChargePaymentIntent(pi, { reconciling: true });
        if (result.outcome === 'succeeded') {
          success = true;
          resolved = await applyChargeSuccess(current, pi);
          await refundOrphanChargeIfNeeded(current, pi);
        } else if (result.outcome === 'failed') {
          resolved = await applyChargeFailure(current, result.error);
        }
      } else {
        const now = Date.now();
        const neverRequested = !current.stripe_requested_at
          && now - new Date(current.created_at).getTime() > 10 * 60 * 1000;
        const lastRequestedAt = current.stripe_last_requested_at || current.stripe_requested_at;
        const requestExpired = lastRequestedAt
          && now - new Date(lastRequestedAt).getTime() > 60 * 60 * 1000;
        if (neverRequested || requestExpired) {
          resolved = await applyChargeFailure(current, new Error('no_charge_created'));
        }
      }

      if (!resolved) {
        continue;
      }
      await emitToAdmin('payment:reconciliation-alert', {
        paymentId: current.payment_id,
        auctionId: attempt.auction_id,
        attemptId: current.id,
        status: success ? 'succeeded' : 'failed',
        reason: 'Pending charge attempt reconciled',
      });
      if (current.kind === 'initial') {
        await schedulePostHoldJobs({
          paymentId: current.payment_id,
          auctionId: attempt.auction_id,
          holdSuccess: success,
        });
        await emitToUser(current.buyer_id, 'auction:won', {
          auctionId: attempt.auction_id,
          finalPrice: Number(current.amount),
          paymentId: current.payment_id,
          paymentStatus: success ? 'held' : 'grace_period',
        });
      }
    } catch (err) {
      console.error(`[PaymentReconciler] Failed to reconcile attempt ${attempt.id}:`, err.message);
    } finally {
      if (current) {
        try {
          await releaseChargeAttempt(current);
        } catch (err) {
          console.error(`[PaymentReconciler] Failed to release attempt ${current.id}:`, err.message);
        }
      }
    }
  }
};
