import { useFetch } from '../../../core/hooks/useFetch';

/**
 * Hook to retrieve shipment tracking details for an auction.
 * Backend: GET /auctions/:id/tracking
 * Accessible to authenticated buyer or seller.
 *
 * @param {string} auctionId
 * @returns {{
 *   tracking: {
 *     carrier: string,
 *     trackingNumber: string,
 *     trackingUrl: string,
 *     shippedAt: string,
 *     deliveryDeadlineAt: string,
 *     status: string,
 *     isExtended: boolean
 *   } | null,
 *   isLoading: boolean,
 *   error: any,
 *   refetch: () => void
 * }}
 */
export function useTracking(auctionId) {
  const url = auctionId ? `/auctions/${encodeURIComponent(auctionId)}/tracking` : null;
  const { data, error, isLoading, refetch } = useFetch(url, {}, !!auctionId);

  return {
    tracking: data?.data || null,
    isLoading,
    error,
    refetch,
  };
}
