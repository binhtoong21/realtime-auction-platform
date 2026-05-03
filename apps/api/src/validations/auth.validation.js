import Joi from 'joi';

const passwordPattern = /^(?=.*[A-Z])(?=.*\d).{8,}$/;
const passwordMessage = 'Password must be at least 8 characters with 1 uppercase letter and 1 number';

export const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().pattern(passwordPattern).required()
    .messages({ 'string.pattern.base': passwordMessage }),
  displayName: Joi.string().min(2).max(50).required(),
});

export const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

export const forgotPasswordSchema = Joi.object({
  email: Joi.string().email().required(),
});

export const resetPasswordSchema = Joi.object({
  token: Joi.string().required(),
  newPassword: Joi.string().pattern(passwordPattern).required()
    .messages({ 'string.pattern.base': passwordMessage }),
});

export const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().pattern(passwordPattern).required()
    .messages({ 'string.pattern.base': passwordMessage }),
});
