import { useCallback } from 'react';
import { axiosClient } from '../../../core/api/axiosClient';
import { useMutation } from '../../../core/hooks/useMutation';

/**
 * Hook to initiate review on an open dispute (transitions 'open' -> 'under_review').
 * @param {string} [disputeId]
 */
export function useDisputeReview(disputeId) {
  const { mutate, data, error, isLoading, reset } = useMutation(
    disputeId ? `/admin/disputes/${disputeId}/review` : '',
    'patch'
  );

  const startReview = useCallback(
    async (overrideId) => {
      const targetId = overrideId || disputeId;
      if (!targetId) {
        throw new Error('Dispute ID is required to start review');
      }

      if (overrideId && overrideId !== disputeId) {
        const response = await axiosClient.patch(`/admin/disputes/${overrideId}/review`);
        return response.data;
      }

      return mutate();
    },
    [disputeId, mutate]
  );

  return {
    startReview,
    data,
    error,
    isLoading,
    reset,
  };
}
