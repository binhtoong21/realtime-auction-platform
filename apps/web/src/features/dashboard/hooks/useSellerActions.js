import { useFetch } from '../../../core/hooks/useFetch';
import { useMutation } from '../../../core/hooks/useMutation';

/**
 * Fetch seller's own auctions list.
 * Backend: GET /auctions?sellerId=me
 * Return structure: { items: [...], nextCursor: ... }
 */
export function useSellerAuctions(status, cursor = null) {
  const queryParams = new URLSearchParams();
  queryParams.append('sellerId', 'me');
  if (status) queryParams.append('status', status);
  if (cursor) queryParams.append('cursor', cursor);
  
  const { data, error, isLoading, refetch } = useFetch(`/auctions?${queryParams.toString()}`);

  const auctions = data?.data?.items || [];
  const nextCursor = data?.data?.nextCursor;

  return {
    auctions,
    nextCursor,
    isLoading,
    error,
    refetch,
  };
}

/**
 * Create a new auction (seller action).
 * Backend: POST /auctions
 */
export function useCreateAuction() {
  const { mutate, data, error, isLoading, reset } = useMutation('/auctions', 'post');

  return {
    createAuction: (formData) => mutate(formData, {
      headers: { 'Content-Type': undefined } // Let browser set multipart with boundary
    }),
    createdData: data?.data,
    isLoading,
    error,
    reset,
  };
}

/**
 * Mark an auction item as shipped (seller action).
 * Backend: POST /auctions/:id/ship
 */
export function useShipAuction() {
  const { mutate, isLoading, error, reset } = useMutation('', 'post');

  const ship = async (auctionId, carrier, trackingNumber) => {
    if (!auctionId) throw new Error('Auction ID is required');
    const body = { carrier, trackingNumber };
    const overrideOptions = {
      url: `/auctions/${encodeURIComponent(auctionId)}/ship`,
    };

    const response = await mutate(body, overrideOptions);
    return response.data;
  };

  return {
    ship,
    isLoading,
    error,
    reset,
  };
}

/**
 * Update tracking number within 24 hours of shipment.
 * Backend: PATCH /auctions/:id/ship
 */
export function useUpdateTracking() {
  const { mutate, isLoading, error, reset } = useMutation('', 'patch');

  const updateTracking = async (auctionId, carrier, trackingNumber) => {
    if (!auctionId) throw new Error('Auction ID is required');
    const body = { carrier, trackingNumber };
    const overrideOptions = {
      url: `/auctions/${encodeURIComponent(auctionId)}/ship`,
    };

    const response = await mutate(body, overrideOptions);
    return response.data;
  };

  return {
    updateTracking,
    isLoading,
    error,
    reset,
  };
}

/**
 * Request shipping deadline extension (+3 days).
 * Backend: POST /auctions/:id/extend-shipping
 */
export function useExtendShipping() {
  const { mutate, isLoading, error, reset } = useMutation('', 'post');

  const extendShipping = async (auctionId, reason) => {
    if (!auctionId) throw new Error('Auction ID is required');
    const body = { reason };
    const overrideOptions = {
      url: `/auctions/${encodeURIComponent(auctionId)}/extend-shipping`,
    };

    const response = await mutate(body, overrideOptions);
    return response.data;
  };

  return {
    extendShipping,
    isLoading,
    error,
    reset,
  };
}

/**
 * Edit scheduled or active auction before any bids are placed.
 * Backend: PATCH /auctions/:id
 */
export function useEditAuction() {
  const { mutate, isLoading, error, reset } = useMutation('', 'patch');

  const editAuction = async (auctionId, formDataOrBody) => {
    if (!auctionId) throw new Error('Auction ID is required');
    const isFormData = typeof FormData !== 'undefined' && formDataOrBody instanceof FormData;
    const overrideOptions = {
      url: `/auctions/${encodeURIComponent(auctionId)}`,
      ...(isFormData ? { headers: { 'Content-Type': undefined } } : {}),
    };

    const response = await mutate(formDataOrBody, overrideOptions);
    return response.data;
  };

  return {
    editAuction,
    isLoading,
    error,
    reset,
  };
}

/**
 * Cancel an auction before any bids are placed.
 * Backend: PATCH /auctions/:id/cancel
 */
export function useCancelAuction() {
  const { mutate, isLoading, error, reset } = useMutation('', 'patch');

  const cancelAuction = async (auctionId) => {
    if (!auctionId) throw new Error('Auction ID is required');
    const overrideOptions = {
      url: `/auctions/${encodeURIComponent(auctionId)}/cancel`,
    };

    const response = await mutate({}, overrideOptions);
    return response.data;
  };

  return {
    cancelAuction,
    isLoading,
    error,
    reset,
  };
}

