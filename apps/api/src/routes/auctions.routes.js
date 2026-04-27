import { Router } from 'express';
import Joi from 'joi';
import requireAuth from '../middleware/requireAuth.js';
import validate from '../middleware/validate.js';
import { checkIdempotency } from '../middleware/idempotency.js';
import { debounceBid } from '../middleware/debounce.js';
import { rateLimiter } from '../middleware/rateLimiter.js';
import { placeBid } from '../controllers/bidding.controller.js';

const router = Router();

const bidSchema = Joi.object({
  amount: Joi.number().positive().precision(2).required()
});

router.post(
  '/:id/bids',
  requireAuth,
  rateLimiter(5, 10),
  validate(bidSchema),
  checkIdempotency,
  debounceBid,
  placeBid
);

export default router;
