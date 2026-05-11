import * as kycService from '../services/kyc.service.js';

export const getKycStatus = async (req, res, next) => {
  try {
    const status = await kycService.getKycStatus(req.user.id);
    res.status(200).json({ success: true, data: status });
  } catch (error) {
    next(error);
  }
};

export const createIdentitySession = async (req, res, next) => {
  try {
    const result = await kycService.createIdentitySession(req.user.id);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

export const createConnectOnboarding = async (req, res, next) => {
  try {
    const { refreshUrl, returnUrl } = req.body;
    const result = await kycService.createConnectOnboarding(req.user.id, {
      refreshUrl,
      returnUrl,
    });
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};
