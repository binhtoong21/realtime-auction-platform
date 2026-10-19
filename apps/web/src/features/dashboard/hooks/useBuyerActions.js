import { useFetch } from '../../../core/hooks/useFetch';
import { useMutation } from '../../../core/hooks/useMutation';

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

  const payments = Array.isArray(data?.data) ? data.data : (data?.data?.items || []);
  const nextCursor = data?.meta?.nextCursor || data?.data?.nextCursor;

  return {
    payments,
    nextCursor,
    isLoading,
    error,
    refetch,
  };
}

/**
 * Retrieve user's bid history.
 * Backend: GET /users/me/bids (Phase 14)
 */
export function useMyBids(status, cursor = null) {
  const queryParams = new URLSearchParams();
  if (status) queryParams.append('status', status);
  if (cursor) queryParams.append('cursor', cursor);
  
  const queryString = queryParams.toString();
  const url = `/users/me/bids${queryString ? `?${queryString}` : ''}`;

  const { data, error, isLoading, refetch } = useFetch(url);

  const bids = Array.isArray(data?.data) ? data.data : (data?.data?.items || []);
  const nextCursor = data?.meta?.nextCursor || data?.data?.nextCursor;

  return {
    bids,
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

/**
 * Request delivery deadline extension (+7 days).
 * Backend: POST /auctions/:id/extend-delivery
 */
export function useExtendDelivery() {
  const { mutate, isLoading, error, reset } = useMutation('', 'post');

  const extendDelivery = async (auctionId, reason) => {
    if (!auctionId) throw new Error('Auction ID is required');
    const body = { reason };
    const overrideOptions = {
      url: `/auctions/${encodeURIComponent(auctionId)}/extend-delivery`,
    };

    const response = await mutate(body, overrideOptions);
    return response.data;
  };

  return {
    extendDelivery,
    isLoading,
    error,
    reset,
  };
}

/**
 * Respond to a Second Chance offer (runner-up buyer).
 * Backend: POST /auctions/:id/second-chance/accept
 *          POST /auctions/:id/second-chance/decline
 */
export function useSecondChance() {
  const { mutate: mutateAccept, isLoading: isAccepting, error: acceptError, reset: resetAccept } = useMutation('', 'post');
  const { mutate: mutateDecline, isLoading: isDeclining, error: declineError, reset: resetDecline } = useMutation('', 'post');

  const accept = async (auctionId) => {
    if (!auctionId) throw new Error('Auction ID is required');
    const overrideOptions = {
      url: `/auctions/${encodeURIComponent(auctionId)}/second-chance/accept`,
    };

    const response = await mutateAccept({}, overrideOptions);
    return response.data;
  };

  const decline = async (auctionId) => {
    if (!auctionId) throw new Error('Auction ID is required');
    const overrideOptions = {
      url: `/auctions/${encodeURIComponent(auctionId)}/second-chance/decline`,
    };

    const response = await mutateDecline({}, overrideOptions);
    return response.data;
  };

  return {
    accept,
    decline,
    isLoading: isAccepting || isDeclining,
    isAccepting,
    isDeclining,
    error: acceptError || declineError,
    reset: () => {
      resetAccept();
      resetDecline();
    },
  };
}

