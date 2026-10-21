import { useFetch } from '../../../core/hooks/useFetch';

/**
 * Hook to fetch platform overview stats and top categories
 * @param {string} [period='7d'] - Time range ('1d' | '7d' | '30d' | '90d' | 'all')
 */
export function useAdminStats(period = '7d') {
  const url = `/admin/stats?period=${encodeURIComponent(period)}`;
  const { data, error, isLoading, refetch } = useFetch(url);

  return {
    overview: data?.data?.overview || null,
    topCategories: data?.data?.topCategories || [],
    period: data?.data?.period || period,
    isLoading,
    error,
    refetch,
  };
}
