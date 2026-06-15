import { Link } from 'react-router-dom';
import './Footer.css';

/** Site footer with copyright and navigation links. */
export function Footer() {
  return (
    <footer className="footer" id="site-footer">
      <div className="footer__inner">
        <span className="footer__copy">
          &copy; {new Date().getFullYear()} AuctionHouse
        </span>
        <nav className="footer__links">
          <Link to="/auctions" className="footer__link">Browse</Link>
          <span className="footer__separator">&middot;</span>
          <Link to="/auth/register" className="footer__link">Get Started</Link>
        </nav>
      </div>
    </footer>
  );
}
