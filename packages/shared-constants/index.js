export const AuctionStatus = {
    ACTIVE: 'active',
    ENDED: 'ended',
    PENDING_PAYMENT: 'pending_payment',
    NO_SALE: 'no_sale'
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
