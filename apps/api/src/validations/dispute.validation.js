import Joi from 'joi';
import { DisputeReason } from '@auction/shared-constants';

export const openDisputeSchema = Joi.object({
  paymentId: Joi.string().uuid().required(),
  reason: Joi.string().valid(...Object.values(DisputeReason)).required(),
  description: Joi.string().max(1000).allow('', null).optional(),
  evidenceUrls: Joi.array().items(Joi.string().uri()).max(10).default([]),
});

export const addEvidenceSchema = Joi.object({
  evidenceUrls: Joi.array().items(Joi.string().uri()).max(10).required(),
});

export const disputeIdSchema = Joi.object({
  id: Joi.string().uuid().required(),
});
