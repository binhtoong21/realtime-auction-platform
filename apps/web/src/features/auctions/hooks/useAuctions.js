import { useMemo } from 'react';
import { useFetch } from '../../../core/hooks/useFetch';

/** Builds a URL query string from filter params, omitting null/undefined values. */
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
 * @param {Object} params
 * @param {string} [params.status] - Filter by status (e.g., active, ended)
 * @param {string} [params.categoryId] - Filter by category ID
 * @param {number|string} [params.minPrice] - Minimum current price
 * @param {number|string} [params.maxPrice] - Maximum current price
 * @param {string} [params.sort] - Sort order (e.g., ending_soon, newest, price_asc, price_desc)
 * @param {string} [params.cursor] - Pagination cursor
 * @param {number} [params.limit] - Number of items per page
 * @returns {{ auctions: Array, nextCursor: string|null, hasMore: boolean, isLoading: boolean, error: any, refetch: Function }}
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
