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
import { LeaderboardPage } from './pages/Leaderboard/LeaderboardPage';
import { VirtualNumbersPage } from './pages/VirtualNumbers/VirtualNumbersPage';
import { WheelPage } from './pages/Wheel/WheelPage';
import { MarketplaceHomePage } from './pages/Marketplace/MarketplaceHomePage';
import { ListingDetailPage } from './pages/Marketplace/ListingDetailPage';
import { CreateListingPage } from './pages/Marketplace/CreateListingPage';
import { MyListingsPage } from './pages/Marketplace/MyListingsPage';
import { AdminLayout } from './layouts/AdminLayout';
import { MaintenancePage } from './pages/Maintenance/MaintenancePage';
import { PartnerApp } from './pages/Partner/PartnerApp';

const AppContent: React.FC = () => {
  const { currentView, user, maintenanceMode, checkMaintenanceStatus, navigateTo } = useAuth();
  const [currentPath, setCurrentPath] = React.useState<string>(
    typeof window !== 'undefined' ? window.location.pathname : '/'
  );

  React.useEffect(() => {
    const handleLocationChange = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handleLocationChange);
    return () => window.removeEventListener('popstate', handleLocationChange);
  }, []);

  const navigateToPath = (path: string, view?: any) => {
    if (typeof window !== 'undefined') {
      window.history.pushState(null, '', path);
      setCurrentPath(path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
    if (view) {
      navigateTo(view);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Maintenance Mode Guard:
  // Only users with role === 'ADMIN' (valid active/previous session) can enter.
  // All others are presented with the humorous Maintenance Screen.
  const isAdmin = user?.role === 'ADMIN';

  if (maintenanceMode && !isAdmin) {
    return <MaintenancePage onCheckStatus={checkMaintenanceStatus} />;
  }

  const isLeaderboardPath = currentPath === '/leaderboard' || currentView === 'leaderboard';
  if (isLeaderboardPath) {
    return (
      <MainLayout>
        <LeaderboardPage />
      </MainLayout>
    );
  }

  const isVirtualNumbersPath = currentPath === '/virtual-numbers' || currentView === 'virtual-numbers';
  if (isVirtualNumbersPath) {
    return (
      <MainLayout>
        <VirtualNumbersPage />
      </MainLayout>
    );
  }

  const isWheelPath = currentPath === '/wheel' || currentView === 'wheel';
  if (isWheelPath) {
    return (
      <MainLayout>
        <WheelPage />
      </MainLayout>
    );
  }

  // Account Marketplace Routes
  const isMarketplaceCreate = currentPath === '/marketplace/create' || currentView === 'marketplace-create';
  if (isMarketplaceCreate) {
    return (
      <MainLayout>
        <CreateListingPage
          onSuccess={(code) => navigateToPath(`/marketplace/listing/${code}`)}
          onCancel={() => navigateToPath('/marketplace', 'marketplace')}
        />
      </MainLayout>
    );
  }

  const isMarketplaceMyAds = (
    currentPath === '/marketplace/my-ads' ||
    currentPath === '/marketplace/my-listings' ||
    currentView === 'marketplace-my-ads'
  );
  if (isMarketplaceMyAds) {
    return (
      <MainLayout>
        <MyListingsPage
          onNavigateCreate={() => navigateToPath('/marketplace/create', 'marketplace-create')}
          onNavigateDetail={(code) => navigateToPath(`/marketplace/listing/${code}`)}
          onBack={() => navigateToPath('/marketplace', 'marketplace')}
        />
      </MainLayout>
    );
  }

  const isMarketplacePubg = (
    currentPath === '/marketplace/pubg' ||
    currentPath === '/market/pubg' ||
    currentView === 'marketplace-pubg'
  );
  if (isMarketplacePubg) {
    return (
      <MainLayout>
        <MarketplaceHomePage
          initialGame="PUBG_MOBILE"
          onNavigateDetail={(code) => navigateToPath(`/marketplace/listing/${code}`)}
          onNavigateCreate={() => navigateToPath('/marketplace/create', 'marketplace-create')}
          onNavigateMyListings={() => navigateToPath('/marketplace/my-listings', 'marketplace-my-ads')}
        />
      </MainLayout>
    );
  }

  const isMarketplaceFreeFire = (
    currentPath === '/marketplace/freefire' ||
    currentPath === '/market/freefire' ||
    currentView === 'marketplace-freefire'
  );
  if (isMarketplaceFreeFire) {
    return (
      <MainLayout>
        <MarketplaceHomePage
          initialGame="FREE_FIRE"
          onNavigateDetail={(code) => navigateToPath(`/marketplace/listing/${code}`)}
          onNavigateCreate={() => navigateToPath('/marketplace/create', 'marketplace-create')}
          onNavigateMyListings={() => navigateToPath('/marketplace/my-listings', 'marketplace-my-ads')}
        />
      </MainLayout>
    );
  }

  const isMarketplaceDetail = (
    (currentPath.startsWith('/marketplace/') &&
      currentPath !== '/marketplace/create' &&
      currentPath !== '/marketplace/my-ads' &&
      currentPath !== '/marketplace/my-listings' &&
      currentPath !== '/marketplace/pubg' &&
      currentPath !== '/marketplace/freefire') ||
    currentPath.startsWith('/market/pubg/') ||
    currentPath.startsWith('/market/freefire/')
  );

  if (isMarketplaceDetail) {
    const segments = currentPath.split('/').filter(Boolean);
    const code = segments[segments.length - 1];
    return (
      <MainLayout>
        <ListingDetailPage
          code={code}
          onBack={() => navigateToPath('/marketplace', 'marketplace')}
        />
      </MainLayout>
    );
  }

  const isMarketplaceHome = currentPath === '/marketplace' || currentView === 'marketplace';
  if (isMarketplaceHome) {
    return (
      <MainLayout>
        <MarketplaceHomePage
          onNavigateDetail={(code) => navigateToPath(`/marketplace/listing/${code}`)}
          onNavigateCreate={() => navigateToPath('/marketplace/create', 'marketplace-create')}
          onNavigateMyListings={() => navigateToPath('/marketplace/my-listings', 'marketplace-my-ads')}
        />
      </MainLayout>
    );
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

  const isAdminPath = typeof window !== 'undefined' && (
    window.location.pathname === '/admin' ||
    window.location.pathname.startsWith('/admin/') ||
    currentView === 'admin'
  );

  if (isAdminPath) {
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

const CustomerPartnerBlocker: React.FC<{ onLogout: () => void }> = ({ onLogout }) => {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#0B0F19',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      direction: 'rtl',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      <div style={{
        maxWidth: 480,
        width: '100%',
        background: '#111827',
        border: '1px solid rgba(239, 68, 68, 0.25)',
        borderRadius: 20,
        padding: 32,
        textAlign: 'center',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)'
      }}>
        <div style={{
          width: 72,
          height: 72,
          borderRadius: 20,
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#EF4444',
          fontSize: '2rem',
          marginBottom: 20
        }}>
          🛡️
        </div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 900, color: '#FFFFFF', margin: '0 0 10px 0' }}>
          منطقة مخصصة للشركاء فقط
        </h2>
        <p style={{ color: '#9CA3AF', fontSize: '0.92rem', lineHeight: 1.6, margin: '0 0 24px 0' }}>
          عذراً، أنت مسجل حالياً بحساب عميل عادي (<span style={{ color: '#F59E0B', fontWeight: 700 }}>CUSTOMER</span>). 
          بوابة الشركاء متاحة فقط لحسابات التجار والموزعين المعتمدين من إدارة KIROPRO.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <a
            href="/"
            style={{
              display: 'block',
              background: '#F59E0B',
              color: '#0B0F19',
              fontWeight: 800,
              padding: '12px 20px',
              borderRadius: 12,
              textDecoration: 'none',
              fontSize: '0.95rem'
            }}
          >
            العودة إلى المتجر الرئيسي
          </a>
          <button
            type="button"
            onClick={onLogout}
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              color: '#9CA3AF',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              fontWeight: 600,
              padding: '10px 20px',
              borderRadius: 12,
              cursor: 'pointer',
              fontSize: '0.85rem'
            }}
          >
            تسجيل الخروج للدخول بحساب شريك
          </button>
        </div>
      </div>
    </div>
  );
};

const AdminPartnerChoice: React.FC<{ onGoToAdmin: () => void; onProceed: () => void }> = ({ onGoToAdmin, onProceed }) => {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#0B0F19',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      direction: 'rtl',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      <div style={{
        maxWidth: 480,
        width: '100%',
        background: '#111827',
        border: '1px solid rgba(245, 158, 11, 0.25)',
        borderRadius: 20,
        padding: 32,
        textAlign: 'center',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)'
      }}>
        <div style={{
          width: 72,
          height: 72,
          borderRadius: 20,
          background: 'rgba(245, 158, 11, 0.1)',
          border: '1px solid rgba(245, 158, 11, 0.2)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#F59E0B',
          fontSize: '2rem',
          marginBottom: 20
        }}>
          👑
        </div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 900, color: '#FFFFFF', margin: '0 0 10px 0' }}>
          تنبيه: حساب مسؤول (ADMIN)
        </h2>
        <p style={{ color: '#9CA3AF', fontSize: '0.92rem', lineHeight: 1.6, margin: '0 0 24px 0' }}>
          أنت مسجل حالياً كمسؤول للنظام. مكانك الأساسي هو لوحة تحكم الإدارة لإدارة الشركاء والطلبات والأسعار.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button
            type="button"
            onClick={onGoToAdmin}
            style={{
              background: '#F59E0B',
              color: '#0B0F19',
              fontWeight: 800,
              padding: '12px 20px',
              borderRadius: 12,
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.95rem'
            }}
          >
            الانتقال إلى لوحة تحكم الإدارة
          </button>
          <button
            type="button"
            onClick={onProceed}
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              color: '#D1D5DB',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              fontWeight: 600,
              padding: '10px 20px',
              borderRadius: 12,
              cursor: 'pointer',
              fontSize: '0.85rem'
            }}
          >
            معاينة بوابة الشركاء
          </button>
        </div>
      </div>
    </div>
  );
};

const AppRouter: React.FC = () => {
  const { user, logout } = useAuth();
  const [adminBypassPartner, setAdminBypassPartner] = React.useState(false);

  const isPartnerPortal = typeof window !== 'undefined' && window.location.pathname.startsWith('/partner');

  if (isPartnerPortal) {
    const hasPartnerToken = typeof window !== 'undefined' && Boolean(localStorage.getItem('partner_token'));

    // If logged in as normal CUSTOMER on storefront and NOT authenticated as partner, block access
    if (user?.role === 'CUSTOMER' && !hasPartnerToken) {
      return <CustomerPartnerBlocker onLogout={() => logout()} />;
    }

    // If logged in as ADMIN on storefront, do not redirect automatically to partner portal; allow choice
    if (user?.role === 'ADMIN' && !adminBypassPartner) {
      return (
        <AdminPartnerChoice
          onGoToAdmin={() => {
            window.location.href = '/admin';
          }}
          onProceed={() => setAdminBypassPartner(true)}
        />
      );
    }

    // Otherwise (unauthenticated or PARTNER role): render Partner Portal
    return <PartnerApp />;
  }

  return (
    <OverlayProvider>
      <WalletProvider>
        <AppContent />
      </WalletProvider>
    </OverlayProvider>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
};

export default App;
