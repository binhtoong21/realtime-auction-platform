import * as notificationService from '../services/notification.service.js';

/**
 * Get paginated notifications for current user
 */
export const handleGetNotifications = async (req, res, next) => {
  try {
    const { cursor, limit, unreadOnly } = req.query;
    const result = await notificationService.getUserNotifications({
      userId: req.user.id,
      cursor,
      limit,
      unreadOnly: unreadOnly === 'true' || unreadOnly === true,
    });

    res.json({
      success: true,
      data: result.notifications,
      meta: result.meta,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Mark a single notification as read
 */
export const handleMarkAsRead = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await notificationService.markNotificationAsRead({
      notificationId: id,
      userId: req.user.id,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Mark all notifications as read
 */
export const handleMarkAllAsRead = async (req, res, next) => {
  try {
    const result = await notificationService.markAllNotificationsAsRead({
      userId: req.user.id,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get unread notifications count for current user
 */
export const handleGetUnreadCount = async (req, res, next) => {
  try {
    const result = await notificationService.getUnreadCount({
      userId: req.user.id,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
