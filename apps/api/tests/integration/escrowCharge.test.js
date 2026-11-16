import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { v7 as uuidv7 } from 'uuid';
import { pool } from '../../src/config/database.js';
import { redisClient } from '../../src/config/redis.js';
import stripe from '../../src/config/stripe.js';
import { createEscrowCharge, resumeEscrowCharge, retryPayment, acceptSecondChance, declineSecondChance,
  runChargeAttempt, applyChargeFailure, applyChargeSuccess } from '../../src/services/payment.service.js';
import { reconcilePendingAttempts, retryOrphanRefunds } from '../../src/services/paymentReconciler.service.js';
import { emitToAdmin } from '../../src/services/socket.service.js';
import { processWebhookEvent } from '../../src/services/webhook.service.js';
import { resetDb, createUser, createAuction } from './helpers/db.js';

vi.mock('../../src/config/stripe.js', () => ({
  default: {
    paymentIntents: {
      create: vi.fn(),
      cancel: vi.fn(async () => ({})),
      retrieve: vi.fn(async (id) => ({ id, amount: 5000, status: 'succeeded' })),
      search: vi.fn(),
    },
    paymentMethods: { retrieve: vi.fn() },
    refunds: {
      create: vi.fn(async () => ({ id: 're_orphan', status: 'succeeded' })),
      retrieve: vi.fn(),
      list: vi.fn(async () => ({ data: [] })),
    },
  },
}));

const worker = vi.hoisted(() => ({ process: null }));
vi.mock('bullmq', () => ({
  Worker: class {
    constructor(_name, process) { worker.process = process; }
    on() {}
  },
}));
vi.mock('../../src/config/redis.js', async (importOriginal) => ({
  ...await importOriginal(), createRedisConnection: vi.fn(() => ({})),
}));

vi.mock('../../src/jobs/queue.js', () => ({
  paymentQueue: { add: vi.fn() },
  schedulePayoutJob: vi.fn(),
  scheduleGracePeriodExpiry: vi.fn(async () => {}),
  scheduleSecondChanceExpiry: vi.fn(async () => {}),
}));

vi.mock('../../src/services/socket.service.js', () => ({
  emitToAuctionRoom: vi.fn(async () => {}),
  emitToUser: vi.fn(),
  emitToAdmin: vi.fn(),
}));

const cardError = () => Object.assign(new Error('Your card was declined.'), { type: 'StripeCardError', code: 'card_declined' });
const connectionError = () => Object.assign(new Error('Network timeout'), { type: 'StripeConnectionError' });
const succeededPi = (id = `pi_${uuidv7()}`) => ({ id, status: 'succeeded' });

async function setupEndedAuction() {
  const sellerId = await createUser();
  const auctionId = await createAuction({ sellerId, currentPrice: 5000, status: 'ended' });
  const winnerId = await createUser();
  await pool.query('UPDATE users SET stripe_cus_id = $1 WHERE id = $2', [`cus_${winnerId}`, winnerId]);
  const paymentMethodId = uuidv7();
  await pool.query(
    `INSERT INTO payment_methods (id, user_id, stripe_pm_id, last4, brand) VALUES ($1, $2, $3, '4242', 'visa')`,
    [paymentMethodId, winnerId, `pm_${paymentMethodId}`],
  );
  await pool.query(
    `INSERT INTO auction_participants (id, auction_id, user_id, payment_method_id) VALUES ($1, $2, $3, $4)`,
    [uuidv7(), auctionId, winnerId, paymentMethodId],
  );
  return { sellerId, auctionId, winnerId };
}

async function getPayment(id) {
  const { rows } = await pool.query(
    'SELECT status, stripe_pi_id, capture_attempts FROM payments WHERE id = $1',
    [id],
  );
  return rows[0];
}

async function getAuctionStatus(id) {
  const { rows } = await pool.query('SELECT status FROM auctions WHERE id = $1', [id]);
  return rows[0].status;
}

async function getAttempt(paymentId) {
  const { rows } = await pool.query(
    `SELECT * FROM payment_attempts WHERE payment_id = $1 ORDER BY created_at DESC`, [paymentId]
  );
  return rows[0];
}

async function ageAttempt(id, interval = '6 minutes') {
  await pool.query(`UPDATE payment_attempts SET updated_at = NOW() - $2::interval WHERE id = $1`, [id, interval]);
}

beforeEach(async () => {
  vi.clearAllMocks();
  stripe.paymentIntents.cancel.mockResolvedValue({});
  await resetDb();
});

afterAll(async () => {
  await pool.end();
  await redisClient.quit();
});

describe('payment attempts ledger', () => {
  async function initialFailure() {
    const fixture = await setupEndedAuction();
    stripe.paymentIntents.create.mockRejectedValueOnce(cardError());
    const result = await createEscrowCharge({ ...fixture, amountInCents: 5000 });
    return { ...fixture, ...result };
  }

  it('keeps an uncertain retry locked, rejects another retry, and reconciles by search', async () => {
    const { paymentId, winnerId } = await initialFailure();
    stripe.paymentIntents.create.mockRejectedValueOnce(connectionError());
    await expect(retryPayment({ paymentId, buyerId: winnerId })).rejects.toMatchObject({ status: 503, code: 'PAYMENT_PROCESSING' });
    expect((await getPayment(paymentId)).status).toBe('hold_pending');
    const attempt = await getAttempt(paymentId);
    expect(attempt.status).toBe('pending');
    await expect(retryPayment({ paymentId, buyerId: winnerId })).rejects.toMatchObject({ status: 422 });
    await ageAttempt(attempt.id);
    stripe.paymentIntents.search.mockResolvedValueOnce({ data: [succeededPi('pi_retry_reconciled')] });
    await reconcilePendingAttempts();
    expect(stripe.paymentIntents.search).toHaveBeenCalledWith({ query: `metadata['attempt_id']:'${attempt.id}'` });
    expect((await getPayment(paymentId)).status).toBe('held');
    expect((await getAttempt(paymentId)).status).toBe('succeeded');
  });

  it('replays the same attempt key directly and creates a new key after a definitive failure', async () => {
    const { paymentId, winnerId } = await initialFailure();
    const initial = await getAttempt(paymentId);
    stripe.paymentIntents.create.mockRejectedValueOnce(connectionError());
    await expect(retryPayment({ paymentId, buyerId: winnerId })).rejects.toMatchObject({ code: 'PAYMENT_PROCESSING' });
    const attempt = await getAttempt(paymentId);
    stripe.paymentIntents.create.mockRejectedValueOnce(cardError());
    expect((await runChargeAttempt(attempt)).outcome).toBe('failed');
    stripe.paymentIntents.create.mockResolvedValueOnce(succeededPi('pi_retry_ok'));
    await expect(retryPayment({ paymentId, buyerId: winnerId })).resolves.toEqual({ success: true });
    const next = await getAttempt(paymentId);
    expect(next.id).not.toBe(attempt.id);
    expect(stripe.paymentIntents.create.mock.calls.map(([, options]) => options.idempotencyKey))
      .toEqual([initial.id, attempt.id, attempt.id, next.id]);
    expect((await getPayment(paymentId)).capture_attempts).toBe(2);
  });

  it('ignores stale outcomes without changing the counter or a newer pending attempt', async () => {
    const { paymentId, winnerId } = await initialFailure();
    const stale = await getAttempt(paymentId);
    stripe.paymentIntents.create.mockRejectedValueOnce(connectionError());
    await expect(retryPayment({ paymentId, buyerId: winnerId })).rejects.toMatchObject({ code: 'PAYMENT_PROCESSING' });
    expect(await applyChargeFailure(stale, cardError())).toBe(false);
    expect(await applyChargeSuccess(stale, succeededPi())).toBe(false);
    expect((await getPayment(paymentId)).capture_attempts).toBe(1);
    expect((await getPayment(paymentId)).status).toBe('hold_pending');
    expect((await getAttempt(paymentId)).status).toBe('pending');
  });

  it('preserves a PI when requires_action cancellation fails', async () => {
    const fixture = await setupEndedAuction();
    stripe.paymentIntents.create.mockResolvedValueOnce({ id: 'pi_action_uncertain', status: 'requires_action' });
    stripe.paymentIntents.cancel.mockRejectedValueOnce(connectionError());
    await expect(createEscrowCharge({ ...fixture, amountInCents: 5000 })).rejects.toMatchObject({ type: 'StripeConnectionError' });
    const { rows: [payment] } = await pool.query('SELECT * FROM payments WHERE auction_id = $1', [fixture.auctionId]);
    expect(payment.status).toBe('hold_pending');
    expect(await getAttempt(payment.id)).toMatchObject({ status: 'pending', stripe_pi_id: 'pi_action_uncertain' });
  });

  it('rolls back a failed success transaction and later reconciles the saved PI', async () => {
    const fixture = await setupEndedAuction();
    await pool.query(`UPDATE auctions SET status = 'cancelled' WHERE id = $1`, [fixture.auctionId]);
    stripe.paymentIntents.create.mockResolvedValueOnce(succeededPi('pi_finalize_failed'));
    await expect(createEscrowCharge({ ...fixture, amountInCents: 5000 })).rejects.toThrow('Invalid state transition');
    const { rows: [payment] } = await pool.query('SELECT * FROM payments WHERE auction_id = $1', [fixture.auctionId]);
    expect(payment.status).toBe('hold_pending');
    const attempt = await getAttempt(payment.id);
    expect(attempt).toMatchObject({ status: 'pending', stripe_pi_id: 'pi_finalize_failed' });
    await pool.query(`UPDATE auctions SET status = 'ended' WHERE id = $1`, [fixture.auctionId]);
    await ageAttempt(attempt.id);
    stripe.paymentIntents.retrieve.mockResolvedValueOnce(succeededPi('pi_finalize_failed'));
    await reconcilePendingAttempts();
    expect(stripe.paymentIntents.retrieve).toHaveBeenCalledWith('pi_finalize_failed');
    expect((await getPayment(payment.id)).status).toBe('held');
    expect(await getAuctionStatus(fixture.auctionId)).toBe('awaiting_ship');
  });

  async function secondChance() {
    const fixture = await initialFailure();
    const userId = await createUser();
    const pmId = uuidv7();
    await pool.query('UPDATE users SET stripe_cus_id = $1 WHERE id = $2', [`cus_${userId}`, userId]);
    await pool.query(`INSERT INTO payment_methods (id, user_id, stripe_pm_id, last4, brand)
      VALUES ($1, $2, $3, '4242', 'visa')`, [pmId, userId, `pm_${pmId}`]);
    await pool.query(`INSERT INTO auction_participants (id, auction_id, user_id, payment_method_id)
      VALUES ($1, $2, $3, $4)`, [uuidv7(), fixture.auctionId, userId, pmId]);
    await pool.query(`UPDATE payments SET status = 'second_chance', second_chance_runner_up_id = $2,
      second_chance_amount = 4500, second_chance_expires_at = NOW() + INTERVAL '48 hours' WHERE id = $1`, [fixture.paymentId, userId]);
    await pool.query(`UPDATE auctions SET status = 'second_chance' WHERE id = $1`, [fixture.auctionId]);
    return { ...fixture, userId };
  }

  it('keeps an uncertain second-chance payment locked against the expiry job and decline', async () => {
    const { paymentId, auctionId, userId } = await secondChance();
    stripe.paymentIntents.create.mockRejectedValueOnce(connectionError());
    await expect(acceptSecondChance({ auctionId, userId })).rejects.toMatchObject({ status: 503, code: 'PAYMENT_PROCESSING' });
    expect((await getPayment(paymentId)).status).toBe('hold_pending');
    expect((await getAttempt(paymentId)).status).toBe('pending');
    await import('../../src/jobs/payment.worker.js');
    await worker.process({ name: 'second-chance-expiry', data: { paymentId, auctionId } });
    await expect(declineSecondChance({ auctionId, userId })).rejects.toMatchObject({ status: 422 });
    expect((await getPayment(paymentId)).status).toBe('hold_pending');
    expect(await getAuctionStatus(auctionId)).toBe('second_chance');
  });

  it('swaps the buyer on second-chance success and ends without a sale on definitive failure', async () => {
    const { paymentId, auctionId, userId } = await secondChance();
    stripe.paymentIntents.create.mockResolvedValueOnce(succeededPi('pi_second_chance'));
    await expect(acceptSecondChance({ auctionId, userId })).resolves.toEqual({ paymentId, status: 'held', amount: 4500 });
    const { rows: [payment] } = await pool.query('SELECT * FROM payments WHERE id = $1', [paymentId]);
    expect(payment.buyer_id).toBe(userId);
    expect(Number(payment.amount)).toBe(4500);
    expect((await getAttempt(paymentId)).status).toBe('succeeded');
    const next = await secondChance();
    stripe.paymentIntents.create.mockRejectedValueOnce(cardError());
    await expect(acceptSecondChance({ auctionId: next.auctionId, userId: next.userId })).rejects.toMatchObject({ status: 402 });
    expect((await getPayment(next.paymentId)).status).toBe('no_sale');
    expect(await getAuctionStatus(next.auctionId)).toBe('no_sale');
  });

  it('fails an initial attempt requested two hours ago when Stripe has no PI', async () => {
    const fixture = await setupEndedAuction();
    stripe.paymentIntents.create.mockRejectedValueOnce(connectionError());
    await expect(createEscrowCharge({ ...fixture, amountInCents: 5000 })).rejects.toMatchObject({ type: 'StripeConnectionError' });
    const { rows: [payment] } = await pool.query('SELECT * FROM payments WHERE auction_id = $1', [fixture.auctionId]);
    const attempt = await getAttempt(payment.id);
    await pool.query(`UPDATE payment_attempts SET created_at = NOW() - INTERVAL '3 hours',
      stripe_requested_at = NOW() - INTERVAL '2 hours',
      stripe_last_requested_at = NOW() - INTERVAL '2 hours',
      updated_at = NOW() - INTERVAL '6 minutes' WHERE id = $1`, [attempt.id]);
    stripe.paymentIntents.search.mockResolvedValueOnce({ data: [] });
    await reconcilePendingAttempts();
    expect(await getAttempt(payment.id)).toMatchObject({ status: 'failed', error: 'no_charge_created' });
    expect((await getPayment(payment.id)).status).toBe('grace_period');
    expect((await getPayment(payment.id)).capture_attempts).toBe(1);
  });

  it('keeps an attempt pending when the last request is within the expiration window', async () => {
    const fixture = await setupEndedAuction();
    stripe.paymentIntents.create.mockRejectedValueOnce(connectionError());
    await expect(createEscrowCharge({ ...fixture, amountInCents: 5000 })).rejects.toMatchObject({ type: 'StripeConnectionError' });
    const { rows: [payment] } = await pool.query('SELECT * FROM payments WHERE auction_id = $1', [fixture.auctionId]);
    const attempt = await getAttempt(payment.id);
    await pool.query(
      `UPDATE payment_attempts SET created_at = NOW() - INTERVAL '3 hours',
       stripe_requested_at = NOW() - INTERVAL '2 hours',
       stripe_last_requested_at = NOW() - INTERVAL '30 minutes',
       updated_at = NOW() - INTERVAL '6 minutes' WHERE id = $1`,
      [attempt.id]
    );
    stripe.paymentIntents.search.mockResolvedValueOnce({ data: [] });
    await reconcilePendingAttempts();
    expect(await getAttempt(payment.id)).toMatchObject({ status: 'pending' });
    expect((await getPayment(payment.id)).status).toBe('hold_pending');
  });
});

describe('attempt execution safety', () => {
  async function pendingAttempt() {
    const fixture = await setupEndedAuction();
    stripe.paymentIntents.create.mockRejectedValueOnce(connectionError());
    await expect(createEscrowCharge({ ...fixture, amountInCents: 5000 }))
      .rejects.toMatchObject({ type: 'StripeConnectionError' });
    const { rows: [payment] } = await pool.query('SELECT * FROM payments WHERE auction_id = $1', [fixture.auctionId]);
    const attempt = await getAttempt(payment.id);
    vi.clearAllMocks();
    return { ...fixture, payment, attempt };
  }

  it('allows only one executor to call Stripe while the lease is held', async () => {
    const { attempt } = await pendingAttempt();
    let finishStripe;
    let startedStripe;
    const started = new Promise((resolve) => { startedStripe = resolve; });
    stripe.paymentIntents.create.mockImplementationOnce(() => {
      startedStripe();
      return new Promise((resolve) => { finishStripe = resolve; });
    });
    const first = runChargeAttempt(attempt);
    await started;
    try {
      expect((await runChargeAttempt(attempt)).outcome).toBe('uncertain');
      await ageAttempt(attempt.id);
      await reconcilePendingAttempts();
      expect(stripe.paymentIntents.create).toHaveBeenCalledTimes(1);
      expect(stripe.paymentIntents.search).not.toHaveBeenCalled();
      expect(stripe.paymentIntents.retrieve).not.toHaveBeenCalled();
    } finally {
      finishStripe(succeededPi('pi_leased'));
      await first;
    }
    expect((await getAttempt(attempt.payment_id)).locked_until).toBeNull();
  });

  it('retrieves a known PI without creating another', async () => {
    const { attempt } = await pendingAttempt();
    await pool.query('UPDATE payment_attempts SET stripe_pi_id = $2 WHERE id = $1', [attempt.id, 'pi_known']);
    stripe.paymentIntents.retrieve.mockResolvedValueOnce(succeededPi('pi_known'));
    expect((await runChargeAttempt(attempt)).outcome).toBe('succeeded');
    expect(stripe.paymentIntents.retrieve).toHaveBeenCalledWith('pi_known');
    expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
  });

  it('searches an old request without creating, then finalizes the PI it finds', async () => {
    const { attempt } = await pendingAttempt();
    await pool.query(`UPDATE payment_attempts SET stripe_requested_at = NOW() - INTERVAL '24 hours' WHERE id = $1`, [attempt.id]);
    stripe.paymentIntents.search.mockResolvedValueOnce({ data: [] });
    expect((await runChargeAttempt(attempt)).outcome).toBe('uncertain');
    expect(await getAttempt(attempt.payment_id)).toMatchObject({ status: 'pending', locked_until: null });
    stripe.paymentIntents.search.mockResolvedValueOnce({ data: [succeededPi('pi_old_request')] });
    expect((await runChargeAttempt(attempt)).outcome).toBe('succeeded');
    expect(stripe.paymentIntents.search).toHaveBeenCalledWith({ query: `metadata['attempt_id']:'${attempt.id}'` });
    expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
  });

  it('keeps a 30-minute empty search pending and fails it after one hour', async () => {
    const { attempt } = await pendingAttempt();
    await pool.query(`UPDATE payment_attempts SET stripe_requested_at = NOW() - INTERVAL '30 minutes',
      stripe_last_requested_at = NOW() - INTERVAL '30 minutes',
      updated_at = NOW() - INTERVAL '6 minutes' WHERE id = $1`, [attempt.id]);
    stripe.paymentIntents.search.mockResolvedValueOnce({ data: [] });
    await reconcilePendingAttempts();
    expect(await getAttempt(attempt.payment_id)).toMatchObject({ status: 'pending', locked_until: null });
    await pool.query(`UPDATE payment_attempts SET stripe_requested_at = NOW() - INTERVAL '2 hours',
      stripe_last_requested_at = NOW() - INTERVAL '2 hours',
      updated_at = NOW() - INTERVAL '6 minutes' WHERE id = $1`, [attempt.id]);
    stripe.paymentIntents.search.mockResolvedValueOnce({ data: [] });
    await reconcilePendingAttempts();
    expect(await getAttempt(attempt.payment_id)).toMatchObject({ status: 'failed', error: 'no_charge_created' });
    expect((await getPayment(attempt.payment_id)).status).toBe('grace_period');
  });

  it('fails an unrequested attempt after ten minutes with no Stripe PI', async () => {
    const { attempt } = await pendingAttempt();
    await pool.query(`UPDATE payment_attempts SET stripe_requested_at = NULL,
      created_at = NOW() - INTERVAL '11 minutes', updated_at = NOW() - INTERVAL '6 minutes' WHERE id = $1`, [attempt.id]);
    stripe.paymentIntents.search.mockResolvedValueOnce({ data: [] });
    await reconcilePendingAttempts();
    expect(await getAttempt(attempt.payment_id)).toMatchObject({ status: 'failed', error: 'no_charge_created' });
  });

  it('refunds a late success for a failed attempt with a stable key', async () => {
    const { attempt } = await pendingAttempt();
    await applyChargeFailure(attempt, cardError());
    const pi = { ...succeededPi('pi_late'), metadata: { attempt_id: attempt.id } };
    const event = { type: 'payment_intent.succeeded', data: { object: pi } };
    await processWebhookEvent(event);
    await processWebhookEvent(event);
    expect(stripe.refunds.create).toHaveBeenCalledWith({ payment_intent: 'pi_late' }, { idempotencyKey: 'refund_pi_late' });
    expect(stripe.refunds.create).toHaveBeenCalledTimes(1);
    expect((await getPayment(attempt.payment_id)).status).toBe('grace_period');
    const { rows } = await pool.query(`SELECT action FROM financial_audit_logs WHERE reference_id = $1 AND action = 'orphan_charge_refunded'`, [attempt.payment_id]);
    expect(rows).toHaveLength(1);
  });

  it('records a failed orphan refund without failing the webhook, then retries the same key', async () => {
    const { attempt } = await pendingAttempt();
    await applyChargeFailure(attempt, cardError());
    const pi = { ...succeededPi('pi_refund_retry'), metadata: { attempt_id: attempt.id } };
    stripe.refunds.create.mockImplementationOnce(async () => {
      const { rows } = await pool.query(
        'SELECT status FROM orphan_refunds WHERE stripe_pi_id = $1', [pi.id]
      );
      expect(rows[0].status).toBe('pending');
      throw connectionError();
    });
    await expect(processWebhookEvent({ type: 'payment_intent.succeeded', data: { object: pi } }))
      .resolves.toBeUndefined();
    const { rows: [pending] } = await pool.query('SELECT * FROM orphan_refunds WHERE stripe_pi_id = $1', [pi.id]);
    expect(pending).toMatchObject({ status: 'pending', attempt_id: attempt.id, error: 'Network timeout' });
    await pool.query(
      `UPDATE orphan_refunds SET updated_at = NOW() - INTERVAL '6 minutes' WHERE stripe_pi_id = $1`, [pi.id]
    );
    stripe.refunds.create.mockResolvedValueOnce({ id: 're_retried', status: 'succeeded' });
    await retryOrphanRefunds();
    const { rows: [refunded] } = await pool.query('SELECT * FROM orphan_refunds WHERE stripe_pi_id = $1', [pi.id]);
    expect(refunded).toMatchObject({ status: 'refunded', stripe_refund_id: 're_retried', error: null });
    expect(stripe.refunds.create.mock.calls).toEqual([
      [{ payment_intent: pi.id }, { idempotencyKey: `refund_${pi.id}` }],
      [{ payment_intent: pi.id }, { idempotencyKey: `refund_${pi.id}` }],
    ]);
  });

  it.each(['succeeded', 'failed', 'canceled'])(
    'retrieves an in-flight orphan refund until Stripe reports %s', async (stripeStatus) => {
      const { attempt } = await pendingAttempt();
      await applyChargeFailure(attempt, cardError());
      const pi = { ...succeededPi('pi_refund_lifecycle'), metadata: { attempt_id: attempt.id } };
      const event = { type: 'payment_intent.succeeded', data: { object: pi } };
      stripe.refunds.create.mockResolvedValueOnce({ id: 're_1', status: 'pending' });
      await processWebhookEvent(event);
      const { rows: [pending] } = await pool.query('SELECT * FROM orphan_refunds WHERE stripe_pi_id = $1', [pi.id]);
      expect(pending).toMatchObject({ status: 'refund_pending', stripe_refund_id: 're_1' });
      await pool.query(
        `UPDATE orphan_refunds SET updated_at = NOW() - INTERVAL '6 minutes' WHERE stripe_pi_id = $1`, [pi.id]
      );
      stripe.refunds.retrieve.mockResolvedValueOnce({ id: 're_1', status: stripeStatus });
      await retryOrphanRefunds();
      expect(stripe.refunds.retrieve).toHaveBeenCalledWith('re_1');
      const { rows: [resolved] } = await pool.query('SELECT * FROM orphan_refunds WHERE stripe_pi_id = $1', [pi.id]);
      expect(resolved.status).toBe(stripeStatus === 'succeeded' ? 'refunded' : 'failed');
      if (stripeStatus !== 'succeeded') {
        expect(resolved.error).toBe(`Stripe refund status: ${stripeStatus}`);
        expect(emitToAdmin).toHaveBeenCalledWith('payment:reconciliation-alert', expect.objectContaining({
          reason: 'orphan_refund_failed', stripeRefundId: 're_1',
        }));
      }
      await pool.query(
        `UPDATE orphan_refunds SET updated_at = NOW() - INTERVAL '6 minutes' WHERE stripe_pi_id = $1`, [pi.id]
      );
      await retryOrphanRefunds();
      await processWebhookEvent(event);
      expect(stripe.refunds.create).toHaveBeenCalledTimes(1);
      expect(stripe.refunds.retrieve).toHaveBeenCalledTimes(1);
    }
  );

  it('keeps a requires-action refund in flight and alerts when it is overdue', async () => {
    const { attempt } = await pendingAttempt();
    await applyChargeFailure(attempt, cardError());
    stripe.refunds.create.mockResolvedValueOnce({ id: 're_action', status: 'requires_action' });
    await processWebhookEvent({ type: 'payment_intent.succeeded', data: {
      object: { ...succeededPi('pi_refund_action'), metadata: { attempt_id: attempt.id } },
    } });
    await pool.query(
      `UPDATE orphan_refunds SET created_at = NOW() - INTERVAL '2 hours',
       updated_at = NOW() - INTERVAL '6 minutes' WHERE stripe_pi_id = 'pi_refund_action'`
    );
    stripe.refunds.retrieve.mockResolvedValueOnce({ id: 're_action', status: 'requires_action' });
    await retryOrphanRefunds();
    const { rows: [refund] } = await pool.query(`SELECT * FROM orphan_refunds WHERE stripe_pi_id = 'pi_refund_action'`);
    expect(refund.status).toBe('refund_pending');
    expect(emitToAdmin).toHaveBeenCalledWith('payment:reconciliation-alert', expect.objectContaining({
      reason: 'orphan_refund_pending_over_one_hour', stripePaymentIntentId: 'pi_refund_action',
    }));
    expect(stripe.refunds.create).toHaveBeenCalledTimes(1);
  });

  it('alerts on an orphan refund pending for over one hour and retains it after another error', async () => {
    const { attempt } = await pendingAttempt();
    await pool.query(
      `INSERT INTO orphan_refunds (stripe_pi_id, attempt_id, created_at, updated_at)
       VALUES ('pi_refund_overdue', $1, NOW() - INTERVAL '2 hours', NOW() - INTERVAL '6 minutes')`,
      [attempt.id]
    );
    stripe.refunds.create.mockRejectedValueOnce(connectionError());
    await retryOrphanRefunds();
    expect(emitToAdmin).toHaveBeenCalledWith('payment:reconciliation-alert', {
      attemptId: attempt.id,
      stripePaymentIntentId: 'pi_refund_overdue',
      reason: 'orphan_refund_pending_over_one_hour',
    });
    const { rows: [refund] } = await pool.query(
      `SELECT status, error FROM orphan_refunds WHERE stripe_pi_id = 'pi_refund_overdue'`
    );
    expect(refund).toMatchObject({ status: 'pending', error: 'Network timeout' });
  });

  it('recovers an existing succeeded refund for a pending orphan obligation without calling create', async () => {
    const { attempt } = await pendingAttempt();
    await pool.query(
      `INSERT INTO orphan_refunds (stripe_pi_id, attempt_id, status, created_at, updated_at)
       VALUES ('pi_refund_existing', $1, 'pending', NOW() - INTERVAL '10 minutes', NOW() - INTERVAL '6 minutes')`,
      [attempt.id]
    );
    stripe.paymentIntents.retrieve.mockResolvedValueOnce({
      id: 'pi_refund_existing',
      status: 'succeeded',
      amount: 5000,
    });
    stripe.refunds.list.mockResolvedValueOnce({
      data: [{ id: 're_old', status: 'succeeded', amount: 5000 }],
    });
    await retryOrphanRefunds();
    const { rows: [refund] } = await pool.query(
      `SELECT * FROM orphan_refunds WHERE stripe_pi_id = 'pi_refund_existing'`
    );
    expect(refund.status).toBe('refunded');
    expect(refund.stripe_refund_id).toBe('re_old');
    expect(stripe.refunds.create).not.toHaveBeenCalled();
  });

  it('creates a new refund when only a partial refund exists for an orphan obligation', async () => {
    const { attempt } = await pendingAttempt();
    await pool.query(
      `INSERT INTO orphan_refunds (stripe_pi_id, attempt_id, status, created_at, updated_at)
       VALUES ('pi_refund_partial', $1, 'pending', NOW() - INTERVAL '10 minutes', NOW() - INTERVAL '6 minutes')`,
      [attempt.id]
    );
    stripe.paymentIntents.retrieve.mockResolvedValueOnce({
      id: 'pi_refund_partial',
      status: 'succeeded',
      amount: 5000,
    });
    stripe.refunds.list.mockResolvedValueOnce({
      data: [{ id: 're_partial', status: 'succeeded', amount: 500 }],
    });
    stripe.refunds.create.mockResolvedValueOnce({
      id: 're_created',
      status: 'succeeded',
      amount: 5000,
    });
    await retryOrphanRefunds();
    const { rows: [refund] } = await pool.query(
      `SELECT * FROM orphan_refunds WHERE stripe_pi_id = 'pi_refund_partial'`
    );
    expect(stripe.refunds.create).toHaveBeenCalledWith(
      { payment_intent: 'pi_refund_partial' },
      { idempotencyKey: 'refund_pi_refund_partial' }
    );
    expect(refund.status).toBe('refunded');
    expect(refund.stripe_refund_id).toBe('re_created');
  });

  it('does not report an uncommitted success after another executor takes the lease', async () => {
    const { attempt } = await pendingAttempt();
    stripe.paymentIntents.create.mockImplementationOnce(async () => {
      await pool.query(
        `UPDATE payment_attempts SET locked_until = NOW() + INTERVAL '20 minutes' WHERE id = $1`,
        [attempt.id]
      );
      return succeededPi('pi_fenced');
    });
    expect((await runChargeAttempt(attempt)).outcome).toBe('uncertain');
    expect((await getPayment(attempt.payment_id)).status).toBe('hold_pending');
    const current = await getAttempt(attempt.payment_id);
    expect(current.status).toBe('pending');
    expect(current.locked_until).not.toBeNull();
    expect(stripe.refunds.create).not.toHaveBeenCalled();
  });

  it.each(['same_success', 'different_success', 'failed'])(
    'reports the committed outcome after a concurrent %s decision', async (decision) => {
      const { attempt } = await pendingAttempt();
      stripe.paymentIntents.create.mockImplementationOnce(async () => {
        if (decision === 'failed') {
          await applyChargeFailure(attempt, cardError());
        } else {
          await applyChargeSuccess(attempt, succeededPi(decision === 'same_success' ? 'pi_this_run' : 'pi_other_run'));
        }
        return succeededPi('pi_this_run');
      });
      const result = await runChargeAttempt(attempt);
      expect(result.outcome).toBe(decision === 'same_success' ? 'succeeded' : decision === 'failed' ? 'failed' : 'uncertain');
      if (decision === 'failed') {
        expect(result.error.message).toBe('Your card was declined.');
      }
      if (decision !== 'same_success') {
        expect(stripe.refunds.create).toHaveBeenCalledWith(
          { payment_intent: 'pi_this_run' }, { idempotencyKey: 'refund_pi_this_run' }
        );
      }
    }
  );

  it('refunds a duplicate PI while preserving the succeeded attempt and payment', async () => {
    const { attempt } = await pendingAttempt();
    await applyChargeSuccess(attempt, succeededPi('pi_original'));
    await processWebhookEvent({ type: 'payment_intent.succeeded', data: {
      object: { ...succeededPi('pi_duplicate'), metadata: { attempt_id: attempt.id } },
    } });
    expect(stripe.refunds.create).toHaveBeenCalledWith({ payment_intent: 'pi_duplicate' }, { idempotencyKey: 'refund_pi_duplicate' });
    expect(await getPayment(attempt.payment_id)).toMatchObject({ status: 'held', stripe_pi_id: 'pi_original' });
  });

  it('refunds a success found by reconciliation after a concurrent failure decision', async () => {
    const { attempt } = await pendingAttempt();
    await ageAttempt(attempt.id);
    stripe.paymentIntents.search.mockImplementationOnce(async () => {
      await applyChargeFailure(attempt, cardError());
      return { data: [succeededPi('pi_reconciled_late')] };
    });
    await reconcilePendingAttempts();
    expect(stripe.refunds.create).toHaveBeenCalledWith({ payment_intent: 'pi_reconciled_late' },
      { idempotencyKey: 'refund_pi_reconciled_late' });
    expect((await getPayment(attempt.payment_id)).status).toBe('grace_period');
  });

  it('allows card deletion after a finished attempt and nulls the ledger reference', async () => {
    const { attempt } = await pendingAttempt();
    await applyChargeFailure(attempt, cardError());
    await pool.query('DELETE FROM payment_methods WHERE id = $1', [attempt.payment_method_id]);
    expect(await getAttempt(attempt.payment_id)).toMatchObject({ status: 'failed', payment_method_id: null });
  });

  it('fails an unrequested attempt whose card was removed without calling Stripe', async () => {
    const { attempt } = await pendingAttempt();
    await pool.query('UPDATE payment_attempts SET stripe_requested_at = NULL WHERE id = $1', [attempt.id]);
    await pool.query('DELETE FROM payment_methods WHERE id = $1', [attempt.payment_method_id]);
    expect((await runChargeAttempt(attempt)).outcome).toBe('failed');
    expect(await getAttempt(attempt.payment_id)).toMatchObject({ status: 'failed', error: 'payment_method_removed' });
    expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
    expect(stripe.paymentIntents.retrieve).not.toHaveBeenCalled();
    expect(stripe.paymentIntents.search).not.toHaveBeenCalled();
  });
});

describe('createEscrowCharge', () => {
  it('charges immediately with an idempotency key and holds the funds', async () => {
    const { sellerId, auctionId, winnerId } = await setupEndedAuction();
    stripe.paymentIntents.create.mockResolvedValueOnce(succeededPi('pi_ok'));

    const result = await createEscrowCharge({ auctionId, winnerId, sellerId, amountInCents: 5000 });

    expect(result.holdSuccess).toBe(true);
    const [params, options] = stripe.paymentIntents.create.mock.calls[0];
    expect(params.capture_method).toBeUndefined();
    expect(params.amount).toBe(5000);
    expect(params.metadata.payment_id).toBe(result.paymentId);
    const attempt = await getAttempt(result.paymentId);
    expect(options.idempotencyKey).toBe(attempt.id);
    expect(params.metadata.attempt_id).toBe(attempt.id);

    const payment = await getPayment(result.paymentId);
    expect(payment.status).toBe('held');
    expect(payment.stripe_pi_id).toBe('pi_ok');
    expect(await getAuctionStatus(auctionId)).toBe('awaiting_ship');
  });

  it('moves to grace period on a card error', async () => {
    const { sellerId, auctionId, winnerId } = await setupEndedAuction();
    stripe.paymentIntents.create.mockRejectedValueOnce(cardError());

    const result = await createEscrowCharge({ auctionId, winnerId, sellerId, amountInCents: 5000 });

    expect(result.holdSuccess).toBe(false);
    const payment = await getPayment(result.paymentId);
    expect(payment.status).toBe('grace_period');
    expect(payment.capture_attempts).toBe(1);
    expect(await getAuctionStatus(auctionId)).toBe('pending_payment');
  });

  it('cancels a PaymentIntent that needs customer action and treats it as a card failure', async () => {
    const { sellerId, auctionId, winnerId } = await setupEndedAuction();
    stripe.paymentIntents.create.mockResolvedValueOnce({ id: 'pi_3ds', status: 'requires_action' });

    const result = await createEscrowCharge({ auctionId, winnerId, sellerId, amountInCents: 5000 });

    expect(result.holdSuccess).toBe(false);
    expect(stripe.paymentIntents.cancel).toHaveBeenCalledWith('pi_3ds');
    expect((await getPayment(result.paymentId)).status).toBe('grace_period');
  });

  it('keeps hold_pending on a transient error and resumes with the same idempotency key', async () => {
    const { sellerId, auctionId, winnerId } = await setupEndedAuction();
    stripe.paymentIntents.create.mockRejectedValueOnce(connectionError());

    await expect(
      createEscrowCharge({ auctionId, winnerId, sellerId, amountInCents: 5000 }),
    ).rejects.toMatchObject({ type: 'StripeConnectionError' });

    const { rows } = await pool.query('SELECT id, status FROM payments WHERE auction_id = $1', [auctionId]);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('hold_pending');

    stripe.paymentIntents.create.mockResolvedValueOnce(succeededPi('pi_resumed'));
    const resumed = await resumeEscrowCharge(rows[0].id);

    expect(resumed.holdSuccess).toBe(true);
    const keys = stripe.paymentIntents.create.mock.calls.map(([, options]) => options.idempotencyKey);
    const attempt = await getAttempt(rows[0].id);
    expect(keys).toEqual([attempt.id, attempt.id]);
    expect((await getPayment(rows[0].id)).status).toBe('held');
    expect(await getAuctionStatus(auctionId)).toBe('awaiting_ship');
  });

  it('deduplicates concurrent escrow charges for the same auction to one payment and one Stripe request', async () => {
    const fixture = await setupEndedAuction();
    stripe.paymentIntents.create.mockImplementationOnce(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return succeededPi('pi_concurrent');
    });

    await Promise.allSettled([
      createEscrowCharge({ ...fixture, amountInCents: 5000 }),
      createEscrowCharge({ ...fixture, amountInCents: 5000 }),
    ]);

    const { rows: payments } = await pool.query('SELECT * FROM payments WHERE auction_id = $1', [fixture.auctionId]);
    expect(payments).toHaveLength(1);
    expect(stripe.paymentIntents.create).toHaveBeenCalledTimes(1);
  });
});
