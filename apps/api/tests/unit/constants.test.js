import { describe, it, expect } from 'vitest';
import { AuctionStatus, PaymentStatus, IdentityStatus, ConnectStatus } from '@auction/shared-constants';
import { VALID_AUCTION_STATUSES } from '../../src/validations/auction.validation.js';

describe('shared-constants value lock', () => {
  describe('AuctionStatus', () => {
    it('should have SCHEDULED = "scheduled"', () => {
      expect(AuctionStatus.SCHEDULED).toBe('scheduled');
    });
    it('should have ACTIVE = "active"', () => {
      expect(AuctionStatus.ACTIVE).toBe('active');
    });
    it('should have ENDED = "ended"', () => {
      expect(AuctionStatus.ENDED).toBe('ended');
    });
    it('should have PENDING_PAYMENT = "pending_payment"', () => {
      expect(AuctionStatus.PENDING_PAYMENT).toBe('pending_payment');
    });
    it('should have AWAITING_SHIP = "awaiting_ship"', () => {
      expect(AuctionStatus.AWAITING_SHIP).toBe('awaiting_ship');
    });
    it('should have SHIPPED = "shipped"', () => {
      expect(AuctionStatus.SHIPPED).toBe('shipped');
    });
    it('should have COMPLETED = "completed"', () => {
      expect(AuctionStatus.COMPLETED).toBe('completed');
    });
    it('should have NO_SALE = "no_sale"', () => {
      expect(AuctionStatus.NO_SALE).toBe('no_sale');
    });
    it('should have CANCELLED = "cancelled"', () => {
      expect(AuctionStatus.CANCELLED).toBe('cancelled');
    });
    it('should have DISPUTED = "disputed"', () => {
      expect(AuctionStatus.DISPUTED).toBe('disputed');
    });
  });

  describe('PaymentStatus', () => {
    it('should have HOLD_PENDING = "hold_pending"', () => {
      expect(PaymentStatus.HOLD_PENDING).toBe('hold_pending');
    });
    it('should have AUTHORIZED = "authorized"', () => {
      expect(PaymentStatus.AUTHORIZED).toBe('authorized');
    });
    it('should have HOLD_FAILED = "hold_failed"', () => {
      expect(PaymentStatus.HOLD_FAILED).toBe('hold_failed');
    });
    it('should have GRACE_PERIOD = "grace_period"', () => {
      expect(PaymentStatus.GRACE_PERIOD).toBe('grace_period');
    });
    it('should have SECOND_CHANCE = "second_chance"', () => {
      expect(PaymentStatus.SECOND_CHANCE).toBe('second_chance');
    });
    it('should have CAPTURE_PENDING = "capture_pending"', () => {
      expect(PaymentStatus.CAPTURE_PENDING).toBe('capture_pending');
    });
    it('should have CAPTURED = "captured"', () => {
      expect(PaymentStatus.CAPTURED).toBe('captured');
    });
    it('should have FROZEN = "frozen"', () => {
      expect(PaymentStatus.FROZEN).toBe('frozen');
    });
    it('should have TRANSFERRED = "transferred"', () => {
      expect(PaymentStatus.TRANSFERRED).toBe('transferred');
    });
    it('should have REFUNDED = "refunded"', () => {
      expect(PaymentStatus.REFUNDED).toBe('refunded');
    });
    it('should have RELEASING = "releasing"', () => {
      expect(PaymentStatus.RELEASING).toBe('releasing');
    });
    it('should have RELEASED = "released"', () => {
      expect(PaymentStatus.RELEASED).toBe('released');
    });
    it('should have NO_SALE = "no_sale"', () => {
      expect(PaymentStatus.NO_SALE).toBe('no_sale');
    });
    it('should have CANCELLED = "cancelled"', () => {
      expect(PaymentStatus.CANCELLED).toBe('cancelled');
    });
  });

  describe('IdentityStatus', () => {
    it('should have NOT_STARTED = "not_started"', () => {
      expect(IdentityStatus.NOT_STARTED).toBe('not_started');
    });
    it('should have PENDING = "pending"', () => {
      expect(IdentityStatus.PENDING).toBe('pending');
    });
    it('should have PROCESSING = "processing"', () => {
      expect(IdentityStatus.PROCESSING).toBe('processing');
    });
    it('should have VERIFIED = "verified"', () => {
      expect(IdentityStatus.VERIFIED).toBe('verified');
    });
    it('should have FAILED = "failed"', () => {
      expect(IdentityStatus.FAILED).toBe('failed');
    });
    it('should have exactly 5 statuses', () => {
      expect(Object.keys(IdentityStatus).length).toBe(5);
    });
  });

  describe('ConnectStatus', () => {
    it('should have NOT_STARTED = "not_started"', () => {
      expect(ConnectStatus.NOT_STARTED).toBe('not_started');
    });
    it('should have PENDING = "pending"', () => {
      expect(ConnectStatus.PENDING).toBe('pending');
    });
    it('should have PAYOUTS_ENABLED = "payouts_enabled"', () => {
      expect(ConnectStatus.PAYOUTS_ENABLED).toBe('payouts_enabled');
    });
    it('should have PAYOUTS_DISABLED = "payouts_disabled"', () => {
      expect(ConnectStatus.PAYOUTS_DISABLED).toBe('payouts_disabled');
    });
    it('should have exactly 4 statuses', () => {
      expect(Object.keys(ConnectStatus).length).toBe(4);
    });
  });

  describe('Joi validation set-equality check', () => {
    it('should verify getAuctionsSchema status list vs AuctionStatus values', () => {
      // Use exported list from auction.validation.js
      const joiStatusList = VALID_AUCTION_STATUSES;
      const constantValues = new Set(Object.values(AuctionStatus));
      const joiSet = new Set(joiStatusList);

      const inJoiNotInConstants = joiStatusList.filter(s => !constantValues.has(s));
      const inConstantsNotInJoi = Object.values(AuctionStatus).filter(s => !joiSet.has(s));

      // Report differences for manual review — this test documents the gap
      console.log('In Joi but NOT in AuctionStatus:', inJoiNotInConstants);
      console.log('In AuctionStatus but NOT in Joi:', inConstantsNotInJoi);

      // This test intentionally DOES NOT assert equality — it documents the gap.
      // The sets are NOT equal: Joi has 'paid' (legacy), AuctionStatus has 'awaiting_ship', 'cancelled', 'disputed'.
      // DO NOT auto-replace Joi with Object.values(AuctionStatus) until this gap is resolved.
      expect(inJoiNotInConstants).toEqual([]);
      expect(inConstantsNotInJoi).toEqual([]);
    });
  });
});
