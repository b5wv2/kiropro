import React, { useState, useEffect } from 'react';
import styles from './Auth.module.css';
import { useAuth } from '../../context/AuthContext';
import { OtpVerificationView } from '../../components/Auth/OtpVerificationView';
import { AlertCircle, Zap } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { login, quickLogin, checkAdminSession, isLoading, navigateTo } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);

  // Secure Quick Login state (only shown if a valid existing admin session exists on this browser)
  const [hasAdminSession, setHasAdminSession] = useState<boolean>(false);
  const [adminEmail, setAdminEmail] = useState<string>('');
  const [isCheckingSession, setIsCheckingSession] = useState<boolean>(true);
  const [isQuickLoggingIn, setIsQuickLoggingIn] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    const verifySession = async () => {
      try {
        const session = await checkAdminSession();
        if (isMounted) {
          setHasAdminSession(session.hasValidAdminSession);
          if (session.email) {
            setAdminEmail(session.email);
          }
        }
      } catch {
        if (isMounted) setHasAdminSession(false);
      } finally {
        if (isMounted) setIsCheckingSession(false);
      }
    };

    verifySession();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) return;

    const res = await login({ email: email.trim(), password });

    if (res.requiresVerification) {
      setUnverifiedEmail(res.email || email.trim());
    } else if (!res.success && res.error) {
      setError(res.error);
    }
  };

  const handleQuickLogin = async () => {
    if (isQuickLoggingIn || isLoading) return;
    setError(null);
    setIsQuickLoggingIn(true);

    try {
      const res = await quickLogin();
      if (!res.success) {
        setError(res.error || 'انتهت صلاحية الجلسة. يرجى تسجيل الدخول مجدداً بكلمة المرور.');
        setHasAdminSession(false);
      }
    } catch (err: any) {
      setError('تعذر استعادة الجلسة. يرجى تسجيل الدخول بكلمة المرور.');
      setHasAdminSession(false);
    } finally {
      setIsQuickLoggingIn(false);
    }
  };

  if (unverifiedEmail) {
    return (
      <OtpVerificationView
        email={unverifiedEmail}
        onChangeEmail={() => {
          setUnverifiedEmail(null);
          setError(null);
        }}
      />
    );
  }

  return (
    <div className={styles.authWrapper} dir="rtl">
      <div className={styles.authCard}>
        {/* Brand Header */}
        <div className={styles.header}>
          <div className={styles.brandBadge}>
            <span className={styles.brandKiro}>KIRO</span>
            <span className={styles.brandPro}>PRO</span>
          </div>
          <h1 className={styles.title}>تسجيل الدخول</h1>
          <p className={styles.subtitle}>سجّل دخولك للوصول إلى رصيد محفظتك وطلباتك.</p>
        </div>

        {error && (
          <div className={styles.errorBanner}>
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Quick Admin Access: ONLY shown if a valid existing Admin session exists on this browser */}
        {!isCheckingSession && hasAdminSession && (
          <div
            className={styles.quickLoginBanner}
            onClick={handleQuickLogin}
            role="button"
            tabIndex={0}
            id="btn-admin-quick-login"
            style={{ opacity: isQuickLoggingIn ? 0.7 : 1, cursor: isQuickLoggingIn ? 'wait' : 'pointer' }}
          >
            <Zap size={18} style={{ flexShrink: 0, color: '#D97706' }} />
            <span>
              {isQuickLoggingIn
                ? 'جاري استعادة جلسة المسؤول...'
                : `⚡ دخول سريع كمسؤول${adminEmail ? ` (${adminEmail})` : ''}`}
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.inputGroup}>
            <label className={styles.label} htmlFor="login-email">البريد الإلكتروني</label>
            <input
              id="login-email"
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className={styles.label} htmlFor="login-password">كلمة المرور</label>
              <button
                type="button"
                className={styles.link}
                onClick={() => navigateTo('forgot-password')}
                style={{ fontSize: '0.8rem', fontWeight: 700, color: '#D97706', textDecoration: 'none' }}
              >
                نسيت كلمة المرور؟
              </button>
            </div>
            <input
              id="login-password"
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

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: 6, padding: '12px', fontWeight: 800 }}
            disabled={isLoading || isQuickLoggingIn}
          >
            <span>{isLoading ? 'جاري تسجيل الدخول...' : 'تسجيل الدخول'}</span>
          </button>
        </form>

        <div className={styles.footerText}>
          <span>ليس لديك حساب؟</span>
          <button
            type="button"
            className={styles.link}
            onClick={() => navigateTo('register')}
            style={{ fontWeight: 800 }}
          >
            إنشاء حساب جديد
          </button>
        </div>
      </div>
    </div>
  );
};

