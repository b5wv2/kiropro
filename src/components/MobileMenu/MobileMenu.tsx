import React from 'react';
import { createPortal } from 'react-dom';
import styles from './MobileMenu.module.css';
import headerStyles from '../Header/Header.module.css';
import { useAuth } from '../../context/AuthContext';
import { useWallet } from '../../context/WalletContext';
import { useOverlay } from '../../context/OverlayContext';

export const MobileMenu: React.FC = () => {
  const { user, isAuthenticated, navigateTo } = useAuth();
  const { formattedBalance } = useWallet();
  const { activeOverlay, closeOverlay, openOverlay } = useOverlay();

  const isOpen = activeOverlay === 'mobile-menu';

  if (!isOpen) return null;

  const handleNavClick = (anchor: string) => {
    closeOverlay();
    navigateTo('home');
    setTimeout(() => {
      const el = document.querySelector(anchor);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  return createPortal(
    <aside
      className={`${styles.drawer} ${isOpen ? styles.open : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="قائمة التنقل"
      >
        <div className={styles.drawerHeader}>
          {/* Logo strictly LTR */}
          <div className={headerStyles.logoWrapper} dir="ltr">
            <div className={headerStyles.logoMark} style={{ width: 32, height: 32 }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            </div>
            <div className={headerStyles.logoText} style={{ fontSize: '1.3rem' }}>
              <span className={headerStyles.brandName}>KIRO</span>
              <span className={headerStyles.brandBadge}>PRO</span>
            </div>
          </div>

          <button
            className={styles.closeButton}
            onClick={closeOverlay}
            aria-label="إغلاق القائمة"
            type="button"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Simplified Navigation Links */}
        <nav className={styles.navLinks}>
          <button
            type="button"
            className={styles.navLink}
            onClick={() => {
              closeOverlay();
              navigateTo('usdt');
            }}
            style={{ color: '#F59E0B', fontWeight: 800 }}
          >
            تحويل USDT فوري ⚡
          </button>
          <button
            type="button"
            className={styles.navLink}
            onClick={() => {
              closeOverlay();
              navigateTo('virtual-numbers');
            }}
            style={{ color: '#F59E0B', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <span>الأرقام الافتراضية 📱</span>
            <span style={{ fontSize: '0.7rem', background: '#F59E0B', color: '#0B0F19', padding: '1px 6px', borderRadius: 4, fontWeight: 900 }}>جديد</span>
          </button>
          <button
            type="button"
            className={styles.navLink}
            onClick={() => handleNavClick('#games')}
          >
            الألعاب الأكثر طلباً
          </button>
          <button
            type="button"
            className={styles.navLink}
            onClick={() => handleNavClick('#how-it-works')}
          >
            كيف يعمل المتجر
          </button>
          <button
            type="button"
            className={styles.navLink}
            onClick={() => handleNavClick('#why-us')}
          >
            لماذا KIROPRO
          </button>
          <button
            type="button"
            className={styles.navLink}
            onClick={() => handleNavClick('#deals')}
          >
            العروض
          </button>
          <button
            type="button"
            className={styles.navLink}
            onClick={() => handleNavClick('#footer')}
          >
            الدعم
          </button>
        </nav>

        {/* Drawer Footer & Actions */}
        <div className={styles.drawerFooter}>
          {isAuthenticated && user ? (
            <>
              <div className={styles.walletInfoBox}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 700 }}>
                  رصيد محفظتك:
                </span>
                <span style={{ fontFamily: 'var(--font-latin)', fontWeight: 900, color: '#0B0F19', fontSize: '1.1rem', direction: 'ltr' }}>
                  {formattedBalance}
                </span>
              </div>

              <button
                className="btn btn-primary btn-sm"
                onClick={() => {
                  openOverlay('wallet');
                }}
                style={{ width: '100%' }}
                type="button"
              >
                <span>إيداع رصيد بالمحفظة</span>
              </button>
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => {
                  closeOverlay();
                  navigateTo('login');
                }}
                style={{ width: '100%' }}
                type="button"
              >
                <span>تسجيل الدخول</span>
              </button>

              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  closeOverlay();
                  navigateTo('register');
                }}
                style={{ width: '100%' }}
                type="button"
              >
                <span>إنشاء حساب</span>
              </button>
            </div>
          )}

          <button
            className="btn btn-secondary btn-sm"
            onClick={() => handleNavClick('#games')}
            style={{ width: '100%', marginTop: 4 }}
            type="button"
          >
            <span>تصفح الألعاب واشحن الآن</span>
          </button>
        </div>
      </aside>,
    document.body
  );
};
