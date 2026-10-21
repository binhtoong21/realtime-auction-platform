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
});
