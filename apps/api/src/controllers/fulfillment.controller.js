import { shipAuction, updateTracking, getTracking, extendShipping, confirmDelivery, extendDelivery } from '../services/fulfillment.service.js';

export const handleShipAuction = async (req, res, next) => {
  try {
    const { id: auctionId } = req.params;
    const { carrier, trackingNumber } = req.body;
    const sellerId = req.user.id;

    const result = await shipAuction({
      auctionId,
      sellerId,
      carrier,
      trackingNumber,
      ipAddress: req.ip,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const handleUpdateTracking = async (req, res, next) => {
  try {
    const { id: auctionId } = req.params;
    const { carrier, trackingNumber } = req.body;
    const sellerId = req.user.id;

    const result = await updateTracking({
      auctionId,
      sellerId,
      carrier,
      trackingNumber,
      ipAddress: req.ip,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const handleGetTracking = async (req, res, next) => {
  try {
    const { id: auctionId } = req.params;
    const userId = req.user.id;

    const result = await getTracking({ auctionId, userId });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const handleExtendShipping = async (req, res, next) => {
  try {
    const { id: auctionId } = req.params;
    const { reason } = req.body;
    const sellerId = req.user.id;

    const result = await extendShipping({
      auctionId,
      sellerId,
      reason,
      ipAddress: req.ip,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const handleConfirmDelivery = async (req, res, next) => {
  try {
    const { id: auctionId } = req.params;
    const buyerId = req.user.id;

    const result = await confirmDelivery({
      auctionId,
      buyerId,
      ipAddress: req.ip,
    });

    if (result.captured === false) {
      return res.status(202).json({
        success: true,
        data: result,
      });
    }

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const handleExtendDelivery = async (req, res, next) => {
  try {
    const { id: auctionId } = req.params;
    const { reason } = req.body;
    const buyerId = req.user.id;

    const result = await extendDelivery({
      auctionId,
      buyerId,
      reason,
      ipAddress: req.ip,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
