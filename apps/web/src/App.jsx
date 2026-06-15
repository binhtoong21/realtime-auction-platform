import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from './core/context/AuthContext';
import { ToastProvider } from './core/context/ToastContext';
import { router } from './router';

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </ToastProvider>
  );
}
