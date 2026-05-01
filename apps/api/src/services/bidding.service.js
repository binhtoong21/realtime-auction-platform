import { pool, withTransaction } from '../config/database.js';
import { ErrorCodes } from '@auction/shared-constants';
import { v7 as uuidv7 } from 'uuid';
import { emitToAuctionRoom, emitToUser } from './socket.service.js';

export const processBid = async ({ auctionId, userId, amount, idempotencyKey }) => {
  const result = await withTransaction(async (client) => {
    // 1. Atomic UPDATE on auctions table to prevent snipe and check conditions
    const updateResult = await client.query(
      `UPDATE auctions 
       SET 
          current_price = $1, 
          extended_count = extended_count + 1, 
          end_at = CASE 
                     WHEN end_at - now() < interval '2 minutes' 
                     THEN end_at + interval '5 minutes' 
                     ELSE end_at 
                   END 
       WHERE id = $2 
         AND status = 'active' 
         AND now() < end_at
         AND current_price + bid_increment <= $1 
       RETURNING *`,
      [amount, auctionId]
    );

    if (updateResult.rowCount === 0) {
      // Find out WHY it failed to provide a meaningful error
      const auctionCheck = await client.query('SELECT status, end_at, current_price, bid_increment FROM auctions WHERE id = $1', [auctionId]);
      
      if (auctionCheck.rowCount === 0) {
        throw { code: 'NOT_FOUND', message: 'Auction not found' };
      }
      
      const auction = auctionCheck.rows[0];
      
      if (auction.status !== 'active' || new Date() >= new Date(auction.end_at)) {
        throw { code: ErrorCodes.AUCTION_ENDED, message: 'Auction is already ended or not active' };
      }
      
      throw { code: ErrorCodes.OUTBID, message: `Bid amount must be at least ${Number(auction.current_price) + Number(auction.bid_increment)}` };
    }

    const updatedAuction = updateResult.rows[0];

    // 2. Insert into bids table
    const bidId = uuidv7();
    const insertBidResult = await client.query(
      `INSERT INTO bids (id, auction_id, bidder_id, amount, idempotency_key, is_winning)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING *`,
      [bidId, auctionId, userId, amount, idempotencyKey]
    );

    const newBid = insertBidResult.rows[0];

    // 3. Find previous winner to notify them they've been outbid
    const previousWinnerResult = await client.query(
      `UPDATE bids SET is_winning = false 
       WHERE auction_id = $1 AND id != $2 AND is_winning = true
       RETURNING bidder_id`,
      [auctionId, bidId]
    );

    return {
      bid: newBid,
      auction: updatedAuction,
      previousWinnerId: previousWinnerResult.rows[0]?.bidder_id || null
    };
  });

  // 4. Emit WebSocket events AFTER transaction commits (websocket_design.md Mục 5)
  // Broadcast to auction room: new bid placed
  await emitToAuctionRoom(auctionId, 'bid:new', {
    bidderId: userId,
    amount: result.bid.amount,
    newPrice: result.auction.current_price,
    endAt: result.auction.end_at,
    extendedCount: result.auction.extended_count
  });

  // Notify previous winner they've been outbid (private event)
  if (result.previousWinnerId && result.previousWinnerId !== userId) {
    emitToUser(result.previousWinnerId, 'bid:outbid', {
      auctionId,
      currentPrice: result.auction.current_price,
      outbidBy: userId
    });
  }

  return {
    bid: result.bid,
    auction: result.auction
  };
};
