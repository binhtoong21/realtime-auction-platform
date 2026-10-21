import { useFetch } from '../../../core/hooks/useFetch';

/**
 * Hook to fetch public seller profile by user ID
 * @param {string} sellerId - UUID of the seller / user
 */
export function useSellerProfile(sellerId) {
  const url = sellerId ? `/users/${sellerId}/profile` : null;
  const { data, error, isLoading, refetch } = useFetch(url, {}, Boolean(sellerId));

  const payload = data?.data;

  return {
    user: payload?.user || null,
    stats: payload?.stats || null,
    activeAuctions: payload?.activeAuctions || [],
    completedAuctions: payload?.completedAuctions || [],
    isLoading,
    error,
    refetch,
  };
}
