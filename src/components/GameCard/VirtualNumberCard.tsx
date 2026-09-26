import React from 'react';
import styles from './GameCard.module.css';
import { getProductImageUrl } from '../../utils/imageUrl';

interface VirtualNumberCardProps {
  onSelect: () => void;
  startingPriceSdg?: number;
}

export const VirtualNumberCard: React.FC<VirtualNumberCardProps> = ({
  onSelect,
  startingPriceSdg = 2500
}) => {
  const imageUrl = getProductImageUrl('/uploads/products/virtual-numbers.jpg');

  return (
    <article
      className={styles.card}
      onClick={onSelect}
      aria-label="الأرقام الافتراضية — استقبال كود التحقق"
      style={{
        position: 'relative'
      }}
    >
      <div className={styles.media} style={{ background: '#0F172A' }}>
        <img
          src={imageUrl}
          alt="الأرقام الافتراضية"
          className={styles.image}
          loading="lazy"
          onError={(e) => {
            (e.target as HTMLImageElement).src =
              'https://images.unsplash.com/photo-1563986768609-322da13575f3?auto=format&fit=crop&w=800&q=80';
          }}
        />

        <div className={styles.badgeDelivery} style={{ background: 'rgba(11, 15, 25, 0.88)' }}>
          <span className={styles.pulseDot} style={{ background: '#FFE600', boxShadow: '0 0 8px #FFE600' }} />
          <span>OTP فوري ⚡</span>
        </div>

        <div
          className={styles.badgeTag}
          style={{
            background: 'var(--accent-yellow)',
            color: '#0B0F19',
            fontWeight: 800
          }}
        >
          8 دول معتمدة
        </div>
      </div>

      <div className={styles.body}>
        <div>
          <h3 className={styles.title} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>الأرقام الافتراضية</span>
            <span style={{ fontSize: '1.1rem' }}>📱</span>
          </h3>

          <div className={styles.meta} style={{ color: 'var(--text-secondary)', marginTop: 4 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span style={{ lineHeight: 1.4 }}>أرقام مؤقتة لتفعيل حساباتك واستقبال رموز التحقق</span>
          </div>
        </div>

        <div className={styles.footer}>
          <div className={styles.priceWrapper}>
            <span className={styles.priceLabel}>يبدأ من</span>
            <span
              className={styles.priceValue}
              style={{
                color: '#0B0F19',
                fontWeight: 900,
                whiteSpace: 'nowrap'
              }}
            >
              {startingPriceSdg.toLocaleString('en-US')} ج.س
            </span>
          </div>

          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}
          >
            <span>اختر الرقم</span>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
          </button>
        </div>
      </div>
    </article>
  );
};
