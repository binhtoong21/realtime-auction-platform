import { useState } from 'react';
import { useMutation } from '../../../core/hooks/useMutation';

export function useJoinAuction(auctionId) {
  const { mutate, isLoading, error } = useMutation(`/auctions/${auctionId}/join`, 'POST');
  const [clientSecret, setClientSecret] = useState(null);

  const joinAuction = async () => {
    try {
      const response = await mutate({}); // Body rỗng
      // Contract: { success: true, data: { setupIntentClientSecret, alreadyJoined } }
      const secret = response.data?.setupIntentClientSecret;
      setClientSecret(secret);
      return response.data;
    } catch (err) {
      throw err;
    }
  };

  return { joinAuction, isLoading, error, clientSecret };
}


