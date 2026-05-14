import { pool } from '../config/database.js';
import stripe from '../config/stripe.js';
import { ensureStripeCustomer } from './kyc.service.js';

/**
 * Lấy danh sách thẻ của user
 */
const getPaymentMethods = async (userId) => {
  const result = await pool.query(
    `SELECT id, last4, brand, is_default, expires_at 
     FROM payment_methods 
     WHERE user_id = $1 
     ORDER BY created_at DESC`,
    [userId]
  );
  return result.rows.map(row => ({
    id: row.id,
    last4: row.last4,
    brand: row.brand,
    isDefault: row.is_default,
    expiresAt: row.expires_at,
  }));
};

/**
 * Tạo SetupIntent để thêm thẻ mới
 */
const createSetupIntent = async (userId) => {
  // Check count
  const countResult = await pool.query(
    'SELECT count(*) FROM payment_methods WHERE user_id = $1',
    [userId]
  );
  if (parseInt(countResult.rows[0].count) >= 5) {
    const error = new Error('Bạn chỉ được thêm tối đa 5 thẻ.');
    error.statusCode = 400;
    error.errorCode = 'MAX_PAYMENT_METHODS_REACHED';
    throw error;
  }

  const user = await ensureStripeCustomer(userId);

  const setupIntent = await stripe.setupIntents.create({
    customer: user.stripe_cus_id,
    payment_method_types: ['card'],
    metadata: {
      user_id: userId,
    },
  });

  return { clientSecret: setupIntent.client_secret };
};

/**
 * Xóa thẻ
 */
const deletePaymentMethod = async (userId, pmId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Kiểm tra thẻ có tồn tại và thuộc về user không
    const pmResult = await client.query(
      'SELECT stripe_pm_id, is_default FROM payment_methods WHERE id = $1 AND user_id = $2',
      [pmId, userId]
    );

    if (pmResult.rows.length === 0) {
      const error = new Error('Không tìm thấy thẻ hoặc không có quyền.');
      error.statusCode = 404;
      error.errorCode = 'PAYMENT_METHOD_NOT_FOUND';
      throw error;
    }

    const { stripe_pm_id, is_default } = pmResult.rows[0];

    // Kiểm tra xem thẻ có đang được hold không
    const activeHolds = await client.query(
      `SELECT 1 FROM payments 
       WHERE payment_method_id = $1 
       AND status IN ('hold_pending', 'authorized', 'frozen', 'grace_period', 'second_chance')`,
      [pmId]
    );

    if (activeHolds.rows.length > 0) {
      const error = new Error('Thẻ này đang được sử dụng cho giao dịch đang chờ xử lý.');
      error.statusCode = 400;
      error.errorCode = 'PAYMENT_METHOD_IN_USE';
      throw error;
    }

    // Xóa trên Stripe
    try {
      await stripe.paymentMethods.detach(stripe_pm_id);
    } catch (stripeErr) {
      console.error('[Stripe] Detach PM failed:', stripeErr.message);
      // Tiếp tục xóa ở DB local ngay cả khi Stripe lỗi (có thể do PM không còn tồn tại bên Stripe)
    }

    // Đếm thẻ còn lại trước khi xóa
    const remainingCount = await client.query(
      'SELECT COUNT(*) FROM payment_methods WHERE user_id = $1 AND id != $2',
      [userId, pmId]
    );
    const isLastCard = parseInt(remainingCount.rows[0].count) === 0;

    // Xóa ở DB local
    await client.query('DELETE FROM payment_methods WHERE id = $1', [pmId]);

    // Nếu xóa thẻ mặc định, tự động gán thẻ khác làm mặc định (nếu còn)
    if (is_default && !isLastCard) {
      const remainingPm = await client.query(
        'SELECT id FROM payment_methods WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
        [userId]
      );
      if (remainingPm.rows.length > 0) {
        await client.query(
          'UPDATE payment_methods SET is_default = true WHERE id = $1',
          [remainingPm.rows[0].id]
        );
      }
    }

    await client.query('COMMIT');
    return {
      message: 'Đã xóa thẻ thanh toán',
      warning: isLastCard
        ? 'Bạn vừa xóa thẻ cuối cùng và sẽ không thể tham gia đấu giá.'
        : null,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Đặt làm thẻ mặc định
 */
const setDefaultPaymentMethod = async (userId, pmId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const pmResult = await client.query(
      'SELECT id FROM payment_methods WHERE id = $1 AND user_id = $2',
      [pmId, userId]
    );

    if (pmResult.rows.length === 0) {
      const error = new Error('Không tìm thấy thẻ hoặc không có quyền.');
      error.statusCode = 404;
      error.errorCode = 'PAYMENT_METHOD_NOT_FOUND';
      throw error;
    }

    // Xóa mặc định các thẻ cũ
    await client.query(
      'UPDATE payment_methods SET is_default = false WHERE user_id = $1',
      [userId]
    );

    // Set mặc định thẻ mới
    await client.query(
      'UPDATE payment_methods SET is_default = true WHERE id = $1',
      [pmId]
    );

    await client.query('COMMIT');
    return { success: true };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export {
  getPaymentMethods,
  createSetupIntent,
  deletePaymentMethod,
  setDefaultPaymentMethod,
};
