import React, { useState } from 'react';
import styles from './Header.module.css';
import accountStyles from '../AccountMenu/AccountMenu.module.css';
import { useAuth } from '../../context/AuthContext';
import { useWallet } from '../../context/WalletContext';
import { useOverlay } from '../../context/OverlayContext';

export const Header: React.FC = () => {
  const { user, isAuthenticated, logout, navigateTo } = useAuth();
  const { formattedBalance, openDepositModal } = useWallet();
  const { openOverlay } = useOverlay();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        {/* Mobile: Menu Toggle Button */}
        <button
          className={styles.menuToggle}
          onClick={() => openOverlay('mobile-menu')}
          aria-label="فتح القائمة الرئيسية"
          type="button"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>

        {/* Brand Logo - Fixed LTR Component */}
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigateTo('home');
          }}
          className={styles.logoWrapper}
          dir="ltr"
          aria-label="KIROPRO"
        >
          <div className={styles.logoMark}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          </div>
          <div className={styles.logoText}>
            <span className={styles.brandName}>KIRO</span>
            <span className={styles.brandBadge}>PRO</span>
          </div>
        </a>

        {/* Desktop Navigation */}
        <nav className={styles.navLinks} aria-label="التنقل الرئيسي">
          <a
            href="/usdt"
            className={styles.navLink}
            onClick={(e) => {
              e.preventDefault();
              navigateTo('usdt');
            }}
            style={{ color: '#F59E0B', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            <span>تحويل USDT فوري ⚡</span>
          </a>
          <a
            href="#games"
            className={styles.navLink}
            onClick={() => navigateTo('home')}
          >
            الألعاب الأكثر طلباً
          </a>
          <a
            href="#how-it-works"
            className={styles.navLink}
            onClick={() => navigateTo('home')}
          >
            كيف يعمل المتجر
          </a>
          <a
            href="#why-us"
            className={styles.navLink}
            onClick={() => navigateTo('home')}
          >
            لماذا KIROPRO
          </a>
          <a
            href="#deals"
            className={styles.navLink}
            onClick={() => navigateTo('home')}
          >
            العروض
          </a>
          <button
            type="button"
            className={styles.navLink}
            onClick={() => navigateTo('virtual-numbers')}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              color: 'var(--accent-yellow)',
              fontWeight: 800,
              padding: '4px 8px',
              borderRadius: 6
            }}
          >
            <span>الأرقام الافتراضية</span>
            <span style={{ fontSize: '0.65rem', background: '#F59E0B', color: '#0B0F19', padding: '1px 5px', borderRadius: 4, fontWeight: 900 }}>جديد</span>
          </button>
          <a
            href="#footer"
            className={styles.navLink}
            onClick={() => navigateTo('home')}
          >
            الدعم
          </a>
        </nav>

        {/* Actions & Account Controls */}
        <div className={styles.actions}>
          {isAuthenticated && user ? (
            /* Logged-in State (Desktop + Mobile) */
            <>
              {/* Wallet Indicator */}
              <div className={styles.walletPill} title="رصيدك المتاح للشحن">
                <div className={styles.walletIcon}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="M7 15h0M2 9.5h20" />
                  </svg>
                </div>
                <span className={styles.walletLabel}>رصيدك:</span>
                <span className={styles.walletBalance}>{formattedBalance}</span>
                <button
                  className={styles.walletDepositBtn}
                  onClick={openDepositModal}
                  title="إيداع رصيد بالمحفظة"
                  aria-label="إضافة رصيد"
                  type="button"
                >
                  +
                </button>
              </div>

              {/* Desktop User Dropdown */}
              <div style={{ position: 'relative' }} className={styles.desktopCta}>
                <button
                  type="button"
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="btn btn-secondary btn-sm"
                  style={{ gap: 6, paddingInline: 12 }}
                >
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#0B0F19', color: 'var(--accent-yellow)', fontSize: '0.75rem', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {user.name.charAt(0)}
                  </div>
                  <span>مرحباً، {user.name}</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {isDropdownOpen && (
                  <div className={accountStyles.desktopDropdown}>
                    <button
                      type="button"
                      className={accountStyles.menuItem}
                      onClick={() => {
                        setIsDropdownOpen(false);
                        navigateTo('account');
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                      <span>حسابي والطلبات</span>
                    </button>

                    <button
                      type="button"
                      className={accountStyles.menuItem}
                      onClick={() => {
                        setIsDropdownOpen(false);
                        openDepositModal();
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="2" y="4" width="20" height="16" rx="2" />
                        <path d="M7 15h0M2 9.5h20" />
                      </svg>
                      <span>إدارة الرصيد</span>
                    </button>

                    <button
                      type="button"
                      className={`${accountStyles.menuItem} ${accountStyles.danger}`}
                      onClick={() => {
                        setIsDropdownOpen(false);
                        logout();
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <polyline points="16 17 21 12 16 7" />
                        <line x1="21" y1="12" x2="9" y2="12" />
                      </svg>
                      <span>تسجيل الخروج</span>
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Guest State */
            <>
              {/* Desktop Guest Auth Actions */}
              <div className={styles.desktopCta} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => navigateTo('login')}
                  style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)', cursor: 'pointer', padding: '8px 12px' }}
                >
                  تسجيل الدخول
                </button>

                <button
                  type="button"
                  onClick={() => navigateTo('register')}
                  className="btn btn-primary btn-sm"
                >
                  <span>إنشاء حساب</span>
                </button>
              </div>
            </>
          )}

          {/* Mobile Account Button: [👤 حساب] */}
          <button
            type="button"
            className={styles.menuToggle}
            onClick={() => openOverlay('account')}
            aria-label="حسابك"
            style={{ display: 'flex' }}
          >
            {isAuthenticated && user ? (
              <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#0B0F19', color: 'var(--accent-yellow)', fontSize: '0.8rem', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {user.name.charAt(0)}
              </div>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
