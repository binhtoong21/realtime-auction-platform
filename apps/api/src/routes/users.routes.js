import { Router } from 'express';
import requireAuth from '../middleware/requireAuth.js';
import validate from '../middleware/validate.js';
import { uploadAvatar } from '../middleware/upload.js';
import { connectOnboardingSchema } from '../validations/kyc.validation.js';
import {
  getKycStatus,
  createIdentitySession,
  createConnectOnboarding,
} from '../controllers/kyc.controller.js';
import { handleGetMyPayments } from '../controllers/payment.controller.js';
import { handleGetMyBids } from '../controllers/bidding.controller.js';
import {
  handleUpdateProfile,
  handleGetPublicProfile,
} from '../controllers/user.controller.js';

const router = Router();

router.get('/me/kyc', requireAuth, getKycStatus);
router.get('/me/payments', requireAuth, handleGetMyPayments);
router.get('/me/bids', requireAuth, handleGetMyBids);
router.patch('/me', requireAuth, uploadAvatar, handleUpdateProfile);
router.post('/me/kyc/identity-session', requireAuth, createIdentitySession);
router.post(
  '/me/kyc/connect-onboarding',
  requireAuth,
  validate(connectOnboardingSchema),
  createConnectOnboarding
);

// Public seller/user profile
router.get('/:id/profile', handleGetPublicProfile);

export default router;
