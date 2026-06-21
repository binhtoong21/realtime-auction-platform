import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useFetch } from '../../../core/hooks/useFetch';
import { useAuctionSocket } from '../hooks/useAuctionSocket';
import { useBidSubmit } from '../hooks/useBidSubmit';
import { useToast } from '../../../core/context/ToastContext';
import { BidForm } from '../components/BidForm';
import { BidHistory } from '../components/BidHistory';
import { JoinAuctionModal } from '../components/JoinAuctionModal';
import { CountdownTimer } from '../components/CountdownTimer';
import './AuctionDetailPage.css';

export function AuctionDetailPage() {
  const { id } = useParams();
  const { showError } = useToast();
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [bidAmount, setBidAmount] = useState('');
  const bidRefetchTimerRef = useRef(null);

  const {
    data: auctionData,
    error: auctionError,
    isLoading: auctionLoading,
    setData: setAuctionData,
    refetch: refetchAuction,
  } = useFetch(`/auctions/${id}`);

  const {
    data: bidsData,
    isLoading: bidsLoading,
    refetch: refetchBids,
  } = useFetch(`/auctions/${id}/bids?limit=50`);

  const auction = auctionData?.data;
  const bids = bidsData?.data || [];

  // Stabilize bidIncrement via ref to prevent callback identity churn
  const bidIncrementRef = useRef(0);
  useEffect(() => {
    if (auction?.bid_increment != null) {
      bidIncrementRef.current = Number(auction.bid_increment);
    }
  }, [auction?.bid_increment]);

  const onOutbid = useCallback((currentPrice) => {
    const minBidCents = Number(currentPrice) + Number(bidIncrementRef.current);
    setBidAmount(String(minBidCents / 100));
    showError(`Bạn đã bị vượt giá! Giá tối thiểu: $${(minBidCents / 100).toFixed(2)}`);
  }, [showError]);

  const { connectionStatus, timeOffset } = useAuctionSocket(id, setAuctionData, onOutbid);

  const {
    bidState,
    errorCode,
    submitBid,
    resetState,
    isSubmitting,
  } = useBidSubmit(id, refetchAuction);

  // Debounced bid list refetch on new bids
  const prevBidCountRef = useRef(null);
  useEffect(() => {
    const currentCount = auction?.bid_count;
    if (currentCount == null) return;
    if (prevBidCountRef.current !== null && currentCount !== prevBidCountRef.current) {
      clearTimeout(bidRefetchTimerRef.current);
      bidRefetchTimerRef.current = setTimeout(() => {
        refetchBids();
      }, 1000);
    }
    prevBidCountRef.current = currentCount;
    return () => clearTimeout(bidRefetchTimerRef.current);
  }, [auction?.bid_count, refetchBids]);

  // Set initial bid amount from auction data (only once per auction)
  const isBidInitializedRef = useRef(false);

  useEffect(() => {
    if (auction?.id) {
      isBidInitializedRef.current = false;
    }
  }, [auction?.id]);
  useEffect(() => {
    if (auction && !isBidInitializedRef.current) {
      const minBidCents = Number(auction.current_price || 0) + Number(auction.bid_increment || 0);
      setBidAmount(String(minBidCents / 100));
      isBidInitializedRef.current = true;
    }
  }, [auction]);

  const handleJoinSuccess = useCallback(() => {
    setShowJoinModal(false);
    refetchAuction();
  }, [refetchAuction]);

  const handleJoinClick = useCallback(() => {
    setShowJoinModal(true);
  }, []);

  // Format price for display
  const formatPrice = (cents) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format((cents || 0) / 100);
  };

  // Loading state
  if (auctionLoading) {
    return (
      <div className="auction-detail-page">
        <div className="auction-detail-skeleton">
          <div className="skeleton-image" />
          <div className="skeleton-info">
            <div className="skeleton-line skeleton-title" />
            <div className="skeleton-line skeleton-seller" />
            <div className="skeleton-line skeleton-price" />
            <div className="skeleton-line skeleton-countdown" />
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (auctionError) {
    const is404 = typeof auctionError === 'string' && auctionError.toLowerCase().includes('not found');
    return (
      <div className="auction-detail-page">
        <div className="auction-detail-error">
          <h2>{is404 ? 'Auction not found' : 'Something went wrong'}</h2>
          <p>{is404 ? 'The auction you are looking for does not exist or has been removed.' : 'Failed to load auction data. Please try again.'}</p>
          {!is404 && (
            <button className="btn-primary" onClick={refetchAuction}>Retry</button>
          )}
        </div>
      </div>
    );
  }

  if (!auction) {
    return (
      <div className="auction-detail-page">
        <div className="auction-detail-empty">
          <h2>No Data</h2>
          <p>The auction details could not be loaded.</p>
        </div>
      </div>
    );
  }

  const currentPrice = Number(auction.current_price || 0);
  const bidIncrement = Number(auction.bid_increment || 0);
  const isActive = auction.status === 'active';
  const isJoined = auction.is_joined || false;

  return (
    <div className="auction-detail-page">
      <div className="auction-detail-layout">
        {/* Left: Image Gallery */}
        <div className="auction-detail-gallery">
          {auction.images && auction.images.length > 0 ? (
            <img
              src={auction.images[0]}
              alt={auction.title}
              className="auction-detail-main-image"
            />
          ) : (
            <div className="auction-detail-no-image">No Image Available</div>
          )}
        </div>

        {/* Right: Info + Bid Form */}
        <div className="auction-detail-info">
          <div className="auction-detail-header">
            <h1>{auction.title}</h1>
            <span className={`status-badge ${auction.status}`}>
              {auction.status}
            </span>
          </div>

          <p className="auction-detail-seller">
            Seller: {auction.seller_name || 'Unknown'}
          </p>

          <div className="auction-detail-price-section">
            <span className="auction-detail-price-label">Current Price</span>
            <span className="auction-detail-price" id="auction-current-price">
              {formatPrice(currentPrice)}
            </span>
          </div>

          <div className="auction-detail-countdown-section">
            <span className="auction-detail-countdown-label">
              {isActive ? 'Time Left' : 'Ended'}
            </span>
            <div className="auction-detail-countdown">
              <CountdownTimer endAt={auction.end_at} timeOffset={timeOffset} />
            </div>
          </div>

          <div className="auction-detail-stats">
            <span>{auction.bid_count || 0} bids</span>
            {auction.extended_count > 0 && (
              <span>Extended {auction.extended_count}x</span>
            )}
            <span className={`connection-dot ${connectionStatus}`} title={connectionStatus} />
          </div>

          {/* Bid Form */}
          {isActive && (
            <BidForm
              auctionId={id}
              currentPrice={currentPrice}
              bidIncrement={bidIncrement}
              isJoined={isJoined}
              auctionStatus={auction.status}
              onJoinClick={handleJoinClick}
              bidAmount={bidAmount}
              setBidAmount={setBidAmount}
              bidState={bidState}
              errorCode={errorCode}
              submitBid={submitBid}
              resetState={resetState}
              isSubmitting={isSubmitting}
            />
          )}

          {!isActive && (
            <div className="auction-detail-ended-notice">
              <p>This auction has ended.</p>
              {auction.winner_id && (
                <p>Final Price: {formatPrice(currentPrice)}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Description */}
      <div className="auction-detail-description">
        <h2>Description</h2>
        <p>{auction.description || 'No description provided.'}</p>
      </div>

      {/* Bid History */}
      <div className="auction-detail-bids-section">
        <h2>Bid History</h2>
        <BidHistory bids={bids} isLoading={bidsLoading} />
      </div>

      {/* Join Auction Modal */}
      <JoinAuctionModal
        isOpen={showJoinModal}
        onClose={() => setShowJoinModal(false)}
        auctionId={id}
        onJoinSuccess={handleJoinSuccess}
      />
    </div>
  );
}
