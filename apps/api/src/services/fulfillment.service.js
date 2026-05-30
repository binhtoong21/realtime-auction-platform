import { pool } from '../config/database.js';
import { v7 as uuidv7 } from 'uuid';
import { CARRIER_TRACKING_URLS, EventNames } from '@auction/shared-constants';
import { emitToUser } from './socket.service.js';

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
