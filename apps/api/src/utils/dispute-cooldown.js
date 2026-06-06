import { COOLDOWN_REASONS, DISPUTE_COOLDOWN_DAYS } from '@auction/shared-constants';

/**
 * Validate dispute cooldown rules based on reason and shipped_at.
 *
 * Returns { allowed: true } or { allowed: false, canOpenAt: Date }.
 */
export function validateDisputeCooldown(reason, shippedAt) {
  if (!COOLDOWN_REASONS.includes(reason)) {
    return { allowed: true };
  }

  if (!shippedAt) {
    return { allowed: false, canOpenAt: null }; // Not shipped yet
  }

  const cooldownEnd = new Date(shippedAt);
  cooldownEnd.setDate(cooldownEnd.getDate() + DISPUTE_COOLDOWN_DAYS);

  if (new Date() >= cooldownEnd) {
    return { allowed: true };
  }

  return { allowed: false, canOpenAt: cooldownEnd };
}
