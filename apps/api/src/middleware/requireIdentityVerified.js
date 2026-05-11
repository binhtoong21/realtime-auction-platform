const requireIdentityVerified = (req, res, next) => {
  if (req.user.identity_status !== 'verified') {
    return res.status(403).json({
      success: false,
      error: {
        code: 'KYC_IDENTITY_REQUIRED',
        message: 'You must complete identity verification to perform this action',
      },
    });
  }
  next();
};

export default requireIdentityVerified;
