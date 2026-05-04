import * as auctionService from '../services/auction.service.js';

export const getAuctions = async (req, res, next) => {
  try {
    const { status, categoryId, cursor, limit } = req.query;
    let { sellerId } = req.query;

    if (sellerId === 'me') {
      if (!req.user) {
        return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'You must be logged in to use sellerId=me' } });
      }
      sellerId = req.user.id;
    }

    const result = await auctionService.getAuctions({
      status,
      categoryId,
      sellerId,
      cursor,
      limit: limit ? parseInt(limit, 10) : 20,
    });
    
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getAuctionById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const auction = await auctionService.getAuctionById(id);
    
    res.status(200).json({
      success: true,
      data: auction,
    });
  } catch (error) {
    next(error);
  }
};

export const getAuctionBids = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { limit } = req.query;
    
    const bids = await auctionService.getBidsByAuctionId(id, limit ? parseInt(limit, 10) : 50);
    
    res.status(200).json({
      success: true,
      data: bids,
    });
  } catch (error) {
    next(error);
  }
};
