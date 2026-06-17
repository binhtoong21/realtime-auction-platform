import { Link, useNavigate } from 'react-router-dom';
import { useAuctions } from '../hooks/useAuctions';
import { AuctionCard } from '../components/AuctionCard';
import './LandingPage.css';

/**
 * Landing Page component for the Realtime Auction Platform.
 * Displays hero section, featured auctions, and a how-it-works guide.
 * @returns {JSX.Element} The rendered component.
 */
export function LandingPage() {
  const navigate = useNavigate();
  
  const { auctions, isLoading, error } = useAuctions({
    status: 'active',
    limit: 8,
    sort: 'ending_soon'
  });

  const handleExploreClick = () => {
    // Navigate to /auctions. The RequireAuth guard will redirect to login 
    // with returnUrl=/auctions if the user is not authenticated.
    navigate('/auctions');
  };

  return (
    <div className="landing-page">
      {/* Hero Section */}
      <section className="hero-section">
        <div className="container">
          <h1 className="hero-title">Discover Exclusive Items at Realtime Auction</h1>
          <p className="hero-subtitle">
            Bid on unique collectibles, art, and high-value items in real-time. Experience the thrill of winning from anywhere.
          </p>
          <div className="hero-ctas">
            <button type="button" className="btn btn-primary btn-lg" onClick={handleExploreClick}>
              Explore Auctions
            </button>
            <Link to="/auth/register" className="btn btn-outline btn-lg">
              Register Now
            </Link>
          </div>
        </div>
      </section>

      {/* Featured Auctions */}
      <section className="featured-section">
        <div className="container">
          <div className="section-header">
            <h2 className="section-title">Ending Soon</h2>
            <Link to="/auctions" className="btn btn-link">View All</Link>
          </div>

          <div className="auctions-grid">
            {isLoading ? (
              // Skeleton loading
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="skeleton-card"></div>
              ))
            ) : error ? (
              <div className="error-state">
                <p>Failed to load featured auctions. Please try again later.</p>
              </div>
            ) : auctions.length === 0 ? (
              <div className="empty-state">
                <p>No active auctions ending soon.</p>
              </div>
            ) : (
              auctions.map((auction) => (
                <AuctionCard key={auction.id} auction={auction} variant="featured" />
              ))
            )}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="how-it-works-section">
        <div className="container">
          <h2 className="section-title text-center">How It Works</h2>
          <div className="steps-grid">
            <div className="step-item">
              <div className="step-number">1</div>
              <h3>Register & Verify</h3>
              <p>Create an account and verify your email to start participating in auctions.</p>
            </div>
            <div className="step-item">
              <div className="step-number">2</div>
              <h3>Find Items</h3>
              <p>Browse our catalog of exclusive items and add them to your watchlist.</p>
            </div>
            <div className="step-item">
              <div className="step-number">3</div>
              <h3>Place Your Bid</h3>
              <p>Join the live auction room, place your bids in real-time, and win!</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
