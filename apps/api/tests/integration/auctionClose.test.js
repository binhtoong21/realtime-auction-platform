import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { v7 as uuidv7 } from 'uuid';
import { Queue, Worker, DelayedError } from 'bullmq';
import { pool } from '../../src/config/database.js';
import { createRedisConnection, redisClient } from '../../src/config/redis.js';
import { processBid } from '../../src/services/bidding.service.js';
import { processAuctionEnd } from '../../src/jobs/auctionEnd.processor.js';
import { createAuthHold } from '../../src/services/payment.service.js';
import { ErrorCodes } from '@auction/shared-constants';
import { resetDb, createUser, createAuction } from './helpers/db.js';

vi.mock('../../src/services/socket.service.js', () => ({
  emitToAuctionRoom: vi.fn(async () => {}),
  emitToUser: vi.fn(),
  emitToAdmin: vi.fn(),
}));

vi.mock('../../src/services/payment.service.js', () => ({
  createAuthHold: vi.fn(async () => ({ paymentId: uuidv7(), holdSuccess: true })),
  schedulePostHoldJobs: vi.fn(async () => {}),
}));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function createBidder(auctionId) {
  const userId = await createUser();
  const paymentMethodId = uuidv7();
  await pool.query(
    `INSERT INTO payment_methods (id, user_id, stripe_pm_id, last4, brand)
     VALUES ($1, $2, $3, '4242', 'visa')`,
    [paymentMethodId, userId, `pm_${paymentMethodId}`],
  );
  await pool.query(
    `INSERT INTO auction_participants (id, auction_id, user_id, payment_method_id)
     VALUES ($1, $2, $3, $4)`,
    [uuidv7(), auctionId, userId, paymentMethodId],
  );
  return userId;
}

async function getAuction(id) {
  const { rows } = await pool.query(
    'SELECT status, winner_id, current_price, end_at, extended_count FROM auctions WHERE id = $1',
    [id],
  );
  return rows[0];
}

function fakeJob(auctionId) {
  return { id: `auction_end_${auctionId}`, data: { auctionId }, moveToDelayed: vi.fn(async () => {}) };
}

const extraRedis = [];

beforeEach(async () => {
  vi.clearAllMocks();
  await resetDb();
});

afterAll(async () => {
  await Promise.all(extraRedis.map((c) => c.quit()));
  await pool.end();
  await redisClient.quit();
});

describe('processBid under concurrency', () => {
  it('keeps one winning bid equal to current_price with 30 concurrent bids, and close picks that bidder', async () => {
    const sellerId = await createUser();
    const auctionId = await createAuction({ sellerId, currentPrice: 100 });
    const bidders = [];
    for (let i = 0; i < 30; i++) bidders.push(await createBidder(auctionId));

    const amounts = bidders.map((_, i) => 101 + i).sort(() => Math.random() - 0.5);
    const results = await Promise.allSettled(
      bidders.map((userId, i) =>
        processBid({ auctionId, userId, amount: amounts[i], idempotencyKey: uuidv7() }),
      ),
    );

    const accepted = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(accepted.length).toBeGreaterThan(0);
    for (const r of rejected) expect(r.reason.code).toBe(ErrorCodes.OUTBID);

    const topIndex = amounts.indexOf(130);
    expect(results[topIndex].status).toBe('fulfilled');

    const { rows: winning } = await pool.query(
      'SELECT bidder_id, amount FROM bids WHERE auction_id = $1 AND is_winning = true',
      [auctionId],
    );
    expect(winning).toHaveLength(1);
    expect(Number(winning[0].amount)).toBe(130);
    expect(winning[0].bidder_id).toBe(bidders[topIndex]);

    const { rows: countRows } = await pool.query(
      'SELECT COUNT(*)::int AS count FROM bids WHERE auction_id = $1',
      [auctionId],
    );
    expect(countRows[0].count).toBe(accepted.length);

    const before = await getAuction(auctionId);
    expect(Number(before.current_price)).toBe(130);
    expect(before.extended_count).toBe(0);

    await pool.query("UPDATE auctions SET end_at = now() - interval '1 second' WHERE id = $1", [auctionId]);
    await processAuctionEnd(fakeJob(auctionId), 'token');

    const after = await getAuction(auctionId);
    expect(after.status).toBe('ended');
    expect(after.winner_id).toBe(bidders[topIndex]);
    expect(createAuthHold).toHaveBeenCalledWith(
      expect.objectContaining({ auctionId, winnerId: bidders[topIndex], amountInCents: 130 }),
    );
  });

  it('extends end_at and increments extended_count only for a bid inside the last 2 minutes', async () => {
    const sellerId = await createUser();
    const farId = await createAuction({ sellerId, currentPrice: 100 });
    const nearEnd = new Date(Date.now() + 60 * 1000);
    const nearId = await createAuction({ sellerId, currentPrice: 100, endAt: nearEnd });
    const farBidder = await createBidder(farId);
    const nearBidder = await createBidder(nearId);

    await processBid({ auctionId: farId, userId: farBidder, amount: 101, idempotencyKey: uuidv7() });
    await processBid({ auctionId: nearId, userId: nearBidder, amount: 101, idempotencyKey: uuidv7() });

    const far = await getAuction(farId);
    const near = await getAuction(nearId);
    expect(far.extended_count).toBe(0);
    expect(near.extended_count).toBe(1);
    expect(new Date(near.end_at).getTime() - nearEnd.getTime()).toBe(5 * 60 * 1000);
  });
});

describe('processAuctionEnd and concurrent bids', () => {
  it('reschedules instead of closing when a bid extends the deadline while close waits for the row lock', async () => {
    const sellerId = await createUser();
    const auctionId = await createAuction({ sellerId, endAt: new Date(Date.now() - 1000) });

    const holder = await pool.connect();
    await holder.query('BEGIN');
    await holder.query('SELECT id FROM auctions WHERE id = $1 FOR UPDATE', [auctionId]);

    const job = fakeJob(auctionId);
    const closing = processAuctionEnd(job, 'token');
    await sleep(300);

    // Simulates a bid that committed just before the deadline and extended it
    await holder.query("UPDATE auctions SET end_at = now() + interval '5 minutes' WHERE id = $1", [auctionId]);
    await holder.query('COMMIT');
    holder.release();

    await expect(closing).rejects.toBeInstanceOf(DelayedError);
    expect(job.moveToDelayed).toHaveBeenCalledTimes(1);
    expect(job.moveToDelayed.mock.calls[0][1]).toBe('token');

    const auction = await getAuction(auctionId);
    expect(auction.status).toBe('active');
    expect(auction.winner_id).toBeNull();
  });

  it('rejects a bid that waited for the row lock while the auction was being closed', async () => {
    const sellerId = await createUser();
    const auctionId = await createAuction({ sellerId, currentPrice: 100, endAt: new Date(Date.now() + 60 * 60 * 1000) });
    const bidder = await createBidder(auctionId);

    const holder = await pool.connect();
    await holder.query('BEGIN');
    await holder.query('SELECT id FROM auctions WHERE id = $1 FOR UPDATE', [auctionId]);

    const bidding = processBid({ auctionId, userId: bidder, amount: 101, idempotencyKey: uuidv7() });
    await sleep(300);

    // Simulates the close job finishing while the bid waits
    await holder.query("UPDATE auctions SET status = 'no_sale' WHERE id = $1", [auctionId]);
    await holder.query('COMMIT');
    holder.release();

    await expect(bidding).rejects.toMatchObject({ code: ErrorCodes.AUCTION_ENDED });
    const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM bids WHERE auction_id = $1', [auctionId]);
    expect(rows[0].count).toBe(0);
  });
});

describe('auction-end job on a real BullMQ queue', () => {
  it('runs again after an anti-snipe extension and closes the auction', async () => {
    const sellerId = await createUser();
    const auctionId = await createAuction({ sellerId, endAt: new Date(Date.now() + 1000) });

    const queueName = `auction-end-test-${uuidv7()}`;
    const queueConn = createRedisConnection('test-queue');
    const workerConn = createRedisConnection('test-worker');
    extraRedis.push(queueConn, workerConn);

    const queue = new Queue(queueName, { connection: queueConn });
    let runs = 0;
    const worker = new Worker(
      queueName,
      async (job, token) => {
        runs += 1;
        return processAuctionEnd(job, token);
      },
      { connection: workerConn },
    );

    try {
      await queue.add('auction-end', { auctionId }, { jobId: `auction_end_${auctionId}`, delay: 1000 });
      // Anti-snipe extension before the job fires
      await pool.query("UPDATE auctions SET end_at = now() + interval '3 seconds' WHERE id = $1", [auctionId]);

      const deadline = Date.now() + 15000;
      let auction = await getAuction(auctionId);
      while (auction.status === 'active' && Date.now() < deadline) {
        await sleep(250);
        auction = await getAuction(auctionId);
      }

      expect(auction.status).toBe('no_sale');
      expect(runs).toBeGreaterThanOrEqual(2);
    } finally {
      await worker.close();
      await queue.obliterate({ force: true });
      await queue.close();
    }
  });
});
