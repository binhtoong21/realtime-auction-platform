import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { pool, withTransaction } from '../config/database.js';
import stripe from '../config/stripe.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '../utils/jwt.js';
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
} from './email.service.js';

const SALT_ROUNDS = 12;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MINUTES = 15;

const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

const generateCryptoToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

// Pre-compute a dummy hash to prevent timing attacks during login
let DUMMY_HASH = '';
bcrypt.hash('dummy_password_for_timing_attack', SALT_ROUNDS).then(hash => {
  DUMMY_HASH = hash;
});

/**
 * Register a new user with email/password.
 */
const register = async ({ email, password, displayName }) => {
  const existing = await pool.query(
    'SELECT id, status FROM users WHERE email = $1',
    [email.toLowerCase()]
  );

  if (existing.rows.length > 0) {
    const user = existing.rows[0];
    if (user.status === 'unverified') {
      await withTransaction(async (client) => {
        // Acquire a lock on the user's verification rows to prevent TOCTOU
        const recentToken = await client.query(
          `SELECT created_at FROM email_verification_tokens WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
          [user.id]
        );
        
        if (recentToken.rows.length > 0) {
          const createdAt = new Date(recentToken.rows[0].created_at);
          const minutesSinceCreation = (new Date() - createdAt) / (1000 * 60);
          
          if (minutesSinceCreation < 5) {
             const error = new Error('Please wait 5 minutes before requesting a new registration/verification email for this account.');
             error.statusCode = 429;
             error.errorCode = 'TOO_MANY_REQUESTS';
             throw error;
          }
        }

        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
        const verifyToken = generateCryptoToken();
        const verifyTokenHash = hashToken(verifyToken);

        await client.query(
          `UPDATE users SET password_hash = $1, display_name = $2 WHERE id = $3`,
          [passwordHash, displayName, user.id]
        );
        await client.query(
          `DELETE FROM email_verification_tokens WHERE user_id = $1`,
          [user.id]
        );
        await client.query(
          `INSERT INTO email_verification_tokens (id, user_id, token_hash, expires_at)
           VALUES ($1, $2, $3, NOW() + INTERVAL '24 hours')`,
          [uuidv4(), user.id, verifyTokenHash]
        );
        
        // Return token outside transaction to avoid blocking it with external API calls
        return verifyToken;
      }).then(async (verifyToken) => {
         await sendVerificationEmail(email, verifyToken);
      });
      return { userId: user.id };
    } else {
      const error = new Error('Email already registered');
      error.statusCode = 409;
      error.errorCode = 'EMAIL_ALREADY_EXISTS';
      throw error;
    }
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const userId = uuidv4();
  const verifyToken = generateCryptoToken();
  const verifyTokenHash = hashToken(verifyToken);

  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO users (id, email, password_hash, display_name, auth_provider, status)
       VALUES ($1, $2, $3, $4, 'email', 'unverified')`,
      [userId, email.toLowerCase(), passwordHash, displayName]
    );

    await client.query(
      `INSERT INTO email_verification_tokens (id, user_id, token_hash, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '24 hours')`,
      [uuidv4(), userId, verifyTokenHash]
    );
  });

  await sendVerificationEmail(email, verifyToken);

  // Create Stripe Customer (non-blocking — user is created even if this fails)
  try {
    const customer = await stripe.customers.create({
      email: email.toLowerCase(),
      name: displayName || undefined,
      metadata: { user_id: userId },
    });
    await pool.query(
      'UPDATE users SET stripe_cus_id = $1 WHERE id = $2',
      [customer.id, userId]
    );
  } catch (stripeErr) {
    // Structured operational logging
    console.error(JSON.stringify({
      event: 'StripeCustomerCreationFailed',
      userId,
      email,
      error: stripeErr.message,
      stack: stripeErr.stack
    }));

    // TODO: Emit monitoring metric or alert (e.g., StripeCustomerCreationFailures)
    
    // TODO: Enqueue a background retry job (e.g., via BullMQ 'createStripeCustomer' queue) 
    // or insert a retry row so the missing stripe_cus_id can be retried/monitored.
    // This ensures failures do not throw back into the main registration flow while preserving recoverability.
  }

  return { userId };
};

/**
 * Verify a user's email address.
 */
const verifyEmail = async (token) => {
  const tokenHash = hashToken(token);

  const result = await pool.query(
    `SELECT evt.id, evt.user_id, evt.expires_at, evt.used_at
     FROM email_verification_tokens evt
     WHERE evt.token_hash = $1`,
    [tokenHash]
  );

  if (result.rows.length === 0) {
    const error = new Error('Invalid verification token');
    error.statusCode = 400;
    error.errorCode = 'INVALID_TOKEN';
    throw error;
  }

  const record = result.rows[0];

  if (record.used_at) {
    const error = new Error('Token has already been used');
    error.statusCode = 400;
    error.errorCode = 'TOKEN_ALREADY_USED';
    throw error;
  }

  if (new Date(record.expires_at) < new Date()) {
    const error = new Error('Verification token has expired');
    error.statusCode = 400;
    error.errorCode = 'TOKEN_EXPIRED';
    throw error;
  }

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE users SET status = 'active' WHERE id = $1`,
      [record.user_id]
    );
    await client.query(
      `UPDATE email_verification_tokens SET used_at = NOW() WHERE id = $1`,
      [record.id]
    );
  });

  return { userId: record.user_id };
};

/**
 * Login with email/password. Returns access + refresh token pair.
 */
const login = async ({ email, password }) => {
  const result = await pool.query(
    `SELECT id, email, password_hash, display_name, role, status,
            failed_login_attempts, locked_until
     FROM users WHERE email = $1`,
    [email.toLowerCase()]
  );

  if (result.rows.length === 0) {
    // Perform a dummy hash comparison to equalize response time 
    // and mitigate User Enumeration via Timing Attacks
    if (DUMMY_HASH) {
      await bcrypt.compare(password, DUMMY_HASH);
    }
    const error = new Error('Invalid email or password');
    error.statusCode = 401;
    error.errorCode = 'INVALID_CREDENTIALS';
    throw error;
  }

  const user = result.rows[0];

  if (user.status === 'banned') {
    const error = new Error('Account has been banned');
    error.statusCode = 403;
    error.errorCode = 'ACCOUNT_BANNED';
    throw error;
  }

  if (user.status === 'unverified') {
    const error = new Error('Please verify your email before logging in');
    error.statusCode = 403;
    error.errorCode = 'EMAIL_NOT_VERIFIED';
    throw error;
  }

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const minutesLeft = Math.ceil(
      (new Date(user.locked_until) - new Date()) / 60000
    );
    const error = new Error(
      `Account is locked. Try again in ${minutesLeft} minute(s)`
    );
    error.statusCode = 429;
    error.errorCode = 'ACCOUNT_LOCKED';
    throw error;
  }

  const isValid = await bcrypt.compare(password, user.password_hash);

  if (!isValid) {
    const attempts = user.failed_login_attempts + 1;

    if (attempts >= MAX_LOGIN_ATTEMPTS) {
      await pool.query(
        `UPDATE users SET failed_login_attempts = $1, 
                          locked_until = NOW() + INTERVAL '${LOCK_DURATION_MINUTES} minutes'
         WHERE id = $2`,
        [attempts, user.id]
      );
    } else {
      await pool.query(
        `UPDATE users SET failed_login_attempts = $1 WHERE id = $2`,
        [attempts, user.id]
      );
    }

    const error = new Error('Invalid email or password');
    error.statusCode = 401;
    error.errorCode = 'INVALID_CREDENTIALS';
    throw error;
  }

  // Login success — reset attempts
  const tokenPayload = { id: user.id, role: user.role };
  const accessToken = generateAccessToken(tokenPayload);
  const refreshTokenRaw = generateRefreshToken(tokenPayload);
  const refreshTokenHash = hashToken(refreshTokenRaw);
  const refreshTokenId = uuidv4();

  await pool.query(
    `UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1`,
    [user.id]
  );

  await pool.query(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
     VALUES ($1, $2, $3, NOW() + INTERVAL '7 days')`,
    [refreshTokenId, user.id, refreshTokenHash]
  );

  return {
    accessToken,
    refreshToken: refreshTokenRaw,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      role: user.role,
    },
  };
};

/**
 * Refresh token rotation: issue new pair, revoke old.
 */
const refresh = async (oldRefreshToken) => {
  let decoded;
  try {
    decoded = verifyRefreshToken(oldRefreshToken);
  } catch {
    const error = new Error('Invalid or expired refresh token');
    error.statusCode = 401;
    error.errorCode = 'INVALID_REFRESH_TOKEN';
    throw error;
  }

  const oldTokenHash = hashToken(oldRefreshToken);

  const result = await pool.query(
    `SELECT rt.id, rt.user_id, rt.expires_at, rt.revoked_at,
            u.role, u.status
     FROM refresh_tokens rt
     JOIN users u ON u.id = rt.user_id
     WHERE rt.token_hash = $1`,
    [oldTokenHash]
  );

  if (result.rows.length === 0 || result.rows[0].revoked_at) {
    const error = new Error('Refresh token has been revoked');
    error.statusCode = 401;
    error.errorCode = 'TOKEN_REVOKED';
    throw error;
  }

  const record = result.rows[0];

  if (record.status === 'banned') {
    const error = new Error('Account has been banned');
    error.statusCode = 403;
    error.errorCode = 'ACCOUNT_BANNED';
    throw error;
  }

  const tokenPayload = { id: record.user_id, role: record.role };
  const newAccessToken = generateAccessToken(tokenPayload);
  const newRefreshTokenRaw = generateRefreshToken(tokenPayload);
  const newRefreshTokenHash = hashToken(newRefreshTokenRaw);

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1`,
      [record.id]
    );

    await client.query(
      `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '7 days')`,
      [uuidv4(), record.user_id, newRefreshTokenHash]
    );
  });

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshTokenRaw,
  };
};

/**
 * Logout: revoke the given refresh token.
 */
const logout = async (refreshToken) => {
  const tokenHash = hashToken(refreshToken);

  await pool.query(
    `UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL`,
    [tokenHash]
  );
};

/**
 * Send password reset email.
 */
const forgotPassword = async (email) => {
  const result = await pool.query(
    'SELECT id FROM users WHERE email = $1 AND auth_provider = $2',
    [email.toLowerCase(), 'email']
  );

  if (result.rows.length === 0) {
    return;
  }

  const userId = result.rows[0].id;
  const resetToken = generateCryptoToken();
  const resetTokenHash = hashToken(resetToken);

  await pool.query(
    `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
     VALUES ($1, $2, $3, NOW() + INTERVAL '1 hour')`,
    [uuidv4(), userId, resetTokenHash]
  );

  await sendPasswordResetEmail(email, resetToken);
};

/**
 * Reset password using token from email.
 */
const resetPassword = async (token, newPassword) => {
  const tokenHash = hashToken(token);

  const result = await pool.query(
    `SELECT id, user_id, expires_at, used_at
     FROM password_reset_tokens
     WHERE token_hash = $1`,
    [tokenHash]
  );

  if (result.rows.length === 0) {
    const error = new Error('Invalid reset token');
    error.statusCode = 400;
    error.errorCode = 'INVALID_TOKEN';
    throw error;
  }

  const record = result.rows[0];

  if (record.used_at) {
    const error = new Error('Token has already been used');
    error.statusCode = 400;
    error.errorCode = 'TOKEN_ALREADY_USED';
    throw error;
  }

  if (new Date(record.expires_at) < new Date()) {
    const error = new Error('Reset token has expired');
    error.statusCode = 400;
    error.errorCode = 'TOKEN_EXPIRED';
    throw error;
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE users SET password_hash = $1 WHERE id = $2`,
      [passwordHash, record.user_id]
    );

    await client.query(
      `UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1`,
      [record.id]
    );

    await client.query(
      `UPDATE refresh_tokens SET revoked_at = NOW() 
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [record.user_id]
    );
  });
};

/**
 * Change password for logged-in user. Revokes all sessions except current.
 */
const changePassword = async (userId, currentPassword, newPassword, currentRefreshToken) => {
  const result = await pool.query(
    'SELECT password_hash FROM users WHERE id = $1',
    [userId]
  );

  if (result.rows.length === 0) {
    const error = new Error('User not found');
    error.statusCode = 404;
    error.errorCode = 'USER_NOT_FOUND';
    throw error;
  }

  const isValid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);

  if (!isValid) {
    const error = new Error('Current password is incorrect');
    error.statusCode = 401;
    error.errorCode = 'INVALID_CREDENTIALS';
    throw error;
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  const currentTokenHash = currentRefreshToken ? hashToken(currentRefreshToken) : null;

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE users SET password_hash = $1 WHERE id = $2`,
      [passwordHash, userId]
    );

    if (currentTokenHash) {
      await client.query(
        `UPDATE refresh_tokens SET revoked_at = NOW() 
         WHERE user_id = $1 AND revoked_at IS NULL AND token_hash != $2`,
        [userId, currentTokenHash]
      );
    } else {
      await client.query(
        `UPDATE refresh_tokens SET revoked_at = NOW() 
         WHERE user_id = $1 AND revoked_at IS NULL`,
        [userId]
      );
    }
  });
};

/**
 * Check if an email is available for registration.
 * Returns true if the email is not found, or if it is unverified and past the cooldown.
 */
const checkEmail = async (email) => {
  const result = await pool.query(
    'SELECT id, status FROM users WHERE email = $1',
    [email.toLowerCase()]
  );

  if (result.rows.length === 0) {
    return { available: true };
  }

  const user = result.rows[0];
  if (user.status === 'unverified') {
    const recentToken = await pool.query(
      `SELECT created_at FROM email_verification_tokens WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [user.id]
    );

    if (recentToken.rows.length > 0) {
      const createdAt = new Date(recentToken.rows[0].created_at);
      const minutesSinceCreation = (new Date() - createdAt) / (1000 * 60);

      if (minutesSinceCreation < 5) {
        return { 
          available: false, 
          message: 'An unverified account exists and recently requested a token. Please wait 5 minutes.'
        };
      }
    }
    // Available to overwrite
    return { available: true };
  }

  return { available: false, message: 'Email is already registered.' };
};

export {
  register,
  verifyEmail,
  login,
  refresh,
  logout,
  forgotPassword,
  resetPassword,
  changePassword,
  checkEmail,
};
