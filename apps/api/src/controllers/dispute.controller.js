import * as disputeService from '../services/dispute.service.js';
import { openDisputeSchema, addEvidenceSchema } from '../validations/dispute.validation.js';

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
    const disputeId = req.params.id;
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

    const disputeId = req.params.id;
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
    const disputeId = req.params.id;
    const result = await disputeService.withdrawDispute({
      disputeId,
      buyerId: req.user.id,
    });

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};
