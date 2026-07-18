import { retryPayment, acceptSecondChance, declineSecondChance, getPaymentById, getMyPayments } from '../services/payment.service.js';

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

export const handleGetPayment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const payment = await getPaymentById({ paymentId: id, userId });

    res.status(200).json({
      success: true,
      data: payment
    });
  } catch (error) {
    next(error);
  }
};

export const handleGetMyPayments = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { cursor, status } = req.query;
    const rawLimit = req.query.limit;
    
    // Parse limit as positive integer and clamp to 100
    const limit = Math.min(Math.max(parseInt(rawLimit, 10) || 20, 1), 100);

    const result = await getMyPayments({ userId, cursor, limit, status });

    res.status(200).json({
      success: true,
      data: result.items,
      meta: {
        nextCursor: result.nextCursor,
        hasMore: !!result.nextCursor
      }
    });
  } catch (error) {
    next(error);
  }
};
