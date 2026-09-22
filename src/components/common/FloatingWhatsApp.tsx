import React from 'react';
import styles from './FloatingWhatsApp.module.css';
import { useAuth } from '../../context/AuthContext';

export const FloatingWhatsApp: React.FC = () => {
  const { maintenanceMode, primaryWhatsapp, currentView } = useAuth();

  // Only render in Normal Mode (not maintenance) and not on admin pages
  if (maintenanceMode || currentView === 'admin' || !primaryWhatsapp || !primaryWhatsapp.enabled || !primaryWhatsapp.url) {
    return null;
  }

  const title = primaryWhatsapp.title || 'واتساب';
  const subtitle = primaryWhatsapp.subtitle || 'تواصل معنا مباشرة';

  return (
    <aside className={styles.floatingContainer} aria-label="زر الدعم السريع عبر واتساب">
      <div className={styles.tooltip}>
        <span>💬</span>
        <span>{title} ({subtitle})</span>
      </div>

      <a
        href={primaryWhatsapp.url}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.whatsappButton}
        aria-label={`${title} - ${subtitle}`}
        title={`${title} - ${subtitle}`}
      >
        <span className={styles.pulseEffect} />
        {/* WhatsApp Icon SVG */}
        <svg
          viewBox="0 0 24 24"
          width="30"
          height="30"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
      </a>
    </aside>
  );
};
