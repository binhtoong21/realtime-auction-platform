import { useEffect, useState, useRef } from 'react';
import { useSocket } from '../../../core/contexts/SocketContext';

/**
 * Hook to manage real-time auction room subscription, catch-up synchronization,
 * and event handling with sequence-based deduplication and callback stabilization.
 *
 * @param {string} auctionId
 * @param {function} setAuctionData - Callback from useFetch to update local auction state
 * @param {function} [onOutbid] - Callback(currentPrice) to trigger outbid alerts
 */
export function useAuctionSocket(auctionId, setAuctionData, onOutbid) {
  const socket = useSocket();
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [timeOffset, setTimeOffset] = useState(0);

  // Track lastSeq for reconnect/catch-up and client deduplication
  const lastSeqRef = useRef(0);

  // Stabilize callbacks via refs to prevent socket unsubscription churn
  const setAuctionDataRef = useRef(setAuctionData);
  useEffect(() => {
    setAuctionDataRef.current = setAuctionData;
  }, [setAuctionData]);

  const onOutbidRef = useRef(onOutbid);
  useEffect(() => {
    onOutbidRef.current = onOutbid;
  }, [onOutbid]);

  useEffect(() => {
    if (!socket || !auctionId) return;

    const handleConnect = () => {
      setConnectionStatus('connected');
      socket.emit('auction:subscribe', {
        auctionId,
        lastSeq: lastSeqRef.current,
      });
    };

    const handleDisconnect = () => setConnectionStatus('disconnected');

    const handleCatchup = (data) => {
      if (data.serverTime) {
        setTimeOffset(data.serverTime - Date.now());
      }
      if (data.seq) {
        if (data.seq < lastSeqRef.current) return;
        lastSeqRef.current = data.seq;
      }

      // eslint-disable-next-line no-unused-vars
      const { seq, serverTime, ...stateParams } = data;
      // Convert camelCase from socket to snake_case for local state
      const snakeCaseParams = {
        current_price: stateParams.currentPrice,
        end_at: stateParams.endAt,
        extended_count: stateParams.extendedCount,
        bid_count: stateParams.bidCount,
      };

      // Remove undefined values
      Object.keys(snakeCaseParams).forEach((key) => {
        if (snakeCaseParams[key] === undefined) {
          delete snakeCaseParams[key];
        }
      });

      setAuctionDataRef.current?.((prev) => ({
        ...prev,
        data: { ...prev?.data, ...snakeCaseParams },
      }));
    };

    const handleNewBid = (bidData) => {
      // Sequence-based deduplication: discard stale or duplicate events
      if (bidData.seq) {
        if (bidData.seq <= lastSeqRef.current) return;
        lastSeqRef.current = bidData.seq;
      }

      setAuctionDataRef.current?.((prev) => {
        const resolvedBidCount =
          bidData.bidCount !== undefined
            ? bidData.bidCount
            : (Number(prev?.data?.bid_count) || 0) + 1;

        return {
          ...prev,
          data: {
            ...prev?.data,
            current_price: bidData.newPrice,
            end_at:
              bidData.endAt !== undefined
                ? bidData.endAt
                : prev?.data?.end_at,
            extended_count:
              bidData.extendedCount !== undefined
                ? bidData.extendedCount
                : prev?.data?.extended_count,
            bid_count: resolvedBidCount,
          },
        };
      });
    };

    const handleOutbid = (data) => {
      if (data.seq) {
        if (data.seq <= lastSeqRef.current) return;
        lastSeqRef.current = data.seq;
      }
      onOutbidRef.current?.(data.currentPrice);
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('auction:catchup', handleCatchup);
    socket.on('bid:new', handleNewBid);
    socket.on('bid:outbid', handleOutbid);

    // Initial join if socket is already connected
    if (socket.connected) {
      handleConnect();
    }

    return () => {
      socket.emit('auction:unsubscribe', { auctionId });
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('auction:catchup', handleCatchup);
      socket.off('bid:new', handleNewBid);
      socket.off('bid:outbid', handleOutbid);
    };
  }, [socket, auctionId]);

  return { connectionStatus, timeOffset };
}
