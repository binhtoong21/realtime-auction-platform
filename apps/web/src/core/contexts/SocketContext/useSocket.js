import { useContext } from 'react';
import { SocketContext } from './SocketContext';

export const useSocket = () => {
  const context = useContext(SocketContext);
  return context?.socket ?? context;
};

export const useSocketStatus = () => {
  const context = useContext(SocketContext);
  return {
    connectionStatus: context?.connectionStatus ?? 'disconnected',
    isConnected: context?.isConnected ?? false,
  };
};

