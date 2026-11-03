import Joi from 'joi';

export const toggleWatchlistSchema = Joi.object({
  id: Joi.string().uuid().required(),
});

export const getMyWatchlistSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});
