import Joi from 'joi';

export const retryPaymentSchema = Joi.object({
  paymentMethodId: Joi.string().uuid().optional()
});
