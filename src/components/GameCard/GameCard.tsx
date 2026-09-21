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

  return (
    <article
      className={styles.card}
      onClick={() => onSelect(game)}
      aria-label={`شحن ${game.name}`}
    >
      <div className={styles.media}>
        <img
          src={getProductImageUrl(game.image)}
          alt={game.name}
          className={styles.image}
          loading="lazy"
        />
        <div className={styles.badgeDelivery}>
          <span className={styles.pulseDot} />
          <span>{game.deliveryTime}</span>
        </div>
        <div className={styles.badgeTag}>{game.badge}</div>
      </div>

      <div className={styles.body}>
        <div>
          <h3 className={styles.title}>{game.name}</h3>
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
          </div>

          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(game);
            }}
          >
            <span>اشحن الآن</span>
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
