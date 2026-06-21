import { useState, useCallback, useRef, useEffect } from 'react';
import { useMutation } from '../../../core/hooks/useMutation';

export function useBidSubmit(auctionId, refetchAuction) {
  const idempotencyKeyRef = useRef(null);
  const lastSubmittedAmountRef = useRef(null);
  // 'idle' | 'submitting' | 'success' | 'network_error' | 'rejected'
  const [bidState, setBidState] = useState('idle'); 
  const [errorCode, setErrorCode] = useState(null);
  const { mutate } = useMutation(`/auctions/${auctionId}/bids`, 'POST');
  
  const isRequestingRef = useRef(false);
  const fallbackTimerRef = useRef(null);

  // Clear timer on unmount
  useEffect(() => {
    return () => clearTimeout(fallbackTimerRef.current);
  }, []);

  const submitBid = useCallback(async (amount) => {
    if (isRequestingRef.current) return;
    isRequestingRef.current = true;

    let currentKey = idempotencyKeyRef.current;
    if (amount !== lastSubmittedAmountRef.current || !currentKey) {
      currentKey = crypto.randomUUID();
      idempotencyKeyRef.current = currentKey;
      lastSubmittedAmountRef.current = amount;
    }

    setBidState('submitting');
    setErrorCode(null);
    clearTimeout(fallbackTimerRef.current);

    try {
      const response = await mutate(
        { amount }, 
        // Backend đang sử dụng header 'Idempotency-Key' theo middleware idempotency.js
        { headers: { 'Idempotency-Key': currentKey } }
      );
      
      // Success (201)
      setBidState('success');
      idempotencyKeyRef.current = null;
      lastSubmittedAmountRef.current = null;
      return response;
    } catch (err) {
      const status = err.response?.status;
      const code = err.response?.data?.error?.code;
      const details = err.response?.data?.error?.details;
      
      setErrorCode({ code, details });
      
      if (status === 400 || status === 422 || status === 403 || status === 402) {
        // Definitive rejection (e.g. Outbid, Ended, Payment Required, Forbidden)
        setBidState('rejected');
        idempotencyKeyRef.current = null;
      } else if (status === 409) {
        // Conflict - đã được xử lý bởi server, hiển thị "đang xử lý" trên UI.
        // Tuyệt đối không đọc response body vì server không trả originalResult.
        // Tuyệt đối KHÔNG xóa idempotencyKey để tránh bypass nếu user tiếp tục spam.
        setBidState('success');
        
        // 3s Fallback refetch mechanism
        fallbackTimerRef.current = setTimeout(() => {
          if (refetchAuction) refetchAuction();
        }, 3000);
      } else {
        // Network Error / 5xx / Timeout -> Keep key for retry
        setBidState('network_error');
      }
      throw err;
    } finally {
      isRequestingRef.current = false;
    }
  }, [mutate, refetchAuction]);

  const resetState = () => {
    setBidState('idle');
    setErrorCode(null);
  };

  return { bidState, errorCode, submitBid, resetState, isSubmitting: bidState === 'submitting' };
}


