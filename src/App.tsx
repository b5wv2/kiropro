import React from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { WalletProvider } from './context/WalletContext';
import { OverlayProvider } from './context/OverlayContext';
import { MainLayout } from './layouts/MainLayout';
import { HomePage } from './pages/Home/HomePage';
import { LoginPage } from './pages/Auth/LoginPage';
import { RegisterPage } from './pages/Auth/RegisterPage';
import { ForgotPasswordPage } from './pages/Auth/ForgotPasswordPage';
import { AccountPage } from './pages/Account/AccountPage';
import { ReviewPage } from './pages/Review/ReviewPage';
import { AllReviewsPage } from './pages/Review/AllReviewsPage';
import { UsdtTransferPage } from './pages/Crypto/UsdtTransferPage';
import { AdminLayout } from './layouts/AdminLayout';

const AppContent: React.FC = () => {
  const { currentView, user } = useAuth();

  const isUsdtPath = typeof window !== 'undefined' && (
    window.location.pathname === '/usdt' || currentView === 'usdt'
  );

  if (isUsdtPath) {
    return (
      <MainLayout>
        <UsdtTransferPage />
      </MainLayout>
    );
  }

  const isForgotPasswordPath = typeof window !== 'undefined' && (
    window.location.pathname === '/forgot-password' || currentView === 'forgot-password'
  );

  if (isForgotPasswordPath) {
    return (
      <MainLayout>
        <ForgotPasswordPage />
      </MainLayout>
    );
  }

  const isAllReviewsPath = typeof window !== 'undefined' && (
    window.location.pathname === '/reviews' || currentView === 'reviews'
  );

  if (isAllReviewsPath) {
    return (
      <MainLayout>
        <AllReviewsPage />
      </MainLayout>
    );
  }

  const isReviewPath = typeof window !== 'undefined' && (
    window.location.pathname.startsWith('/review') ||
    (window.location.search.includes('token=') && !window.location.pathname.includes('admin'))
  );

  if (isReviewPath) {
    return (
      <MainLayout>
        <ReviewPage />
      </MainLayout>
    );
  }

  if (currentView === 'admin') {
    if (user?.role !== 'ADMIN') {
      return <HomePage />;
    }
    return <AdminLayout />;
  }

  return (
    <MainLayout>
      {currentView === 'home' && <HomePage />}
      {currentView === 'login' && <LoginPage />}
      {currentView === 'register' && <RegisterPage />}
      {currentView === 'forgot-password' && <ForgotPasswordPage />}
      {currentView === 'account' && <AccountPage />}
      {currentView === 'usdt' && <UsdtTransferPage />}
    </MainLayout>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <OverlayProvider>
        <WalletProvider>
          <AppContent />
        </WalletProvider>
      </OverlayProvider>
    </AuthProvider>
  );
};

export default App;
