import React, { useState } from 'react';
import styles from './Auth.module.css';
import { useAuth } from '../../context/AuthContext';
import { OtpVerificationView } from '../../components/Auth/OtpVerificationView';
import { AlertCircle } from 'lucide-react';

export const RegisterPage: React.FC = () => {
  const { register, isLoading, navigateTo } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [preferredCurrency, setPreferredCurrency] = useState<'USD' | 'SDG'>('USD');
  
  // Verification step state
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  const [cooldownRemaining, setCooldownRemaining] = useState<number>(60);
  const [error, setError] = useState<string | null>(null);

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
      preferred_currency: preferredCurrency
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
