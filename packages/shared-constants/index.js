export const AuctionStatus = {
    DRAFT: 'draft',
    ACTIVE: 'active',
    ENDED: 'ended',
    PENDING_PAYMENT: 'pending_payment',
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
    AUCTION_CATCHUP: 'auction:catchup',
    AUCTION_SHIPPED: 'auction:shipped',
    AUCTION_TRACKING_UPDATED: 'auction:tracking-updated',
    PAYMENT_STATUS: 'payment:status',
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
    CAPTURE_PENDING: 'capture_pending',
    CAPTURED: 'captured',
    FROZEN: 'frozen',
    TRANSFERRED: 'transferred',
    REFUNDED: 'refunded',
    RELEASING: 'releasing',
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

export const CARRIERS = {
    VNPOST: 'vnpost',
    GHN: 'ghn',
    GHTK: 'ghtk',
    JT: 'jt',
    FEDEX: 'fedex',
    DHL: 'dhl',
    UPS: 'ups',
    OTHER: 'other',
};

export const CARRIER_TRACKING_REGEX = {
    [CARRIERS.VNPOST]: /^[A-Z]{2}\d{9}VN$/i,
    [CARRIERS.GHN]:    /^[A-Z0-9]{8,15}$/i,
    [CARRIERS.GHTK]:   /^(\d{9}|(?=.{5,50}$)[A-Z0-9]+(?:\.[A-Z0-9]+)+)$/i,
    [CARRIERS.JT]:     /^\d{12,15}$/,
    [CARRIERS.FEDEX]:  /^\d{12}(\d{2})?$/,
    [CARRIERS.DHL]:    /^[0-9]{10,11}$/,
    [CARRIERS.UPS]:    /^1Z[A-Z0-9]{16}$/i,
    [CARRIERS.OTHER]:  /^.{6,50}$/,
};

export const CARRIER_TRACKING_URLS = {
    [CARRIERS.VNPOST]: 'https://www.vnpost.vn/en-us/tra-cuu/buu-pham?key=',
    [CARRIERS.GHN]:    'https://ghn.vn/pages/quan-ly-don-hang?code=',
    [CARRIERS.GHTK]:   'https://i.ghtk.vn/',
    [CARRIERS.JT]:     'https://jtexpress.vn/tracking?bill=',
    [CARRIERS.FEDEX]:  'https://www.fedex.com/wtrk/track/?trknbr=',
    [CARRIERS.DHL]:    'https://www.dhl.com/en/express/tracking.html?AWB=',
    [CARRIERS.UPS]:    'https://www.ups.com/track?tracknum=',
    [CARRIERS.OTHER]:  null,
};
