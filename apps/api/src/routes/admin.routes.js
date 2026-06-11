import express from 'express';
import requireAuth from '../middleware/requireAuth.js';
import requireRole from '../middleware/requireRole.js';
import * as disputeController from '../controllers/dispute.controller.js';

const router = express.Router();

router.use(requireAuth);
router.use(requireRole('admin'));

router.patch('/disputes/:id/review', disputeController.handleReviewDispute);
router.patch('/disputes/:id/resolve', disputeController.handleResolveDispute);

export default router;
