import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as notificationService from '../../../src/services/notification.service.js';
import { pool } from '../../../src/config/database.js';

vi.mock('../../../src/config/database.js', () => ({
  pool: {
    query: vi.fn(),
  },
}));

describe('notification.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getUserNotifications', () => {
    it('should return mapped notifications with pagination meta', async () => {
      const mockRows = [
        {
          id: 'n-1',
          type: 'bid:outbid',
          title: 'Outbid!',
          message: 'You have been outbid',
          reference_id: 'auc-1',
          reference_type: 'auction',
          payload: { amount: 100 },
          is_read: false,
          created_at: '2026-10-21T01:00:00Z',
        },
      ];

      pool.query
        .mockResolvedValueOnce({ rows: mockRows })
        .mockResolvedValueOnce({ rows: [{ count: 1 }] });

      const result = await notificationService.getUserNotifications({
        userId: 'user-1',
        limit: 10,
      });

      expect(result.notifications).toHaveLength(1);
      expect(result.notifications[0].id).toBe('n-1');
      expect(result.notifications[0].referenceId).toBe('auc-1');
      expect(result.meta.unreadCount).toBe(1);
      expect(result.meta.hasMore).toBe(false);
      expect(result.meta.nextCursor).toBeNull();
    });

    it('should indicate hasMore and return nextCursor when row count exceeds limit', async () => {
      const mockRows = [
        { id: 'n-1', type: 't', title: 't', message: 'm', reference_id: null, reference_type: null, payload: {}, is_read: false, created_at: '2026-10-21T02:00:00Z' },
        { id: 'n-2', type: 't', title: 't', message: 'm', reference_id: null, reference_type: null, payload: {}, is_read: false, created_at: '2026-10-21T01:00:00Z' },
      ];

      pool.query
        .mockResolvedValueOnce({ rows: mockRows })
        .mockResolvedValueOnce({ rows: [{ count: 5 }] });

      const result = await notificationService.getUserNotifications({
        userId: 'user-1',
        limit: 1,
      });

      expect(result.notifications).toHaveLength(1);
      expect(result.meta.hasMore).toBe(true);
      expect(result.meta.nextCursor).toBe('2026-10-21T02:00:00Z');
      expect(result.meta.unreadCount).toBe(5);
    });
  });

  describe('markNotificationAsRead', () => {
    it('should mark notification as read and return updated status', async () => {
      pool.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'n-1', is_read: true }],
      });

      const result = await notificationService.markNotificationAsRead({
        notificationId: 'n-1',
        userId: 'user-1',
      });

      expect(result).toEqual({ id: 'n-1', isRead: true });
    });

    it('should throw 404 when notification does not exist or belong to user', async () => {
      pool.query.mockResolvedValueOnce({
        rowCount: 0,
        rows: [],
      });

      await expect(
        notificationService.markNotificationAsRead({
          notificationId: 'n-nonexistent',
          userId: 'user-1',
        })
      ).rejects.toThrow('Notification not found');
    });
  });

  describe('markAllNotificationsAsRead', () => {
    it('should update all unread notifications for user', async () => {
      pool.query.mockResolvedValueOnce({
        rowCount: 4,
        rows: [{ id: 'n-1' }, { id: 'n-2' }, { id: 'n-3' }, { id: 'n-4' }],
      });

      const result = await notificationService.markAllNotificationsAsRead({
        userId: 'user-1',
      });

      expect(result.updatedCount).toBe(4);
    });
  });

  describe('getUnreadCount', () => {
    it('should return unread count for user', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{ count: 7 }],
      });

      const result = await notificationService.getUnreadCount({
        userId: 'user-1',
      });

      expect(result.unreadCount).toBe(7);
    });
  });

  describe('createNotification', () => {
    it('should insert and return new notification', async () => {
      const mockCreated = {
        id: 'new-notif-uuid',
        type: 'auction:won',
        title: 'You won!',
        message: 'Congratulations',
        reference_id: 'auc-1',
        reference_type: 'auction',
        payload: { finalBid: 500 },
        is_read: false,
        created_at: '2026-10-21T03:00:00Z',
      };

      pool.query.mockResolvedValueOnce({
        rows: [mockCreated],
      });

      const result = await notificationService.createNotification({
        userId: 'user-1',
        type: 'auction:won',
        title: 'You won!',
        message: 'Congratulations',
        referenceId: 'auc-1',
        referenceType: 'auction',
        payload: { finalBid: 500 },
      });

      expect(result.id).toBe('new-notif-uuid');
      expect(result.title).toBe('You won!');
      expect(result.isRead).toBe(false);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO notifications'),
        expect.arrayContaining(['user-1', 'auction:won', 'You won!'])
      );
    });
  });
});
