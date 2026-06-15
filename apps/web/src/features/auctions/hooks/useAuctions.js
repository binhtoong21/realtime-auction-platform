import { useMemo } from 'react';
import { useFetch } from '../../../core/hooks/useFetch';

function buildQuery({ status, categoryId, minPrice, maxPrice, sort, cursor, limit }) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (categoryId) params.set('categoryId', categoryId);
  if (minPrice != null) params.set('minPrice', String(minPrice));
  if (maxPrice != null) params.set('maxPrice', String(maxPrice));
  if (sort) params.set('sort', sort);
  if (cursor) params.set('cursor', cursor);
  if (limit != null) params.set('limit', String(limit));
  return params.toString();
}

/**
 * Hook for fetching paginated auction listings.
 * All params must be primitives to avoid infinite re-fetch loops.
 */
export function useAuctions({ status, categoryId, minPrice, maxPrice, sort, cursor, limit } = {}) {
  const queryString = useMemo(
    () => buildQuery({ status, categoryId, minPrice, maxPrice, sort, cursor, limit }),
    [status, categoryId, minPrice, maxPrice, sort, cursor, limit]
  );

  const url = queryString ? `/auctions?${queryString}` : '/auctions';
  const { data, error, isLoading, refetch } = useFetch(url, {}, true);

  const auctions = data?.data || [];
  const meta = data?.meta || null;
  const nextCursor = meta?.nextCursor || null;
  const hasMore = meta?.hasMore ?? false;

  return { auctions, nextCursor, hasMore, isLoading, error, refetch };
}
