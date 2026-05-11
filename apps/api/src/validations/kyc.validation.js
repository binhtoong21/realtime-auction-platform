import Joi from 'joi';

export const connectOnboardingSchema = Joi.object({
  refreshUrl: Joi.string().uri().optional(),
  returnUrl: Joi.string().uri().optional(),
});
