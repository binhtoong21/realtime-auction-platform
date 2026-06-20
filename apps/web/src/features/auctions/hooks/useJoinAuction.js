import { useState, useCallback, useRef, useEffect } from 'react';
import { useMutation } from '../../../core/hooks/useMutation';

export function useJoinAuction(auctionId) {
  const { mutate, isLoading, error } = useMutation(`/auctions/${auctionId}/join`, 'POST');
  const [clientSecret, setClientSecret] = useState(null);
  const isRequestingRef = useRef(false);

  useEffect(() => {
    setClientSecret(null);
  }, [auctionId]);

  const joinAuction = useCallback(async () => {
    if (isRequestingRef.current) return;
    
    isRequestingRef.current = true;
    try {
      const response = await mutate({}); // Body rỗng
      // Contract: { success: true, data: { setupIntentClientSecret, alreadyJoined } }
      const secret = response.data?.setupIntentClientSecret;
      setClientSecret(secret);
      return response.data;
    } finally {
      isRequestingRef.current = false;
    }
  }, [mutate]);

  return { joinAuction, isLoading, error, clientSecret };
}



