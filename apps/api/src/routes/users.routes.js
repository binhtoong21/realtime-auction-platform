import { Router } from 'express';
import requireAuth from '../middleware/requireAuth.js';
import validate from '../middleware/validate.js';
import { connectOnboardingSchema } from '../validations/kyc.validation.js';
import {
  getKycStatus,
  createIdentitySession,
  createConnectOnboarding,
} from '../controllers/kyc.controller.js';

const router = Router();

router.get('/me/kyc', requireAuth, getKycStatus);
router.post('/me/kyc/identity-session', requireAuth, createIdentitySession);
router.post(
  '/me/kyc/connect-onboarding',
  requireAuth,
  validate(connectOnboardingSchema),
  createConnectOnboarding
);

export default router;
