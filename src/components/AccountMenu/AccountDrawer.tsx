import React from 'react';
import { createPortal } from 'react-dom';
import styles from './AccountMenu.module.css';
import { useAuth } from '../../context/AuthContext';
import { useWallet } from '../../context/WalletContext';
import { useOverlay } from '../../context/OverlayContext';
import { PromoRedemptionCard } from '../Promo/PromoRedemptionCard';

export const AccountDrawer: React.FC = () => {
  const { user, isAuthenticated, logout, navigateTo } = useAuth();
  const { formattedBalance } = useWallet();
  const { activeOverlay, closeOverlay, openOverlay } = useOverlay();

  const isOpen = activeOverlay === 'account';

  if (!isOpen) return null;

  return createPortal(
    <aside
      className={`${styles.drawer} ${isOpen ? styles.open : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="قائمة الحساب"
    >
        <div className={styles.header}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            {isAuthenticated ? 'حسابك في KIROPRO' : 'تسجيل الدخول إلى حسابك'}
          </h3>
          <button
            className={styles.closeButton}
            onClick={closeOverlay}
            aria-label="إغلاق"
            type="button"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {isAuthenticated && user ? (
          <>
            {/* Logged in User Card */}
            <div className={styles.userCard}>
              <div className={styles.avatarBox}>
                <div className={styles.avatar}>{user.name.charAt(0)}</div>
                <div>
                  <h4 style={{ fontSize: '1rem', fontWeight: 800, color: '#0B0F19' }}>{user.name}</h4>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{user.email}</span>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#FFFFFF', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>رصيد المحفظة:</span>
                <span style={{ fontFamily: 'var(--font-latin)', fontWeight: 900, fontSize: '1.1rem', color: '#0B0F19', direction: 'ltr' }}>
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
                <span>إدارة وإيداع الرصيد</span>
              </button>
            </div>

            {/* Promo / Gift Code Card */}
            <PromoRedemptionCard compact />

            {/* Menu Links */}
            <div className={styles.menuList}>
              <button
                className={styles.menuItem}
                onClick={() => {
                  closeOverlay();
                  navigateTo('account');
                }}
                type="button"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                <span>حسابي وبياناتي</span>
              </button>

              <button
                className={styles.menuItem}
                onClick={() => {
                  closeOverlay();
                  navigateTo('account');
                }}
                type="button"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="M7 15h0M2 9.5h20" />
                </svg>
                <span>المحفظة والرصيد</span>
              </button>

              <button
                className={styles.menuItem}
                onClick={() => {
                  closeOverlay();
                  navigateTo('account');
                }}
                type="button"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
                  <path d="M3 6h18" />
                  <path d="M16 10a4 4 0 0 1-8 0" />
                </svg>
                <span>سجل الطلبات والشحنات</span>
              </button>

              <button
                className={`${styles.menuItem} ${styles.danger}`}
                onClick={() => {
                  closeOverlay();
                  logout();
                }}
                type="button"
                style={{ marginTop: 12 }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                <span>تسجيل الخروج</span>
              </button>
            </div>
          </>
        ) : (
          /* Guest Actions */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 10 }}>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              سجّل دخولك للوصول إلى رصيدك المسبق الدفع، تتبع طلباتك، والشحن الفوري لألعابك.
            </p>

            <button
              className="btn btn-primary"
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
              className="btn btn-secondary"
              onClick={() => {
                closeOverlay();
                navigateTo('register');
              }}
              style={{ width: '100%' }}
              type="button"
            >
              <span>إنشاء حساب جديد</span>
            </button>
          </div>
        )}
      </aside>,
    document.body
  );
};
