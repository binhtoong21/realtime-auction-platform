import Joi from 'joi';

export const VALID_AUCTION_STATUSES = ['scheduled', 'active', 'ended', 'pending_payment', 'paid', 'shipped', 'completed', 'no_sale'];

export const getAuctionsSchema = Joi.object({
  status: Joi.string().valid(...VALID_AUCTION_STATUSES).optional(),
  categoryId: Joi.string().uuid().optional(),
  sellerId: Joi.alternatives().try(Joi.string().uuid(), Joi.string().valid('me')).optional(),
  bidderId: Joi.alternatives().try(Joi.string().uuid(), Joi.string().valid('me')).optional(),
  cursor: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})(?:_[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})?$/).optional(),
  limit: Joi.number().integer().min(1).max(100).default(20).optional(),
  sort: Joi.string().valid('ending_soon', 'newest', 'price_asc', 'price_desc').optional(),
  minPrice: Joi.number().min(0).optional(),
  maxPrice: Joi.number().min(0).optional(),
});

export const getAuctionBidsSchema = Joi.object({
  limit: Joi.number().integer().min(1).max(100).default(50).optional(),
});

export const createAuctionSchema = Joi.object({
  title: Joi.string().min(3).max(100).required(),
  description: Joi.string().max(2000).required(),
  // images are now handled via multipart/form-data and req.files
  startingPrice: Joi.number().integer().positive().required(),
  reservePrice: Joi.number().integer().positive().allow(null).optional(),
  bidIncrement: Joi.number().integer().positive().required(),
  startAt: Joi.date().iso().greater('now').required(),
  endAt: Joi.date().iso().greater(Joi.ref('startAt')).required(),
  categoryId: Joi.string().uuid().required()
});

export const updateAuctionSchema = Joi.object({
  title: Joi.string().min(3).max(100).optional(),
  description: Joi.string().max(2000).optional(),
  existingImages: Joi.alternatives().try(
    Joi.array().items(Joi.string().uri()).max(10),
    Joi.string().uri().custom((val) => [val]) // Coerce single string to array
  ).optional(),
  startingPrice: Joi.number().integer().positive().optional(),
  reservePrice: Joi.number().integer().positive().allow(null).optional(),
  bidIncrement: Joi.number().integer().positive().optional(),
  startAt: Joi.date().iso().greater('now').optional(),
  endAt: Joi.date().iso().greater(Joi.ref('startAt')).optional(),
  categoryId: Joi.string().uuid().optional()
});
