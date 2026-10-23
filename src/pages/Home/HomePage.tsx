import React from 'react';
import styles from './HomePage.module.css';
import { useAuth } from '../../context/AuthContext';
import { ChevronLeft } from 'lucide-react';
import {
  VouchersIllustration,
  GameTopUpIllustration,
  PaymentCardsIllustration,
  SocialMediaIllustration,
  VirtualNumbersIllustration,
  SubscriptionsIllustration
} from '../../components/Categories/CategoryIllustrations';
import { HowItWorks } from '../../components/HowItWorks/HowItWorks';
import { WhyUs } from '../../components/Features/WhyUs';
import { HomeReviewsSection } from '../../components/Reviews/HomeReviewsSection';

export interface CategoryCardItem {
  id: string;
  name: string;
  path: string;
  illustration: React.ReactNode;
}

const CATEGORY_ITEMS: CategoryCardItem[] = [
  {
    id: 'vouchers',
    name: 'قسائم الشحن',
    path: '/category/vouchers',
    illustration: <VouchersIllustration />
  },
  {
    id: 'game-topup',
    name: 'شحن الألعاب عبر ID',
    path: '/category/game-topup',
    illustration: <GameTopUpIllustration />
  },
  {
    id: 'social-media',
    name: 'منصات التواصل الاجتماعي',
    path: '/category/social-media',
    illustration: <SocialMediaIllustration />
  },
  {
    id: 'payment-cards',
    name: 'بطاقات الدفع',
    path: '/category/payment-cards',
    illustration: <PaymentCardsIllustration />
  },
  {
    id: 'virtual-numbers',
    name: 'الأرقام الافتراضية',
    path: '/virtual-numbers',
    illustration: <VirtualNumbersIllustration />
  },
  {
    id: 'subscriptions',
    name: 'الاشتراكات الرقمية',
    path: '/category/subscriptions',
    illustration: <SubscriptionsIllustration />
  }
];

export const HomePage: React.FC = () => {
  const { navigateTo } = useAuth();

  const handleNavigate = (path: string) => {
    if (path === '/virtual-numbers') {
      navigateTo('virtual-numbers');
    } else if (path === '/usdt') {
      navigateTo('usdt');
    } else if (path === '/wheel') {
      navigateTo('wheel');
    }

    if (typeof window !== 'undefined') {
      window.history.pushState(null, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, path: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleNavigate(path);
    }
  };

  return (
    <div className={styles.homePage}>
      {/* 1. Compact, Confident Hero Section */}
      <section className={styles.heroSection}>
        <div className={styles.heroContent}>
          <div className={styles.titleWrapper}>
            {/* Left Sparkle Accent */}
            <svg
              className={styles.sparkleLeft}
              width="28"
              height="28"
              viewBox="0 0 28 28"
              fill="none"
              aria-hidden="true"
            >
              <path d="M5 14L1 10M9 7L5 1M14 6L14 1" stroke="#FFE600" strokeWidth="3" strokeLinecap="round" />
            </svg>

            <h1 className={styles.heroTitle}>
              <span>كل خدماتك الرقمية</span>
              <span className={styles.heroHighlight}>في مكان واحد</span>
            </h1>

            {/* Right Sparkle Accent */}
            <svg
              className={styles.sparkleRight}
              width="28"
              height="28"
              viewBox="0 0 28 28"
              fill="none"
              aria-hidden="true"
            >
              <path d="M23 14L27 10M19 7L23 1M14 6L14 1" stroke="#FFE600" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </div>

          <p className={styles.heroSubtitle}>اختار الفئة المناسبة ليك</p>
        </div>
      </section>

      {/* 2. Main Categories Grid Section */}
      <section id="categories" className={styles.categoriesSection}>
        <div className={styles.gridContainer}>
          <div className={styles.categoriesGrid}>
            {CATEGORY_ITEMS.map((cat) => (
              <div
                key={cat.id}
                role="button"
                tabIndex={0}
                onClick={() => handleNavigate(cat.path)}
                onKeyDown={(e) => handleKeyDown(e, cat.path)}
                className={styles.categoryCard}
                aria-label={`تصفح قسم ${cat.name}`}
              >
                {/* 3D Visual Artwork */}
                <div className={styles.illustrationBox}>
                  {cat.illustration}
                </div>

                {/* Bottom Title & Circle Arrow Indicator */}
                <div className={styles.cardFooter}>
                  <h2 className={styles.categoryName}>{cat.name}</h2>
                  <div className={styles.arrowCircle} aria-hidden="true">
                    <ChevronLeft size={16} strokeWidth={2.5} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 3. Full-Width Deals Promo Banner */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => handleNavigate('/category/vouchers')}
            onKeyDown={(e) => handleKeyDown(e, '/category/vouchers')}
            className={styles.dealsBanner}
            aria-label="عروض KiroPro - اكتشف أحدث العروض والخصومات على جميع الخدمات"
          >
            <div className={styles.dealsContent}>
              <div className={styles.dealsGiftBox} aria-hidden="true">
                {/* 3D Gift Box SVG with ribbon and gold sparkle */}
                <svg viewBox="0 0 54 54" fill="none" style={{ width: '100%', height: '100%' }}>
                  <rect x="7" y="20" width="40" height="28" rx="6" fill="#F59E0B" />
                  <rect x="5" y="14" width="44" height="10" rx="3" fill="#D97706" />
                  {/* Vertical Ribbon */}
                  <rect x="23" y="14" width="8" height="34" fill="#FFE600" />
                  {/* Horizontal Ribbon */}
                  <rect x="7" y="30" width="40" height="7" fill="#FFE600" opacity="0.9" />
                  {/* Bow */}
                  <path d="M22 14C17 7 10 9 14 14C18 16 23 15 27 15" stroke="#FFE600" strokeWidth="3" strokeLinecap="round" />
                  <path d="M32 14C37 7 44 9 40 14C36 16 31 15 27 15" stroke="#FFE600" strokeWidth="3" strokeLinecap="round" />
                  {/* % Discount badge */}
                  <circle cx="42" cy="38" r="9" fill="#0B0F19" stroke="#FFE600" strokeWidth="1.5" />
                  <text x="38" y="42" fill="#FFE600" fontSize="10" fontWeight="900" fontFamily="sans-serif">%</text>
                </svg>
              </div>

              <div className={styles.dealsText}>
                <h3 className={styles.dealsTitle}>
                  <span>عروض</span>
                  <span className={styles.dealsTitleHighlight}>KiroPro</span>
                </h3>
                <p className={styles.dealsSubtitle}>
                  اكتشف أحدث العروض والخصومات على جميع الخدمات
                </p>
              </div>
            </div>

            <div className={styles.dealsArrow} aria-hidden="true">
              <ChevronLeft size={20} strokeWidth={2.8} />
            </div>
          </div>
        </div>
      </section>

      {/* 4. Features & Why Us */}
      <WhyUs />

      {/* 5. How it works */}
      <HowItWorks />

      {/* 6. Customer Reviews */}
      <HomeReviewsSection />
    </div>
  );
};

export default HomePage;
