import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as biddingService from '../../../src/services/bidding.service.js';
import { pool, withTransaction } from '../../../src/config/database.js';
import { emitToAuctionRoom, emitToUser } from '../../../src/services/socket.service.js';
import { ErrorCodes, AuctionStatus } from '@auction/shared-constants';

const mockClient = {
  query: vi.fn(),
};

vi.mock('../../../src/config/database.js', () => ({
  pool: {
    query: vi.fn(),
  },
  withTransaction: vi.fn(async (cb) => cb(mockClient)),
}));

vi.mock('../../../src/services/socket.service.js', () => ({
  emitToAuctionRoom: vi.fn().mockResolvedValue(),
  emitToUser: vi.fn().mockResolvedValue(),
}));

describe('bidding.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('processBid', () => {
    it('should reject if bidder has not registered a card for the auction', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      await expect(
        biddingService.processBid({
          auctionId: 'auc-1',
          userId: 'user-1',
          amount: 5000,
          idempotencyKey: 'idemp-1',
        })
      ).rejects.toMatchObject({
        code: 'CARD_NOT_REGISTERED',
      });

      expect(withTransaction).not.toHaveBeenCalled();
    });

    it('should throw NOT_FOUND if auction does not exist', async () => {
      // 1. Participant check ok
      pool.query.mockResolvedValueOnce({ rows: [{ id: 'part-1' }] });

      // 2. Atomic update returns 0 rows
      mockClient.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });

      // 3. Fallback check finds 0 rows
      mockClient.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });

      await expect(
        biddingService.processBid({
          auctionId: 'auc-missing',
          userId: 'user-1',
          amount: 5000,
          idempotencyKey: 'idemp-1',
        })
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('should throw AUCTION_ENDED if auction status is not active or ended', async () => {
      pool.query.mockResolvedValueOnce({ rows: [{ id: 'part-1' }] });

      // Atomic update fails
      mockClient.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });

      // Fallback check finds ended auction
      mockClient.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            status: AuctionStatus.COMPLETED,
            end_at: new Date(Date.now() - 10000).toISOString(),
            current_price: 5000,
            bid_increment: 100,
          },
        ],
      });

      await expect(
        biddingService.processBid({
          auctionId: 'auc-1',
          userId: 'user-1',
          amount: 6000,
          idempotencyKey: 'idemp-1',
        })
      ).rejects.toMatchObject({
        code: ErrorCodes.AUCTION_ENDED,
      });
    });

    it('should throw OUTBID if bid amount is less than currentPrice + bidIncrement', async () => {
      pool.query.mockResolvedValueOnce({ rows: [{ id: 'part-1' }] });

      // Atomic update fails
      mockClient.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });

      // Fallback check: auction is active but price higher
      mockClient.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            status: AuctionStatus.ACTIVE,
            end_at: new Date(Date.now() + 600000).toISOString(),
            current_price: 5000,
            bid_increment: 200,
          },
        ],
      });

      await expect(
        biddingService.processBid({
          auctionId: 'auc-1',
          userId: 'user-1',
          amount: 5100, // less than 5200
          idempotencyKey: 'idemp-1',
        })
      ).rejects.toMatchObject({
        code: ErrorCodes.OUTBID,
        details: {
          currentPrice: 5000,
          bidIncrement: 200,
        },
      });
    });

    it('should successfully place a bid, calculate authoritative bid_count, and emit socket events', async () => {
      // 1. Participant check passed
      pool.query.mockResolvedValueOnce({ rows: [{ id: 'part-1' }] });

      const mockUpdatedAuction = {
        id: 'auc-1',
        current_price: 6000,
        extended_count: 1,
        end_at: '2026-03-01T12:05:00.000Z',
        status: 'active',
      };

      const mockNewBid = {
        id: 'bid-1',
        auction_id: 'auc-1',
        bidder_id: 'user-new',
        amount: 6000,
        is_winning: true,
      };

      // 2. Atomic update succeeds
      mockClient.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [mockUpdatedAuction],
      });

      // 3. Insert bid succeeds
      mockClient.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [mockNewBid],
      });

      // 4. Update previous winner succeeds
      mockClient.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ bidder_id: 'user-old-winner' }],
      });

      // 5. Query authoritative bid count
      mockClient.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ count: 7 }],
      });

      const result = await biddingService.processBid({
        auctionId: 'auc-1',
        userId: 'user-new',
        amount: 6000,
        idempotencyKey: 'idemp-uuid',
      });

      expect(result.bid.id).toBe('bid-1');
      expect(result.auction.bid_count).toBe(7);
      expect(result.auction.current_price).toBe(6000);

      // Verify emitToAuctionRoom broadcast
      expect(emitToAuctionRoom).toHaveBeenCalledWith(
        'auc-1',
        'bid:new',
        expect.objectContaining({
          bidderId: 'user-new',
          amount: 6000,
          newPrice: 6000,
          endAt: '2026-03-01T12:05:00.000Z',
          extendedCount: 1,
          bidCount: 7,
        })
      );

      // Verify private outbid notification to previous winner
      expect(emitToUser).toHaveBeenCalledWith(
        'user-old-winner',
        'bid:outbid',
        expect.objectContaining({
          auctionId: 'auc-1',
          currentPrice: 6000,
          outbidBy: 'user-new',
        })
      );
    });

    it('should not notify outbid if the bidder was already the winner', async () => {
      pool.query.mockResolvedValueOnce({ rows: [{ id: 'part-1' }] });

      mockClient.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'auc-1', current_price: 7000, extended_count: 2, end_at: '2026-03-01T12:00:00Z' }],
      });
      mockClient.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'bid-2', bidder_id: 'user-same', amount: 7000 }],
      });
      mockClient.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ bidder_id: 'user-same' }], // same user was previous winner
      });
      mockClient.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ count: 3 }],
      });

      await biddingService.processBid({
        auctionId: 'auc-1',
        userId: 'user-same',
        amount: 7000,
        idempotencyKey: 'idemp-2',
      });

      expect(emitToUser).not.toHaveBeenCalled();
    });
  });

  describe('getMyBids', () => {
    it('should fetch paginated bids for user', async () => {
      const mockBids = [
        {
          id: 'bid-1',
          auctionId: 'auc-1',
          amount: 5000,
          isWinning: true,
          createdAt: '2026-02-01T10:00:00Z',
          auctionTitle: 'Watch',
          auctionStatus: 'active',
          auctionCurrentPrice: 5000,
        },
      ];

      pool.query.mockResolvedValueOnce({
        rows: mockBids,
      });

      const result = await biddingService.getMyBids('user-1', null, 10);

      expect(result.bids).toHaveLength(1);
      expect(result.meta.hasMore).toBe(false);
      expect(result.meta.nextCursor).toBe(null);
    });

    it('should correctly set hasMore and nextCursor when extra row exists', async () => {
      const mockBids = [
        { id: 'b-1', createdAt: '2026-02-01T12:00:00Z' },
        { id: 'b-2', createdAt: '2026-02-01T11:00:00Z' },
        { id: 'b-extra', createdAt: '2026-02-01T10:00:00Z' }, // 3rd item when limit is 2
      ];

      pool.query.mockResolvedValueOnce({
        rows: mockBids,
      });

      const result = await biddingService.getMyBids('user-1', '2026-02-01T13:00:00Z', 2);

      expect(result.bids).toHaveLength(2);
      expect(result.meta.hasMore).toBe(true);
      expect(result.meta.nextCursor).toBe('2026-02-01T11:00:00Z');
    });
  });
});
