import { useCallback } from 'react';
import './Toast.css';

export function Toast({ id, message, type, onClose }) {
  const handleClose = useCallback(() => {
    onClose(id);
  }, [id, onClose]);

  const iconMap = {
    success: '✓',
    error: '✕',
    info: 'ℹ',
  };

  return (
    <div
      className={`toast toast--${type}`}
      role="alert"
      id={`toast-${id}`}
    >
      <span className="toast__icon">{iconMap[type] || iconMap.info}</span>
      <span className="toast__message">{message}</span>
      <button
        className="toast__close"
        onClick={handleClose}
        aria-label="Dismiss notification"
      >
        ✕
      </button>
    </div>
  );
}
