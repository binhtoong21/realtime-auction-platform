import { useState, useCallback, useMemo } from 'react';
import { useFetch } from '../../../core/hooks/useFetch';
import { axiosClient } from '../../../core/api/axiosClient';

/**
 * Hook to retrieve full dispute details for Buyer or Seller.
 * Backend: GET /disputes/:id
 * @param {string|null} disputeId
 */
export function useDisputeDetails(disputeId) {
  const url = disputeId ? `/disputes/${encodeURIComponent(disputeId)}` : null;
  const { data, error, isLoading, refetch } = useFetch(url, {}, Boolean(disputeId));

  return useMemo(
    () => ({
      dispute: data?.data || null,
      isLoading,
      error,
      refetch,
    }),
    [data, error, isLoading, refetch]
  );
}

/**
 * Hook to execute dispute actions (submit evidence, withdraw dispute)
 * for Buyers and Sellers.
 */
export function useUserDisputeActions() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState(null);

  /**
   * Fetch dispute detail imperatively
   * @param {string} disputeId
   */
  const fetchDispute = useCallback(async (disputeId) => {
    if (!disputeId) throw new Error('Dispute ID is required');
    try {
      const response = await axiosClient.get(`/disputes/${encodeURIComponent(disputeId)}`);
      return response.data?.data;
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message || 'Failed to fetch dispute detail';
      throw new Error(msg, { cause: err });
    }
  }, []);

  /**
   * Submit additional buyer evidence or seller counter-evidence within 72h window
   * Backend: PATCH /disputes/:id/evidence
   * @param {string} disputeId
   * @param {object} params
   * @param {File[]} params.files - Evidence files (images or video)
   * @param {string} [params.note] - Optional contextual note
   */
  const submitEvidence = useCallback(async (disputeId, { files = [], note = '' } = {}) => {
    if (!disputeId) throw new Error('Dispute ID is required');
    if (!files || files.length === 0) {
      throw new Error('At least one evidence file is required');
    }

    setIsSubmitting(true);
    setActionError(null);

    try {
      const formData = new FormData();
      files.forEach((file) => {
        formData.append('evidence', file);
      });
      if (note && note.trim()) {
        formData.append('note', note.trim());
      }

      const response = await axiosClient.patch(
        `/disputes/${encodeURIComponent(disputeId)}/evidence`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );
      return response.data?.data;
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message || 'Failed to submit evidence';
      setActionError(msg);
      throw new Error(msg, { cause: err });
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  /**
   * Withdraw an active dispute (Buyer only, status must be 'open')
   * Backend: DELETE /disputes/:id
   * @param {string} disputeId
   */
  const withdrawDispute = useCallback(async (disputeId) => {
    if (!disputeId) throw new Error('Dispute ID is required');

    setIsSubmitting(true);
    setActionError(null);

    try {
      const response = await axiosClient.delete(`/disputes/${encodeURIComponent(disputeId)}`);
      return response.data?.data;
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message || 'Failed to withdraw dispute';
      setActionError(msg);
      throw new Error(msg, { cause: err });
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  const clearError = useCallback(() => {
    setActionError(null);
  }, []);

  return {
    fetchDispute,
    submitEvidence,
    withdrawDispute,
    isSubmitting,
    actionError,
    clearError,
  };
}
