import { useState, useCallback } from 'react';
import { axiosClient } from '../../../core/api/axiosClient';

/**
 * Hook to execute administrative auction management actions
 */
export function useAdminAuctionActions() {
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [actionError, setActionError] = useState(null);

  const cancelAuction = useCallback(async (auctionId, reason) => {
    setIsActionLoading(true);
    setActionError(null);
    try {
      const res = await axiosClient.patch(`/admin/auctions/${auctionId}/cancel`, { reason });
      return res.data?.data;
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message || 'Failed to cancel auction';
      setActionError(msg);
      throw err;
    } finally {
      setIsActionLoading(false);
    }
  }, []);

  return {
    cancelAuction,
    isActionLoading,
    actionError,
  };
}
