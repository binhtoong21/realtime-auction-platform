import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as auctionService from '../../../src/services/auction.service.js';
import { pool } from '../../../src/config/database.js';

vi.mock('../../../src/config/database.js', () => ({
  pool: {
    query: vi.fn(),
  },
}));

vi.mock('../../../src/config/stripe.js', () => ({
  default: {
    paymentIntents: {
      capture: vi.fn(),
      cancel: vi.fn(),
    },
    customers: {
      create: vi.fn(),
    },
  },
}));

vi.mock('../../../src/config/redis.js', () => ({
  redisClient: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  },
}));

vi.mock('../../../src/jobs/queue.js', () => ({
  scheduleAuctionStart: vi.fn(),
  scheduleAuctionEnd: vi.fn(),
  removeAuctionJobs: vi.fn(),
  removeAuctionStartJob: vi.fn(),
  removeAuctionEndJob: vi.fn(),
}));

describe('auction.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAuctions - search filtering', () => {
    it('should append ILIKE search clause for title and description when search keyword is provided', async () => {
      const mockAuctions = [
        {
          id: '11111111-1111-1111-1111-111111111111',
          title: 'Vintage Camera 1970',
          current_price: 25000,
          status: 'active',
          start_at: new Date('2026-11-01T00:00:00Z'),
          end_at: new Date('2026-11-10T00:00:00Z'),
          images: ['https://example.com/cam.jpg'],
          created_at: new Date('2026-11-01T00:00:00Z'),
          category_name: 'Electronics',
          disputeId: null,
        },
      ];

      pool.query.mockResolvedValueOnce({ rows: mockAuctions });

      const result = await auctionService.getAuctions({
        search: 'camera',
        limit: 10,
        sort: 'newest',
      });

      expect(result.items).toEqual(mockAuctions);
      expect(pool.query).toHaveBeenCalledTimes(1);

      const [executedSql, executedValues] = pool.query.mock.calls[0];
      expect(executedSql).toContain('(a.title ILIKE $1 OR a.description ILIKE $1)');
      expect(executedSql).toContain('ORDER BY a.id DESC LIMIT $2');
      expect(executedValues).toEqual(['%camera%', 10]);
    });

    it('should trim search keyword and not add clause when search is empty or whitespace', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const result = await auctionService.getAuctions({
        search: '    ',
        limit: 20,
      });

      expect(result.items).toEqual([]);
      expect(pool.query).toHaveBeenCalledTimes(1);

      const [executedSql, executedValues] = pool.query.mock.calls[0];
      expect(executedSql).not.toContain('ILIKE');
      expect(executedValues).toEqual([20]);
    });

    it('should combine search with category, price range, and status filters correctly', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      await auctionService.getAuctions({
        status: 'active',
        categoryId: '33333333-3333-3333-3333-333333333333',
        minPrice: 5000,
        maxPrice: 50000,
        search: 'laptop',
        limit: 15,
        sort: 'newest',
      });

      const [executedSql, executedValues] = pool.query.mock.calls[0];

      // Verifies parameter ordering:
      // $1: status, $2: categoryId, $3: minPrice, $4: maxPrice, $5: search, $6: limit
      expect(executedSql).toContain('AND a.status = $1');
      expect(executedSql).toContain('AND a.category_id = $2');
      expect(executedSql).toContain('AND a.current_price >= $3');
      expect(executedSql).toContain('AND a.current_price <= $4');
      expect(executedSql).toContain('AND (a.title ILIKE $5 OR a.description ILIKE $5)');
      expect(executedSql).toContain('LIMIT $6');

      expect(executedValues).toEqual([
        'active',
        '33333333-3333-3333-3333-333333333333',
        5000,
        50000,
        '%laptop%',
        15,
      ]);
    });

    it('should generate nextCursor when returned rows match limit', async () => {
      const mockRows = Array.from({ length: 5 }, (_, i) => ({
        id: `00000000-0000-0000-0000-00000000000${i}`,
        title: `Item ${i}`,
        current_price: 1000 * (i + 1),
        status: 'active',
        start_at: new Date('2026-11-01T00:00:00Z'),
        end_at: new Date('2026-11-10T00:00:00Z'),
      }));

      pool.query.mockResolvedValueOnce({ rows: mockRows });

      const result = await auctionService.getAuctions({
        search: 'Item',
        limit: 5,
        sort: 'newest',
      });

      expect(result.items.length).toBe(5);
      expect(result.nextCursor).not.toBeNull();
      expect(typeof result.nextCursor).toBe('string');
    });

    it('should return null nextCursor when returned rows is less than limit', async () => {
      const mockRows = [
        {
          id: '00000000-0000-0000-0000-000000000001',
          title: 'Solo Item',
          current_price: 5000,
          status: 'active',
        },
      ];

      pool.query.mockResolvedValueOnce({ rows: mockRows });

      const result = await auctionService.getAuctions({
        search: 'Solo',
        limit: 10,
        sort: 'newest',
      });

      expect(result.items.length).toBe(1);
      expect(result.nextCursor).toBeNull();
    });
  });

  describe('getAuctionById', () => {
    it('should return auction details with seller and bid count', async () => {
      const auctionId = '22222222-2222-2222-2222-222222222222';
      const mockAuction = {
        id: auctionId,
        title: 'Rare Diamond Watch',
        current_price: 150000,
        status: 'active',
        seller_id: 'seller-uuid',
        seller_name: 'Premium Seller',
        category_name: 'Jewelry',
        category_slug: 'jewelry',
        bid_count: 7,
      };

      pool.query.mockResolvedValueOnce({ rows: [mockAuction] });

      const result = await auctionService.getAuctionById(auctionId);

      expect(result).toEqual(mockAuction);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT a.*'),
        [auctionId]
      );
    });

    it('should throw 404 when auction does not exist', async () => {
      const nonExistentId = '99999999-9999-9999-9999-999999999999';
      pool.query.mockResolvedValueOnce({ rows: [] });

      await expect(
        auctionService.getAuctionById(nonExistentId)
      ).rejects.toMatchObject({
        statusCode: 404,
        errorCode: 'AUCTION_NOT_FOUND',
        message: 'Auction not found',
      });
    });
  });
});
