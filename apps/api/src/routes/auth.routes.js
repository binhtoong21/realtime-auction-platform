import { Router } from 'express';
import validate from '../middleware/validate.js';
import requireAuth from '../middleware/requireAuth.js';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  checkEmailSchema,
} from '../validations/auth.validation.js';
import {
  register,
  verifyEmail,
  login,
  refreshToken,
  logout,
  forgotPassword,
  resetPassword,
  changePassword,
  getMe,
  checkEmail,
} from '../controllers/auth.controller.js';

const router = Router();

router.get('/me', requireAuth, getMe);
router.get('/check-email', validate(checkEmailSchema, 'query'), checkEmail);
router.post('/register', validate(registerSchema), register);
router.get('/verify-email', verifyEmail);
router.post('/login', validate(loginSchema), login);
router.post('/refresh', refreshToken);
router.post('/logout', requireAuth, logout);
router.post('/forgot-password', validate(forgotPasswordSchema), forgotPassword);
router.post('/reset-password', validate(resetPasswordSchema), resetPassword);
router.patch('/change-password', requireAuth, validate(changePasswordSchema), changePassword);

export default router;
