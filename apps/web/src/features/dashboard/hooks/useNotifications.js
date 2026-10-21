import { useState, useEffect, useCallback, useMemo } from 'react';
import { axiosClient } from '../../../core/api/axiosClient';
import { useSocket } from '../../../core/contexts/SocketContext';
import { useAuth } from '../../../core/context/AuthContext';

/**
 * Hook to manage user notifications, unread count, pagination, and real-time socket events.
 * @param {object} [params]
 * @param {string|null} [params.cursor=null]
 * @param {number} [params.limit=20]
 * @param {boolean} [params.unreadOnly=false]
 */
export function useNotifications({ cursor = null, limit = 20, unreadOnly = false } = {}) {
  const user = useAuth();
  const socket = useSocket();

  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [meta, setMeta] = useState({ nextCursor: null, hasMore: false, unreadCount: 0 });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchNotifications = useCallback(
    async (overrideCursor = null, append = false) => {
      if (!user) return;
      setIsLoading(true);
      setError(null);

      try {
        const queryParams = new URLSearchParams();
        const targetCursor = overrideCursor !== null ? overrideCursor : cursor;
        if (targetCursor) queryParams.set('cursor', targetCursor);
        if (limit) queryParams.set('limit', String(limit));
        if (unreadOnly) queryParams.set('unreadOnly', 'true');

        const queryString = queryParams.toString();
        const url = `/notifications${queryString ? `?${queryString}` : ''}`;

        const res = await axiosClient.get(url);
        const data = res.data?.data || [];
        const resMeta = res.data?.meta || { nextCursor: null, hasMore: false, unreadCount: 0 };

        if (append) {
          setNotifications((prev) => [...prev, ...data]);
        } else {
          setNotifications(data);
        }
        setMeta(resMeta);
        setUnreadCount(resMeta.unreadCount ?? 0);
        return { data, meta: resMeta };
      } catch (err) {
        const msg =
          err.response?.data?.error?.message ||
          err.message ||
          'Failed to fetch notifications';
        setError(msg);
      } finally {
        setIsLoading(false);
      }
    },
    [user, cursor, limit, unreadOnly]
  );

  // Mark single notification as read
  const markAsRead = useCallback(async (id) => {
    try {
      await axiosClient.patch(`/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
      throw err;
    }
  }, []);

  // Mark all notifications as read
  const markAllAsRead = useCallback(async () => {
    try {
      await axiosClient.patch('/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all notifications as read:', err);
      throw err;
    }
  }, []);

  // Load more using cursor pagination
  const loadMore = useCallback(async () => {
    if (meta.hasMore && meta.nextCursor && !isLoading) {
      return fetchNotifications(meta.nextCursor, true);
    }
  }, [meta.hasMore, meta.nextCursor, isLoading, fetchNotifications]);

  // Initial fetch on mount or option change when authenticated
  useEffect(() => {
    if (!user) {
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchNotifications();
  }, [user, fetchNotifications]);

  // Realtime notification sync via WebSocket
  useEffect(() => {
    if (!socket || !user) return;

    const handleNewNotification = (notification) => {
      setNotifications((prev) => [notification, ...prev]);
      setUnreadCount((prev) => prev + 1);
    };

    const handlePrivateEvent = () => {
      setUnreadCount((prev) => prev + 1);
    };

    socket.on('notification:new', handleNewNotification);
    socket.on('bid:outbid', handlePrivateEvent);
    socket.on('auction:won', handlePrivateEvent);
    socket.on('dispute:opened', handlePrivateEvent);
    socket.on('dispute:resolved', handlePrivateEvent);

    return () => {
      socket.off('notification:new', handleNewNotification);
      socket.off('bid:outbid', handlePrivateEvent);
      socket.off('auction:won', handlePrivateEvent);
      socket.off('dispute:opened', handlePrivateEvent);
      socket.off('dispute:resolved', handlePrivateEvent);
    };
  }, [socket, user]);

  return useMemo(
    () => ({
      notifications: user ? notifications : [],
      unreadCount: user ? unreadCount : 0,
      meta: user ? meta : { nextCursor: null, hasMore: false, unreadCount: 0 },
      isLoading,
      error,
      refetch: () => fetchNotifications(null, false),
      loadMore,
      markAsRead,
      markAllAsRead,
    }),
    [
      user,
      notifications,
      unreadCount,
      meta,
      isLoading,
      error,
      fetchNotifications,
      loadMore,
      markAsRead,
      markAllAsRead,
    ]
  );
}
