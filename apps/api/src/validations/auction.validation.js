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
