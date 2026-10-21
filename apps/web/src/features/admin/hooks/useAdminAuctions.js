import { useMemo } from 'react';
import { useFetch } from '../../../core/hooks/useFetch';

/**
 * Hook to fetch paginated auctions list for admin review
 * @param {object} [params]
 * @param {number} [params.page=1]
 * @param {number} [params.limit=20]
 * @param {string} [params.search='']
 * @param {string} [params.status='']
 * @param {string} [params.categoryId='']
 */
export function useAdminAuctions({
  page = 1,
  limit = 20,
  search = '',
  status = '',
  categoryId = '',
} = {}) {
  const url = useMemo(() => {
    const params = new URLSearchParams();
    if (page) params.set('page', String(page));
    if (limit) params.set('limit', String(limit));
    if (search && search.trim() !== '') params.set('search', search.trim());
    if (status) params.set('status', status);
    if (categoryId) params.set('categoryId', categoryId);

    const queryString = params.toString();
    return `/admin/auctions${queryString ? `?${queryString}` : ''}`;
  }, [page, limit, search, status, categoryId]);

  const { data, error, isLoading, refetch } = useFetch(url);

  return {
    auctions: data?.data || [],
    meta: data?.meta || { total: 0, page: 1, limit: 20, totalPages: 0 },
    isLoading,
    error,
    refetch,
  };
}
