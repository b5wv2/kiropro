import React from 'react';
import { MessageCircle, Clock, ShieldAlert } from 'lucide-react';
import { BanDetails } from '../../types/auth';
import { useAuth } from '../../context/AuthContext';
import styles from './BanNotice.module.css';

interface BanNoticeProps {
  banInfo: BanDetails;
  onDismiss?: () => void;
  mode?: 'login' | 'register' | 'general';
}

/**
 * Format date in Arabic: "22 سبتمبر 2026 - 10:30 PM"
 */
export function formatBanExpiryArabic(expiresAt?: string | null): string {
  if (!expiresAt) return 'دائم';
  try {
    const date = new Date(expiresAt);
    if (isNaN(date.getTime())) return 'دائم';

    const monthsArabic = [
      'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
      'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
    ];

    const day = date.getDate();
    const month = monthsArabic[date.getMonth()];
    const year = date.getFullYear();

    let hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const formattedTime = `${hours}:${minutes} ${ampm}`;

    return `${day} ${month} ${year} - ${formattedTime}`;
  } catch {
    return 'مؤقت';
  }
}

export const BanNotice: React.FC<BanNoticeProps> = ({ banInfo, onDismiss, mode = 'login' }) => {
  const { primaryWhatsapp, contactChannels } = useAuth();

  const isRegister = mode === 'register' || banInfo.message.includes('إنشاء');
  const isTemporary = !banInfo.permanent && Boolean(banInfo.expiresAt);
  const formattedExpiry = formatBanExpiryArabic(banInfo.expiresAt);

  // Determine active support link
  const supportUrl =
    primaryWhatsapp?.url ||
    contactChannels.find(c => c.enabled)?.url ||
    'https://wa.me/966567418246';

  return (
    <div className={styles.banContainer} role="alert" aria-live="assertive">
      <div className={styles.iconWrapper}>
        <span>🚫</span>
      </div>

      <h2 className={styles.title}>
        {banInfo.message || (isRegister ? 'لا يمكنك إنشاء حساب حاليًا' : 'تم حظر حسابك من قبل إدارة KIROPRO')}
      </h2>

      {banInfo.restrictionMessage && (
        <p className={styles.restrictionSubtitle}>
          {banInfo.restrictionMessage}
        </p>
      )}

      <div className={styles.detailsCard}>
        {banInfo.reason && (
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>
              {isRegister ? 'سبب التقييد:' : 'سبب الحظر:'}
            </span>
            <div className={styles.detailValue}>
              {banInfo.reason}
            </div>
          </div>
        )}

        <div className={styles.detailRow}>
          <span className={styles.detailLabel}>
            {isTemporary
              ? (isRegister ? 'ينتهي التقييد في:' : 'ينتهي الحظر في:')
              : (isRegister ? 'مدة التقييد:' : 'مدة الحظر:')}
          </span>
          <div>
            {isTemporary ? (
              <span className={`${styles.durationBadge} ${styles.durationTemporary}`}>
                <Clock size={14} />
                <span>{formattedExpiry}</span>
              </span>
            ) : (
              <span className={`${styles.durationBadge} ${styles.durationPermanent}`}>
                <ShieldAlert size={14} />
                <span>دائم</span>
              </span>
            )}
          </div>
        </div>
      </div>

      <p className={styles.supportNote}>
        {isRegister
          ? 'للاستفسار، تواصل مع الدعم الفني.'
          : 'للاستفسار أو الاعتراض، تواصل مع الدعم الفني.'}
      </p>

      <div className={styles.actionButtons}>
        <a
          href={supportUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.supportButton}
        >
          <MessageCircle size={18} />
          <span>تواصل مع الدعم عبر واتساب</span>
        </a>

        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className={styles.secondaryButton}
          >
            إغلاق التنبيه / محاولة بحساب آخر
          </button>
        )}
      </div>
    </div>
  );
};
