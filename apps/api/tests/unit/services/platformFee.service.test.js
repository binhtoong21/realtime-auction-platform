import { describe, it, expect, beforeEach } from 'vitest';
import { calculatePlatformFee, bustFeeCache } from '../../../src/services/platformFee.service.js';
import { DEFAULT_FEE_TIERS } from '@auction/shared-constants';

const tiers = DEFAULT_FEE_TIERS;

describe('calculatePlatformFee', () => {
  beforeEach(() => {
    bustFeeCache();
  });

  // Tier 1: $0 — $100 (≤10000 cents) → 10%
  it('$50 → 10% fee = $5', async () => {
    const result = await calculatePlatformFee(5000, tiers);
    expect(result.feeAmount).toBe(500);
    expect(result.feeRate).toBe(0.10);
    expect(result.sellerReceives).toBe(4500);
  });

  it('$100 exactly → 10% (boundary: <= not <)', async () => {
    const result = await calculatePlatformFee(10000, tiers);
    expect(result.feeAmount).toBe(1000);
    expect(result.feeRate).toBe(0.10);
    expect(result.sellerReceives).toBe(9000);
  });

  // Tier 2: $100.01 — $1,000 (10001–100000 cents) → 7%
  it('$100.01 → 7% (just above tier 1 boundary)', async () => {
    const result = await calculatePlatformFee(10001, tiers);
    expect(result.feeAmount).toBe(700); // Math.round(10001 * 0.07) = 700
    expect(result.feeRate).toBe(0.07);
    expect(result.sellerReceives).toBe(9301);
  });

  it('$500 → 7% fee = $35', async () => {
    const result = await calculatePlatformFee(50000, tiers);
    expect(result.feeAmount).toBe(3500);
    expect(result.feeRate).toBe(0.07);
    expect(result.sellerReceives).toBe(46500);
  });

  // Tier 3: $1,000.01 — $10,000 → 5%
  it('$5,000 → 5% fee = $250', async () => {
    const result = await calculatePlatformFee(500000, tiers);
    expect(result.feeAmount).toBe(25000);
    expect(result.feeRate).toBe(0.05);
    expect(result.sellerReceives).toBe(475000);
  });

  // Tier 4: > $10,000 → 3%
  it('$20,000 → 3% fee = $600', async () => {
    const result = await calculatePlatformFee(2000000, tiers);
    expect(result.feeAmount).toBe(60000);
    expect(result.feeRate).toBe(0.03);
    expect(result.sellerReceives).toBe(1940000);
  });

  // Edge: minimum viable amount
  it('$0.01 (1 cent) → 10%, rounds to 0 fee', async () => {
    const result = await calculatePlatformFee(1, tiers);
    expect(result.feeAmount).toBe(0);
    expect(result.sellerReceives).toBe(1);
  });

  // Edge: rounding
  it('$33.33 (3333 cents) → 10%, Math.round(333.3) = 333', async () => {
    const result = await calculatePlatformFee(3333, tiers);
    expect(result.feeAmount).toBe(333);
    expect(result.sellerReceives).toBe(3000);
  });

  // Validation errors
  it('throws on 0 amount', async () => {
    await expect(calculatePlatformFee(0, tiers)).rejects.toMatchObject({
      code: 'INVALID_AMOUNT',
    });
  });

  it('throws on negative amount', async () => {
    await expect(calculatePlatformFee(-100, tiers)).rejects.toMatchObject({
      code: 'INVALID_AMOUNT',
    });
  });

  it('throws on non-integer (floating point)', async () => {
    await expect(calculatePlatformFee(50.5, tiers)).rejects.toMatchObject({
      code: 'INVALID_AMOUNT',
    });
  });

  it('throws on empty tiers array', async () => {
    await expect(calculatePlatformFee(5000, [])).rejects.toMatchObject({
      code: 'FEE_TIER_NOT_FOUND',
    });
  });

  // Verify flat rate (NOT marginal)
  it('flat rate: $999 pays 7% on full amount, not mixed tiers', async () => {
    const result = await calculatePlatformFee(99900, tiers);
    // Flat: 99900 * 0.07 = 6993
    // Marginal would be: 10000*0.10 + 89900*0.07 = 7293
    expect(result.feeAmount).toBe(6993);
    expect(result.feeRate).toBe(0.07);
    expect(result.sellerReceives).toBe(92907);
  });
});
