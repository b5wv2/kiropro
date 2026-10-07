import React from 'react';
import { PartnerProvider, usePartner } from '../../context/PartnerContext';
import { PartnerLayout } from '../../layouts/PartnerLayout';
import { PartnerDashboard } from './PartnerDashboard';
import { PartnerQuickBuy } from './PartnerQuickBuy';
import { PartnerCards } from './PartnerCards';
import { PartnerDeposits } from './PartnerDeposits';
import { PartnerLedger } from './PartnerLedger';
import { PartnerOrders } from './PartnerOrders';
import { PartnerProfilePage } from './PartnerProfile';
import { PartnerLogin } from './PartnerLogin';
import { PartnerSetupPassword } from './PartnerSetupPassword';
import { RefreshCw } from 'lucide-react';

const PartnerPortalContent: React.FC = () => {
  const { isAuthenticated, isLoading, activeTab, partner } = usePartner();

  // Check if this is a password setup token link
  const urlParams = new URLSearchParams(window.location.search);
  const isSetupPasswordRoute = 
    window.location.pathname.includes('/setup-password') || 
    (urlParams.has('token') && !window.location.pathname.includes('admin') && !window.location.pathname.includes('review'));

  if (isSetupPasswordRoute) {
    return <PartnerSetupPassword />;
  }

  // Explicit login subroute if not authenticated
  if (window.location.pathname.includes('/login') && !isAuthenticated) {
    return <PartnerLogin />;
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

  // Suspended account guard
  if (partner?.status === 'SUSPENDED') {
    return (
      <div className="partner-portal-shell" style={{ justifyContent: 'center', alignItems: 'center', padding: 24, direction: 'rtl' }}>
        <div className="partner-card" style={{ maxWidth: 480, width: '100%', textAlign: 'center', border: '1px solid rgba(239, 68, 68, 0.4)', padding: 32 }}>
          <div style={{ fontSize: '3rem', marginBottom: 16 }}>🚫</div>
          <h2 style={{ color: '#fff', fontSize: '1.4rem', fontWeight: 900, margin: '0 0 12px 0' }}>
            الحساب التجاري موقوف مؤقتاً
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '0.95rem', lineHeight: 1.6, margin: '0 0 24px 0' }}>
            تم تعليق حسابك التجاري من قبل إدارة المنصة. يرجى التواصل مع الدعم الفني للمراجعة وإعادة التفعيل.
          </p>
          <a
            href="/"
            className="btn-partner-primary"
            style={{ textDecoration: 'none', display: 'inline-block', padding: '12px 24px' }}
          >
            العودة إلى المتجر الرئيسي
          </a>
        </div>
      </div>
    );
  }

  // Must change password guard: forces change password before accessing dashboard
  if (partner?.mustChangePassword) {
    return (
      <PartnerLayout>
        <PartnerProfilePage forceChangePassword={true} />
      </PartnerLayout>
    );
  }

  return (
    <PartnerLayout>
      {activeTab === 'dashboard' && <PartnerDashboard />}
      {activeTab === 'buy' && <PartnerQuickBuy />}
      {activeTab === 'cards' && <PartnerCards />}
      {activeTab === 'deposits' && <PartnerDeposits />}
      {activeTab === 'ledger' && <PartnerLedger />}
      {activeTab === 'orders' && <PartnerOrders />}
      {activeTab === 'profile' && <PartnerProfilePage />}
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
