import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { v7 as uuidv7 } from 'uuid';
import { pool } from '../../src/config/database.js';
import { redisClient } from '../../src/config/redis.js';
import stripe from '../../src/config/stripe.js';
import { confirmDelivery, autoConfirmDelivery, expireShippingDeadline } from '../../src/services/fulfillment.service.js';
import { createDisputeFromRequest, withdrawDispute, resolveDispute } from '../../src/services/dispute.service.js';
import { schedulePayoutJob } from '../../src/jobs/queue.js';
import { DisputeReason } from '@auction/shared-constants';
import { resetDb, createUser, createAuction } from './helpers/db.js';

vi.mock('../../src/config/stripe.js', () => ({
  default: {
    paymentIntents: {
      create: vi.fn(),
      cancel: vi.fn(async () => ({})),
      capture: vi.fn(async () => ({})),
      retrieve: vi.fn(),
      search: vi.fn(),
    },
    paymentMethods: { retrieve: vi.fn() },
    refunds: {
      create: vi.fn(async () => ({ id: 're_1', status: 'succeeded' })),
      retrieve: vi.fn(),
    },
  },
}));

vi.mock('../../src/config/redis.js', async (importOriginal) => ({
  ...await importOriginal(),
  createRedisConnection: vi.fn(() => ({})),
}));

vi.mock('../../src/jobs/queue.js', () => ({
  paymentQueue: { add: vi.fn() },
  schedulePayoutJob: vi.fn(async () => {}),
  removeDeliveryJobs: vi.fn(async () => {}),
  rescheduleShippingDeadline: vi.fn(async () => {}),
  rescheduleDeliveryJobs: vi.fn(async () => {}),
  ensureJobScheduled: vi.fn(async () => {}),
}));

vi.mock('../../src/services/socket.service.js', () => ({
  emitToAuctionRoom: vi.fn(async () => {}),
  emitToUser: vi.fn(async () => {}),
  emitToAdmin: vi.fn(async () => {}),
}));

async function setupEscrowFixture({ auctionStatus = 'shipped', paymentStatus = 'held' } = {}) {
  const sellerId = await createUser();
  const buyerId = await createUser();
  const auctionId = await createAuction({ sellerId, currentPrice: 5000, status: auctionStatus });

  await pool.query(
    `UPDATE auctions SET 
       shipped_at = NOW() - INTERVAL '10 days',
       shipping_deadline_at = NOW() - INTERVAL '1 day',
       delivery_deadline_at = NOW() - INTERVAL '1 hour'
     WHERE id = $1`,
    [auctionId]
  );

  const paymentId = uuidv7();
  await pool.query(
    `INSERT INTO payments (id, auction_id, buyer_id, seller_id, amount, stripe_pi_id, status)
     VALUES ($1, $2, $3, $4, 5000, 'pi_held', $5)`,
    [paymentId, auctionId, buyerId, sellerId, paymentStatus]
  );

  return { sellerId, buyerId, auctionId, paymentId };
}

async function getPayment(id) {
  const { rows } = await pool.query('SELECT * FROM payments WHERE id = $1', [id]);
  return rows[0];
}

async function getAuction(id) {
  const { rows } = await pool.query('SELECT * FROM auctions WHERE id = $1', [id]);
  return rows[0];
}

beforeEach(async () => {
  vi.clearAllMocks();
  await resetDb();
});

afterAll(async () => {
  await pool.end();
  await redisClient.quit();
});

describe('escrow money out (release, auto-confirm, dispute, refund)', () => {
  it('1. confirmDelivery (auction shipped) -> payment captured, auction completed, schedulePayoutJob called, no Stripe call', async () => {
    const { buyerId, auctionId, paymentId } = await setupEscrowFixture({ auctionStatus: 'shipped', paymentStatus: 'held' });

    const result = await confirmDelivery({ auctionId, buyerId, ipAddress: '127.0.0.1' });
    expect(result).toEqual({ captured: true });

    const payment = await getPayment(paymentId);
    expect(payment.status).toBe('captured');

    const auction = await getAuction(auctionId);
    expect(auction.status).toBe('completed');

    expect(schedulePayoutJob).toHaveBeenCalledWith(paymentId, auctionId);
    expect(stripe.paymentIntents.capture).not.toHaveBeenCalled();
    expect(stripe.paymentIntents.cancel).not.toHaveBeenCalled();
    expect(stripe.refunds.create).not.toHaveBeenCalled();
  });

  it('2. confirmDelivery twice -> second call rejects with statusCode 409', async () => {
    const { buyerId, auctionId } = await setupEscrowFixture({ auctionStatus: 'shipped', paymentStatus: 'held' });

    await confirmDelivery({ auctionId, buyerId });
    await expect(confirmDelivery({ auctionId, buyerId })).rejects.toMatchObject({
      statusCode: 409,
      errorCode: 'INVALID_PAYMENT_STATE',
    });
  });

  it('3. autoConfirmDelivery with delivery_deadline_at in the past -> captured, completed, no Stripe call', async () => {
    const { auctionId, paymentId } = await setupEscrowFixture({ auctionStatus: 'shipped', paymentStatus: 'held' });

    const result = await autoConfirmDelivery(auctionId);
    expect(result).toEqual({ captured: true });

    const payment = await getPayment(paymentId);
    expect(payment.status).toBe('captured');

    const auction = await getAuction(auctionId);
    expect(auction.status).toBe('completed');

    expect(schedulePayoutJob).toHaveBeenCalledWith(paymentId, auctionId);
    expect(stripe.paymentIntents.capture).not.toHaveBeenCalled();
    expect(stripe.paymentIntents.cancel).not.toHaveBeenCalled();
    expect(stripe.refunds.create).not.toHaveBeenCalled();
  });

  it('4. expireShippingDeadline (auction awaiting_ship, deadline in the past) -> payment refunded, auction no_sale, refunds.create called', async () => {
    const { auctionId, paymentId } = await setupEscrowFixture({ auctionStatus: 'awaiting_ship', paymentStatus: 'held' });
    stripe.refunds.create.mockResolvedValueOnce({ id: 're_1', status: 'succeeded' });

    const result = await expireShippingDeadline(auctionId);
    expect(result).toEqual({ refunded: true });

    const payment = await getPayment(paymentId);
    expect(payment.status).toBe('refunded');

    const auction = await getAuction(auctionId);
    expect(auction.status).toBe('no_sale');

    expect(stripe.refunds.create).toHaveBeenCalledWith(
      { payment_intent: 'pi_held' },
      { idempotencyKey: `refund_${paymentId}` }
    );
  });

  it('5. expireShippingDeadline with refund pending -> payment stays releasing, auction no_sale', async () => {
    const { auctionId, paymentId } = await setupEscrowFixture({ auctionStatus: 'awaiting_ship', paymentStatus: 'held' });
    stripe.refunds.create.mockResolvedValueOnce({ id: 're_1', status: 'pending' });

    const result = await expireShippingDeadline(auctionId);
    expect(result).toEqual({ refunded: false });

    const payment = await getPayment(paymentId);
    expect(payment.status).toBe('releasing');

    const auction = await getAuction(auctionId);
    expect(auction.status).toBe('no_sale');
  });

  it('6. Dispute: createDisputeFromRequest on a held payment -> frozen; withdrawDispute -> back to held', async () => {
    const { buyerId, paymentId } = await setupEscrowFixture({ auctionStatus: 'shipped', paymentStatus: 'held' });
    const disputeId = uuidv7();

    const created = await createDisputeFromRequest({
      id: disputeId,
      buyerId,
      paymentId,
      reason: DisputeReason.ITEM_NOT_AS_DESCRIBED,
      description: 'Item did not match photos',
      evidenceUrls: ['https://example.com/evidence1.jpg'],
    });

    expect(created.status).toBe('open');
    let payment = await getPayment(paymentId);
    expect(payment.status).toBe('frozen');

    await withdrawDispute({ disputeId, buyerId });
    payment = await getPayment(paymentId);
    expect(payment.status).toBe('held');
  });

  it('7. resolveDispute seller_wins on a frozen payment (dispute under_review, admin user distinct) -> payment captured, schedulePayoutJob called, no Stripe call', async () => {
    const { buyerId, auctionId, paymentId } = await setupEscrowFixture({ auctionStatus: 'shipped', paymentStatus: 'frozen' });
    const adminId = await createUser();
    const disputeId = uuidv7();

    await pool.query(
      `INSERT INTO disputes (id, payment_id, auction_id, opened_by, reason, description, evidence_urls, status, deadline_at)
       VALUES ($1, $2, $3, $4, $5, 'Testing seller wins', $6, 'under_review', NOW() + INTERVAL '7 days')`,
      [disputeId, paymentId, auctionId, buyerId, DisputeReason.ITEM_NOT_AS_DESCRIBED, ['https://example.com/item.jpg']]
    );

    const resolved = await resolveDispute({
      disputeId,
      adminId,
      outcome: 'seller_wins',
      resolutionNote: 'Seller verified delivery proof',
      rejectionReason: 'INSUFFICIENT_EVIDENCE',
    });

    expect(resolved.status).toBe('resolved_seller_wins');

    const payment = await getPayment(paymentId);
    expect(payment.status).toBe('captured');

    const auction = await getAuction(auctionId);
    expect(auction.status).toBe('completed');

    expect(schedulePayoutJob).toHaveBeenCalledWith(paymentId, auctionId);
    expect(stripe.paymentIntents.capture).not.toHaveBeenCalled();
    expect(stripe.paymentIntents.cancel).not.toHaveBeenCalled();
    expect(stripe.refunds.create).not.toHaveBeenCalled();
  });

  it('8. resolveDispute buyer_wins on a frozen payment -> refunds.create with refund_<paymentId> and payment refunded', async () => {
    const { buyerId, auctionId, paymentId } = await setupEscrowFixture({ auctionStatus: 'shipped', paymentStatus: 'frozen' });
    const adminId = await createUser();
    const disputeId = uuidv7();

    await pool.query(
      `INSERT INTO disputes (id, payment_id, auction_id, opened_by, reason, description, evidence_urls, status, deadline_at)
       VALUES ($1, $2, $3, $4, $5, 'Testing buyer wins', $6, 'under_review', NOW() + INTERVAL '7 days')`,
      [disputeId, paymentId, auctionId, buyerId, DisputeReason.ITEM_NOT_AS_DESCRIBED, ['https://example.com/item.jpg']]
    );

    stripe.refunds.create.mockResolvedValueOnce({ id: 're_dispute', status: 'succeeded' });

    const resolved = await resolveDispute({
      disputeId,
      adminId,
      outcome: 'buyer_wins',
      resolutionNote: 'Refund approved for buyer',
      policyRule: 'ITEM_NOT_AS_DESCRIBED',
    });

    expect(resolved.status).toBe('resolved_buyer_wins');

    const payment = await getPayment(paymentId);
    expect(payment.status).toBe('refunded');

    const auction = await getAuction(auctionId);
    expect(auction.status).toBe('refunded');

    expect(stripe.refunds.create).toHaveBeenCalledWith(
      { payment_intent: 'pi_held' },
      { idempotencyKey: `refund_${paymentId}` }
    );
  });

  it('9. concurrent opposite resolveDispute calls -> exactly one fulfils, the other rejects with 409', async () => {
    const { buyerId, auctionId, paymentId } = await setupEscrowFixture({ auctionStatus: 'shipped', paymentStatus: 'frozen' });
    const admin1 = await createUser();
    const admin2 = await createUser();
    const disputeId = uuidv7();

    await pool.query(
      `INSERT INTO disputes (id, payment_id, auction_id, opened_by, reason, description, evidence_urls, status, deadline_at)
       VALUES ($1, $2, $3, $4, $5, 'Testing race', $6, 'under_review', NOW() + INTERVAL '7 days')`,
      [disputeId, paymentId, auctionId, buyerId, DisputeReason.ITEM_NOT_AS_DESCRIBED, ['https://example.com/item.jpg']]
    );

    stripe.refunds.create.mockResolvedValue({ id: 're_race', status: 'succeeded' });

    const [r1, r2] = await Promise.allSettled([
      resolveDispute({
        disputeId,
        adminId: admin1,
        outcome: 'seller_wins',
        resolutionNote: 'Seller proof',
        rejectionReason: 'INSUFFICIENT_EVIDENCE',
      }),
      resolveDispute({
        disputeId,
        adminId: admin2,
        outcome: 'buyer_wins',
        resolutionNote: 'Buyer claim',
        policyRule: 'ITEM_NOT_AS_DESCRIBED',
      }),
    ]);

    const fulfilled = [r1, r2].filter((r) => r.status === 'fulfilled');
    const rejected = [r1, r2].filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason.statusCode).toBe(409);

    const winnerOutcome = fulfilled[0].value.status;
    const payment = await getPayment(paymentId);
    if (winnerOutcome === 'resolved_seller_wins') {
      expect(payment.status).toBe('captured');
      expect(stripe.refunds.create).not.toHaveBeenCalled();
    } else {
      expect(payment.status).toBe('refunded');
      expect(schedulePayoutJob).not.toHaveBeenCalled();
    }
  });

  it('10. resolveDispute buyer_wins where refunds.create throws connection error -> resolves successfully, payment stays releasing', async () => {
    const { buyerId, auctionId, paymentId } = await setupEscrowFixture({ auctionStatus: 'shipped', paymentStatus: 'frozen' });
    const adminId = await createUser();
    const disputeId = uuidv7();

    await pool.query(
      `INSERT INTO disputes (id, payment_id, auction_id, opened_by, reason, description, evidence_urls, status, deadline_at)
       VALUES ($1, $2, $3, $4, $5, 'Testing network timeout', $6, 'under_review', NOW() + INTERVAL '7 days')`,
      [disputeId, paymentId, auctionId, buyerId, DisputeReason.ITEM_NOT_AS_DESCRIBED, ['https://example.com/item.jpg']]
    );

    const connectionErr = Object.assign(new Error('Network timeout'), { type: 'StripeConnectionError' });
    stripe.refunds.create.mockRejectedValueOnce(connectionErr);

    const resolved = await resolveDispute({
      disputeId,
      adminId,
      outcome: 'buyer_wins',
      resolutionNote: 'Refund approved',
      policyRule: 'ITEM_NOT_AS_DESCRIBED',
    });

    expect(resolved.status).toBe('resolved_buyer_wins');

    const payment = await getPayment(paymentId);
    expect(payment.status).toBe('releasing');

    const auction = await getAuction(auctionId);
    expect(auction.status).toBe('refunded');
  });
});
