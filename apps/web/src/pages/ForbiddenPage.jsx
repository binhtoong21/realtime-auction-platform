import { Link } from 'react-router-dom';
import './ForbiddenPage.css';

/**
 * 403 Forbidden Page.
 * Displays high-density security restriction notification for unauthorized access attempts.
 */
export function ForbiddenPage() {
  return (
    <div className="error-page">
      <div className="error-card error-card--forbidden">
        <div className="error-code-badge error-code-badge--forbidden">HTTP 403</div>
        <h1 className="error-title">ACCESS_RESTRICTED</h1>
        <p className="error-description">
          Administrative credentials and elevated role privileges are required to access this operational terminal.
        </p>
        <div className="error-actions">
          <Link to="/" className="error-btn error-btn--primary">
            Return to Market
          </Link>
          <Link to="/auth/login" className="error-btn error-btn--secondary">
            Switch Account
          </Link>
        </div>
      </div>
    </div>
  );
}
