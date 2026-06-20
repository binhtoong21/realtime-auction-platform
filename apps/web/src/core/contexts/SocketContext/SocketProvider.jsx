import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { SocketContext } from './SocketContext';
import { getAccessToken } from '../../../core/api/tokenManager';
import { useAuth } from '../../context/AuthContext';

export function SocketProvider({ children }) {
  const [socket, setSocket] = useState(null);
  const user = useAuth(); // Depend on user state to trigger reconnects

  useEffect(() => {
    const token = getAccessToken();
    // If not authenticated, we shouldn't have a socket
    if (!token || !user) {
      setSocket(null);
      return;
    }

    const newSocket = io(import.meta.env.VITE_API_URL, {
      auth: { token },
      autoConnect: true,
      // Intentional websocket-only transport to enforce low latency for live auctions
      transports: ['websocket'],
    });

    newSocket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
    });

    setSocket(newSocket);

    return () => {
      newSocket.off('connect_error');
      newSocket.disconnect();
    };
  }, [user]); // Re-run whenever auth state changes

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
}
