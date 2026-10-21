import express from 'express';
import requireAuth from '../middleware/requireAuth.js';
import requireRole from '../middleware/requireRole.js';
import validate from '../middleware/validate.js';
import * as disputeController from '../controllers/dispute.controller.js';
import * as adminController from '../controllers/admin.controller.js';
import {
  disputeIdSchema,
  resolveDisputeSchema,
  adminDisputesQuerySchema,
} from '../validations/dispute.validation.js';
import {
  adminStatsQuerySchema,
  adminUsersQuerySchema,
  adminBanUserSchema,
  adminSuspendUserSchema,
  adminKycOverrideSchema,
  adminAuctionsQuerySchema,
  adminCancelAuctionSchema,
  adminCategoryCreateSchema,
  adminCategoryUpdateSchema,
  adminCategoryMergeSchema,
} from '../validations/admin.validation.js';

const router = express.Router();

router.use(requireAuth);
router.use(requireRole('admin'));

// Platform Analytics
router.get(
  '/stats',
  validate(adminStatsQuerySchema, 'query'),
  adminController.handleGetStats
);

// Disputes
router.get(
  '/disputes',
  validate(adminDisputesQuerySchema, 'query'),
  disputeController.handleGetAdminDisputes
);
router.get(
  '/disputes/:id',
  validate(disputeIdSchema, 'params'),
  disputeController.handleGetDisputeById
);
router.patch(
  '/disputes/:id/review',
  validate(disputeIdSchema, 'params'),
  disputeController.handleReviewDispute
);
router.patch(
  '/disputes/:id/resolve',
  validate(disputeIdSchema, 'params'),
  validate(resolveDisputeSchema, 'body'),
  disputeController.handleResolveDispute
);

// Users Management
router.get(
  '/users',
  validate(adminUsersQuerySchema, 'query'),
  adminController.handleGetUsers
);
router.get('/users/:id', adminController.handleGetUserById);
router.post(
  '/users/:id/ban',
  validate(adminBanUserSchema, 'body'),
  adminController.handleBanUser
);
router.post(
  '/users/:id/suspend',
  validate(adminSuspendUserSchema, 'body'),
  adminController.handleSuspendUser
);
router.post('/users/:id/reactivate', adminController.handleReactivateUser);
router.post(
  '/users/:id/kyc-override',
  validate(adminKycOverrideSchema, 'body'),
  adminController.handleKycOverride
);

// Auctions Management
router.get(
  '/auctions',
  validate(adminAuctionsQuerySchema, 'query'),
  adminController.handleGetAuctions
);
router.patch(
  '/auctions/:id/cancel',
  validate(adminCancelAuctionSchema, 'body'),
  adminController.handleCancelAuction
);

// Categories Management
router.get('/categories', adminController.handleGetCategories);
router.post(
  '/categories',
  validate(adminCategoryCreateSchema, 'body'),
  adminController.handleCreateCategory
);
router.patch(
  '/categories/:id',
  validate(adminCategoryUpdateSchema, 'body'),
  adminController.handleUpdateCategory
);
router.delete('/categories/:id', adminController.handleDeleteCategory);
router.post(
  '/categories/merge',
  validate(adminCategoryMergeSchema, 'body'),
  adminController.handleMergeCategories
);

export default router;
