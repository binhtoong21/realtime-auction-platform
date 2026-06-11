import Joi from 'joi';
import { DisputeReason, DisputePolicyRule, DisputeRejectionReason } from '@auction/shared-constants';

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

export const resolveDisputeSchema = Joi.object({
  outcome: Joi.string().valid('buyer_wins', 'seller_wins').required(),
  resolutionNote: Joi.string().min(20).max(2000).required(),
  policyRule: Joi.string().valid(...Object.values(DisputePolicyRule))
    .when('outcome', { is: 'buyer_wins', then: Joi.required(), otherwise: Joi.forbidden() }),
  rejectionReason: Joi.string().valid(...Object.values(DisputeRejectionReason))
    .when('outcome', { is: 'seller_wins', then: Joi.required(), otherwise: Joi.forbidden() }),
});
