import React from 'react';
import { createPortal } from 'react-dom';
import styles from './AccountMenu.module.css';
import { useAuth } from '../../context/AuthContext';
import { useWallet } from '../../context/WalletContext';
import { useOverlay } from '../../context/OverlayContext';
import { PromoRedemptionCard } from '../Promo/PromoRedemptionCard';

interface MilitaryRankInfo {
  type: 'president' | 'military' | 'civilian';
  badgeText: string;
  badgeIcon: string;
  color?: string;
  borderColor?: string;
  bgColor?: string;
}

const normalizeRankName = (text?: string | null): string => {
  if (!text) return '';
  return text.replace(/[\u064B-\u065F\u0670\u0640]/g, '').trim();
};

const resolveUserRank = (rankName?: string | null, totalDonated?: number): MilitaryRankInfo => {
  const norm = normalizeRankName(rankName);
  const amount = Math.max(0, Number(totalDonated) || 0);

  // 1. Head of State (رئيس الدولة)
  if (norm.includes('رئيس') || norm.includes('الدولة') || amount >= 100000) {
    return {
      type: 'president',
      badgeText: 'صاحب السلطة: رئيس الدولة',
      badgeIcon: '👑🏛️'
    };
  }

  // 2. Military Ranks Table
  const RANKS: Array<{
    match: string;
    cleanName: string;
    icon: string;
    color: string;
    borderColor: string;
    bgColor: string;
    minAmount: number;
  }> = [
    { match: 'فريق', cleanName: 'فريق أول', icon: '⚔️🦅', color: '#EF4444', borderColor: 'rgba(239, 68, 68, 0.45)', bgColor: 'rgba(239, 68, 68, 0.08)', minAmount: 75000 },
    { match: 'عميد', cleanName: 'عميد', icon: '🦅⭐⭐', color: '#8B5CF6', borderColor: 'rgba(139, 92, 246, 0.45)', bgColor: 'rgba(139, 92, 246, 0.08)', minAmount: 50000 },
    { match: 'عقيد', cleanName: 'عقيد', icon: '🦅⭐', color: '#EC4899', borderColor: 'rgba(236, 72, 153, 0.45)', bgColor: 'rgba(236, 72, 153, 0.08)', minAmount: 30000 },
    { match: 'رائد', cleanName: 'رائد', icon: '🦅', color: '#3B82F6', borderColor: 'rgba(59, 130, 246, 0.45)', bgColor: 'rgba(59, 130, 246, 0.08)', minAmount: 18000 },
    { match: 'نقيب', cleanName: 'نقيب', icon: '⭐⭐', color: '#06B6D4', borderColor: 'rgba(6, 182, 212, 0.45)', bgColor: 'rgba(6, 182, 212, 0.08)', minAmount: 10000 },
    { match: 'ملازم', cleanName: 'ملازم', icon: '⭐', color: '#10B981', borderColor: 'rgba(16, 185, 129, 0.45)', bgColor: 'rgba(16, 185, 129, 0.08)', minAmount: 6000 },
    { match: 'رقيب', cleanName: 'رقيب', icon: '🔰🔰', color: '#84CC16', borderColor: 'rgba(132, 204, 22, 0.45)', bgColor: 'rgba(132, 204, 22, 0.08)', minAmount: 3000 },
    { match: 'عريف', cleanName: 'عريف', icon: '🔰', color: '#EAB308', borderColor: 'rgba(234, 179, 8, 0.45)', bgColor: 'rgba(234, 179, 8, 0.08)', minAmount: 1500 },
    { match: 'جندي', cleanName: 'جندي', icon: '🪖', color: '#64748B', borderColor: 'rgba(100, 116, 139, 0.45)', bgColor: 'rgba(100, 116, 139, 0.08)', minAmount: 500 }
  ];

  const matched = RANKS.find(r => (norm && norm.includes(r.match)) || (amount > 0 && amount >= r.minAmount));

  if (matched && (amount >= 500 || (norm && norm !== 'مدني'))) {
    return {
      type: 'military',
      badgeText: `الرتبة العسكرية: ${matched.cleanName}`,
      badgeIcon: matched.icon,
      color: matched.color,
      borderColor: matched.borderColor,
      bgColor: matched.bgColor
    };
  }

  // 3. Civilian (رصيده التراكمي صفر أو لم يتبرع)
  return {
    type: 'civilian',
    badgeText: 'مدني',
    badgeIcon: '🪖'
  };
};

export const AccountDrawer: React.FC = () => {
  const { user, isAuthenticated, logout, navigateTo } = useAuth();
  const { formattedBalance } = useWallet();
  const { activeOverlay, closeOverlay, openOverlay } = useOverlay();

  const isOpen = activeOverlay === 'account';

  const rankInfo = resolveUserRank(user?.military_rank, user?.total_donated_amount);

  const handleGoToSupport = () => {
    closeOverlay();
    window.history.pushState(null, '', '/developer-support');
    navigateTo('developer-support');
  };

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
                <div className={`${styles.avatar} ${rankInfo.type === 'president' ? styles.avatarPresident : ''}`}>
                  {user.name ? user.name.charAt(0).toUpperCase() : '👤'}
                </div>
                <div className={styles.userInfoCol}>
                  <h4 className={styles.userGreeting}>
                    مرحباً بك، <span className={styles.userNameHighlight}>{user.name}</span>
                  </h4>

                  {/* Military Rank Badge */}
                  {rankInfo.type === 'president' && (
                    <div
                      className={styles.presidentRankBadge}
                      onClick={handleGoToSupport}
                      role="button"
                      tabIndex={0}
                      title="صاحب السلطة العليا - انقر لعرض سجل وترقيات الرتب العسكرية"
                    >
                      <span>🏷️</span>
                      <span>[ {rankInfo.badgeText} {rankInfo.badgeIcon} ]</span>
                    </div>
                  )}

                  {rankInfo.type === 'military' && (
                    <div
                      className={styles.militaryRankBadge}
                      style={{
                        color: rankInfo.color,
                        borderColor: rankInfo.borderColor,
                        backgroundColor: rankInfo.bgColor
                      }}
                      onClick={handleGoToSupport}
                      role="button"
                      tabIndex={0}
                      title="رتبة عسكرية رسمية - انقر لعرض سجل وترقيات الرتب العسكرية"
                    >
                      <span>🏷️</span>
                      <span>[ {rankInfo.badgeText} {rankInfo.badgeIcon} ]</span>
                    </div>
                  )}

                  {rankInfo.type === 'civilian' && (
                    <div className={styles.civilianBadgeRow}>
                      <span className={styles.civilianBadge}>
                        <span>[ {rankInfo.badgeText} {rankInfo.badgeIcon} ]</span>
                      </span>
                      <button
                        type="button"
                        className={styles.upgradeRankLink}
                        onClick={handleGoToSupport}
                        title="انقر لترقية رتبتك العسكرية عبر دعم المنصة والمطورين"
                      >
                        <span>ارتقِ برتبتك الآن ⚡</span>
                      </button>
                    </div>
                  )}

                  <span className={styles.userEmail}>{user.email}</span>
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
                className={styles.menuItem}
                onClick={handleGoToSupport}
                type="button"
              >
                <span style={{ fontSize: '1.05rem', lineHeight: 1 }}>🎖️</span>
                <span>دعم المطورين والرتب العسكرية</span>
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
