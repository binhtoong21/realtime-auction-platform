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
      // Contract: { success: true, data: { clientSecret } }
      const secret = response.data?.clientSecret;
      setClientSecret(secret);
      return response.data;
    } finally {
      isRequestingRef.current = false;
    }
  }, [mutate]);

  const { mutate: confirmMutate } = useMutation(`/auctions/${auctionId}/join/confirm`, 'POST');

  const confirmSetup = useCallback(async () => {
    try {
      const response = await confirmMutate({});
      return response.data;
    } catch (err) {
      console.error('Failed to confirm join on backend:', err);
      throw err;
    }
  }, [confirmMutate]);

  return { joinAuction, confirmSetup, isLoading, error, clientSecret };
}



