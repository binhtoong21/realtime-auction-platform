import { Router } from 'express';
import Joi from 'joi';
import requireAuth from '../middleware/requireAuth.js';
import requireIdentityVerified from '../middleware/requireIdentityVerified.js';
import validate from '../middleware/validate.js';
import { checkIdempotency } from '../middleware/idempotency.js';
import { debounceBid } from '../middleware/debounce.js';
import { rateLimiter } from '../middleware/rateLimiter.js';
import { placeBid } from '../controllers/bidding.controller.js';

import optionalAuth from '../middleware/optionalAuth.js';
import { getAuctionsSchema, getAuctionBidsSchema, createAuctionSchema, updateAuctionSchema } from '../validations/auction.validation.js';
import { getAuctions, getAuctionById, getAuctionBids, createAuction, updateAuction, cancelAuction, joinAuction } from '../controllers/auction.controller.js';

const router = Router();

// Read routes (Public or Guest allowed)
router.get('/', optionalAuth, validate(getAuctionsSchema, 'query'), getAuctions);
router.get('/:id', getAuctionById);
router.get('/:id/bids', validate(getAuctionBidsSchema, 'query'), getAuctionBids);

const bidSchema = Joi.object({
  amount: Joi.number().integer().positive().required()
});

// Write routes
router.post(
  '/',
  requireAuth,
  requireIdentityVerified,
  validate(createAuctionSchema),
  createAuction
);

router.patch(
  '/:id',
  requireAuth,
  validate(updateAuctionSchema),
  updateAuction
);

router.patch(
  '/:id/cancel',
  requireAuth,
  cancelAuction
);

// Join auction — SetupIntent flow
router.post(
  '/:id/join',
  requireAuth,
  joinAuction
);

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
