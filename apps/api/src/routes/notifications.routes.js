import { Router } from 'express';
import requireAuth from '../middleware/requireAuth.js';
import * as notificationController from '../controllers/notification.controller.js';

const router = Router();

router.use(requireAuth);

router.get('/', notificationController.handleGetNotifications);
router.get('/unread-count', notificationController.handleGetUnreadCount);
router.patch('/read-all', notificationController.handleMarkAllAsRead);
router.patch('/:id/read', notificationController.handleMarkAsRead);

export default router;
