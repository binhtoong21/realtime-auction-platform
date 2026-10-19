import { Link } from 'react-router-dom';
import './NotFoundPage.css';

/**
 * 404 Not Found Page.
 * Displays high-density terminal-styled error screen with safe navigation actions.
 */
export function NotFoundPage() {
  return (
    <div className="error-page">
      <div className="error-card">
        <div className="error-code-badge">HTTP 404</div>
        <h1 className="error-title">RESOURCE_NOT_FOUND</h1>
        <p className="error-description">
          The requested route or resource could not be found on this system. It may have been moved, expired, or deleted.
        </p>
        <div className="error-actions">
          <Link to="/" className="error-btn error-btn--primary">
            Return to Market
          </Link>
          <Link to="/dashboard" className="error-btn error-btn--secondary">
            User Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
