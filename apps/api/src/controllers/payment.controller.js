import { retryPayment, acceptSecondChance, declineSecondChance } from '../services/payment.service.js';

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

export const handleAcceptSecondChance = async (req, res, next) => {
  try {
    const { id: auctionId } = req.params;
    const userId = req.user.id;

    const result = await acceptSecondChance({ auctionId, userId });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const handleDeclineSecondChance = async (req, res, next) => {
  try {
    const { id: auctionId } = req.params;
    const userId = req.user.id;

    await declineSecondChance({ auctionId, userId });

    res.status(200).json({
      success: true,
      data: { status: 'no_sale' },
    });
  } catch (error) {
    next(error);
  }
};
