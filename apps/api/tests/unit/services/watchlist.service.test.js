import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as watchlistService from '../../../src/services/watchlist.service.js';
import { pool } from '../../../src/config/database.js';

vi.mock('../../../src/config/database.js', () => ({
  pool: {
    query: vi.fn(),
  },
}));

describe('watchlist.service', () => {
  const userId = '11111111-1111-1111-1111-111111111111';
  const auctionId = '22222222-2222-2222-2222-222222222222';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('toggleWatchlist', () => {
    it('should throw 404 when auction does not exist', async () => {
      // Mock auctionCheck -> not found
      pool.query.mockResolvedValueOnce({ rows: [] });

      await expect(
        watchlistService.toggleWatchlist({ userId, auctionId })
      ).rejects.toMatchObject({
        statusCode: 404,
        errorCode: 'AUCTION_NOT_FOUND',
        message: 'Auction not found',
      });

      expect(pool.query).toHaveBeenCalledTimes(1);
      expect(pool.query).toHaveBeenCalledWith(
        'SELECT id FROM auctions WHERE id = $1',
        [auctionId]
      );
    });

    it('should add to watchlist when auction is not yet saved', async () => {
      // 1. auctionCheck -> found
      pool.query.mockResolvedValueOnce({ rows: [{ id: auctionId }] });
      // 2. existing check -> empty
      pool.query.mockResolvedValueOnce({ rows: [] });
      // 3. insert -> success
      pool.query.mockResolvedValueOnce({ rowCount: 1 });

      const result = await watchlistService.toggleWatchlist({ userId, auctionId });

      expect(result).toEqual({ inWatchlist: true, auctionId });
      expect(pool.query).toHaveBeenCalledTimes(3);
      expect(pool.query).toHaveBeenNthCalledWith(
        3,
        'INSERT INTO watchlist (user_id, auction_id) VALUES ($1, $2)',
        [userId, auctionId]
      );
    });

    it('should remove from watchlist when auction is already saved', async () => {
      // 1. auctionCheck -> found
      pool.query.mockResolvedValueOnce({ rows: [{ id: auctionId }] });
      // 2. existing check -> found
      pool.query.mockResolvedValueOnce({ rows: [{ 1: 1 }] });
      // 3. delete -> success
      pool.query.mockResolvedValueOnce({ rowCount: 1 });

      const result = await watchlistService.toggleWatchlist({ userId, auctionId });

      expect(result).toEqual({ inWatchlist: false, auctionId });
      expect(pool.query).toHaveBeenCalledTimes(3);
      expect(pool.query).toHaveBeenNthCalledWith(
        3,
        'DELETE FROM watchlist WHERE user_id = $1 AND auction_id = $2',
        [userId, auctionId]
      );
    });
  });

  describe('getMyWatchlist', () => {
    it('should return paginated items with meta statistics', async () => {
      const mockTotal = 25;
      const mockRows = [
        {
          id: auctionId,
          title: 'Vintage Watch',
          current_price: 15000,
          status: 'active',
          start_at: '2026-11-01T00:00:00Z',
          end_at: '2026-11-10T00:00:00Z',
          images: ['https://example.com/img1.jpg'],
          created_at: '2026-11-01T00:00:00Z',
          category_name: 'Watches',
          category_slug: 'watches',
          saved_at: '2026-11-02T10:00:00Z',
          bid_count: 5,
        },
      ];

      // 1. count query
      pool.query.mockResolvedValueOnce({ rows: [{ total: mockTotal }] });
      // 2. items query
      pool.query.mockResolvedValueOnce({ rows: mockRows });

      const result = await watchlistService.getMyWatchlist({
        userId,
        page: 2,
        limit: 10,
      });

      expect(result.items).toEqual(mockRows);
      expect(result.meta).toEqual({
        total: 25,
        page: 2,
        limit: 10,
        totalPages: 3,
      });

      // Verify count query
      expect(pool.query).toHaveBeenNthCalledWith(
        1,
        'SELECT COUNT(*)::int AS total FROM watchlist WHERE user_id = $1',
        [userId]
      );
      // Verify items query with offset: (2 - 1) * 10 = 10
      expect(pool.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('LIMIT $2 OFFSET $3'),
        [userId, 10, 10]
      );
    });

    it('should handle empty watchlist gracefully', async () => {
      // 1. count query -> 0
      pool.query.mockResolvedValueOnce({ rows: [{ total: 0 }] });
      // 2. items query -> empty
      pool.query.mockResolvedValueOnce({ rows: [] });

      const result = await watchlistService.getMyWatchlist({
        userId,
        page: 1,
        limit: 20,
      });

      expect(result.items).toEqual([]);
      expect(result.meta).toEqual({
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
    });

    it('should enforce bounds on page and limit parameters', async () => {
      pool.query.mockResolvedValueOnce({ rows: [{ total: 5 }] });
      pool.query.mockResolvedValueOnce({ rows: [] });

      await watchlistService.getMyWatchlist({
        userId,
        page: -5,
        limit: 500,
      });

      // page should be clamped to 1, limit to 100, offset to 0
      expect(pool.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('LIMIT $2 OFFSET $3'),
        [userId, 100, 0]
      );
    });
  });

  describe('getMyWatchlistIds', () => {
    it('should return array of watched auction IDs', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [
          { auction_id: 'auction-uuid-1' },
          { auction_id: 'auction-uuid-2' },
        ],
      });

      const result = await watchlistService.getMyWatchlistIds({ userId });

      expect(result).toEqual(['auction-uuid-1', 'auction-uuid-2']);
      expect(pool.query).toHaveBeenCalledWith(
        'SELECT auction_id FROM watchlist WHERE user_id = $1',
        [userId]
      );
    });

    it('should return empty array when user has no watched auctions', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const result = await watchlistService.getMyWatchlistIds({ userId });

      expect(result).toEqual([]);
    });
  });
});
