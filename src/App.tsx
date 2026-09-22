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
import { MaintenancePage } from './pages/Maintenance/MaintenancePage';

const AppContent: React.FC = () => {
  const { currentView, user, maintenanceMode, checkMaintenanceStatus, navigateTo } = useAuth();

  // Maintenance Mode Guard:
  // Only users with role === 'ADMIN' (valid active/previous session) can enter.
  // All others are presented with the humorous Maintenance Screen.
  const isAdmin = user?.role === 'ADMIN';

  if (maintenanceMode && !isAdmin) {
    return <MaintenancePage onCheckStatus={checkMaintenanceStatus} />;
  }

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
    <>
      {maintenanceMode && isAdmin && (
        <div style={{
          background: 'linear-gradient(90deg, #78350F 0%, #B45309 100%)',
          color: '#FEF3C7',
          padding: '8px 16px',
          textAlign: 'center',
          fontSize: '0.85rem',
          fontWeight: 800,
          borderBottom: '1px solid #F59E0B',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          position: 'sticky',
          top: 0,
          zIndex: 10000,
          direction: 'rtl'
        }}>
          <span>🛠️ وضع الصيانة مفعل حالياً: المتجر مغلق أمام العملاء والزوار وأنت تتصفح بكامل الصلاحيات كمسؤول.</span>
          <button
            type="button"
            onClick={() => navigateTo('admin')}
            style={{
              background: '#F59E0B',
              color: '#0B0F19',
              border: 'none',
              borderRadius: 6,
              padding: '3px 10px',
              fontSize: '0.75rem',
              fontWeight: 900,
              cursor: 'pointer'
            }}
          >
            إدارة الإعدادات
          </button>
        </div>
      )}
      <MainLayout>
        {currentView === 'home' && <HomePage />}
        {currentView === 'login' && <LoginPage />}
        {currentView === 'register' && <RegisterPage />}
        {currentView === 'forgot-password' && <ForgotPasswordPage />}
        {currentView === 'account' && <AccountPage />}
        {currentView === 'usdt' && <UsdtTransferPage />}
      </MainLayout>
    </>
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
