import Joi from 'joi';

export const getAuctionsSchema = Joi.object({
  status: Joi.string().valid('draft', 'active', 'ended', 'pending_payment', 'paid', 'shipped', 'completed', 'no_sale').optional(),
  categoryId: Joi.string().uuid().optional(),
  sellerId: Joi.alternatives().try(Joi.string().uuid(), Joi.string().valid('me')).optional(),
  cursor: Joi.string().isoDate().optional(),
  limit: Joi.number().integer().min(1).max(100).default(20).optional(),
  sort: Joi.string().valid('ending_soon', 'newest', 'price_asc', 'price_desc').optional(),
});

export const getAuctionBidsSchema = Joi.object({
  limit: Joi.number().integer().min(1).max(100).default(50).optional(),
});

export const createAuctionSchema = Joi.object({
  title: Joi.string().min(3).max(100).required(),
  description: Joi.string().max(2000).required(),
  // TODO: Replace with multipart/form-data + S3 upload
  // Currently accepts image URLs directly for development
  images: Joi.array().items(Joi.string().uri()).max(10).required(),
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
  images: Joi.array().items(Joi.string().uri()).max(10).optional(),
  startingPrice: Joi.number().integer().positive().optional(),
  reservePrice: Joi.number().integer().positive().allow(null).optional(),
  bidIncrement: Joi.number().integer().positive().optional(),
  startAt: Joi.date().iso().greater('now').optional(),
  endAt: Joi.date().iso().greater(Joi.ref('startAt')).optional(),
  categoryId: Joi.string().uuid().optional()
});
