import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as adminService from '../../../src/services/admin.service.js';
import { pool } from '../../../src/config/database.js';

vi.mock('../../../src/config/database.js', () => ({
  pool: {
    query: vi.fn(),
    connect: vi.fn(),
  },
}));

describe('admin.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getStats', () => {
    it('should aggregate and return platform stats', async () => {
      pool.query
        .mockResolvedValueOnce({
          rows: [{ total_users: 100, active_users: 80, new_users: 10 }],
        })
        .mockResolvedValueOnce({
          rows: [{ total_auctions: 50, active_auctions: 10, completed_auctions: 35, scheduled_auctions: 5 }],
        })
        .mockResolvedValueOnce({
          rows: [{ open_disputes: 2, resolved_disputes: 8 }],
        })
        .mockResolvedValueOnce({
          rows: [{ total_volume_cents: 10000000, platform_revenue_cents: 700000 }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 'cat-1', name: 'Watches', slug: 'watches', auction_count: 20, volume_cents: 5000000 }],
        });

      const result = await adminService.getStats({ period: '7d' });

      expect(result.period).toBe('7d');
      expect(result.overview.totalUsers).toBe(100);
      expect(result.overview.activeAuctions).toBe(10);
      expect(result.overview.openDisputes).toBe(2);
      expect(result.overview.totalVolumeCents).toBe(10000000);
      expect(result.overview.platformRevenueCents).toBe(700000);
      expect(result.topCategories).toHaveLength(1);
      expect(result.topCategories[0].name).toBe('Watches');
    });
  });

  describe('getUsers', () => {
    it('should return paginated users with meta', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ total: 1 }] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'u-1',
              email: 'trader@example.com',
              display_name: 'Trader Joe',
              avatar_url: null,
              role: 'user',
              status: 'active',
              identity_status: 'verified',
              created_at: '2026-01-01T00:00:00Z',
              auctions_count: 4,
              bids_count: 12,
            },
          ],
        });

      const result = await adminService.getUsers({ page: 1, limit: 10 });

      expect(result.users).toHaveLength(1);
      expect(result.users[0].email).toBe('trader@example.com');
      expect(result.users[0].auctionsCount).toBe(4);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
    });
  });

  describe('banUser', () => {
    it('should update user to banned and cancel active auctions in transaction', async () => {
      const mockClient = {
        query: vi.fn(),
        release: vi.fn(),
      };
      pool.connect.mockResolvedValueOnce(mockClient);

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'u-1', email: 'banned@example.com', status: 'banned' }] })
        .mockResolvedValueOnce({ rowCount: 2 }) // cancel auctions
        .mockResolvedValueOnce({}); // COMMIT

      const result = await adminService.banUser({
        userId: 'u-1',
        adminId: 'admin-1',
        reason: 'Fraud',
      });

      expect(result.status).toBe('banned');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('cancelAuction', () => {
    it('should set status to cancelled', async () => {
      pool.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'auc-1', title: 'Suspicious Item', status: 'cancelled' }],
      });

      const result = await adminService.cancelAuction({
        auctionId: 'auc-1',
        adminId: 'admin-1',
        reason: 'Policy violation',
      });

      expect(result.status).toBe('cancelled');
    });
  });

  describe('categories management', () => {
    it('should create a category', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{ id: 'cat-new', name: 'Art', slug: 'art', description: 'Paintings' }],
      });

      const result = await adminService.createCategory({
        name: 'Art',
        slug: 'art',
        description: 'Paintings',
      });

      expect(result.name).toBe('Art');
    });

    it('should prevent deleting category with auctions', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{ count: 5 }],
      });

      await expect(adminService.deleteCategory('cat-1')).rejects.toThrow(
        'Cannot delete category with active or existing auctions'
      );
    });
  });
});
