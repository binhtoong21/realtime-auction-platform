import * as disputeService from '../services/dispute.service.js';
import * as s3Service from '../services/s3.service.js';
import { v7 as uuidv7 } from 'uuid';
import { openDisputeSchema, addEvidenceSchema, disputeIdSchema, resolveDisputeSchema } from '../validations/dispute.validation.js';

export const handleOpenDispute = async (req, res, next) => {
  let uploadedUrls = [];
  try {
    const value = req.body;

    if (!req.files || req.files.length === 0) {
      const err = new Error('Evidence files are required to open a dispute');
      err.statusCode = 400;
      err.errorCode = 'EVIDENCE_REQUIRED';
      return next(err);
    }

    const disputeId = uuidv7();

    const uploadPromises = req.files.map((file) => {
      const ext = file.detectedExt || 'bin';
      const s3Key = `disputes/${disputeId}/${Date.now()}-${uuidv7()}.${ext}`;
      return s3Service.uploadFile(file.buffer, file.detectedMime || file.mimetype, s3Key);
    });
    const results = await Promise.allSettled(uploadPromises);
    uploadedUrls = results.filter(r => r.status === 'fulfilled').map(r => r.value);
    
    const rejected = results.find(r => r.status === 'rejected');
    if (rejected) throw rejected.reason;

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
  let newlyUploadedUrls = [];
  try {
    const disputeId = req.params.id;

    if (!req.files || req.files.length === 0) {
      const err = new Error('Evidence files are required');
      err.statusCode = 400;
      err.errorCode = 'EVIDENCE_REQUIRED';
      return next(err);
    }

    const uploadPromises = req.files.map((file) => {
      const ext = file.detectedExt || 'bin';
      const s3Key = `disputes/${disputeId}/${Date.now()}-${uuidv7()}.${ext}`;
      return s3Service.uploadFile(file.buffer, file.detectedMime || file.mimetype, s3Key);
    });
    const results = await Promise.allSettled(uploadPromises);
    newlyUploadedUrls = results.filter(r => r.status === 'fulfilled').map(r => r.value);
    
    const rejected = results.find(r => r.status === 'rejected');
    if (rejected) throw rejected.reason;

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

export const handleReviewDispute = async (req, res, next) => {
  try {
    const disputeId = req.params.id;
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
    const disputeId = req.params.id;
    const result = await disputeService.resolveDispute({
      disputeId,
      adminId: req.user.id,
      ...req.body,
      ipAddress: req.ip || req.connection.remoteAddress,
    });

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};
