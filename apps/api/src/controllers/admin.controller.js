import * as adminService from '../services/admin.service.js';

/**
 * Platform overview stats
 */
export const handleGetStats = async (req, res, next) => {
  try {
    const { period } = req.query;
    const stats = await adminService.getStats({ period });
    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Paginated users list
 */
export const handleGetUsers = async (req, res, next) => {
  try {
    const { page, limit, search, role, status, identityStatus } = req.query;
    const result = await adminService.getUsers({
      page,
      limit,
      search,
      role,
      status,
      identityStatus,
    });

    res.json({
      success: true,
      data: result.users,
      meta: result.meta,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Detailed user view
 */
export const handleGetUserById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const details = await adminService.getUserById(id);
    res.json({
      success: true,
      data: details,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Ban user
 */
export const handleBanUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const user = await adminService.banUser({
      userId: id,
      adminId: req.user.id,
      reason,
    });
    res.json({
      success: true,
      data: user,
      message: 'User banned successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Suspend user
 */
export const handleSuspendUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const user = await adminService.suspendUser({
      userId: id,
      adminId: req.user.id,
      reason,
    });
    res.json({
      success: true,
      data: user,
      message: 'User suspended successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Reactivate user
 */
export const handleReactivateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await adminService.reactivateUser({
      userId: id,
      adminId: req.user.id,
    });
    res.json({
      success: true,
      data: user,
      message: 'User reactivated successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Manual KYC override
 */
export const handleKycOverride = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { note } = req.body;
    const user = await adminService.overrideKyc({
      userId: id,
      adminId: req.user.id,
      note,
    });
    res.json({
      success: true,
      data: user,
      message: 'KYC verified manually',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Paginated auctions list
 */
export const handleGetAuctions = async (req, res, next) => {
  try {
    const { page, limit, search, status, categoryId } = req.query;
    const result = await adminService.getAuctions({
      page,
      limit,
      search,
      status,
      categoryId,
    });

    res.json({
      success: true,
      data: result.auctions,
      meta: result.meta,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Force cancel an auction
 */
export const handleCancelAuction = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const auction = await adminService.cancelAuction({
      auctionId: id,
      adminId: req.user.id,
      reason,
    });
    res.json({
      success: true,
      data: auction,
      message: 'Auction cancelled by administrator',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Categories list with auction counts
 */
export const handleGetCategories = async (req, res, next) => {
  try {
    const categories = await adminService.getCategoriesWithStats();
    res.json({
      success: true,
      data: categories,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create new category
 */
export const handleCreateCategory = async (req, res, next) => {
  try {
    const { name, slug, description } = req.body;
    const category = await adminService.createCategory({
      name,
      slug,
      description,
    });
    res.status(201).json({
      success: true,
      data: category,
      message: 'Category created successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update category
 */
export const handleUpdateCategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, slug, description } = req.body;
    const category = await adminService.updateCategory({
      categoryId: id,
      name,
      slug,
      description,
    });
    res.json({
      success: true,
      data: category,
      message: 'Category updated successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete category
 */
export const handleDeleteCategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await adminService.deleteCategory(id);
    res.json({
      success: true,
      data: result,
      message: 'Category deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Merge categories
 */
export const handleMergeCategories = async (req, res, next) => {
  try {
    const { sourceCategoryId, targetCategoryId } = req.body;
    const result = await adminService.mergeCategories({
      sourceCategoryId,
      targetCategoryId,
    });
    res.json({
      success: true,
      data: result,
      message: 'Categories merged successfully',
    });
  } catch (error) {
    next(error);
  }
};
