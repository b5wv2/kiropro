import React from 'react';
import styles from './MobileBottomNav.module.css';
import { useAuth } from '../../context/AuthContext';
import { useOverlay } from '../../context/OverlayContext';
import { Home, LayoutGrid, FileText, User } from 'lucide-react';

export const MobileBottomNav: React.FC = () => {
  const { currentView, navigateTo, isAuthenticated } = useAuth();
  const { openOverlay } = useOverlay();

  const isHome = currentView === 'home';
  const isAccount = currentView === 'account';

  const handleHomeClick = () => {
    navigateTo('home');
    if (typeof window !== 'undefined') {
      window.history.pushState(null, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleCategoriesClick = () => {
    if (!isHome) {
      navigateTo('home');
      setTimeout(() => {
        const el = document.getElementById('categories');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } else {
      const el = document.getElementById('categories');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleOrdersClick = () => {
    if (isAuthenticated) {
      navigateTo('account');
    } else {
      navigateTo('login');
    }
  };

  const handleAccountClick = () => {
    if (isAuthenticated) {
      openOverlay('account');
    } else {
      navigateTo('login');
    }
  };

  return (
    <nav className={styles.bottomNav} aria-label="شريط التنقل السفلي للهواتف">
      <button
        type="button"
        className={`${styles.navItem} ${isHome ? styles.navItemActive : ''}`}
        onClick={handleHomeClick}
        aria-label="الرئيسية"
      >
        <div className={styles.navIconWrap}>
          <Home size={19} strokeWidth={isHome ? 2.6 : 2} />
        </div>
        <span>الرئيسية</span>
      </button>

      <button
        type="button"
        className={styles.navItem}
        onClick={handleCategoriesClick}
        aria-label="الفئات"
      >
        <div className={styles.navIconWrap}>
          <LayoutGrid size={19} strokeWidth={2} />
        </div>
        <span>الفئات</span>
      </button>

      <button
        type="button"
        className={`${styles.navItem} ${isAccount ? styles.navItemActive : ''}`}
        onClick={handleOrdersClick}
        aria-label="طلباتي"
      >
        <div className={styles.navIconWrap}>
          <FileText size={19} strokeWidth={isAccount ? 2.6 : 2} />
        </div>
        <span>طلباتي</span>
      </button>

      <button
        type="button"
        className={styles.navItem}
        onClick={handleAccountClick}
        aria-label="حسابي"
      >
        <div className={styles.navIconWrap}>
          <User size={19} strokeWidth={2} />
        </div>
        <span>حسابي</span>
      </button>
    </nav>
  );
};

export default MobileBottomNav;
