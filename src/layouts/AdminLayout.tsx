import React, { useState } from 'react';
import { AdminSidebar, AdminTab } from '../components/admin/AdminSidebar';
import { AdminHeader } from '../components/admin/AdminHeader';
import { AdminDashboard } from '../pages/Admin/AdminDashboard';
import { AdminCustomers } from '../pages/Admin/AdminCustomers';
import { AdminReferralLeaderboard } from '../pages/Admin/AdminReferralLeaderboard';
import { AdminOrders } from '../pages/Admin/AdminOrders';
import { AdminCrypto } from '../pages/Admin/AdminCrypto';
import { AdminTopups } from '../pages/Admin/AdminTopups';
import { AdminPaymentMethods } from '../pages/Admin/AdminPaymentMethods';
import { AdminWallet } from '../pages/Admin/AdminWallet';
import { AdminCashback } from '../pages/Admin/AdminCashback';
import { AdminPromoCodes } from '../pages/Admin/AdminPromoCodes';
import { AdminProducts } from '../pages/Admin/AdminProducts';
import { AdminReviews } from '../pages/Admin/AdminReviews';
import { AdminProviders } from '../pages/Admin/AdminProviders';
import { AdminAudit } from '../pages/Admin/AdminAudit';
import { AdminSecurityAudit } from '../pages/Admin/AdminSecurityAudit';
import { AdminSettings } from '../pages/Admin/AdminSettings';

export const AdminLayout: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <AdminDashboard onNavigateTab={setActiveTab} />;
      case 'customers':
        return <AdminCustomers />;
      case 'referrals':
        return <AdminReferralLeaderboard />;
      case 'orders':
        return <AdminOrders />;
      case 'crypto':
        return <AdminCrypto />;
      case 'topups':
        return <AdminTopups />;
      case 'payment-methods':
        return <AdminPaymentMethods />;
      case 'wallet':
        return <AdminWallet />;
      case 'cashback':
        return <AdminCashback />;
      case 'codes':
        return <AdminPromoCodes />;
      case 'products':
        return <AdminProducts />;
      case 'reviews':
        return <AdminReviews />;
      case 'providers':
        return <AdminProviders />;
      case 'audit':
        return <AdminAudit />;
      case 'security':
        return <AdminSecurityAudit />;
      case 'settings':
        return <AdminSettings />;
      default:
        return <AdminDashboard onNavigateTab={setActiveTab} />;
    }
  };

  return (
    <div className="admin-shell" dir="rtl">
      {/* Sidebar (Desktop + Mobile Drawer) */}
      <AdminSidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
      />

      {/* Main Content Area */}
      <div className="admin-main-wrapper">
        <AdminHeader
          activeTab={activeTab}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
        />

        <main className="admin-content">
          {renderContent()}
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
