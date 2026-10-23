import React from 'react';
import styles from './GameCard.module.css';
import { Game } from '../../types';
import { getProductImageUrl } from '../../utils/imageUrl';
import { formatCurrency } from '../../lib/formatters';
import { useWallet } from '../../context/WalletContext';

interface GameCardProps {
  game: Game;
  onSelect: (game: Game) => void;
}

export const GameCard: React.FC<GameCardProps> = ({ game, onSelect }) => {
  const { exchangeRate } = useWallet();
  const effectiveSdgPrice = game.minPriceSdg || Math.round(game.minPrice * (exchangeRate || 7600));

  const isOutOfStock = Boolean(game.packages && game.packages.length > 0 && game.packages.every(p => p.inStock === false));
  const isCard = game.category === 'cards' || game.id === 'kiropro-card';
  const isVoucher = game.id.includes('voucher') || game.category === 'cards';

  const actionLabel = isOutOfStock
    ? 'نفد مؤقتاً'
    : isCard && game.id === 'kiropro-card'
      ? 'طلب البطاقة'
      : isVoucher
        ? 'طلب الكود'
        : game.category === 'apps' || game.category === 'digital' || game.category === 'subscriptions'
          ? 'شحن الحساب'
          : 'اشحن الآن';

  return (
    <article
      className={styles.card}
      onClick={() => onSelect(game)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(game);
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`${actionLabel} - ${game.name}`}
    >
      <div className={styles.media}>
        <img
          src={getProductImageUrl(game.image)}
          alt={game.name}
          className={styles.image}
          loading="lazy"
          onError={(e) => {
            (e.target as HTMLImageElement).src =
              'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=800&q=80';
          }}
        />
        <div className={styles.badgeDelivery}>
          <span className={styles.pulseDot} />
          <span>{game.deliveryTime}</span>
        </div>
        <div className={styles.badgeTag}>{isOutOfStock ? 'نفد مؤقتاً' : game.badge}</div>
      </div>

      <div className={styles.body}>
        <div>
          <h3 className={styles.title} title={game.name}>{game.name}</h3>
          <div className={styles.meta}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span>{game.type}</span>
          </div>
        </div>

        <div className={styles.footer}>
          <div className={styles.priceWrapper}>
            <span className={styles.priceLabel}>يبدأ من</span>
            <span className={styles.priceValue}>{formatCurrency(effectiveSdgPrice, 'SDG')}</span>
            {game.minPrice > 0 && (
              <span className={styles.priceUsd}>≈ ${game.minPrice.toFixed(2)} USD</span>
            )}
          </div>

          <button
            type="button"
            className={`btn ${isOutOfStock ? 'btn-secondary' : 'btn-primary'} btn-sm`}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(game);
            }}
            tabIndex={-1}
            aria-hidden="true"
          >
            <span>{actionLabel}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
          </button>
        </div>
      </div>
    </article>
  );
};
