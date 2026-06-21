import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from './core/context/AuthContext';
import { ToastProvider } from './core/context/ToastContext';
import { SocketProvider } from './core/contexts/SocketContext';
import { router } from './router';

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <SocketProvider>
          <RouterProvider router={router} />
        </SocketProvider>
      </AuthProvider>
    </ToastProvider>
  );
}

