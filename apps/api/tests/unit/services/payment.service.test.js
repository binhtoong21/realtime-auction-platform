import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as paymentService from '../../../src/services/payment.service.js';
import * as auctionService from '../../../src/services/auction.service.js';
import { pool } from '../../../src/config/database.js';

vi.mock('../../../src/config/database.js', () => ({
  pool: {
    query: vi.fn(),
    connect: vi.fn(),
  },
}));

vi.mock('../../../src/config/redis.js', () => ({
  createRedisConnection: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    on: vi.fn(),
  })),
  redisClient: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  },
}));

vi.mock('../../../src/config/stripe.js', () => ({
  default: {},
}));

vi.mock('../../../src/jobs/queue.js', () => ({
  scheduleAuctionStart: vi.fn(),
  scheduleAuctionEnd: vi.fn(),
  removeAuctionJobs: vi.fn(),
  removeAuctionStartJob: vi.fn(),
  removeAuctionEndJob: vi.fn(),
}));

describe('payment.service & auction.service dispute propagation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getMyPayments', () => {
    it('should query payments with LEFT JOIN disputes and include disputeId and disputeStatus', async () => {
      const mockPayments = [
        {
          id: 'pay-1',
          auctionId: 'auc-1',
          auctionTitle: 'Vintage Watch',
          amount: 50000,
          status: 'frozen',
          created_at: new Date('2026-03-01T12:00:00Z'),
          cursorTime: '2026-03-01T12:00:00Z',
          auctionStatus: 'shipped',
          disputeId: 'disp-101',
          disputeStatus: 'open',
        },
        {
          id: 'pay-2',
          auctionId: 'auc-2',
          auctionTitle: 'Antique Vase',
          amount: 25000,
          status: 'captured',
          created_at: new Date('2026-03-01T10:00:00Z'),
          cursorTime: '2026-03-01T10:00:00Z',
          auctionStatus: 'completed',
          disputeId: null,
          disputeStatus: null,
        },
      ];

      pool.query.mockResolvedValueOnce({ rows: mockPayments });

      const result = await paymentService.getMyPayments({
        userId: 'buyer-1',
        limit: 10,
      });

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('LEFT JOIN disputes d ON d.payment_id = p.id'),
        ['buyer-1', 10]
      );
      expect(result.items).toHaveLength(2);
      expect(result.items[0].disputeId).toBe('disp-101');
      expect(result.items[0].disputeStatus).toBe('open');
      expect(result.items[1].disputeId).toBeNull();
    });
  });

  describe('getAuctions', () => {
    it('should query auctions with LEFT JOIN disputes and include disputeId', async () => {
      const mockAuctions = [
        {
          id: 'auc-1',
          title: 'Mechanical Keyboard',
          current_price: 15000,
          status: 'disputed',
          start_at: new Date(),
          end_at: new Date(),
          images: [],
          created_at: new Date(),
          category_name: 'Electronics',
          disputeId: 'disp-202',
        },
      ];

      pool.query.mockResolvedValueOnce({ rows: mockAuctions });

      const result = await auctionService.getAuctions({
        sellerId: 'seller-1',
        limit: 20,
      });

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('LEFT JOIN disputes d ON d.auction_id = a.id'),
        ['seller-1', 20]
      );
      expect(result.items).toHaveLength(1);
      expect(result.items[0].disputeId).toBe('disp-202');
    });
  });
});
