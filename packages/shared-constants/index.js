export const AuctionStatus = {
    DRAFT: 'draft',
    ACTIVE: 'active',
    ENDED: 'ended',
    PENDING_PAYMENT: 'pending_payment',
    PAID: 'paid',
    AWAITING_SHIP: 'awaiting_ship',
    SHIPPED: 'shipped',
    COMPLETED: 'completed',
    NO_SALE: 'no_sale',
    CANCELLED: 'cancelled',
    DISPUTED: 'disputed',
};

export const DisputeStatus = {
    OPEN: 'open',
    UNDER_REVIEW: 'under_review',
    RESOLVED_BUYER_WINS: 'resolved_buyer_wins',
    RESOLVED_SELLER_WINS: 'resolved_seller_wins',
    EXPIRED: 'expired',
    WITHDRAWN: 'withdrawn',
};

export const EventNames = {
    BID_NEW: 'bid:new',
    BID_OUTBID: 'bid:outbid',
    AUCTION_STARTED: 'auction:started',
    AUCTION_EXTENDED: 'auction:extended',
    AUCTION_ENDED: 'auction:ended',
    AUCTION_CATCHUP: 'auction:catchup'
};

export const ErrorCodes = {
    OUTBID: 'ERR_OUTBID',
    AUCTION_ENDED: 'ERR_AUCTION_ENDED',
    INVALID_AMOUNT: 'ERR_INVALID_AMOUNT'
};

export const UserStatus = {
    UNVERIFIED: 'unverified',
    ACTIVE: 'active',
    SUSPENDED: 'suspended',
    BANNED: 'banned'
};

export const UserRole = {
    USER: 'user',
    ADMIN: 'admin'
};

export const PaymentStatus = {
    HOLD_PENDING: 'hold_pending',
    AUTHORIZED: 'authorized',
    HOLD_FAILED: 'hold_failed',
    GRACE_PERIOD: 'grace_period',
    SECOND_CHANCE: 'second_chance',
    CAPTURED: 'captured',
    FROZEN: 'frozen',
    TRANSFERRED: 'transferred',
    REFUNDED: 'refunded',
    RELEASED: 'released',
    NO_SALE: 'no_sale',
    CANCELLED: 'cancelled',
};

export const DEFAULT_FEE_TIERS = [
    { maxAmount: 10000, rate: 0.10 },
    { maxAmount: 100000, rate: 0.07 },
    { maxAmount: 1000000, rate: 0.05 },
    { maxAmount: null, rate: 0.03 },
];
