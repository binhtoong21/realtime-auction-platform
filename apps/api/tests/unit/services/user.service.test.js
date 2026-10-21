import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as userService from '../../../src/services/user.service.js';
import { pool } from '../../../src/config/database.js';
import * as s3Service from '../../../src/services/s3.service.js';

vi.mock('../../../src/config/database.js', () => ({
  pool: {
    query: vi.fn(),
  },
}));

vi.mock('../../../src/services/s3.service.js', () => ({
  uploadFile: vi.fn(),
}));

describe('user.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('updateProfile', () => {
    it('should update display name without avatar', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'user-1',
            email: 'user@example.com',
            display_name: 'New Name',
            avatar_url: null,
            role: 'user',
            status: 'active',
          },
        ],
      });

      const result = await userService.updateProfile({
        userId: 'user-1',
        displayName: 'New Name',
      });

      expect(result.displayName).toBe('New Name');
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users'),
        ['user-1', 'New Name']
      );
    });

    it('should upload avatar to s3 and update avatar_url', async () => {
      s3Service.uploadFile.mockResolvedValueOnce('https://cdn.example.com/avatar.jpg');
      pool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'user-1',
            email: 'user@example.com',
            display_name: 'Current Name',
            avatar_url: 'https://cdn.example.com/avatar.jpg',
            role: 'user',
            status: 'active',
          },
        ],
      });

      const fakeFile = {
        buffer: Buffer.from('fake image data'),
        mimetype: 'image/jpeg',
        detectedExt: 'jpg',
      };

      const result = await userService.updateProfile({
        userId: 'user-1',
        file: fakeFile,
      });

      expect(s3Service.uploadFile).toHaveBeenCalled();
      expect(result.avatarUrl).toBe('https://cdn.example.com/avatar.jpg');
    });

    it('should return existing user without updates when no changes provided', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'user-1',
            email: 'user@example.com',
            display_name: 'Existing Name',
            avatar_url: null,
            role: 'user',
            status: 'active',
          },
        ],
      });

      const result = await userService.updateProfile({
        userId: 'user-1',
      });

      expect(result.displayName).toBe('Existing Name');
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id, email'),
        ['user-1']
      );
    });
  });

  describe('getPublicProfile', () => {
    it('should return public seller profile with stats and auctions', async () => {
      // 1. User query
      pool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'user-1',
            display_name: 'Super Seller',
            avatar_url: 'https://cdn.example.com/avatar.png',
            role: 'user',
            identity_status: 'verified',
            created_at: '2026-01-01T00:00:00Z',
          },
        ],
      });

      // 2. Stats query
      pool.query.mockResolvedValueOnce({
        rows: [
          {
            total_auctions: 10,
            active_auctions: 2,
            completed_sales: 8,
            dispute_count: 0,
            total_sales_volume: 500000,
          },
        ],
      });

      // 3. Active auctions query
      pool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'auc-1',
            title: 'Vintage Watch',
            current_price: 25000,
            images: ['https://cdn.example.com/watch.jpg'],
            end_at: '2026-11-01T00:00:00Z',
            status: 'active',
            created_at: '2026-10-01T00:00:00Z',
          },
        ],
      });

      // 4. Completed auctions query
      pool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'auc-2',
            title: 'Rare Coin',
            current_price: 15000,
            images: [],
            end_at: '2026-10-15T00:00:00Z',
            status: 'completed',
            created_at: '2026-10-05T00:00:00Z',
          },
        ],
      });

      const result = await userService.getPublicProfile('user-1');

      expect(result.user.displayName).toBe('Super Seller');
      expect(result.user.identityStatus).toBe('verified');
      expect(result.stats.totalAuctions).toBe(10);
      expect(result.stats.completedSales).toBe(8);
      expect(result.stats.completionRate).toBe(100);
      expect(result.stats.reputationScore).toBe(100);
      expect(result.stats.totalSalesVolume).toBe(500000);
      expect(result.activeAuctions).toHaveLength(1);
      expect(result.activeAuctions[0].title).toBe('Vintage Watch');
      expect(result.completedAuctions).toHaveLength(1);
    });

    it('should throw 404 when user not found or banned', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [],
      });

      await expect(userService.getPublicProfile('nonexistent')).rejects.toThrow(
        'User not found'
      );
    });
  });
});
