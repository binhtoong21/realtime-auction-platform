import { useFetch } from '../../../../core/hooks/useFetch';
import { useMutation } from '../../../../core/hooks/useMutation';

/**
 * Retrieve escrow payment history.
 * Backend: GET /users/me/payments
 */
export function usePaymentHistory(status, cursor = null) {
  const queryParams = new URLSearchParams();
  if (status) queryParams.append('status', status);
  if (cursor) queryParams.append('cursor', cursor);
  
  const queryString = queryParams.toString();
  const url = `/users/me/payments${queryString ? `?${queryString}` : ''}`;

  const { data, error, isLoading, refetch } = useFetch(url);

  const payments = data?.data?.items || [];
  const nextCursor = data?.data?.nextCursor;

  return {
    payments,
    nextCursor,
    isLoading,
    error,
    refetch,
  };
}

/**
 * Confirm delivery of a won item (releases escrow funds to the seller).
 * Backend: POST /auctions/:id/confirm-delivery
 */
export function useConfirmDelivery() {
  const { mutate, isLoading, error, reset } = useMutation('', 'post');

  const confirm = async (auctionId) => {
    if (!auctionId) throw new Error('Auction ID is required');
    const overrideOptions = {
      url: `/auctions/${encodeURIComponent(auctionId)}/confirm-delivery`,
    };

    const response = await mutate({}, overrideOptions);
    return response.data;
  };

  return {
    confirm,
    isLoading,
    error,
    reset,
  };
}

/**
 * Open a dispute on an escrow payment (buyer action).
 * Backend: POST /disputes
 */
export function useOpenDispute() {
  const { mutate, isLoading, error, reset } = useMutation('/disputes', 'post');

  const open = async (disputeForm) => {
    const body = {
      paymentId: disputeForm.paymentId,
      reason: disputeForm.reason,
      description: disputeForm.description,
      evidenceUrls: disputeForm.evidenceUrls || [],
    };

    const response = await mutate(body);
    return response.data;
  };

  return {
    open,
    isLoading,
    error,
    reset,
  };
}

/**
 * Retry payment during GRACE_PERIOD
 * Backend: POST /payments/:id/retry
 */
export function useRetryPayment() {
  const { mutate, isLoading, error, reset } = useMutation('', 'post');

  const retry = async (paymentId, paymentMethodId) => {
    if (!paymentId) throw new Error('Payment ID is required');
    const body = { paymentMethodId };
    const overrideOptions = {
      url: `/payments/${encodeURIComponent(paymentId)}/retry`,
    };

    const response = await mutate(body, overrideOptions);
    return response.data;
  };

  return {
    retry,
    isLoading,
    error,
    reset,
  };
}
