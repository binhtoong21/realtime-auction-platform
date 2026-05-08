import Joi from 'joi';

export const getAuctionsSchema = Joi.object({
  status: Joi.string().valid('draft', 'active', 'ended', 'pending_payment', 'paid', 'shipped', 'completed', 'no_sale').optional(),
  categoryId: Joi.string().uuid().optional(),
  sellerId: Joi.alternatives().try(Joi.string().uuid(), Joi.string().valid('me')).optional(),
  cursor: Joi.string().isoDate().optional(),
  limit: Joi.number().integer().min(1).max(100).default(20).optional(),
});

export const getAuctionBidsSchema = Joi.object({
  limit: Joi.number().integer().min(1).max(100).default(50).optional(),
});

export const createAuctionSchema = Joi.object({
  title: Joi.string().min(3).max(100).required(),
  description: Joi.string().max(2000).required(),
  // TODO Phase 8.2: Replace with multipart/form-data + S3 upload
  // Currently accepts image URLs directly for development
  images: Joi.array().items(Joi.string().uri()).max(10).required(),
  starting_price: Joi.number().positive().precision(2).required(),
  reserve_price: Joi.number().positive().precision(2).allow(null).optional(),
  bid_increment: Joi.number().positive().precision(2).required(),
  start_at: Joi.date().iso().greater('now').required(),
  end_at: Joi.date().iso().greater(Joi.ref('start_at')).required(),
  category_id: Joi.string().uuid().required()
});

export const updateAuctionSchema = Joi.object({
  title: Joi.string().min(3).max(100).optional(),
  description: Joi.string().max(2000).optional(),
  images: Joi.array().items(Joi.string().uri()).max(10).optional(),
  starting_price: Joi.number().positive().precision(2).optional(),
  reserve_price: Joi.number().positive().precision(2).allow(null).optional(),
  bid_increment: Joi.number().positive().precision(2).optional(),
  start_at: Joi.date().iso().greater('now').optional(),
  end_at: Joi.date().iso().greater(Joi.ref('start_at')).optional(),
  category_id: Joi.string().uuid().optional()
});
