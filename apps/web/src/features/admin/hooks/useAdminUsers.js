import { useMemo } from 'react';
import { useFetch } from '../../../core/hooks/useFetch';

/**
 * Hook to fetch paginated users list with filtering
 * @param {object} [params]
 * @param {number} [params.page=1]
 * @param {number} [params.limit=20]
 * @param {string} [params.search='']
 * @param {string} [params.role='']
 * @param {string} [params.status='']
 * @param {string} [params.identityStatus='']
 */
export function useAdminUsers({
  page = 1,
  limit = 20,
  search = '',
  role = '',
  status = '',
  identityStatus = '',
} = {}) {
  const url = useMemo(() => {
    const params = new URLSearchParams();
    if (page) params.set('page', String(page));
    if (limit) params.set('limit', String(limit));
    if (search && search.trim() !== '') params.set('search', search.trim());
    if (role) params.set('role', role);
    if (status) params.set('status', status);
    if (identityStatus) params.set('identityStatus', identityStatus);

    const queryString = params.toString();
    return `/admin/users${queryString ? `?${queryString}` : ''}`;
  }, [page, limit, search, role, status, identityStatus]);

  const { data, error, isLoading, refetch } = useFetch(url);

  return {
    users: data?.data || [],
    meta: data?.meta || { total: 0, page: 1, limit: 20, totalPages: 0 },
    isLoading,
    error,
    refetch,
  };
}

/**
 * Hook to fetch detailed profile and activity for an individual user
 * @param {string} userId
 */
export function useAdminUserDetail(userId) {
  const { data, error, isLoading, refetch } = useFetch(
    userId ? `/admin/users/${userId}` : null
  );

  return {
    userDetail: data?.data?.user || null,
    recentAuctions: data?.data?.recentAuctions || [],
    recentBids: data?.data?.recentBids || [],
    recentDisputes: data?.data?.recentDisputes || [],
    isLoading,
    error,
    refetch,
  };
}
