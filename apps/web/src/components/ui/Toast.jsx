import { useCallback } from 'react';
import './Toast.css';

const VALID_TYPES = ['success', 'error', 'info'];
const DEFAULT_TYPE = 'info';

const ICON_MAP = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
};

/**
 * Individual toast notification component.
 * @param {{ id: string, message: string, type: 'success'|'error'|'info', onClose: (id: string) => void }} props
 */
export function Toast({ id, message, type, onClose }) {
  const normalizedType = VALID_TYPES.includes(type) ? type : DEFAULT_TYPE;

  const handleClose = useCallback(() => {
    onClose(id);
  }, [id, onClose]);

  return (
    <div
      className={`toast toast--${normalizedType}`}
      role="alert"
      id={`toast-${id}`}
    >
      <span className="toast__icon">{ICON_MAP[normalizedType]}</span>
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
