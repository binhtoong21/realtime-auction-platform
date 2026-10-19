import { useMemo } from 'react';
import { useFetch } from '../../../core/hooks/useFetch';

/**
 * Hook for fetching dispute detail by ID.
 * @param {string} disputeId
 */
export function useDisputeDetail(disputeId) {
  const url = disputeId ? `/admin/disputes/${disputeId}` : null;
  const { data, error, isLoading, refetch } = useFetch(url, {}, Boolean(disputeId));

  return useMemo(
    () => ({
      dispute: data?.data || null,
      error,
      isLoading,
      refetch,
    }),
    [data, error, isLoading, refetch]
  );
}
