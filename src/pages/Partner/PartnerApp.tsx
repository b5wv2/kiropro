import React from 'react';
import { PartnerProvider, usePartner } from '../../context/PartnerContext';
import { PartnerLayout } from '../../layouts/PartnerLayout';
import { PartnerDashboard } from './PartnerDashboard';
import { PartnerQuickBuy } from './PartnerQuickBuy';
import { PartnerDeposits } from './PartnerDeposits';
import { PartnerLedger } from './PartnerLedger';
import { PartnerOrders } from './PartnerOrders';
import { PartnerLogin } from './PartnerLogin';
import { PartnerSetupPassword } from './PartnerSetupPassword';
import { RefreshCw } from 'lucide-react';

const PartnerPortalContent: React.FC = () => {
  const { isAuthenticated, isLoading, activeTab } = usePartner();

  // Check if this is a password setup token link
  const urlParams = new URLSearchParams(window.location.search);
  const isSetupPasswordRoute = 
    window.location.pathname.includes('/setup-password') || 
    (urlParams.has('token') && !window.location.pathname.includes('admin') && !window.location.pathname.includes('review'));

  if (isSetupPasswordRoute) {
    return <PartnerSetupPassword />;
  }

  if (isLoading) {
    return (
      <div className="partner-portal-shell" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 60,
            height: 60,
            borderRadius: 16,
            background: 'linear-gradient(135deg, #f59e0b, #b45309)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#0b0f19',
            fontWeight: 900,
            fontSize: '1.8rem',
            boxShadow: '0 0 30px rgba(245, 158, 11, 0.4)',
            marginBottom: 20
          }}>
            K
          </div>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 900, color: '#fff', margin: '0 0 8px 0' }}>
            KIROPRO PARTNER
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#94a3b8', fontSize: '0.85rem' }}>
            <RefreshCw size={16} className="spin-anim" />
            <span>جاري التحقق من الصلاحيات والتسجيل...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <PartnerLogin />;
  }

  return (
    <PartnerLayout>
      {activeTab === 'dashboard' && <PartnerDashboard />}
      {activeTab === 'quick-buy' && <PartnerQuickBuy />}
      {activeTab === 'deposits' && <PartnerDeposits />}
      {activeTab === 'ledger' && <PartnerLedger />}
      {activeTab === 'orders' && <PartnerOrders />}
    </PartnerLayout>
  );
};

export const PartnerApp: React.FC = () => {
  return (
    <PartnerProvider>
      <PartnerPortalContent />
    </PartnerProvider>
  );
};

export default PartnerApp;
