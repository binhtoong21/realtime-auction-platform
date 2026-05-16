import { retryPayment } from '../services/payment.service.js';

export const handleRetryPayment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { paymentMethodId } = req.body;
    const buyerId = req.user.id;

    await retryPayment({
      paymentId: id,
      buyerId,
      paymentMethodId
    });

    res.status(200).json({
      success: true,
      data: {
        message: 'Payment retried successfully'
      }
    });
  } catch (error) {
    next(error);
  }
};
