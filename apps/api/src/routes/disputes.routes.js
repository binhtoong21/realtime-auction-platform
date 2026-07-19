import express from 'express';
import requireAuth from '../middleware/requireAuth.js';
import { uploadDisputeEvidence } from '../middleware/upload.js';
import validate from '../middleware/validate.js';
import { openDisputeSchema, addEvidenceSchema, disputeIdSchema } from '../validations/dispute.validation.js';
import * as disputeController from '../controllers/dispute.controller.js';

const router = express.Router();

// All dispute endpoints require authentication
router.use(requireAuth);

router.post('/', uploadDisputeEvidence, validate(openDisputeSchema, 'body'), disputeController.handleOpenDispute);
router.get('/:id', validate(disputeIdSchema, 'params'), disputeController.handleGetDisputeById);
router.patch('/:id/evidence', validate(disputeIdSchema, 'params'), uploadDisputeEvidence, validate(addEvidenceSchema, 'body'), disputeController.handleAddEvidence);
router.delete('/:id', validate(disputeIdSchema, 'params'), disputeController.handleWithdrawDispute);

export default router;
