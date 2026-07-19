import * as disputeService from '../services/dispute.service.js';
import * as s3Service from '../services/s3.service.js';
import { v7 as uuidv7 } from 'uuid';
import { openDisputeSchema, addEvidenceSchema, disputeIdSchema, resolveDisputeSchema } from '../validations/dispute.validation.js';

export const handleOpenDispute = async (req, res, next) => {
  let uploadedUrls = [];
  try {
    const { error, value } = openDisputeSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ success: false, message: error.details[0].message });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'Evidence files are required to open a dispute' });
    }

    const disputeId = uuidv7();

    const uploadPromises = req.files.map((file) => {
      const ext = file.originalname.split('.').pop() || 'bin';
      const s3Key = `disputes/${disputeId}/${Date.now()}-${uuidv7()}.${ext}`;
      return s3Service.uploadFile(file.buffer, file.mimetype, s3Key);
    });
    uploadedUrls = await Promise.all(uploadPromises);

    const result = await disputeService.createDisputeFromRequest({
      id: disputeId,
      ...value,
      buyerId: req.user.id,
      evidenceUrls: uploadedUrls,
    });

    res.status(201).json({ success: true, data: result });
  } catch (err) {
    if (uploadedUrls.length > 0) {
      const s3Keys = uploadedUrls.map(url => url.replace(`${process.env.R2_PUBLIC_URL}/`, ''));
      s3Service.deleteFiles(s3Keys).catch(console.error);
    }
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
  let newlyUploadedUrls = [];
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

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'Evidence files are required' });
    }

    const oldDispute = await disputeService.getDisputeById({ disputeId, userId: req.user.id, userRole: req.user.role });
    const currentEvidence = oldDispute.evidence_urls || [];
    
    if (currentEvidence.length + req.files.length > 3) {
      return res.status(400).json({ 
        success: false, 
        message: `Cumulative evidence limit exceeded. You can only upload ${3 - currentEvidence.length} more file(s).` 
      });
    }

    const uploadPromises = req.files.map((file) => {
      const ext = file.originalname.split('.').pop() || 'bin';
      const s3Key = `disputes/${disputeId}/${Date.now()}-${uuidv7()}.${ext}`;
      return s3Service.uploadFile(file.buffer, file.mimetype, s3Key);
    });
    newlyUploadedUrls = await Promise.all(uploadPromises);

    const result = await disputeService.addEvidence({
      disputeId,
      userId: req.user.id,
      evidenceUrls: newlyUploadedUrls,
    });

    res.json({ success: true, data: result });
  } catch (err) {
    if (newlyUploadedUrls.length > 0) {
      const s3Keys = newlyUploadedUrls.map(url => url.replace(`${process.env.R2_PUBLIC_URL}/`, ''));
      s3Service.deleteFiles(s3Keys).catch(console.error);
    }
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
