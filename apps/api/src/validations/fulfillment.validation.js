import Joi from 'joi';
import { CARRIERS, CARRIER_TRACKING_REGEX } from '@auction/shared-constants';

const carrierValues = Object.values(CARRIERS);

/**
 * Cross-field validator: trackingNumber format must match carrier regex.
 */
const trackingValidator = (value, helpers) => {
  const regex = CARRIER_TRACKING_REGEX[value.carrier];
  if (regex && !regex.test(value.trackingNumber)) {
    return helpers.message(`Invalid tracking number format for carrier ${value.carrier}`);
  }
  return value;
};

export const shipAuctionSchema = Joi.object({
  carrier: Joi.string()
    .valid(...carrierValues)
    .required()
    .messages({
      'any.only': `carrier must be one of: ${carrierValues.join(', ')}`,
    }),
  trackingNumber: Joi.string()
    .trim()
    .required()
    .messages({
      'string.empty': 'trackingNumber is required',
    }),
}).custom(trackingValidator);

export const updateTrackingSchema = Joi.object({
  carrier: Joi.string()
    .valid(...carrierValues)
    .required()
    .messages({
      'any.only': `carrier must be one of: ${carrierValues.join(', ')}`,
    }),
  trackingNumber: Joi.string()
    .trim()
    .required()
    .messages({
      'string.empty': 'trackingNumber is required',
    }),
}).custom(trackingValidator);

export const extendShippingSchema = Joi.object({
  reason: Joi.string()
    .trim()
    .required()
    .min(10)
    .messages({
      'string.empty': 'reason is required',
      'string.min': 'reason must be at least 10 characters',
    }),
});

export const extendDeliverySchema = Joi.object({
  reason: Joi.string()
    .trim()
    .required()
    .min(10)
    .messages({
      'string.empty': 'reason is required',
      'string.min': 'reason must be at least 10 characters',
    }),
});
