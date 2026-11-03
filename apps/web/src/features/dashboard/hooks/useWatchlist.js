import { useState, useCallback, useMemo } from 'react';
import { useFetch } from '../../../core/hooks/useFetch';
import { axiosClient } from '../../../core/api/axiosClient';
import { useAuth } from '../../../core/context/AuthContext';

/**
 * Hook to retrieve the set of watched auction IDs for instant O(1) bookmark lookup.
 * Safe for unauthenticated guests (returns empty set without triggering API call).
 */
export function useWatchlistIds() {
  const user = useAuth();
  const shouldFetch = Boolean(user);
  const url = shouldFetch ? '/users/me/watchlist/ids' : null;

  const { data, isLoading, error, refetch } = useFetch(url, {}, shouldFetch);

  const watchedIds = useMemo(() => {
    if (!user || !data?.data) return [];
    return Array.isArray(data.data) ? data.data : [];
  }, [user, data]);

  const watchedIdsSet = useMemo(() => new Set(watchedIds), [watchedIds]);

  return useMemo(
    () => ({
      watchedIds,
      watchedIdsSet,
      isLoading: user ? isLoading : false,
      error,
      refetchWatchedIds: refetch,
    }),
    [watchedIds, watchedIdsSet, user, isLoading, error, refetch]
  );
}

/**
 * Hook to retrieve paginated watchlist items for the /dashboard/watchlist page.
 *
 * @param {object} [params]
 * @param {number} [params.page=1]
 * @param {number} [params.limit=20]
 */
export function useWatchlistAuctions({ page = 1, limit = 20 } = {}) {
  const user = useAuth();
  const shouldFetch = Boolean(user);
  const url = shouldFetch
    ? `/users/me/watchlist?page=${encodeURIComponent(page)}&limit=${encodeURIComponent(limit)}`
    : null;

  const { data, error, isLoading, refetch } = useFetch(url, {}, shouldFetch);

  return useMemo(
    () => ({
      auctions: data?.data || [],
      meta: data?.meta || { total: 0, page, limit, totalPages: 1 },
      error,
      isLoading: user ? isLoading : false,
      refetch,
    }),
    [data, error, isLoading, refetch, user, page, limit]
  );
}

/**
 * Hook to execute bookmark toggle with optimistic state handling.
 * Backend: POST /auctions/:id/watchlist
 */
export function useToggleWatchlist() {
  const [isToggling, setIsToggling] = useState(false);
  const [toggleError, setToggleError] = useState(null);

  const toggle = useCallback(async (auctionId) => {
    if (!auctionId) {
      throw new Error('Auction ID is required');
    }

    setIsToggling(true);
    setToggleError(null);

    try {
      const response = await axiosClient.post(
        `/auctions/${encodeURIComponent(auctionId)}/watchlist`
      );
      return response.data?.data;
    } catch (err) {
      const msg =
        err.response?.data?.error?.message ||
        err.message ||
        'Failed to toggle watchlist status';
      setToggleError(msg);
      throw new Error(msg, { cause: err });
    } finally {
      setIsToggling(false);
    }
  }, []);

  return {
    toggle,
    isToggling,
    toggleError,
  };
}
