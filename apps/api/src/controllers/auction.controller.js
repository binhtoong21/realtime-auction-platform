import * as auctionService from '../services/auction.service.js';
import * as s3Service from '../services/s3.service.js';
import { v7 as uuidv7 } from 'uuid';

export const getAuctions = async (req, res, next) => {
  try {
    const { status, categoryId, cursor, limit, sort, minPrice, maxPrice } = req.query;
    let { sellerId, bidderId } = req.query;

    if (sellerId === 'me') {
      if (!req.user) {
        return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'You must be logged in to use sellerId=me' } });
      }
      sellerId = req.user.id;
    }

    if (bidderId === 'me') {
      if (!req.user) {
        return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'You must be logged in to use bidderId=me' } });
      }
      bidderId = req.user.id;
    }

    const result = await auctionService.getAuctions({
      status,
      categoryId,
      sellerId,
      bidderId,
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
  let uploadedUrls = [];
  try {
    const sellerId = req.user.id;
    const auctionId = uuidv7();

    if (!req.files || req.files.length === 0) {
      const error = new Error('Images are required to create an auction');
      error.statusCode = 400;
      error.errorCode = 'IMAGES_REQUIRED';
      throw error;
    }

    const uploadPromises = req.files.map((file) => {
      const ext = file.detectedExt || 'bin';
      const s3Key = `auctions/${auctionId}/${Date.now()}-${uuidv7()}.${ext}`;
      return s3Service.uploadFile(file.buffer, file.detectedMime || file.mimetype, s3Key);
    });
    const results = await Promise.allSettled(uploadPromises);
    uploadedUrls = results.filter(r => r.status === 'fulfilled').map(r => r.value);
    
    const rejected = results.find(r => r.status === 'rejected');
    if (rejected) throw rejected.reason;

    const serviceData = {
      id: auctionId,
      title: req.body.title,
      description: req.body.description,
      images: uploadedUrls,
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
    if (uploadedUrls.length > 0) {
      const s3Keys = uploadedUrls.map(url => url.replace(`${process.env.R2_PUBLIC_URL}/`, ''));
      await s3Service.deleteFiles(s3Keys).catch(console.error);
    }
    next(error);
  }
};

export const updateAuction = async (req, res, next) => {
  let newlyUploadedUrls = [];
  try {
    const { id } = req.params;
    const sellerId = req.user.id;
    
    let existingImages = req.body.existingImages || [];
    if (!Array.isArray(existingImages)) {
      existingImages = [existingImages];
    }
    
    const newFiles = req.files || [];
    
    if (existingImages.length + newFiles.length > 10) {
      const error = new Error('Total images cannot exceed 10');
      error.statusCode = 400;
      error.errorCode = 'TOO_MANY_IMAGES';
      throw error;
    }

    const oldAuction = await auctionService.getAuctionById(id, sellerId);
    if (!oldAuction || oldAuction.seller_id !== sellerId) {
      const error = new Error('Auction not found or unauthorized');
      error.statusCode = 404;
      error.errorCode = 'AUCTION_NOT_FOUND';
      throw error;
    }
    const oldImages = oldAuction.images || [];

    const invalidImages = existingImages.filter(url => !oldImages.includes(url));
    if (invalidImages.length > 0) {
      const error = new Error('Invalid existing images provided');
      error.statusCode = 400;
      error.errorCode = 'INVALID_EXISTING_IMAGES';
      throw error;
    }

    if (newFiles.length > 0) {
      const uploadPromises = newFiles.map((file) => {
        const ext = file.detectedExt || 'bin';
        const s3Key = `auctions/${id}/${Date.now()}-${uuidv7()}.${ext}`;
        return s3Service.uploadFile(file.buffer, file.detectedMime || file.mimetype, s3Key);
      });
      const results = await Promise.allSettled(uploadPromises);
      newlyUploadedUrls = results.filter(r => r.status === 'fulfilled').map(r => r.value);
      
      const rejected = results.find(r => r.status === 'rejected');
      if (rejected) throw rejected.reason;
    }

    const finalImages = [...existingImages, ...newlyUploadedUrls];
    
    const serviceData = {
      title: req.body.title,
      description: req.body.description,
      images: finalImages,
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
    
    // Delete orphaned images from S3
    const removedImages = oldImages.filter(url => !finalImages.includes(url));
    if (removedImages.length > 0) {
      const s3Keys = removedImages.map(url => url.replace(`${process.env.R2_PUBLIC_URL}/`, ''));
      s3Service.deleteFiles(s3Keys).catch(console.error);
    }
    
    res.status(200).json({
      success: true,
      data: auction,
    });
  } catch (error) {
    if (newlyUploadedUrls.length > 0) {
      const s3Keys = newlyUploadedUrls.map(url => url.replace(`${process.env.R2_PUBLIC_URL}/`, ''));
      await s3Service.deleteFiles(s3Keys).catch(console.error);
    }
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

export const confirmJoinAuction = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await auctionService.confirmJoinAuction(userId, id);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
