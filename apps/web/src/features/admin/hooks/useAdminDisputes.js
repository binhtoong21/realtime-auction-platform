import { useMemo } from 'react';
import { useFetch } from '../../../core/hooks/useFetch';

/**
 * Hook for fetching paginated dispute queue for Admin Desk.
 * @param {object} params
 * @param {string} [params.status] - 'open' | 'under_review' | 'resolved_buyer_wins' | 'resolved_seller_wins' | 'expired' | 'withdrawn'
 * @param {number} [params.page=1]
 * @param {number} [params.limit=20]
 */
export function useAdminDisputes({ status = '', page = 1, limit = 20 } = {}) {
  const queryParams = new URLSearchParams();
  if (status && status !== 'all') {
    queryParams.set('status', status);
  }
  if (page) {
    queryParams.set('page', String(page));
  }
  if (limit) {
    queryParams.set('limit', String(limit));
  }

  const queryString = queryParams.toString();
  const url = `/admin/disputes${queryString ? `?${queryString}` : ''}`;

  const { data, error, isLoading, refetch } = useFetch(url);

  return useMemo(
    () => ({
      disputes: data?.data || [],
      meta: data?.meta || { total: 0, page: 1, limit: 20, totalPages: 1 },
      error,
      isLoading,
      refetch,
    }),
    [data, error, isLoading, refetch]
  );
}
