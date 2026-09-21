import React from 'react';
import styles from './GameCard.module.css';
import { getProductImageUrl } from '../../utils/imageUrl';

export interface UsdtCardConfig {
  imageUrl?: string | null;
  minOrderAmount?: number;
  exchangeRate?: number;
  available?: number;
}

interface UsdtCardProps {
  config?: UsdtCardConfig | null;
  onSelect: () => void;
}

export const UsdtCard: React.FC<UsdtCardProps> = ({ config, onSelect }) => {
  // Use image from Admin / Database -> Fallback image -> default placeholder
  const rawImage = config?.imageUrl || '/uploads/products/usdt-card.webp';
  const resolvedImageUrl = getProductImageUrl(rawImage);

  // Dynamic price from backend config (defaults to 3 if not yet loaded)
  const minAmount = config?.minOrderAmount ? Math.max(3, config.minOrderAmount) : 3;
  const usdtRate = config?.exchangeRate || 6200;
  const startingSdg = Math.round(minAmount * usdtRate);

  return (
    <article
      className={styles.card}
      onClick={onSelect}
      aria-label="تحويل USDT فوري"
      style={{
        border: '1px solid rgba(16, 185, 129, 0.25)',
        position: 'relative'
      }}
    >
      <div className={styles.media} style={{ background: '#0B1E19' }}>
        <img
          src={resolvedImageUrl}
          alt="USDT — تحويل فوري ⚡"
          className={styles.image}
          loading="lazy"
          onError={(e) => {
            (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1622979135225-d2ba269bc1df?auto=format&fit=crop&w=800&q=80';
          }}
        />

        <div className={styles.badgeDelivery} style={{ background: 'rgba(6, 78, 59, 0.9)', borderColor: 'rgba(16, 185, 129, 0.4)' }}>
          <span className={styles.pulseDot} style={{ background: '#10B981', boxShadow: '0 0 8px #10B981' }} />
          <span>تنفيذ فوري ⚡</span>
        </div>

        <div
          className={styles.badgeTag}
          style={{
            background: 'var(--accent-yellow)',
            color: '#0B0F19',
            fontWeight: 800
          }}
        >
          6 شبكات مدعومة
        </div>
      </div>

      <div className={styles.body}>
        <div>
          <h3 className={styles.title} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>USDT — تحويل فوري</span>
            <span style={{ fontSize: '1rem' }}>⚡</span>
          </h3>

          <div className={styles.meta} style={{ color: '#10B981' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span>تحويل سريع وآمن لمحفظتك</span>
          </div>
        </div>

        <div className={styles.footer}>
          <div className={styles.priceWrapper}>
            <span className={styles.priceLabel}>يبدأ من</span>
            <span
              className={styles.priceValue}
              style={{
                color: '#10B981',
                fontWeight: 900,
                whiteSpace: 'nowrap'
              }}
            >
              {startingSdg.toLocaleString('en-US')} ج.س
            </span>
          </div>

          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}
            style={{
              background: 'linear-gradient(135deg, #10B981 0%, #047857 100%)',
              color: '#FFFFFF',
              border: 'none',
              fontWeight: 800
            }}
          >
            <span>اطلب الآن</span>
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
