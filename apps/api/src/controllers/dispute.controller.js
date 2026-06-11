import * as disputeService from '../services/dispute.service.js';
import { openDisputeSchema, addEvidenceSchema, disputeIdSchema, resolveDisputeSchema } from '../validations/dispute.validation.js';

export const handleOpenDispute = async (req, res, next) => {
  try {
    const { error, value } = openDisputeSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ success: false, message: error.details[0].message });
    }

    const result = await disputeService.openDispute({
      ...value,
      buyerId: req.user.id,
    });

    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

export const handleGetDisputeById = async (req, res, next) => {
  try {
    const { error, value } = disputeIdSchema.validate(req.params);
    if (error) {
      return res.status(400).json({ success: false, message: error.details[0].message });
    }

    const disputeId = value.id;
    const result = await disputeService.getDisputeById({
      disputeId,
      userId: req.user.id,
      userRole: req.user.role,
    });

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

export const handleAddEvidence = async (req, res, next) => {
  try {
    const { error, value } = addEvidenceSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ success: false, message: error.details[0].message });
    }

    const paramValidation = disputeIdSchema.validate(req.params);
    if (paramValidation.error) {
      return res.status(400).json({ success: false, message: paramValidation.error.details[0].message });
    }

    const disputeId = paramValidation.value.id;
    const result = await disputeService.addEvidence({
      disputeId,
      userId: req.user.id,
      evidenceUrls: value.evidenceUrls,
    });

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

export const handleWithdrawDispute = async (req, res, next) => {
  try {
    const { error, value } = disputeIdSchema.validate(req.params);
    if (error) {
      return res.status(400).json({ success: false, message: error.details[0].message });
    }

    const disputeId = value.id;
    const result = await disputeService.withdrawDispute({
      disputeId,
      buyerId: req.user.id,
    });

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

export const handleReviewDispute = async (req, res, next) => {
  try {
    const { error, value } = disputeIdSchema.validate(req.params);
    if (error) {
      return res.status(400).json({ success: false, message: error.details[0].message });
    }

    const disputeId = value.id;
    const result = await disputeService.reviewDispute({
      disputeId,
      adminId: req.user.id,
    });

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

export const handleResolveDispute = async (req, res, next) => {
  try {
    const paramValidation = disputeIdSchema.validate(req.params);
    if (paramValidation.error) {
      return res.status(400).json({ success: false, message: paramValidation.error.details[0].message });
    }

    const bodyValidation = resolveDisputeSchema.validate(req.body);
    if (bodyValidation.error) {
      return res.status(400).json({ success: false, message: bodyValidation.error.details[0].message });
    }

    const disputeId = paramValidation.value.id;
    const result = await disputeService.resolveDispute({
      disputeId,
      adminId: req.user.id,
      ...bodyValidation.value,
      ipAddress: req.ip || req.connection.remoteAddress,
    });

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};
