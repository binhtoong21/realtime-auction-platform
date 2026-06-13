import { createBrowserRouter } from 'react-router-dom';
import { BaseLayout } from '../components/layout/BaseLayout';
import { LoginPage } from '../features/authentication/pages/LoginPage';
import { RegisterPage } from '../features/authentication/pages/RegisterPage';
import { VerifyEmailPage } from '../features/authentication/pages/VerifyEmailPage';
import { ForgotPasswordPage } from '../features/authentication/pages/ForgotPasswordPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <BaseLayout />,
    children: [
      {
        index: true,
        element: (
          <div style={{ textAlign: 'center', marginTop: 'var(--space-10)' }}>
            <h1 style={{ marginBottom: 'var(--space-4)' }}>Welcome to AuctionHouse</h1>
            <p style={{ color: 'var(--color-text-secondary)' }}>Discover and bid on exclusive items.</p>
          </div>
        ),
      },
      {
        path: 'auth/login',
        element: <LoginPage />,
      },
      {
        path: 'auth/register',
        element: <RegisterPage />,
      },
      {
        path: 'auth/verify-email',
        element: <VerifyEmailPage />,
      },
      {
        path: 'auth/forgot-password',
        element: <ForgotPasswordPage />,
      },
      // Placeholder for future routes
      {
        path: 'auctions',
        element: <div>Auctions Listing Page</div>,
      }
    ],
  },
]);
