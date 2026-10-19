import { useEffect, useState, useMemo } from 'react';
import { io } from 'socket.io-client';
import { SocketContext } from './SocketContext';
import { getAccessToken, setAccessToken } from '../../api/tokenManager';
import { useAuth, useAuthDispatch } from '../../context/AuthContext';
import { axiosClient } from '../../api/axiosClient';

export function SocketProvider({ children }) {
  const [socket, setSocket] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const user = useAuth();
  const { logout } = useAuthDispatch();

  useEffect(() => {
    const token = getAccessToken();
    if (!user || !token) {
      return;
    }

    const socketUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    const newSocket = io(socketUrl, {
      auth: { token: `Bearer ${token}` },
      transports: ['websocket'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    const handleConnect = () => {
      setConnectionStatus('connected');
    };

    const handleDisconnect = () => {
      setConnectionStatus('disconnected');
    };

    const handleConnectError = (error) => {
      setConnectionStatus('disconnected');
      console.error('Socket connection error:', error);
    };

    const handleTokenExpired = async () => {
      try {
        const response = await axiosClient.post('/auth/refresh');
        const newToken = response.data?.data?.accessToken;
        if (newToken) {
          setAccessToken(newToken);
          newSocket.auth = { token: `Bearer ${newToken}` };
          newSocket.emit('auth:refresh', { token: newToken });
        } else {
          logout();
        }
      } catch {
        logout();
      }
    };

    newSocket.on('connect', handleConnect);
    newSocket.on('disconnect', handleDisconnect);
    newSocket.on('connect_error', handleConnectError);
    newSocket.on('auth:token_expired', handleTokenExpired);

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSocket(newSocket);

    return () => {
      newSocket.off('connect', handleConnect);
      newSocket.off('disconnect', handleDisconnect);
      newSocket.off('connect_error', handleConnectError);
      newSocket.off('auth:token_expired', handleTokenExpired);
      newSocket.disconnect();
      setSocket(null);
      setConnectionStatus('disconnected');
    };
  }, [user, logout]);

  const contextValue = useMemo(() => ({
    socket,
    connectionStatus,
    isConnected: connectionStatus === 'connected',
  }), [socket, connectionStatus]);

  return (
    <SocketContext.Provider value={contextValue}>
      {children}
    </SocketContext.Provider>
  );
}

