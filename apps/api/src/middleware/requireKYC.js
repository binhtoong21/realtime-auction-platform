export const requireKYC = (req, res, next) => {
  // TODO: Enable when kyc_status column is added to the users table
  // if (req.user.kyc_status !== 'verified') {
  //   return res.status(403).json({
  //     success: false,
  //     error: {
  //       code: 'KYC_REQUIRED',
  //       message: 'You must be KYC verified to perform this action'
  //     }
  //   });
  // }
  next();
};

export default requireKYC;
