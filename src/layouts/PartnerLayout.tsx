import React, { useState } from 'react';
import { usePartner, PartnerTab } from '../context/PartnerContext';
import { 
  LayoutDashboard, 
  Zap, 
  Wallet, 
  History, 
  ShoppingBag, 
  LogOut, 
  ShieldCheck, 
  PlusCircle, 
  Menu, 
  X, 
  Lock, 
  Key
} from 'lucide-react';

interface PartnerLayoutProps {
  children: React.ReactNode;
}

export const PartnerLayout: React.FC<PartnerLayoutProps> = ({ children }) => {
  const { partner, wallet, activeTab, setActiveTab, logout, partnerFetch, refreshProfile } = usePartner();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  
  // Password change form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const navItems: { id: PartnerTab; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'لوحة التحكم', icon: <LayoutDashboard size={18} /> },
    { id: 'quick-buy', label: 'شحن سريع', icon: <Zap size={18} /> },
    { id: 'deposits', label: 'الإيداعات والرصيد', icon: <Wallet size={18} /> },
    { id: 'ledger', label: 'القيود المالية', icon: <History size={18} /> },
    { id: 'orders', label: 'سجل الطلبات', icon: <ShoppingBag size={18} /> },
  ];

  const handleTabClick = (tabId: PartnerTab) => {
    setActiveTab(tabId);
    setMobileMenuOpen(false);
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMsg(null);

    if (newPassword.length < 8) {
      setPasswordMsg({ type: 'error', text: 'كلمة المرور يجب أن لا تقل عن 8 أحرف وأرقام.' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: 'error', text: 'كلمتا المرور غير متطابقتين.' });
      return;
    }

    try {
      setPasswordSubmitting(true);
      await partnerFetch('/api/partner/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword })
      });

      setPasswordMsg({ type: 'success', text: 'تم تحديث كلمة المرور بنجاح!' });
      setTimeout(async () => {
        setPasswordModalOpen(false);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setPasswordMsg(null);
        await refreshProfile();
      }, 1500);
    } catch (err: any) {
      setPasswordMsg({ type: 'error', text: err.message || 'فشل تحديث كلمة المرور' });
    } finally {
      setPasswordSubmitting(false);
    }
  };

  return (
    <div className="partner-portal-shell" dir="rtl">
      {/* Must Change Password Banner */}
      {partner?.mustChangePassword && (
        <div style={{
          background: 'linear-gradient(90deg, #b45309 0%, #d97706 100%)',
          color: '#fff',
          padding: '10px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.88rem',
          fontWeight: 800,
          boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
          zIndex: 10001
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Key size={18} />
            <span>تنبيه أمني: يُرجى تغيير كلمة المرور المؤقتة الخاصة بحسابك لضمان أمان محفظتك.</span>
          </div>
          <button
            onClick={() => setPasswordModalOpen(true)}
            style={{
              background: '#0f172a',
              color: '#fbbf24',
              border: 'none',
              padding: '6px 14px',
              borderRadius: 6,
              fontWeight: 800,
              cursor: 'pointer',
              fontSize: '0.8rem'
            }}
          >
            تغيير كلمة المرور الآن
          </button>
        </div>
      )}

      {/* Main Header */}
      <header className="partner-header">
        <div className="partner-header-inner">
          {/* Brand */}
          <div className="partner-brand" onClick={() => handleTabClick('dashboard')}>
            <div style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #f59e0b, #b45309)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#0b0f19',
              fontWeight: 900,
              fontSize: '1.2rem',
              boxShadow: '0 0 15px rgba(245, 158, 11, 0.4)'
            }}>
              K
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 900, fontSize: '1.15rem', letterSpacing: '0.5px' }}>KIROPRO</span>
                <span className="partner-brand-badge">PARTNER</span>
              </div>
              <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>منصة التجار والشحن الفوري</div>
            </div>
          </div>

          {/* Desktop Nav Tabs */}
          <nav className="partner-nav-tabs" style={{ display: 'none' }} id="desktop-nav">
            {navItems.map((item) => (
              <button
                key={item.id}
                className={`partner-nav-tab ${activeTab === item.id ? 'active' : ''}`}
                onClick={() => handleTabClick(item.id)}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </nav>

          <style>{`
            @media (min-width: 900px) {
              #desktop-nav { display: flex !important; }
            }
          `}</style>

          {/* Right Area: Balance & User */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Live Balance Widget */}
            <div 
              className="partner-balance-chip" 
              onClick={() => handleTabClick('deposits')}
              style={{ cursor: 'pointer', transition: 'transform 0.2s' }}
              title="اضغط للإيداع وزيادة الرصيد"
            >
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 800 }}>الرصيد المتاح</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span className="partner-balance-value">${Number(wallet?.balance || 0).toFixed(2)}</span>
                  <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 800 }}>USD</span>
                </div>
              </div>
              <PlusCircle size={20} color="#10b981" />
            </div>

            {/* Level Badge */}
            {partner?.levelArabicName && (
              <div 
                className="partner-level-chip"
                style={{
                  background: 'rgba(245, 158, 11, 0.12)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  color: partner.badgeColor || '#fbbf24'
                }}
              >
                <ShieldCheck size={14} />
                <span>{partner.levelArabicName}</span>
              </div>
            )}

            {/* Password change icon button */}
            <button
              onClick={() => setPasswordModalOpen(true)}
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#94a3b8',
                borderRadius: 8,
                padding: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              title="تغيير كلمة المرور"
            >
              <Lock size={16} />
            </button>

            {/* Logout */}
            <button
              onClick={logout}
              style={{
                background: 'rgba(244, 63, 94, 0.1)',
                border: '1px solid rgba(244, 63, 94, 0.25)',
                color: '#fb7185',
                borderRadius: 8,
                padding: '8px 12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontWeight: 700,
                fontSize: '0.82rem',
                fontFamily: 'inherit'
              }}
              title="تسجيل الخروج"
            >
              <LogOut size={16} />
              <span style={{ display: 'none' }} className="logout-text">خروج</span>
            </button>

            <style>{`
              @media (min-width: 600px) {
                .logout-text { display: inline !important; }
              }
            `}</style>

            {/* Mobile Hamburger */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#fff',
                borderRadius: 8,
                padding: '8px',
                cursor: 'pointer',
                display: 'flex'
              }}
              id="mobile-menu-btn"
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>

            <style>{`
              @media (min-width: 900px) {
                #mobile-menu-btn { display: none !important; }
              }
            `}</style>
          </div>
        </div>

        {/* Mobile Nav Drawer */}
        {mobileMenuOpen && (
          <div style={{
            padding: '16px 0 8px 0',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            marginTop: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 6
          }}>
            {navItems.map((item) => (
              <button
                key={item.id}
                className={`partner-nav-tab ${activeTab === item.id ? 'active' : ''}`}
                style={{ width: '100%', justifyContent: 'flex-start', padding: '12px 16px' }}
                onClick={() => handleTabClick(item.id)}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <main style={{ flex: 1, maxWidth: 1400, width: '100%', margin: '0 auto', padding: '24px 16px 60px 16px' }}>
        {children}
      </main>

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid rgba(255, 255, 255, 0.05)',
        padding: '20px 24px',
        textAlign: 'center',
        color: '#64748b',
        fontSize: '0.8rem',
        background: 'rgba(10, 14, 23, 0.95)'
      }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            جميع الحقوق محفوظة © {new Date().getFullYear()} <span style={{ color: '#fbbf24', fontWeight: 800 }}>KIROPRO Partner Portal</span>
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <span>الدعم الفني للتجار: support@kiropro.store</span>
            <span>•</span>
            <span>بوابة التاجر المعتمدة</span>
          </div>
        </div>
      </footer>

      {/* Modal: Change Password */}
      {passwordModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 20000,
          padding: 16
        }}>
          <div className="partner-card" style={{ maxWidth: 450, width: '100%', background: '#0f172a' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Lock size={20} color="#f59e0b" />
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900 }}>تغيير كلمة المرور</h3>
              </div>
              <button
                onClick={() => setPasswordModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {passwordMsg && (
              <div style={{
                padding: '10px 14px',
                borderRadius: 8,
                marginBottom: 16,
                fontSize: '0.85rem',
                fontWeight: 700,
                background: passwordMsg.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
                color: passwordMsg.type === 'success' ? '#34d399' : '#fb7185',
                border: `1px solid ${passwordMsg.type === 'success' ? '#10b981' : '#f43f5e'}`
              }}>
                {passwordMsg.text}
              </div>
            )}

            <form onSubmit={handlePasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#94a3b8', marginBottom: 6, fontWeight: 700 }}>
                  كلمة المرور الحالية
                </label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 8,
                    padding: '10px 14px',
                    color: '#fff',
                    outline: 'none',
                    fontSize: '0.9rem'
                  }}
                  placeholder="••••••••"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#94a3b8', marginBottom: 6, fontWeight: 700 }}>
                  كلمة المرور الجديدة (8 أحرف على الأقل)
                </label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 8,
                    padding: '10px 14px',
                    color: '#fff',
                    outline: 'none',
                    fontSize: '0.9rem'
                  }}
                  placeholder="••••••••"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#94a3b8', marginBottom: 6, fontWeight: 700 }}>
                  تأكيد كلمة المرور الجديدة
                </label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 8,
                    padding: '10px 14px',
                    color: '#fff',
                    outline: 'none',
                    fontSize: '0.9rem'
                  }}
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                disabled={passwordSubmitting}
                className="btn-partner-primary"
                style={{ marginTop: 8 }}
              >
                {passwordSubmitting ? 'جاري التحديث...' : 'حفظ كلمة المرور الجديدة'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
