import { Router } from 'express';
import requireAuth from '../middleware/requireAuth.js';
import validate from '../middleware/validate.js';
import { rateLimiter } from '../middleware/rateLimiter.js';
import { handleRetryPayment, handleGetPayment } from '../controllers/payment.controller.js';
import { retryPaymentSchema } from '../validations/payment.validation.js';

const router = Router();

router.post(
  '/:id/retry',
  requireAuth,
  rateLimiter('retry-payment', 1, 300), // 1 request / 300s (5 minutes)
  validate(retryPaymentSchema),
  handleRetryPayment
);

router.get('/:id', requireAuth, handleGetPayment);

export default router;
