import { pool } from '../config/database.js';
import { v7 as uuidv7 } from 'uuid';
import { CARRIER_TRACKING_URLS, EventNames } from '@auction/shared-constants';
import { emitToUser } from './socket.service.js';
import stripe from '../config/stripe.js';
import { rescheduleShippingDeadline, schedulePayoutJob, removeDeliveryJobs, rescheduleDeliveryJobs } from '../jobs/queue.js';

/**
 * Write an immutable financial audit log entry.
 */
const writeAuditLog = async ({ referenceId, referenceType, action, deltaState, actorId, ipAddress }, client) => {
  const queryFn = client || pool;
  await queryFn.query(
    `INSERT INTO financial_audit_logs (id, reference_id, reference_type, action, delta_state, actor_id, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [uuidv7(), referenceId, referenceType, action, JSON.stringify(deltaState), actorId, ipAddress || null]
  );
};

/**
 * Build a tracking URL from carrier and tracking number.
 * Returns null for carrier 'other' or unknown carriers.
 */
const buildTrackingUrl = (carrier, trackingNumber) => {
  const baseUrl = CARRIER_TRACKING_URLS[carrier];
  return baseUrl ? `${baseUrl}${trackingNumber}` : null;
};

/**
 * Seller confirms shipment — transitions auction from AWAITING_SHIP to SHIPPED.
 *
 * Guards (all in SQL WHERE clause):
 *   - auction.status = 'awaiting_ship'
 *   - auction.seller_id = sellerId (ownership)
 *
 * Sets delivery_deadline_at = NOW() + 14 days (frozen per-transaction, same as shipped_at).
 * Sweeper (Phase 10.6) will detect the shipped auction and schedule BullMQ jobs.
 */
export const shipAuction = async ({ auctionId, sellerId, carrier, trackingNumber, ipAddress }) => {
  const client = await pool.connect();
  let updatedAuction;

  try {
    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE auctions SET
         status = 'shipped',
         carrier = $1,
         tracking_number = $2,
         shipped_at = NOW(),
         delivery_deadline_at = NOW() + INTERVAL '14 days',
         updated_at = NOW()
       WHERE id = $3
         AND status = 'awaiting_ship'
         AND seller_id = $4
       RETURNING *`,
      [carrier, trackingNumber, auctionId, sellerId]
    );

    if (result.rowCount === 0) {
      const err = new Error('Auction cannot be shipped in its current state');
      err.statusCode = 409;
      err.errorCode = 'INVALID_AUCTION_STATE';
      throw err;
    }

    updatedAuction = result.rows[0];

    await writeAuditLog({
      referenceId: auctionId,
      referenceType: 'auction',
      action: 'auction_shipped',
      deltaState: {
        from: 'awaiting_ship',
        to: 'shipped',
        carrier,
        trackingNumber,
      },
      actorId: sellerId,
      ipAddress,
    }, client);

    await client.query('COMMIT');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* already rolled back or committed */ }
    throw err;
  } finally {
    client.release();
  }

  // Post-transaction side effects (fire-and-forget, never rollback DB on failure)
  const trackingUrl = buildTrackingUrl(carrier, trackingNumber);
  const buyerId = updatedAuction.winner_id;

  try {
    if (buyerId) {
      emitToUser(buyerId, EventNames.AUCTION_SHIPPED, {
        auctionId,
        carrier,
        trackingNumber,
        trackingUrl,
        shippedAt: updatedAuction.shipped_at,
        deliveryDeadlineAt: updatedAuction.delivery_deadline_at,
      });
    }

    emitToUser(sellerId, EventNames.AUCTION_SHIPPED, {
      auctionId,
      status: 'shipped',
    });
  } catch (wsErr) {
    console.error(`[Fulfillment] WS emit failed for auction ${auctionId}:`, wsErr);
  }

  return {
    status: 'shipped',
    shippedAt: updatedAuction.shipped_at,
    deliveryDeadlineAt: updatedAuction.delivery_deadline_at,
    trackingUrl,
  };
};

/**
 * Seller updates tracking info — allowed once, within 24h of shipment.
 *
 * Guards (all in SQL WHERE clause):
 *   - status = 'shipped'
 *   - seller_id = sellerId (ownership)
 *   - tracking_updated_at IS NULL (one-time only, DB-level race condition guard)
 *   - shipped_at > NOW() - 24h (time window)
 */
export const updateTracking = async ({ auctionId, sellerId, carrier, trackingNumber, ipAddress }) => {
  const client = await pool.connect();
  let updatedAuction;

  try {
    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE auctions SET
         carrier = $1,
         tracking_number = $2,
         tracking_updated_at = NOW(),
         updated_at = NOW()
       WHERE id = $3
         AND status = 'shipped'
         AND seller_id = $4
         AND tracking_updated_at IS NULL
         AND shipped_at > NOW() - INTERVAL '24 hours'
       RETURNING *`,
      [carrier, trackingNumber, auctionId, sellerId]
    );

    if (result.rowCount === 0) {
      const err = new Error('Tracking cannot be updated at this time');
      err.statusCode = 409;
      err.errorCode = 'TRACKING_UPDATE_FAILED';
      throw err;
    }

    updatedAuction = result.rows[0];

    await writeAuditLog({
      referenceId: auctionId,
      referenceType: 'auction',
      action: 'tracking_updated',
      deltaState: { carrier, trackingNumber },
      actorId: sellerId,
      ipAddress,
    }, client);

    await client.query('COMMIT');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* already rolled back or committed */ }
    throw err;
  } finally {
    client.release();
  }

  // Post-transaction side effect
  const trackingUrl = buildTrackingUrl(carrier, trackingNumber);
  const buyerId = updatedAuction.winner_id;

  try {
    if (buyerId) {
      emitToUser(buyerId, EventNames.AUCTION_TRACKING_UPDATED, {
        auctionId,
        carrier,
        trackingNumber,
        trackingUrl,
      });
    }
  } catch (wsErr) {
    console.error(`[Fulfillment] WS emit failed for tracking update ${auctionId}:`, wsErr);
  }

  return {
    carrier,
    trackingNumber,
    trackingUpdated: true,
  };
};

/**
 * Get tracking information for an auction.
 * Only the buyer (winner) and seller can view.
 */
export const getTracking = async ({ auctionId, userId }) => {
  const result = await pool.query(
    `SELECT carrier, tracking_number, shipped_at,
            delivery_deadline_at, delivery_extended,
            status, seller_id, winner_id
     FROM auctions
     WHERE id = $1`,
    [auctionId]
  );

  if (result.rows.length === 0) {
    const err = new Error('Auction not found');
    err.statusCode = 404;
    err.errorCode = 'AUCTION_NOT_FOUND';
    throw err;
  }

  const auction = result.rows[0];

  // Guard: no winner yet → deny access (prevents random users from probing)
  if (!auction.winner_id) {
    const err = new Error('Access denied');
    err.statusCode = 403;
    err.errorCode = 'FORBIDDEN';
    throw err;
  }

  // Membership check: only buyer (winner) or seller
  if (userId !== auction.seller_id && userId !== auction.winner_id) {
    const err = new Error('Access denied');
    err.statusCode = 403;
    err.errorCode = 'FORBIDDEN';
    throw err;
  }

  if (!auction.shipped_at) {
    const err = new Error('This auction has not been shipped yet');
    err.statusCode = 400;
    err.errorCode = 'NOT_SHIPPED_YET';
    throw err;
  }

  const trackingUrl = buildTrackingUrl(auction.carrier, auction.tracking_number);

  return {
    carrier: auction.carrier,
    trackingNumber: auction.tracking_number,
    trackingUrl,
    shippedAt: auction.shipped_at,
    deliveryDeadlineAt: auction.delivery_deadline_at,
    status: auction.status,
    isExtended: auction.delivery_extended,
  };
};

/**
 * Seller extends shipping deadline (+3 days). Allowed once.
 */
export const extendShipping = async ({ auctionId, sellerId, reason, ipAddress }) => {
  const client = await pool.connect();
  let updatedDeadline;
  let buyerId;

  try {
    await client.query('BEGIN');

    // 1. SELECT for precise error handling
    const result = await client.query(
      `SELECT status, seller_id, shipping_extended, shipping_deadline_at, winner_id
       FROM auctions WHERE id = $1 FOR UPDATE`,
      [auctionId]
    );

    if (result.rowCount === 0) {
      const err = new Error('Auction not found');
      err.statusCode = 404;
      err.errorCode = 'AUCTION_NOT_FOUND';
      throw err;
    }

    const auction = result.rows[0];

    if (auction.seller_id !== sellerId) {
      const err = new Error('Access denied');
      err.statusCode = 403;
      err.errorCode = 'FORBIDDEN';
      throw err;
    }

    if (auction.status !== 'awaiting_ship') {
      const err = new Error('Auction cannot be extended in its current state');
      err.statusCode = 409;
      err.errorCode = 'INVALID_AUCTION_STATE';
      throw err;
    }

    if (auction.shipping_extended) {
      const err = new Error('Shipping extension has already been used');
      err.statusCode = 409;
      err.errorCode = 'EXTENSION_ALREADY_USED';
      throw err;
    }

    if (new Date(auction.shipping_deadline_at) <= new Date()) {
      const err = new Error('Shipping deadline has already exceeded');
      err.statusCode = 409;
      err.errorCode = 'SHIPPING_DEADLINE_EXCEEDED';
      throw err;
    }

    // 2. UPDATE DB
    const updateResult = await client.query(
      `UPDATE auctions SET
         shipping_deadline_at = shipping_deadline_at + INTERVAL '3 days',
         shipping_extended = true,
         updated_at = NOW()
       WHERE id = $1 AND shipping_extended = false
       RETURNING shipping_deadline_at, winner_id`,
      [auctionId]
    );

    if (updateResult.rowCount === 0) {
      const err = new Error('Failed to update auction or extension already used');
      err.statusCode = 409;
      err.errorCode = 'EXTENSION_ALREADY_USED';
      throw err;
    }

    updatedDeadline = updateResult.rows[0].shipping_deadline_at;
    buyerId = updateResult.rows[0].winner_id;

    // 3. Write Audit Log
    await writeAuditLog({
      referenceId: auctionId,
      referenceType: 'auction',
      action: 'shipping_extended',
      deltaState: { reason },
      actorId: sellerId,
      ipAddress,
    }, client);

    await client.query('COMMIT');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* ignore rollback error */ }
    throw err;
  } finally {
    client.release();
  }

  // 4. Post-transaction
  try {
    await rescheduleShippingDeadline(auctionId, updatedDeadline);

    if (buyerId) {
      emitToUser(buyerId, EventNames.AUCTION_SHIPPING_EXTENDED, {
        auctionId,
        reason,
        newShippingDeadlineAt: updatedDeadline,
      });
    }
  } catch (postErr) {
    console.error(`[Fulfillment] Post-transaction failed for extendShipping ${auctionId}:`, postErr);
  }

  return {
    newShippingDeadlineAt: updatedDeadline,
    extensionUsed: true,
  };
};

/**
 * Buyer confirms delivery of the item.
 * Triggers Stripe capture and sets auction to completed.
 */
export const confirmDelivery = async ({ auctionId, buyerId, ipAddress }) => {
  let paymentId;
  let stripePiId;
  let amount;
  let sellerId;

  // STEP 1: DB Lock (outside of main transaction to avoid holding lock during I/O)
  const lockResult = await pool.query(
    `UPDATE payments p
     SET status = 'capture_pending', updated_at = NOW()
     FROM auctions a
     WHERE p.auction_id = a.id
       AND p.auction_id = $1
       AND p.buyer_id = $2
       AND p.status = 'authorized'
       AND a.status = 'shipped'
     RETURNING p.id, p.stripe_pi_id, p.seller_id, p.amount`,
    [auctionId, buyerId]
  );

  if (lockResult.rowCount === 0) {
    const err = new Error('Invalid state for confirming delivery or already processed');
    err.statusCode = 409;
    err.errorCode = 'INVALID_PAYMENT_STATE';
    throw err;
  }

  paymentId = lockResult.rows[0].id;
  stripePiId = lockResult.rows[0].stripe_pi_id;
  sellerId = lockResult.rows[0].seller_id;
  amount = lockResult.rows[0].amount;

  // STEP 2: Stripe Capture (I/O call)
  try {
    await stripe.paymentIntents.capture(stripePiId);
  } catch (stripeErr) {
    console.error(`[Fulfillment] Stripe capture failed for payment ${paymentId}:`, stripeErr.message);
    
    // Fallback: Sweeper will retry later. Emit WS to both parties.
    Promise.allSettled([
      emitToUser(buyerId, EventNames.PAYMENT_STATUS, {
        status: 'capture_pending',
        message: 'Hệ thống đang xử lý xác nhận nhận hàng, vui lòng chờ trong giây lát.',
      }),
      emitToUser(sellerId, EventNames.PAYMENT_STATUS, {
        status: 'capture_pending',
        message: 'Hệ thống đang xử lý xác nhận nhận hàng, vui lòng chờ trong giây lát.',
      })
    ]).catch(e => console.error('[Fulfillment] WS emit fallback failed:', e));

    return { captured: false, message: 'Đang xử lý...' };
  }

  // STEP 3: DB Transaction (Commit)
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE payments SET status = 'captured', updated_at = NOW() WHERE id = $1`,
      [paymentId]
    );

    const auctionUpdate = await client.query(
      `UPDATE auctions SET status = 'completed', delivered_at = NOW(), updated_at = NOW() WHERE id = $1 AND status = 'shipped'`,
      [auctionId]
    );

    if (auctionUpdate.rowCount === 0) {
      throw new Error(`Auction state changed before completion for auction ${auctionId}`);
    }

    await writeAuditLog({
      referenceId: paymentId,
      referenceType: 'payment',
      action: 'delivery_confirmed_capture',
      deltaState: { amount, stripe_pi_id: stripePiId },
      actorId: buyerId,
      ipAddress,
    }, client);

    await client.query('COMMIT');
  } catch (dbErr) {
    try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
    console.error(`[Fulfillment] DB update failed after capture for payment ${paymentId}`, dbErr);
    throw dbErr;
  } finally {
    client.release();
  }

  // STEP 4: Post-transaction Side Effects
  try {
    Promise.allSettled([
      schedulePayoutJob(paymentId, auctionId),
      removeDeliveryJobs(auctionId),
      emitToUser(sellerId, EventNames.PAYMENT_STATUS, {
        status: 'captured',
        message: 'Buyer đã xác nhận nhận hàng. Tiền đang được chuyển.',
      })
    ]).then(results => {
      results.forEach((res, index) => {
        if (res.status === 'rejected') {
          console.error(`[Fulfillment] confirmDelivery side-effect [${index}] failed:`, res.reason);
        }
      });
    });
  } catch (sideErr) {
    console.error(`[Fulfillment] Side effects failed for confirmDelivery ${auctionId}:`, sideErr);
  }

  return { captured: true };
};

/**
 * Buyer extends delivery deadline (+7 days). Allowed once.
 */
export const extendDelivery = async ({ auctionId, buyerId, reason, ipAddress }) => {
  const client = await pool.connect();
  let updatedDeadline;
  let originalShippedAt;
  let sellerId;

  try {
    await client.query('BEGIN');

    // 1. SELECT FOR UPDATE to perform detailed guard checks
    const checkResult = await client.query(
      `SELECT shipped_at, delivery_deadline_at, status, winner_id, delivery_extended, seller_id
       FROM auctions WHERE id = $1 FOR UPDATE`,
      [auctionId]
    );

    if (checkResult.rowCount === 0) {
      const err = new Error('Auction not found');
      err.statusCode = 404;
      err.errorCode = 'AUCTION_NOT_FOUND';
      throw err;
    }

    const auction = checkResult.rows[0];

    if (auction.winner_id !== buyerId) {
      const err = new Error('Access denied');
      err.statusCode = 403;
      err.errorCode = 'FORBIDDEN';
      throw err;
    }

    if (auction.status !== 'shipped') {
      const err = new Error('Auction cannot be extended in its current state');
      err.statusCode = 409;
      err.errorCode = 'INVALID_AUCTION_STATE';
      throw err;
    }

    if (auction.delivery_extended) {
      const err = new Error('Delivery extension has already been used');
      err.statusCode = 409;
      err.errorCode = 'EXTENSION_ALREADY_USED';
      throw err;
    }

    if (new Date(auction.delivery_deadline_at) <= new Date()) {
      const err = new Error('Delivery deadline has already exceeded');
      err.statusCode = 409;
      err.errorCode = 'DELIVERY_DEADLINE_EXCEEDED';
      throw err;
    }

    sellerId = auction.seller_id;

    // 2. Atomic UPDATE with conditions mapped
    const updateResult = await client.query(
      `UPDATE auctions SET
         delivery_deadline_at = delivery_deadline_at + INTERVAL '7 days',
         delivery_extended = true,
         updated_at = NOW()
       WHERE id = $1
         AND status = 'shipped'
         AND winner_id = $2
         AND delivery_extended = false
         AND delivery_deadline_at > NOW()
       RETURNING delivery_deadline_at, shipped_at`,
      [auctionId, buyerId]
    );

    if (updateResult.rowCount === 0) {
      const err = new Error('Failed to update auction or extension already used');
      err.statusCode = 409;
      err.errorCode = 'EXTENSION_FAILED';
      throw err;
    }

    updatedDeadline = updateResult.rows[0].delivery_deadline_at;
    originalShippedAt = updateResult.rows[0].shipped_at;

    // 3. Write Audit Log
    await writeAuditLog({
      referenceId: auctionId,
      referenceType: 'auction',
      action: 'delivery_extended',
      deltaState: { 
        reason,
        old_deadline: auction.delivery_deadline_at,
        new_deadline: updatedDeadline
      },
      actorId: buyerId,
      ipAddress,
    }, client);

    await client.query('COMMIT');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }

  // 4. Post-transaction Side Effects
  try {
    Promise.allSettled([
      rescheduleDeliveryJobs(auctionId, updatedDeadline, originalShippedAt),
      emitToUser(sellerId, EventNames.AUCTION_DELIVERY_EXTENDED, {
        auctionId,
        reason,
        newDeliveryDeadlineAt: updatedDeadline,
      })
    ]).then(results => {
      results.forEach((res, index) => {
        if (res.status === 'rejected') {
          console.error(`[Fulfillment] extendDelivery side-effect [${index}] failed:`, res.reason);
        }
      });
    });
  } catch (postErr) {
    console.error(`[Fulfillment] Post-transaction failed for extendDelivery ${auctionId}:`, postErr);
  }

  return {
    newDeliveryDeadlineAt: updatedDeadline,
    extensionUsed: true,
  };
};
