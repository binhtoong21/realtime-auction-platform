import { useEffect, useState, useRef } from 'react';
import { useSocket } from '../../../core/contexts/SocketContext';

/**
 * @param {string} auctionId 
 * @param {function} setAuctionData - Callback từ useFetch để update local state
 * @param {function} onOutbid - Callback(currentPrice) để UI hiện Toast và auto-fill giá
 */
export function useAuctionSocket(auctionId, setAuctionData, onOutbid) {
  const socket = useSocket();
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [timeOffset, setTimeOffset] = useState(0);
  
  // Track lastSeq for reconnect/catch-up logic
  const lastSeqRef = useRef(0);

  useEffect(() => {
    if (!socket || !auctionId) return;

    const handleConnect = () => {
      setConnectionStatus('connected');
      socket.emit('auction:subscribe', { auctionId, lastSeq: lastSeqRef.current });
    };
    
    const handleDisconnect = () => setConnectionStatus('disconnected');

    const handleCatchup = (data) => {
      // Simple timeOffset for countdown UI display; for critical sync, consider NTP-like RTT compensation.
      setTimeOffset(data.serverTime - Date.now());
      if (data.seq) lastSeqRef.current = data.seq;
      
      const { seq, serverTime, ...stateParams } = data;
      // prev ở đây là object envelope { success: true, data: {...} } trả về từ useFetch
      setAuctionData(prev => ({
        ...prev,
        data: { ...prev?.data, ...stateParams }
      }));
    };

    const handleNewBid = (bidData) => {
      if (bidData.seq) lastSeqRef.current = bidData.seq;
      
      setAuctionData(prev => ({
        ...prev,
        data: {
          ...prev?.data,
          currentPrice: bidData.newPrice,
          endAt: bidData.endAt !== undefined ? bidData.endAt : prev?.data?.endAt,
          extendedCount: bidData.extendedCount !== undefined ? bidData.extendedCount : prev?.data?.extendedCount,
          bidCount: (prev?.data?.bidCount || 0) + 1
        }
      }));
    };

    const handleOutbid = (data) => {
      if (data.seq) lastSeqRef.current = data.seq;
      if (onOutbid) {
        // Backend's 'bid:outbid' payload contains { auctionId, currentPrice, outbidBy }.
        // PR 3B UI component will add its own bidIncrement to this currentPrice to auto-fill the form.
        onOutbid(data.currentPrice);
      }
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('auction:catchup', handleCatchup);
    socket.on('bid:new', handleNewBid);
    socket.on('bid:outbid', handleOutbid);
    
    // Initial join if already connected
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
  }, [socket, auctionId, setAuctionData, onOutbid]);

  return { connectionStatus, timeOffset };
}


