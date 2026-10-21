import * as userService from '../services/user.service.js';

/**
 * Handle updating current authenticated user's profile
 */
export const handleUpdateProfile = async (req, res, next) => {
  try {
    const { displayName } = req.body;
    const file = req.file;

    const user = await userService.updateProfile({
      userId: req.user.id,
      displayName,
      file,
    });

    res.json({
      success: true,
      data: { user },
      message: 'Profile updated successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Handle fetching public profile for any seller / user
 */
export const handleGetPublicProfile = async (req, res, next) => {
  try {
    const { id } = req.params;
    const profile = await userService.getPublicProfile(id);

    res.json({
      success: true,
      data: profile,
    });
  } catch (error) {
    next(error);
  }
};
