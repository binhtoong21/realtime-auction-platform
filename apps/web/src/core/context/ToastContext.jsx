import { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Toast } from '../../components/ui/Toast';

const ToastContext = createContext(null);

const MAX_TOASTS = 3;

/**
 * Provides toast notification capabilities to the component tree.
 * Manages toast lifecycle including auto-dismiss timers and max stack enforcement.
 * @param {{ children: React.ReactNode }} props
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef({});

  /** Removes a toast by ID and cleans up its auto-dismiss timer. */
  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    if (timersRef.current[id]) {
      clearTimeout(timersRef.current[id]);
      delete timersRef.current[id];
    }
  }, []);

  /** Adds a new toast, enforcing max stack limit by evicting the oldest entry. */
  const addToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    setToasts((prev) => {
      let next = [...prev];

      // Enforce max stack limit (ui_design.md §9): remove oldest first
      while (next.length >= MAX_TOASTS) {
        const oldest = next[0];
        // Clean up the timer for the force-removed toast
        if (timersRef.current[oldest.id]) {
          clearTimeout(timersRef.current[oldest.id]);
          delete timersRef.current[oldest.id];
        }
        next = next.slice(1);
      }

      next.push({ id, message, type });
      return next;
    });

    // Schedule auto-dismiss
    timersRef.current[id] = setTimeout(() => {
      removeToast(id);
    }, duration);
  }, [removeToast]);

  // Cleanup all timers on unmount
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

  const showSuccess = useCallback((msg) => addToast(msg, 'success'), [addToast]);
  const showError = useCallback((msg) => addToast(msg, 'error'), [addToast]);
  const showInfo = useCallback((msg) => addToast(msg, 'info'), [addToast]);

  const value = useMemo(
    () => ({ showSuccess, showError, showInfo }),
    [showSuccess, showError, showInfo]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div className="toast-container" aria-live="polite">
          {toasts.map((toast) => (
            <Toast
              key={toast.id}
              id={toast.id}
              message={toast.message}
              type={toast.type}
              onClose={removeToast}
            />
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}

/**
 * Hook to access toast notification methods.
 * @returns {{ showSuccess: (msg: string) => void, showError: (msg: string) => void, showInfo: (msg: string) => void }}
 */
export function useToast() {
  const context = useContext(ToastContext);
  if (context === null) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
