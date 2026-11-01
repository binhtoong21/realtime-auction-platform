import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as adminService from '../../../src/services/admin.service.js';
import { pool } from '../../../src/config/database.js';
import { writeAuditLog } from '../../../src/services/auditLogger.js';

vi.mock('../../../src/config/database.js', () => ({
  pool: {
    query: vi.fn(),
    connect: vi.fn(),
  },
}));

vi.mock('../../../src/services/auditLogger.js', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(),
}));

describe('admin.service', () => {
  let mockClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };
    pool.connect.mockResolvedValue(mockClient);
  });

  describe('getStats', () => {
    it('should aggregate and return platform stats', async () => {
      pool.query
        .mockResolvedValueOnce({
          rows: [{ total_users: 100, active_users: 80, new_users: 10 }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              total_auctions: 50,
              active_auctions: 10,
              completed_auctions: 35,
              scheduled_auctions: 5,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ open_disputes: 2, resolved_disputes: 8 }],
        })
        .mockResolvedValueOnce({
          rows: [
            { total_volume_cents: 10000000, platform_revenue_cents: 700000 },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'cat-1',
              name: 'Watches',
              slug: 'watches',
              auction_count: 20,
              volume_cents: 5000000,
            },
          ],
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

  describe('getUserById', () => {
    it('should return full user profile details', async () => {
      pool.query
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
              stripe_cus_id: 'cus_123',
              stripe_acct_id: null,
              created_at: '2026-01-01T00:00:00Z',
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ id: 'auc-1', title: 'Vintage Watch' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'bid-1', amount: 5000 }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await adminService.getUserById('u-1');

      expect(result.user.id).toBe('u-1');
      expect(result.user.hasStripeCustomer).toBe(true);
      expect(result.user.hasStripeConnect).toBe(false);
      expect(result.recentAuctions).toHaveLength(1);
      expect(result.recentBids).toHaveLength(1);
      expect(result.recentDisputes).toHaveLength(0);
    });

    it('should throw 404 when user is not found', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      await expect(adminService.getUserById('u-nonexistent')).rejects.toThrow('User not found');
    });
  });

  describe('banUser', () => {
    it('should update user to banned, cancel active auctions, revoke tokens, and write audit log', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ id: 'u-1', email: 'banned@example.com', status: 'active' }],
        }) // checkRes FOR UPDATE
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ id: 'u-1', email: 'banned@example.com', status: 'banned' }],
        }) // userRes UPDATE
        .mockResolvedValueOnce({ rowCount: 2 }) // cancel auctions
        .mockResolvedValueOnce({ rowCount: 3 }) // delete refresh_tokens
        .mockResolvedValueOnce({}); // COMMIT

      const result = await adminService.banUser({
        userId: 'u-1',
        adminId: 'admin-1',
        reason: 'Fraudulent activity',
        ipAddress: '127.0.0.1',
      });

      expect(result.status).toBe('banned');
      expect(mockClient.release).toHaveBeenCalled();
      expect(writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          referenceId: 'u-1',
          referenceType: 'user',
          action: 'admin_user_banned',
          actorId: 'admin-1',
          ipAddress: '127.0.0.1',
        })
      );
    });

    it('should prevent admin from banning their own account', async () => {
      await expect(
        adminService.banUser({
          userId: 'admin-1',
          adminId: 'admin-1',
          reason: 'Self ban',
        })
      ).rejects.toThrow('Admin cannot ban their own account');
    });

    it('should handle idempotency when user is already banned', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ id: 'u-1', email: 'banned@example.com', status: 'banned' }],
        }) // checkRes FOR UPDATE
        .mockResolvedValueOnce({}); // COMMIT

      const result = await adminService.banUser({
        userId: 'u-1',
        adminId: 'admin-1',
        reason: 'Fraud',
      });

      expect(result.status).toBe('banned');
      expect(mockClient.query).toHaveBeenCalledTimes(3); // BEGIN, check, COMMIT
      expect(writeAuditLog).not.toHaveBeenCalled();
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should throw 404 when user is not found', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // checkRes FOR UPDATE
        .mockResolvedValueOnce({}); // ROLLBACK

      await expect(
        adminService.banUser({
          userId: 'u-missing',
          adminId: 'admin-1',
          reason: 'Fraud',
        })
      ).rejects.toThrow('User not found');

      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('suspendUser', () => {
    it('should suspend user, revoke tokens, and write audit log', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ id: 'u-1', email: 'user@example.com', status: 'active' }],
        }) // check FOR UPDATE
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ id: 'u-1', email: 'user@example.com', status: 'suspended' }],
        }) // UPDATE
        .mockResolvedValueOnce({ rowCount: 1 }) // DELETE refresh_tokens
        .mockResolvedValueOnce({}); // COMMIT

      const result = await adminService.suspendUser({
        userId: 'u-1',
        adminId: 'admin-1',
        reason: 'Under investigation',
        ipAddress: '10.0.0.1',
      });

      expect(result.status).toBe('suspended');
      expect(writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          referenceId: 'u-1',
          referenceType: 'user',
          action: 'admin_user_suspended',
          actorId: 'admin-1',
          ipAddress: '10.0.0.1',
        })
      );
    });

    it('should prevent admin from suspending themselves', async () => {
      await expect(
        adminService.suspendUser({
          userId: 'admin-1',
          adminId: 'admin-1',
          reason: 'Test',
        })
      ).rejects.toThrow('Admin cannot suspend their own account');
    });

    it('should be idempotent if user is already suspended', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ id: 'u-1', email: 'user@example.com', status: 'suspended' }],
        }) // check FOR UPDATE
        .mockResolvedValueOnce({}); // COMMIT

      const result = await adminService.suspendUser({
        userId: 'u-1',
        adminId: 'admin-1',
        reason: 'Repeat suspend',
      });

      expect(result.status).toBe('suspended');
      expect(mockClient.query).toHaveBeenCalledTimes(3); // BEGIN, check, COMMIT
      expect(writeAuditLog).not.toHaveBeenCalled();
    });
  });

  describe('reactivateUser', () => {
    it('should reactivate user and write audit log', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ id: 'u-1', email: 'user@example.com', status: 'suspended' }],
        }) // check FOR UPDATE
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ id: 'u-1', email: 'user@example.com', status: 'active' }],
        }) // UPDATE
        .mockResolvedValueOnce({}); // COMMIT

      const result = await adminService.reactivateUser({
        userId: 'u-1',
        adminId: 'admin-1',
        ipAddress: '192.168.1.1',
      });

      expect(result.status).toBe('active');
      expect(writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          referenceId: 'u-1',
          referenceType: 'user',
          action: 'admin_user_reactivated',
          actorId: 'admin-1',
          ipAddress: '192.168.1.1',
        })
      );
    });

    it('should be idempotent if user is already active', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ id: 'u-1', email: 'user@example.com', status: 'active' }],
        }) // check FOR UPDATE
        .mockResolvedValueOnce({}); // COMMIT

      const result = await adminService.reactivateUser({
        userId: 'u-1',
        adminId: 'admin-1',
      });

      expect(result.status).toBe('active');
      expect(mockClient.query).toHaveBeenCalledTimes(3);
      expect(writeAuditLog).not.toHaveBeenCalled();
    });
  });

  describe('overrideKyc', () => {
    it('should manually verify KYC and write audit log', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ id: 'u-1', email: 'user@example.com', identity_status: 'pending' }],
        }) // check FOR UPDATE
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [
            {
              id: 'u-1',
              email: 'user@example.com',
              identity_status: 'verified',
              identity_verified_at: '2026-03-01T12:00:00Z',
            },
          ],
        }) // UPDATE
        .mockResolvedValueOnce({}); // COMMIT

      const result = await adminService.overrideKyc({
        userId: 'u-1',
        adminId: 'admin-1',
        note: 'Passport verified manually offline',
        ipAddress: '127.0.0.1',
      });

      expect(result.identity_status).toBe('verified');
      expect(writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          referenceId: 'u-1',
          referenceType: 'user',
          action: 'admin_kyc_override',
          actorId: 'admin-1',
        })
      );
    });

    it('should be idempotent if user is already verified', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ id: 'u-1', email: 'user@example.com', identity_status: 'verified' }],
        }) // check FOR UPDATE
        .mockResolvedValueOnce({}); // COMMIT

      const result = await adminService.overrideKyc({
        userId: 'u-1',
        adminId: 'admin-1',
        note: 'Repeat override',
      });

      expect(result.identity_status).toBe('verified');
      expect(mockClient.query).toHaveBeenCalledTimes(3);
      expect(writeAuditLog).not.toHaveBeenCalled();
    });
  });

  describe('cancelAuction', () => {
    it('should lock auction, cancel it, and write audit log', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ id: 'auc-1', title: 'Suspicious Item', status: 'active' }],
        }) // check FOR UPDATE
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ id: 'auc-1', title: 'Suspicious Item', status: 'cancelled' }],
        }) // UPDATE
        .mockResolvedValueOnce({}); // COMMIT

      const result = await adminService.cancelAuction({
        auctionId: 'auc-1',
        adminId: 'admin-1',
        reason: 'Counterfeit report',
        ipAddress: '127.0.0.1',
      });

      expect(result.status).toBe('cancelled');
      expect(writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          referenceId: 'auc-1',
          referenceType: 'auction',
          action: 'admin_auction_force_cancelled',
          actorId: 'admin-1',
          ipAddress: '127.0.0.1',
        })
      );
    });

    it('should be idempotent if auction is already cancelled', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ id: 'auc-1', title: 'Cancelled Item', status: 'cancelled' }],
        }) // check FOR UPDATE
        .mockResolvedValueOnce({}); // COMMIT

      const result = await adminService.cancelAuction({
        auctionId: 'auc-1',
        adminId: 'admin-1',
        reason: 'Repeated cancel',
      });

      expect(result.status).toBe('cancelled');
      expect(mockClient.query).toHaveBeenCalledTimes(3);
      expect(writeAuditLog).not.toHaveBeenCalled();
    });

    it('should reject cancelling auction in finalized state (completed/refunded)', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ id: 'auc-1', title: 'Sold Item', status: 'completed' }],
        }) // check FOR UPDATE
        .mockResolvedValueOnce({}); // ROLLBACK

      await expect(
        adminService.cancelAuction({
          auctionId: 'auc-1',
          adminId: 'admin-1',
          reason: 'Too late',
        })
      ).rejects.toThrow('Cannot cancel auction in finalized state: completed');
    });

    it('should throw 404 when auction is not found', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // check FOR UPDATE
        .mockResolvedValueOnce({}); // ROLLBACK

      await expect(
        adminService.cancelAuction({
          auctionId: 'auc-missing',
          adminId: 'admin-1',
          reason: 'Invalid',
        })
      ).rejects.toThrow('Auction not found');
    });
  });

  describe('categories management', () => {
    it('should fetch categories with stats', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'cat-1',
            name: 'Art',
            slug: 'art',
            description: 'Paintings and sculptures',
            created_at: '2026-01-01T00:00:00Z',
            auction_count: 5,
          },
        ],
      });

      const result = await adminService.getCategoriesWithStats();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Art');
      expect(result[0].auctionCount).toBe(5);
    });

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

    it('should update a category', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{ id: 'cat-1', name: 'Fine Art', slug: 'fine-art', description: 'Curated' }],
      });

      const result = await adminService.updateCategory({
        categoryId: 'cat-1',
        name: 'Fine Art',
        slug: 'fine-art',
      });

      expect(result.name).toBe('Fine Art');
    });

    it('should prevent deleting category with auctions', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{ count: 5 }],
      });

      await expect(adminService.deleteCategory('cat-1')).rejects.toThrow(
        'Cannot delete category with active or existing auctions'
      );
    });

    it('should delete category with no auctions', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ count: 0 }] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'cat-empty' }] });

      const result = await adminService.deleteCategory('cat-empty');

      expect(result.deleted).toBe(true);
      expect(result.id).toBe('cat-empty');
    });

    it('should merge categories, reassign auctions, and write audit log', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'cat-src', name: 'Old Art' }] }) // sourceRes FOR UPDATE
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'cat-tgt', name: 'New Art' }] }) // targetRes FOR UPDATE
        .mockResolvedValueOnce({ rowCount: 4 }) // update auctions
        .mockResolvedValueOnce({ rowCount: 1 }) // delete source
        .mockResolvedValueOnce({}); // COMMIT

      const result = await adminService.mergeCategories({
        sourceCategoryId: 'cat-src',
        targetCategoryId: 'cat-tgt',
        adminId: 'admin-1',
        ipAddress: '127.0.0.1',
      });

      expect(result.sourceCategoryId).toBe('cat-src');
      expect(result.targetCategoryId).toBe('cat-tgt');
      expect(result.reassignedAuctionsCount).toBe(4);
      expect(writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          referenceId: 'cat-src',
          referenceType: 'category',
          action: 'admin_category_merged',
          actorId: 'admin-1',
        })
      );
    });

    it('should prevent merging category into itself', async () => {
      await expect(
        adminService.mergeCategories({
          sourceCategoryId: 'cat-same',
          targetCategoryId: 'cat-same',
        })
      ).rejects.toThrow('Source and target category cannot be the same');
    });
  });
});
