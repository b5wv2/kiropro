import React, { useState } from 'react';
import styles from './Auth.module.css';
import { useAuth } from '../../context/AuthContext';
import { OtpVerificationView } from '../../components/Auth/OtpVerificationView';
import { AlertCircle, Gift } from 'lucide-react';
import { api } from '../../lib/api';
import { ReferralConfig, generateReferralCopy } from '../../utils/referralText';

export const RegisterPage: React.FC = () => {
  const { register, isLoading, navigateTo } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [preferredCurrency, setPreferredCurrency] = useState<'USD' | 'SDG'>('USD');
  const [referralCode, setReferralCode] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return (params.get('ref') || '').toUpperCase();
    }
    return '';
  });
  const [referralConfig, setReferralConfig] = useState<ReferralConfig | null>(null);

  // Verification step state
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  const [cooldownRemaining, setCooldownRemaining] = useState<number>(60);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    api.get<ReferralConfig>('/api/referral/config')
      .then(cfg => { if (cfg) setReferralConfig(cfg); })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim() || !email.trim()) {
      setError('يرجى إدخال جميع الحقول المطلوبة.');
      return;
    }

    if (password.length < 6) {
      setError('كلمة المرور يجب أن تكون 6 أحرف على الأقل.');
      return;
    }

    if (password !== confirmPassword) {
      setError('كلمتا المرور غير متطابقتين.');
      return;
    }

    const res = await register({
      name: name.trim(),
      email: email.trim(),
      password,
      preferred_currency: preferredCurrency,
      referral_code: referralCode.trim() ? referralCode.trim().toUpperCase() : undefined
    });

    if (res.requiresVerification) {
      setVerificationEmail(res.email || email.trim());
      if (res.cooldownRemaining) {
        setCooldownRemaining(res.cooldownRemaining);
      }
    } else if (!res.success && res.error) {
      setError(res.error);
    }
  };

  // If waiting for email verification, render the 6-cell OTP screen
  if (verificationEmail) {
    return (
      <OtpVerificationView
        email={verificationEmail}
        initialCooldown={cooldownRemaining}
        onChangeEmail={() => {
          setVerificationEmail(null);
          setError(null);
        }}
      />
    );
  }

  return (
    <div className={styles.authWrapper}>
      <div className={styles.authCard}>
        {/* Brand Header */}
        <div className={styles.header}>
          <div className={styles.brandBadge}>
            <span className={styles.brandKiro}>KIRO</span>
            <span className={styles.brandPro}>PRO</span>
          </div>
          <h1 className={styles.title}>إنشاء حساب جديد</h1>
          <p className={styles.subtitle}>انضم إلى منصة KIROPRO واشحن ألعابك وبطاقاتك فورياً.</p>
        </div>

        {error && (
          <div className={styles.errorBanner}>
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.inputGroup}>
            <label className={styles.label} htmlFor="reg-name">الاسم الكامل*</label>
            <input
              id="reg-name"
              type="text"
              required
              className={styles.input}
              placeholder="مثال: أحمد محمد"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
            />
          </div>

          <div className={styles.inputGroup}>
            <label className={styles.label} htmlFor="reg-email">البريد الإلكتروني*</label>
            <input
              id="reg-email"
              type="email"
              required
              className={styles.input}
              placeholder="name@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
            />
          </div>

          <div className={styles.inputGroup}>
            <label className={styles.label} htmlFor="reg-pass">كلمة المرور (6 أحرف على الأقل)*</label>
            <input
              id="reg-pass"
              type="password"
              required
              className={styles.input}
              placeholder="••••••••"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
            />
          </div>

          <div className={styles.inputGroup}>
            <label className={styles.label} htmlFor="reg-confirm">تأكيد كلمة المرور*</label>
            <input
              id="reg-confirm"
              type="password"
              required
              className={styles.input}
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setError(null);
              }}
            />
          </div>

          <div className={styles.inputGroup}>
            <label className={styles.label}>اختر عملة حسابك ومحفظتك*</label>
            <div className={styles.currencySelectorGrid}>
              <button
                type="button"
                className={`${styles.currencyCard} ${preferredCurrency === 'USD' ? styles.currencyCardActive : ''}`}
                onClick={() => setPreferredCurrency('USD')}
              >
                <span className={styles.currencyCode}>USD ($)</span>
                <span className={styles.currencyLabel}>الدولار الأمريكي</span>
              </button>
              <button
                type="button"
                className={`${styles.currencyCard} ${preferredCurrency === 'SDG' ? styles.currencyCardActive : ''}`}
                onClick={() => setPreferredCurrency('SDG')}
              >
                <span className={styles.currencyCode}>SDG (ج.س)</span>
                <span className={styles.currencyLabel}>الجنيه السوداني</span>
              </button>
            </div>
          </div>

          {/* Referral / Invite Code Input Field */}
          <div className={styles.inputGroup}>
            <label className={styles.label} htmlFor="reg-ref">
              كود الدعوة أو الإحالة (اختياري)
            </label>
            <input
              id="reg-ref"
              type="text"
              className={styles.input}
              placeholder="مثال: KP123456"
              value={referralCode}
              onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
              style={{ fontFamily: 'monospace', letterSpacing: '1px' }}
            />
            {referralCode.trim() && (
              <div style={{
                marginTop: 6,
                fontSize: '0.8rem',
                color: '#15803d',
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                padding: '6px 10px',
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}>
                <Gift size={14} color="#16a34a" />
                <span>
                  هدية الصداقة الترحيبية: ستحصل على {generateReferralCopy(referralConfig).formattedReferee} {generateReferralCopy(referralConfig).currency} في محفظتك فور التسجيل!
                </span>
              </div>
            )}
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: 8, padding: '12px', fontWeight: 800 }}
            disabled={isLoading}
          >
            <span>{isLoading ? 'جاري إرسال رمز التحقق...' : 'إنشاء حساب والتحقق بالبريد'}</span>
          </button>
        </form>

        <div className={styles.footerText}>
          <span>لديك حساب بالفعل؟</span>
          <button
            type="button"
            className={styles.link}
            onClick={() => navigateTo('login')}
            style={{ fontWeight: 800 }}
          >
            تسجيل الدخول
          </button>
        </div>
      </div>
    </div>
  );
};
