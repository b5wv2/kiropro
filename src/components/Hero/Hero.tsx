import React from 'react';
import styles from './Hero.module.css';
import { useTypewriter } from '../../hooks/useTypewriter';
import { useWallet } from '../../context/WalletContext';
import { formatCurrency } from '../../lib/formatters';
import { Game } from '../../types';

interface HeroProps {
  onQuickTopUp: (game: Game) => void;
  featuredGame: Game;
}

const PHRASES = [
  'ألعابك المفضلة',
  'ماسات Likee فوراً 💎',
  'نجوم تيليجرام ⭐',
  'اشتراكات Telegram Premium',
  'رصيدك الرقمي بثوانٍ'
];

export const Hero: React.FC<HeroProps> = ({ onQuickTopUp, featuredGame }) => {
  const dynamicText = useTypewriter(PHRASES, {
    typingSpeed: 70,
    deletingSpeed: 38,
    pauseDuration: 1800
  });

  const { openDepositModal, exchangeRate } = useWallet();
  const pubgPriceSdg = Math.round(8.99 * (exchangeRate || 7600));
  const freeFirePriceSdg = Math.round(5.40 * (exchangeRate || 7600));

  return (
    <section className={styles.hero}>
      <div className={styles.ambientGlow} />
      <div className={`container ${styles.grid}`}>
        {/* Content Column */}
        <div className={styles.content}>
          <div className={styles.badge}>
            <div className={styles.badgeIcon}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            </div>
            <span>شحن سريع. رصيد جاهز. بدون تعقيد.</span>
          </div>

          <h1 className={styles.heading}>
            <span style={{ marginBottom: 4 }}>اشحن</span>
            <div className={styles.typewriterLine}>
              <div className={styles.typewriterBox}>
                <span className={styles.typewriterText}>{dynamicText}</span>
                <span className={styles.cursor} />
              </div>
            </div>
          </h1>

          <p className={styles.subheading}>
            <strong>KIROPRO</strong> يمنحك تجربة شحن رقمية سريعة وسلسة، مع تنفيذ تلقائي للطلبات وأسعار واضحة بدون تعقيد.
          </p>

          <div className={styles.ctaGroup}>
            <a href="#games" className="btn btn-primary">
              <span>ابدأ التسوق الآن</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
            </a>

            <button
              onClick={openDepositModal}
              className="btn btn-secondary"
              type="button"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="M7 15h0M2 9.5h20" />
              </svg>
              <span>إدارة الرصيد</span>
            </button>
          </div>

          {/* 4 System-Connected Trust Indicators */}
          <div className={styles.trustRow}>
            <div className={styles.trustItem}>
              <div className={styles.trustIconWrap}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              </div>
              <div className={styles.trustTextWrap}>
                <span className={styles.trustVal}>شحن تلقائي</span>
                <span className={styles.trustSub}>تنفيذ الطلب عبر مزود الشحن</span>
              </div>
            </div>

            <div className={styles.trustItem}>
              <div className={styles.trustIconWrap}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="M7 15h0M2 9.5h20" />
                </svg>
              </div>
              <div className={styles.trustTextWrap}>
                <span className={styles.trustVal}>دفع من رصيدك</span>
                <span className={styles.trustSub}>استخدم رصيد KIROPRO مباشرة</span>
              </div>
            </div>

            <div className={styles.trustItem}>
              <div className={styles.trustIconWrap}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <div className={styles.trustTextWrap}>
                <span className={styles.trustVal}>تنفيذ سريع</span>
                <span className={styles.trustSub}>معالجة الطلب تلقائياً</span>
              </div>
            </div>

            <div className={styles.trustItem}>
              <div className={styles.trustIconWrap}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <div className={styles.trustTextWrap}>
                <span className={styles.trustVal}>دعم العملاء</span>
                <span className={styles.trustSub}>مساعدة عند وجود مشكلة</span>
              </div>
            </div>
          </div>
        </div>

        {/* Visual Showcase Card */}
        <div className={styles.visual}>
          <div className={styles.cardStack}>
            <div className={styles.mainCard}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                <div className={styles.statusPill}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#4ADE80', boxShadow: '0 0 8px #4ADE80' }} />
                  <span>الربط مع مزود الشحن متصل</span>
                </div>
                <span style={{ fontSize: '0.75rem', color: '#94A3B8', fontWeight: 700 }}>KIRO Core</span>
              </div>

              {/* Game Item 1: PUBG */}
              <div className={styles.previewItem}>
                <img
                  src="https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=120&q=80"
                  alt="PUBG Mobile"
                  className={styles.previewThumb}
                />
                <div style={{ flexGrow: 1 }}>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#FFFFFF' }}>ببجي موبايل (PUBG Mobile)</h4>
                  <p style={{ fontSize: '0.75rem', color: '#94A3B8' }}>660 شدة (UC) عبر معرّف اللاعب</p>
                </div>
                <span className={styles.previewPrice}>{formatCurrency(pubgPriceSdg, 'SDG')}</span>
              </div>

              {/* Game Item 2: Free Fire */}
              <div className={styles.previewItem} style={{ marginBottom: 18 }}>
                <img
                  src="https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=120&q=80"
                  alt="Free Fire"
                  className={styles.previewThumb}
                />
                <div style={{ flexGrow: 1 }}>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#FFFFFF' }}>فري فاير (Free Fire)</h4>
                  <p style={{ fontSize: '0.75rem', color: '#94A3B8' }}>520+52 جوهرة عبر الـ UID</p>
                </div>
                <span className={styles.previewPrice}>{formatCurrency(freeFirePriceSdg, 'SDG')}</span>
              </div>

              <button
                className="btn btn-primary"
                onClick={() => onQuickTopUp(featuredGame)}
                style={{ width: '100%', fontSize: '0.975rem' }}
                type="button"
              >
                <span>تجربة الشحن من رصيدك الآن</span>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              </button>
            </div>

            {/* Floating Badge */}
            <div className={styles.floatingBadge}>
              <div style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--accent-yellow)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0B0F19" strokeWidth="2.5">
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="M7 15h0M2 9.5h20" />
                </svg>
              </div>
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0B0F19' }}>رصيد محفظة جاهز</div>
                <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>تنفيذ مباشر عبر رصيد KIROPRO</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
