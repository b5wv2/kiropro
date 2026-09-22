import React, { useState } from 'react';
import styles from './MaintenancePage.module.css';
import { Wrench, RefreshCw, Send, ShieldAlert, Lock, X, Coffee } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface MaintenancePageProps {
  onCheckStatus?: () => Promise<boolean>;
}

export const MaintenancePage: React.FC<MaintenancePageProps> = ({ onCheckStatus }) => {
  const { login, quickLogin, contactChannels } = useAuth();
  const [checking, setChecking] = useState(false);
  const [checkMessage, setCheckMessage] = useState<string | null>(null);

  // Admin secret modal state
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);

  const handleManualCheck = async () => {
    setChecking(true);
    setCheckMessage(null);
    try {
      if (onCheckStatus) {
        const stillInMaintenance = await onCheckStatus();
        if (stillInMaintenance) {
          setCheckMessage('لسه شوية يا بطل.. شغالين ترتيبات، جرّب تاني بعد شوية ☕✨');
        } else {
          setCheckMessage('أبشروا! المتجر رجع شغال.. جاري تحويلك هسي 🎉');
          setTimeout(() => {
            window.location.reload();
          }, 1000);
        }
      } else {
        setTimeout(() => {
          setCheckMessage('لسه شوية يا بطل.. شغالين ترتيبات، جرّب تاني بعد شوية ☕✨');
        }, 800);
      }
    } catch {
      setCheckMessage('لسه الترتيبات مستمرة.. دقايق وبنرجع ليكم!');
    } finally {
      setTimeout(() => setChecking(false), 600);
    }
  };

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminLoading(true);
    setAdminError(null);
    try {
      const res = await login({ email: adminEmail, password: adminPassword });
      if (res.success) {
        setShowAdminModal(false);
        window.location.reload();
      } else {
        setAdminError(res.error || 'بيانات المسؤول غير صحيحة.');
      }
    } catch (err: any) {
      setAdminError(err.message || 'فشل تسجيل الدخول.');
    } finally {
      setAdminLoading(false);
    }
  };

  const handleQuickAdminLogin = async () => {
    setAdminLoading(true);
    setAdminError(null);
    try {
      const res = await quickLogin();
      if (res.success) {
        setShowAdminModal(false);
        window.location.reload();
      } else {
        setAdminError(res.error || 'تعذر الدخول السريع كمسؤول.');
      }
    } catch (err: any) {
      setAdminError(err.message || 'فشل الدخول السريع.');
    } finally {
      setAdminLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.ambientGlow} />

      <main className={styles.card}>
        <div className={styles.iconWrapper}>
          <Wrench size={44} className={styles.floatingIcon} />
        </div>

        {/* الشريط الإعلاني */}
        <div className={styles.badge}>
          <span className={styles.pulseDot} />
          <span>شوية ترتيب من ورانا.. والجايات أحلى إن شاء الله 🎮🔥</span>
        </div>

        {/* العنوان الرئيسي */}
        <h1 className={styles.title}>أصبروا علينا شوية.. راجعين أقوى 🔥</h1>

        {/* النص الرئيسي */}
        <section className={styles.humorBox}>
          <p className={styles.humorBody}>
            يا جماعة، <strong>KIROPRO</strong> هسي في صيانة وترتيبات بسيطة عشان نرجع ليكم أقوى وأسرع وأرتب.
          </p>
          <p className={styles.humorSub}>
            حساباتكم وبياناتكم محفوظة، وما في حاجة ضاعت ❤️
          </p>
          <p className={styles.humorFooter}>
            استعدوا.. راجعين ليكم بحاجة سمحة جدًا 🔥🎮
          </p>
        </section>

        {/* البطاقات */}
        <div className={styles.statusGrid}>
          <div className={styles.statusCard}>
            <span className={styles.statusValue}>الرجعة قريبة ⚡</span>
            <span className={styles.statusLabel}>بس شوية ترتيب ونرجع</span>
          </div>
          <div className={styles.statusCard}>
            <span className={styles.statusValue}>حساباتكم في أمان 🔒</span>
            <span className={styles.statusLabel}>كل بياناتكم محفوظة</span>
          </div>
          <div className={styles.statusCard}>
            <span className={styles.statusValue}>راجعين أقوى 🔥</span>
            <span className={styles.statusLabel}>والجايات أحلى</span>
          </div>
        </div>

        {/* Feedback notification from checking */}
        {checkMessage && (
          <div style={{
            background: 'rgba(245, 158, 11, 0.15)',
            border: '1px solid #F59E0B',
            borderRadius: '12px',
            padding: '12px 16px',
            marginBottom: '18px',
            fontSize: '0.9rem',
            fontWeight: 700,
            color: '#FBBF24',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
          }}>
            <Coffee size={18} />
            <span>{checkMessage}</span>
          </div>
        )}

        {/* أزرار الإجراءات */}
        <div className={styles.btnGroup}>
          <button
            className={styles.checkBtn}
            onClick={handleManualCheck}
            disabled={checking}
            type="button"
            aria-label="فحص حالة المتجر والاتصال"
          >
            <RefreshCw size={18} className={checking ? 'animate-spin' : ''} style={{ animation: checking ? 'spin 1s linear infinite' : 'none' }} />
            <span>{checking ? 'بنشوف المتجر رجع ولا لسه...' : '🔄 شوف المتجر رجع ولا لسه'}</span>
          </button>
        </div>

        {/* قسم قنوات التواصل المعتمدة من الإدارة */}
        {contactChannels && contactChannels.filter(c => c.enabled && c.url).length > 0 && (
          <section className={styles.contactSection} aria-label="قنوات التواصل والدعم">
            <h2 className={styles.contactTitle}>
              <span>محتاج تتواصل معانا؟ 👇</span>
            </h2>
            <div className={styles.channelsGrid}>
              {contactChannels
                .filter(c => c.enabled && c.url)
                .sort((a, b) => (a.order || 0) - (b.order || 0))
                .map(channel => {
                  let cardSpecificClass = styles.channelCard;
                  let platformEmoji = '💬';
                  let iconElement = null;

                  if (channel.id === 'whatsapp') {
                    cardSpecificClass += ` ${styles.channelCardWhatsapp}`;
                    platformEmoji = '💬';
                    iconElement = (
                      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                      </svg>
                    );
                  } else if (channel.id === 'facebook') {
                    cardSpecificClass += ` ${styles.channelCardFacebook}`;
                    platformEmoji = '📘';
                    iconElement = (
                      <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                        <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
                      </svg>
                    );
                  } else {
                    cardSpecificClass += ` ${styles.channelCardTelegram}`;
                    platformEmoji = '✈️';
                    iconElement = <Send size={20} />;
                  }

                  const displayTitle = channel.title || (channel.id === 'whatsapp' ? 'واتساب' : channel.id === 'facebook' ? 'فيسبوك' : 'تيليجرام');
                  const displaySubtitle = channel.subtitle || (channel.id === 'whatsapp' ? 'للدعم والاستفسارات' : channel.id === 'facebook' ? 'تابعنا وتواصل معنا' : 'للتواصل السريع');

                  return (
                    <a
                      key={channel.id}
                      href={channel.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cardSpecificClass}
                      aria-label={`${displayTitle} - ${displaySubtitle}`}
                      title={`${displayTitle} - ${displaySubtitle}`}
                    >
                      <div className={styles.channelIconWrap}>
                        {iconElement}
                      </div>
                      <div className={styles.channelInfo}>
                        <span className={styles.channelName}>{platformEmoji} {displayTitle}</span>
                        <span className={styles.channelSubtitle}>{displaySubtitle}</span>
                      </div>
                    </a>
                  );
                })}
            </div>
          </section>
        )}

        <div className={styles.footerNote}>
          <span>KIROPRO</span>
          <span>•</span>
          <button
            type="button"
            className={styles.adminSecretBtn}
            onClick={() => setShowAdminModal(true)}
            title="بوابة دخول الإدارة"
          >
            <Lock size={12} style={{ display: 'inline', marginLeft: 4 }} />
            دخول المسؤول
          </button>
        </div>
      </main>

      {/* Admin Login Modal (for Admin to login if not already logged in) */}
      {showAdminModal && (
        <div className={styles.modalOverlay} onClick={() => setShowAdminModal(false)}>
          <div className={styles.loginModal} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, color: '#F59E0B' }}>
                <ShieldAlert size={20} />
                <span>بوابة دخول الإدارة أثناء الصيانة</span>
              </div>
              <button
                type="button"
                onClick={() => setShowAdminModal(false)}
                style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {adminError && (
              <div style={{ background: '#7f1d1d', border: '1px solid #ef4444', color: '#fca5a5', padding: '8px 12px', borderRadius: 8, fontSize: '0.85rem', marginBottom: 12 }}>
                {adminError}
              </div>
            )}

            <form onSubmit={handleAdminSubmit}>
              <div>
                <label style={{ fontSize: '0.8rem', color: '#CBD5E1' }}>البريد الإلكتروني للأدمن:</label>
                <input
                  type="email"
                  className={styles.loginInput}
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="admin@kiropro.com"
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: '#CBD5E1' }}>كلمة المرور:</label>
                <input
                  type="password"
                  className={styles.loginInput}
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                <button
                  type="submit"
                  className={styles.checkBtn}
                  disabled={adminLoading}
                  style={{ padding: '10px' }}
                >
                  <span>{adminLoading ? 'جاري التحقق...' : 'دخول كمسؤول 🚀'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleQuickAdminLogin}
                  disabled={adminLoading}
                  className="btn btn-secondary btn-sm"
                  style={{ width: '100%', fontSize: '0.85rem' }}
                >
                  ⚡ دخول سريع كمسؤول
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
