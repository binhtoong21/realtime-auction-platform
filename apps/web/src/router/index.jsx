import { createBrowserRouter, Navigate } from 'react-router-dom';
import { BaseLayout } from '../components/layout/BaseLayout';
import { LoginPage } from '../features/authentication/pages/LoginPage';
import { RegisterPage } from '../features/authentication/pages/RegisterPage';
import { VerifyEmailPage } from '../features/authentication/pages/VerifyEmailPage';
import { ForgotPasswordPage } from '../features/authentication/pages/ForgotPasswordPage';
import { ResetPasswordPage } from '../features/authentication/pages/ResetPasswordPage';
import { AuctionBrowsePage } from '../features/auctions/pages/AuctionBrowsePage';
import { AuctionDetailPage } from '../features/auctions/pages/AuctionDetailPage';
import { TrackingPage } from '../features/auctions/pages/TrackingPage';
import { RequireAuth } from './RequireAuth';
import { RequireRole } from './RequireRole';
import { DashboardLayout } from '../features/dashboard/components/DashboardLayout';
import { DashboardHome } from '../features/dashboard/pages/DashboardHome';
import { MyAuctionsPage } from '../features/dashboard/pages/MyAuctionsPage';
import { CreateAuctionPage } from '../features/dashboard/pages/CreateAuctionPage';
import { EditAuctionPage } from '../features/dashboard/pages/EditAuctionPage';
import { MyBidsPage } from '../features/dashboard/pages/MyBidsPage';

import { PaymentHistoryPage } from '../features/dashboard/pages/PaymentHistoryPage';
import { NotificationCenterPage } from '../features/dashboard/pages/NotificationCenterPage';
import { ProfileSettingsPage } from '../features/dashboard/pages/ProfileSettingsPage';
import { PaymentMethodsPage } from '../features/dashboard/pages/PaymentMethodsPage';
import { KycPage } from '../features/dashboard/pages/KycPage';
import { AdminLayout } from '../features/admin/components/AdminLayout';
import { NotFoundPage } from '../pages/NotFoundPage';
import { ForbiddenPage } from '../pages/ForbiddenPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <BaseLayout />,
    children: [
      {
        index: true,
        element: <AuctionBrowsePage />,
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
        element: <AuctionBrowsePage />,
      },
      {
        path: 'auctions/:id',
        element: (
          <RequireAuth>
            <AuctionDetailPage />
          </RequireAuth>
        ),
      },
      {
        path: 'auctions/:id/tracking',
        element: (
          <RequireAuth>
            <TrackingPage />
          </RequireAuth>
        ),
      },
      {
        path: 'dashboard',
        element: (
          <RequireAuth>
            <DashboardLayout />
          </RequireAuth>
        ),
        children: [
          {
            index: true,
            element: <DashboardHome />,
          },
          {
            path: 'auctions',
            element: <MyAuctionsPage />,
          },
          {
            path: 'auctions/create',
            element: <CreateAuctionPage />,
          },
          {
            path: 'auctions/:id/edit',
            element: <EditAuctionPage />,
          },
          {
            path: 'bids',
            element: <MyBidsPage />,
          },
          {
            path: 'payments',
            element: <PaymentHistoryPage />,
          },
          {
            path: 'notifications',
            element: <NotificationCenterPage />,
          },
          {
            path: 'settings/profile',
            element: <ProfileSettingsPage />,
          },
          {
            path: 'settings/payment-methods',
            element: <PaymentMethodsPage />,
          },
          {
            path: 'settings/kyc',
            element: <KycPage />,
          },
        ],
      },
      {
        path: '403',
        element: <ForbiddenPage />,
      },
      {
        path: 'admin',
        element: (
          <RequireRole role="admin">
            <AdminLayout />
          </RequireRole>
        ),
        children: [
          {
            index: true,
            element: <Navigate to="/admin/disputes" replace />,
          },
          {
            path: 'disputes',
            element: (
              <div style={{ padding: '24px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>Dispute Queue Desk</h2>
                <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px' }}>
                  Queue interface loading.
                </p>
              </div>
            ),
          },
        ],
      },
      {
        path: '*',
        element: <NotFoundPage />,
      },
    ],
  },
]);

