import express from 'express';
import requireAuth from '../middleware/requireAuth.js';
import requireRole from '../middleware/requireRole.js';
import * as disputeController from '../controllers/dispute.controller.js';
import validate from '../middleware/validate.js';
import { disputeIdSchema, resolveDisputeSchema, adminDisputesQuerySchema } from '../validations/dispute.validation.js';

const router = express.Router();

router.use(requireAuth);
router.use(requireRole('admin'));

router.get('/disputes', validate(adminDisputesQuerySchema, 'query'), disputeController.handleGetAdminDisputes);
router.get('/disputes/:id', validate(disputeIdSchema, 'params'), disputeController.handleGetDisputeById);
router.patch('/disputes/:id/review', validate(disputeIdSchema, 'params'), disputeController.handleReviewDispute);
router.patch('/disputes/:id/resolve', validate(disputeIdSchema, 'params'), validate(resolveDisputeSchema, 'body'), disputeController.handleResolveDispute);

export default router;
