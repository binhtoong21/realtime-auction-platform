import { pool } from '../config/database.js';
import { DEFAULT_FEE_TIERS } from '@auction/shared-constants';

let cachedTiers = null;
let cacheExpiresAt = 0;

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Load fee tiers from DB (platform_settings), with in-memory cache.
 *
 * Cache strategy: in-memory, TTL 5 minutes. Acceptable because fee tiers
 * change extremely rarely. When running multiple API instances, each
 * instance caches independently — worst case 5 min stale after admin update.
 *
 * TODO (Phase 12): When admin panel implements `PATCH /admin/settings/fee-tiers`,
 * publish a Redis Pub/Sub event to bust cache across all instances immediately.
 */
export async function loadFeeTiers() {
  const now = Date.now();

  if (cachedTiers && now < cacheExpiresAt) {
    return cachedTiers;
  }

  try {
    const result = await pool.query(
      `SELECT value FROM platform_settings WHERE key = 'fee_tiers'`
    );

    if (result.rows.length > 0) {
      const tiers = result.rows[0].value;

      if (Array.isArray(tiers) && tiers.length > 0) {
        cachedTiers = tiers;
        cacheExpiresAt = now + CACHE_TTL_MS;
        return cachedTiers;
      }
    }
  } catch (err) {
    console.error('[PlatformFee] Failed to load fee tiers from DB, using defaults:', err.message);
  }

  cachedTiers = DEFAULT_FEE_TIERS;
  cacheExpiresAt = now + CACHE_TTL_MS;
  return cachedTiers;
}

/**
 * Calculate platform fee for a given amount.
 *
 * Uses flat rate per tier (not marginal/progressive).
 * The entire amount is charged at the single rate of the matching tier.
 *
 * Tier matching uses `<=` comparison (e.g., $100.00 exactly falls into the ≤$100 tier at 10%).
 *
 * @param {number} amountInCents - Positive integer, e.g. 50000 = $500.00
 * @param {Array} [tiers] - Optional override (for testing). Defaults to loaded tiers.
 * @returns {{ feeAmount: number, feeRate: number, sellerReceives: number }}
 */
export async function calculatePlatformFee(amountInCents, tiers) {
  if (!Number.isInteger(amountInCents) || amountInCents <= 0) {
    throw { code: 'INVALID_AMOUNT', message: 'Amount must be a positive integer (cents)' };
  }

  const feeTiers = tiers || await loadFeeTiers();

  const matchedTier = feeTiers.find(
    (tier) => tier.maxAmount === null || amountInCents <= tier.maxAmount
  );

  if (!matchedTier) {
    throw { code: 'FEE_TIER_NOT_FOUND', message: 'No matching fee tier for the given amount' };
  }

  const feeAmount = Math.round(amountInCents * matchedTier.rate);
  const sellerReceives = amountInCents - feeAmount;

  return {
    feeAmount,
    feeRate: matchedTier.rate,
    sellerReceives,
  };
}

/**
 * Bust the in-memory cache. Call after admin updates fee tiers.
 */
export function bustFeeCache() {
  cachedTiers = null;
  cacheExpiresAt = 0;
}
