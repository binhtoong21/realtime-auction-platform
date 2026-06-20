import * as auctionService from '../services/auction.service.js';

export const getAuctions = async (req, res, next) => {
  try {
    const { status, categoryId, cursor, limit, sort, minPrice, maxPrice } = req.query;
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
      sort,
      minPrice: minPrice !== undefined && minPrice !== '' ? Math.round(parseFloat(minPrice) * 100) : undefined,
      maxPrice: maxPrice !== undefined && maxPrice !== '' ? Math.round(parseFloat(maxPrice) * 100) : undefined,
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
    const userId = req.user?.id || null;
    const auction = await auctionService.getAuctionById(id, userId);
    
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

export const createAuction = async (req, res, next) => {
  try {
    const sellerId = req.user.id;
    const serviceData = {
      title: req.body.title,
      description: req.body.description,
      images: req.body.images,
      starting_price: req.body.startingPrice,
      reserve_price: req.body.reservePrice,
      bid_increment: req.body.bidIncrement,
      start_at: req.body.startAt,
      end_at: req.body.endAt,
      category_id: req.body.categoryId
    };
    
    // Remove undefined fields so we don't pass them if they are not provided (important for update)
    Object.keys(serviceData).forEach(key => serviceData[key] === undefined && delete serviceData[key]);

    const auction = await auctionService.createAuction(sellerId, serviceData);
    
    res.status(201).json({
      success: true,
      data: auction,
    });
  } catch (error) {
    next(error);
  }
};

export const updateAuction = async (req, res, next) => {
  try {
    const { id } = req.params;
    const sellerId = req.user.id;
    
    const serviceData = {
      title: req.body.title,
      description: req.body.description,
      images: req.body.images,
      starting_price: req.body.startingPrice,
      reserve_price: req.body.reservePrice,
      bid_increment: req.body.bidIncrement,
      start_at: req.body.startAt,
      end_at: req.body.endAt,
      category_id: req.body.categoryId
    };
    
    // Remove undefined fields
    Object.keys(serviceData).forEach(key => serviceData[key] === undefined && delete serviceData[key]);

    const auction = await auctionService.updateAuction(id, sellerId, serviceData);
    
    res.status(200).json({
      success: true,
      data: auction,
    });
  } catch (error) {
    next(error);
  }
};

export const cancelAuction = async (req, res, next) => {
  try {
    const { id } = req.params;
    const sellerId = req.user.id;
    
    const auction = await auctionService.cancelAuction(id, sellerId);
    
    res.status(200).json({
      success: true,
      data: auction,
    });
  } catch (error) {
    next(error);
  }
};

export const joinAuction = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await auctionService.joinAuction(userId, id);

    if (result.alreadyJoined) {
      return res.status(200).json({
        success: true,
        message: 'Already joined this auction',
        data: {},
      });
    }

    res.status(200).json({
      success: true,
      data: { clientSecret: result.clientSecret },
    });
  } catch (error) {
    next(error);
  }
};
