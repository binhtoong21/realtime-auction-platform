import { createBrowserRouter } from 'react-router-dom';
import { BaseLayout } from '../components/layout/BaseLayout';
import { LoginPage } from '../features/authentication/pages/LoginPage';
import { RegisterPage } from '../features/authentication/pages/RegisterPage';
import { VerifyEmailPage } from '../features/authentication/pages/VerifyEmailPage';
import { ForgotPasswordPage } from '../features/authentication/pages/ForgotPasswordPage';
import { ResetPasswordPage } from '../features/authentication/pages/ResetPasswordPage';
import { LandingPage } from '../features/auctions/pages/LandingPage';
import { AuctionBrowsePage } from '../features/auctions/pages/AuctionBrowsePage';
import { AuctionDetailPage } from '../features/auctions/pages/AuctionDetailPage';
import { RequireAuth } from './RequireAuth';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <BaseLayout />,
    children: [
      {
        index: true,
        element: <LandingPage />,
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
      {
        path: 'auth/reset-password',
        element: <ResetPasswordPage />,
      },
      {
        path: 'auctions',
        element: (
          <RequireAuth>
            <AuctionBrowsePage />
          </RequireAuth>
        ),
      },
      {
        path: 'auctions/:id',
        element: (
          <RequireAuth>
            <AuctionDetailPage />
          </RequireAuth>
        ),
      },
    ],
  },
]);

