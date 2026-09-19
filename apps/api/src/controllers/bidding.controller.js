import * as biddingService from '../services/bidding.service.js';

export const placeBid = async (req, res, next) => {
  try {
    const { id: auctionId } = req.params;
    const { amount } = req.body;
    const userId = req.user.id;
    const idempotencyKey = req.idempotencyKey;

    const result = await biddingService.processBid({
      auctionId,
      userId,
      amount,
      idempotencyKey
    });

    res.status(201).json({
      success: true,
      data: result
    });
  } catch (error) {
    if (error.code === 'ERR_OUTBID' || error.code === 'ERR_AUCTION_ENDED') {
      return res.status(400).json({
        success: false,
        error: { code: error.code, message: error.message, details: error.details }
      });
    }
    next(error);
  }
};

export const handleGetMyBids = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { cursor, limit } = req.query;
    
    const result = await biddingService.getMyBids(userId, cursor, limit ? parseInt(limit, 10) : 20);
    
    res.status(200).json({
      success: true,
      data: result.bids,
      meta: result.meta
    });
  } catch (error) {
    next(error);
  }
};
