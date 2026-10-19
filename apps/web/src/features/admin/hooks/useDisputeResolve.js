import { useCallback } from 'react';
import { axiosClient } from '../../../core/api/axiosClient';
import { useMutation } from '../../../core/hooks/useMutation';

/**
 * Hook to resolve an under-review dispute (outcome: 'buyer_wins' | 'seller_wins').
 * @param {string} [disputeId]
 */
export function useDisputeResolve(disputeId) {
  const { mutate, data, error, isLoading, reset } = useMutation(
    disputeId ? `/admin/disputes/${disputeId}/resolve` : '',
    'patch'
  );

  const resolveDispute = useCallback(
    async ({ outcome, resolutionNote, policyRule, rejectionReason, overrideId }) => {
      const targetId = overrideId || disputeId;
      if (!targetId) {
        throw new Error('Dispute ID is required to resolve dispute');
      }

      const payload = {
        outcome,
        resolutionNote,
      };

      if (outcome === 'buyer_wins') {
        payload.policyRule = policyRule;
      } else if (outcome === 'seller_wins') {
        payload.rejectionReason = rejectionReason;
      }

      if (overrideId && overrideId !== disputeId) {
        const response = await axiosClient.patch(`/admin/disputes/${overrideId}/resolve`, payload);
        return response.data;
      }

      return mutate(payload);
    },
    [disputeId, mutate]
  );

  return {
    resolveDispute,
    data,
    error,
    isLoading,
    reset,
  };
}
