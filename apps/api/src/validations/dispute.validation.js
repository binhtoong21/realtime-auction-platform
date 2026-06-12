import Joi from 'joi';
import { DisputeReason, DisputePolicyRule, DisputeRejectionReason, DisputeOutcome } from '@auction/shared-constants';

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
  outcome: Joi.string().valid(DisputeOutcome.BUYER_WINS, DisputeOutcome.SELLER_WINS).required(),
  resolutionNote: Joi.string().min(20).max(2000).required(),
  policyRule: Joi.string().valid(...Object.values(DisputePolicyRule))
    .when('outcome', { is: DisputeOutcome.BUYER_WINS, then: Joi.required(), otherwise: Joi.forbidden() }),
  rejectionReason: Joi.string().valid(...Object.values(DisputeRejectionReason))
    .when('outcome', { is: DisputeOutcome.SELLER_WINS, then: Joi.required(), otherwise: Joi.forbidden() }),
});
