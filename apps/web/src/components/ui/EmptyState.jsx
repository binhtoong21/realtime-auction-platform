import { Link } from 'react-router-dom';
import './EmptyState.css';

export function EmptyState({ icon: Icon, heading, subtext, cta }) {
  const isCompact = !Icon;

  return (
    <div className={`empty-state ${isCompact ? 'empty-state--compact' : ''}`}>
      {Icon && (
        <div className="empty-state__icon">
          <Icon size={32} />
        </div>
      )}
      {heading && <p className="empty-state__heading">{heading}</p>}
      {subtext && <p className="empty-state__subtext">{subtext}</p>}
      {cta && (
        cta.onClick ? (
          <button type="button" onClick={cta.onClick} className="btn btn--sm btn--primary empty-state__cta">
            {cta.label}
          </button>
        ) : (
          <Link to={cta.to} className="btn btn--sm btn--primary empty-state__cta">
            {cta.label}
          </Link>
        )
      )}
    </div>
  );
}
