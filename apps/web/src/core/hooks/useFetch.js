import { useState, useEffect, useRef, useCallback } from 'react';
import { axiosClient } from '../api/axiosClient';

/**
 * Custom hook for data fetching
 * @param {string} url - API endpoint
 * @param {object} options - Axios options
 * @param {boolean} executeImmediately - If true, fetch runs on mount
 */
export function useFetch(url, options = {}, executeImmediately = true) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // We use refs to keep track of the latest request to prevent stale closures/responses
  const requestIdRef = useRef(0);
  const abortControllerRef = useRef(null);

  const fetchData = useCallback(
    async (overrideOptions = {}) => {
      // Abort previous request if still running
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      const currentRequestId = ++requestIdRef.current;

      setIsLoading(true);
      setError(null);

      try {
        const response = await axiosClient({
          url,
          ...options,
          ...overrideOptions,
          signal: abortController.signal,
        });

        // Only update state if this is the most recent request
        if (currentRequestId === requestIdRef.current) {
          setData(response.data);
        }
        return response.data;
      } catch (err) {
        // If the error was an intentional abort, ignore it
        if (err.name === 'CanceledError' || err.message === 'canceled') {
          return;
        }

        if (currentRequestId === requestIdRef.current) {
          const errData = err.response?.data;
          const errorMsg = errData?.error?.details?.[0]?.message || errData?.error?.message || errData?.message || err.message || 'An error occurred';
          setError(errorMsg);
        }
        throw err;
      } finally {
        if (currentRequestId === requestIdRef.current) {
          setIsLoading(false);
        }
      }
    },
    // We omit `options` from dependency array intentionally to avoid infinite loops
    // if the caller passes an object inline `{ params: {...} }` without memoizing.
    // If dynamic URL or options are needed, caller should pass them via `overrideOptions` in `execute`
    // or we assume `url` is the primary dependency.
    [url] 
  );

  useEffect(() => {
    if (executeImmediately && url) {
      fetchData().catch((err) => {
        // Handle unhandled rejection if executeImmediately fails silently
        console.warn('Background fetch failed:', err.message);
      });
    }

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchData, executeImmediately, url]);

  return { data, error, isLoading, refetch: fetchData, setData };
}
