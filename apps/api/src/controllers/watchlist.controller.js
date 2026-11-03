import * as watchlistService from '../services/watchlist.service.js';

export const handleToggleWatchlist = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id: auctionId } = req.params;

    const result = await watchlistService.toggleWatchlist({ userId, auctionId });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const handleGetMyWatchlist = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { page, limit } = req.query;

    const result = await watchlistService.getMyWatchlist({ userId, page, limit });

    res.status(200).json({
      success: true,
      data: result.items,
      meta: result.meta,
    });
  } catch (error) {
    next(error);
  }
};

export const handleGetMyWatchlistIds = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const result = await watchlistService.getMyWatchlistIds({ userId });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
