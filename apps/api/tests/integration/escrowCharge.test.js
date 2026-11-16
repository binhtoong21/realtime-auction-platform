import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { v7 as uuidv7 } from 'uuid';
import { pool } from '../../src/config/database.js';
import { redisClient } from '../../src/config/redis.js';
import stripe from '../../src/config/stripe.js';
import { createEscrowCharge, resumeEscrowCharge, retryPayment } from '../../src/services/payment.service.js';
import { resetDb, createUser, createAuction } from './helpers/db.js';

vi.mock('../../src/config/stripe.js', () => ({
  default: {
    paymentIntents: { create: vi.fn(), cancel: vi.fn(async () => ({})) },
    paymentMethods: { retrieve: vi.fn() },
  },
}));

vi.mock('../../src/jobs/queue.js', () => ({
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

beforeEach(async () => {
  vi.clearAllMocks();
  await resetDb();
});

afterAll(async () => {
  await pool.end();
  await redisClient.quit();
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
    expect(options.idempotencyKey).toBe(`charge_${result.paymentId}`);

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
    expect(keys).toEqual([`charge_${rows[0].id}`, `charge_${rows[0].id}`]);
    expect((await getPayment(rows[0].id)).status).toBe('held');
    expect(await getAuctionStatus(auctionId)).toBe('awaiting_ship');
  });
});

describe('retryPayment', () => {
  it('reuses the idempotency key after a system error and uses a new key after a card error', async () => {
    const { sellerId, auctionId, winnerId } = await setupEndedAuction();
    stripe.paymentIntents.create.mockRejectedValueOnce(cardError());
    const { paymentId } = await createEscrowCharge({ auctionId, winnerId, sellerId, amountInCents: 5000 });

    stripe.paymentIntents.create.mockRejectedValueOnce(connectionError());
    await expect(retryPayment({ paymentId, buyerId: winnerId })).rejects.toMatchObject({ status: 503 });
    expect((await getPayment(paymentId)).status).toBe('grace_period');

    stripe.paymentIntents.create.mockRejectedValueOnce(cardError());
    await expect(retryPayment({ paymentId, buyerId: winnerId })).rejects.toMatchObject({ status: 402 });

    stripe.paymentIntents.create.mockResolvedValueOnce(succeededPi('pi_retry_ok'));
    await expect(retryPayment({ paymentId, buyerId: winnerId })).resolves.toEqual({ success: true });

    const keys = stripe.paymentIntents.create.mock.calls.map(([, options]) => options.idempotencyKey);
    expect(keys).toEqual([
      `charge_${paymentId}`,
      `charge_${paymentId}_retry_1`,
      `charge_${paymentId}_retry_1`,
      `charge_${paymentId}_retry_2`,
    ]);
    const payment = await getPayment(paymentId);
    expect(payment.status).toBe('held');
    expect(payment.stripe_pi_id).toBe('pi_retry_ok');
    expect(await getAuctionStatus(auctionId)).toBe('awaiting_ship');
  });
});
