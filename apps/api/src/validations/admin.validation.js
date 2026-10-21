import Joi from 'joi';

export const adminStatsQuerySchema = Joi.object({
  period: Joi.string().valid('1d', '7d', '30d', '90d', 'all').default('7d'),
});

export const adminUsersQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  search: Joi.string().allow('').default(''),
  role: Joi.string().valid('user', 'admin').allow(''),
  status: Joi.string().valid('active', 'suspended', 'banned').allow(''),
  identityStatus: Joi.string().valid('not_started', 'pending', 'verified', 'rejected').allow(''),
});

export const adminBanUserSchema = Joi.object({
  reason: Joi.string().max(500).required(),
});

export const adminSuspendUserSchema = Joi.object({
  reason: Joi.string().max(500).required(),
});

export const adminKycOverrideSchema = Joi.object({
  note: Joi.string().max(500).allow(''),
});

export const adminAuctionsQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  search: Joi.string().allow('').default(''),
  status: Joi.string().allow(''),
  categoryId: Joi.string().uuid().allow(''),
});

export const adminCancelAuctionSchema = Joi.object({
  reason: Joi.string().max(500).required(),
});

export const adminCategoryCreateSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  slug: Joi.string().min(2).max(100).pattern(/^[a-z0-9-]+$/).required(),
  description: Joi.string().max(500).allow('', null),
});

export const adminCategoryUpdateSchema = Joi.object({
  name: Joi.string().min(2).max(100),
  slug: Joi.string().min(2).max(100).pattern(/^[a-z0-9-]+$/),
  description: Joi.string().max(500).allow('', null),
}).min(1);

export const adminCategoryMergeSchema = Joi.object({
  sourceCategoryId: Joi.string().uuid().required(),
  targetCategoryId: Joi.string().uuid().required(),
});
