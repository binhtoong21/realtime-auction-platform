import express from 'express';
import requireAuth from '../middleware/requireAuth.js';
import * as disputeController from '../controllers/dispute.controller.js';

const router = express.Router();

// All dispute endpoints require authentication
router.use(requireAuth);

router.post('/', disputeController.handleOpenDispute);
router.get('/:id', disputeController.handleGetDisputeById);
router.patch('/:id/evidence', disputeController.handleAddEvidence);
router.delete('/:id', disputeController.handleWithdrawDispute);

export default router;
