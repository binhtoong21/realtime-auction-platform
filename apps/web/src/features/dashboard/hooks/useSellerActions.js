import { useFetch } from '../../../../core/hooks/useFetch';
import { useMutation } from '../../../../core/hooks/useMutation';

/**
 * Fetch seller's own auctions list.
 * Backend: GET /auctions?sellerId=me
 * Return structure: { items: [...], nextCursor: ... }
 */
export function useSellerAuctions(status) {
  const { data, error, isLoading, refetch } = useFetch(
    status ? `/auctions?sellerId=me&status=${encodeURIComponent(status)}` : '/auctions?sellerId=me'
  );

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

  const create = async (auctionForm) => {
    const startingPrice = Number(auctionForm.startingPrice);
    const bidIncrement = Number(auctionForm.bidIncrement);
    const reservePrice = auctionForm.reservePrice ? Number(auctionForm.reservePrice) : null;

    if (isNaN(startingPrice) || isNaN(bidIncrement) || (reservePrice !== null && isNaN(reservePrice))) {
      throw new Error('Invalid numeric values');
    }

    const startAt = new Date(auctionForm.startAt);
    const endAt = new Date(auctionForm.endAt);

    if (isNaN(startAt.getTime()) || isNaN(endAt.getTime())) {
      throw new Error('Invalid date values');
    }

    const body = {
      title: auctionForm.title,
      description: auctionForm.description,
      images: auctionForm.images || [],
      startingPrice,
      reservePrice,
      bidIncrement,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      categoryId: auctionForm.categoryId,
    };

    const response = await mutate(body);
    return response.data; // Unwrapped object containing the actual data payload
  };

  return {
    create,
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
