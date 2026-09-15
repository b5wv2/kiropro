import React, { useState, useEffect, useRef } from 'react';
import styles from './Auth.module.css';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import { 
  Mail, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Eye, 
  EyeOff, 
  ShieldCheck 
} from 'lucide-react';

export const ForgotPasswordPage: React.FC = () => {
  const { navigateTo } = useAuth();

  // Multi-step flow: EMAIL -> OTP -> PASSWORD -> SUCCESS
  const [step, setStep] = useState<'EMAIL' | 'OTP' | 'PASSWORD' | 'SUCCESS'>('EMAIL');

  // Form states
  const [email, setEmail] = useState('');
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Status & Feedback
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  // 60-second cooldown timer
  const [countdown, setCountdown] = useState<number>(60);
  const [isResending, setIsResending] = useState(false);

  // OTP inputs refs
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (step === 'OTP') {
      inputRefs.current[0]?.focus();
    }
  }, [step]);

  // Countdown timer effect
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const maskEmail = (rawEmail: string): string => {
    if (!rawEmail || !rawEmail.includes('@')) return rawEmail;
    const [name, domain] = rawEmail.split('@');
    if (!name || name.length <= 1) return `*@${domain}`;
    return `${name.charAt(0)}***@${domain}`;
  };

  // ==========================================
  // STEP 1: REQUEST OTP VIA EMAIL
  // ==========================================
  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMsg(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setError('يرجى إدخال البريد الإلكتروني.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError('يرجى إدخال بريد إلكتروني صحيح.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post('/api/auth/forgot-password', { email: cleanEmail });
      setInfoMsg(res.message || 'إذا كان البريد مرتبطًا بحساب، فستصلك رسالة تحتوي على رمز التحقق.');
      setCountdown(60);
      setStep('OTP');
    } catch (err: any) {
      if (err?.response?.status === 429) {
        setError(err.message || 'يرجى الانتظار دقيقة واحدة قبل طلب رمز جديد.');
      } else {
        setError(err.message || 'حدث خطأ أثناء إرسال رمز التحقق. يرجى المحاولة لاحقاً.');
      }
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // STEP 2: OTP INPUT HANDLERS
  // ==========================================
  const handleDigitChange = (index: number, val: string) => {
    const cleanVal = val.replace(/\D/g, '');
    if (!cleanVal) {
      const newDigits = [...digits];
      newDigits[index] = '';
      setDigits(newDigits);
      return;
    }

    const singleDigit = cleanVal.slice(-1);
    const newDigits = [...digits];
    newDigits[index] = singleDigit;
    setDigits(newDigits);
    setError(null);

    if (index < 5) {
      inputRefs.current[index + 1]?.focus();
    } else {
      const fullCode = newDigits.join('');
      if (fullCode.length === 6) {
        handleVerifyOtp(fullCode);
      }
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!digits[index] && index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '');
    if (!pastedData) return;

    const newDigits = [...digits];
    for (let i = 0; i < 6; i++) {
      if (i < pastedData.length) {
        newDigits[i] = pastedData[i];
      }
    }
    setDigits(newDigits);
    setError(null);

    const nextFocus = Math.min(pastedData.length, 5);
    inputRefs.current[nextFocus]?.focus();

    if (pastedData.length >= 6) {
      handleVerifyOtp(newDigits.join(''));
    }
  };

  const handleVerifyOtp = async (codeToVerify?: string) => {
    const code = codeToVerify || digits.join('');
    if (code.length !== 6) {
      setError('يرجى إدخال رمز التحقق المكون من 6 أرقام كاملاً.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await api.post('/api/auth/password-reset/verify-otp', {
        email: email.trim().toLowerCase(),
        otp: code
      });

      if (res.success && res.resetToken) {
        setResetToken(res.resetToken);
        setStep('PASSWORD');
      } else {
        setError(res.error || 'رمز التحقق غير صحيح أو منتهي الصلاحية.');
      }
    } catch (err: any) {
      setError(err.message || 'رمز التحقق غير صحيح أو منتهي الصلاحية.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (countdown > 0 || isResending) return;
    setIsResending(true);
    setError(null);

    try {
      const res = await api.post('/api/auth/password-reset/resend-otp', {
        email: email.trim().toLowerCase()
      });
      setInfoMsg(res.message || 'تم إرسال رمز تحقق جديد إلى بريدك.');
      setCountdown(60);
      setDigits(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } catch (err: any) {
      setError(err.message || 'تعذر إعادة إرسال رمز التحقق حالياً.');
    } finally {
      setIsResending(false);
    }
  };

  // ==========================================
  // STEP 3: RESET PASSWORD SUBMIT
  // ==========================================
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!resetToken) {
      setError('انتهت صلاحية جلسة إعادة التعيين. يرجى البدء من جديد.');
      setStep('EMAIL');
      return;
    }

    if (newPassword.length < 6) {
      setError('كلمة المرور الجديدة يجب ألا تقل عن 6 أحرف.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('كلمتا المرور غير متطابقتين.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post('/api/auth/password-reset', {
        resetToken,
        newPassword
      });

      if (res.success) {
        setStep('SUCCESS');
      } else {
        setError(res.error || 'فشل تحديث كلمة المرور.');
      }
    } catch (err: any) {
      setError(err.message || 'فشل تحديث كلمة المرور. يرجى المحاولة لاحقاً.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.authWrapper} dir="rtl">
      <div className={styles.authCard}>
        {/* Brand Header */}
        <div className={styles.header}>
          <div className={styles.brandBadge}>
            <span className={styles.brandKiro}>KIRO</span>
            <span className={styles.brandPro}>PRO</span>
          </div>

          {step === 'EMAIL' && (
            <>
              <h1 className={styles.title}>إعادة تعيين كلمة المرور</h1>
              <p className={styles.subtitle}>أدخل بريدك الإلكتروني لاستلام رمز التحقق واستعادة حسابك.</p>
            </>
          )}

          {step === 'OTP' && (
            <>
              <h1 className={styles.title}>تحقق من بريدك الإلكتروني</h1>
              <p className={styles.subtitle}>
                أدخل رمز الأمان المكون من 6 أرقام المرسل إلى:{' '}
                <span className={styles.maskedEmail}>{maskEmail(email)}</span>
              </p>
            </>
          )}

          {step === 'PASSWORD' && (
            <>
              <h1 className={styles.title}>كلمة المرور الجديدة</h1>
              <p className={styles.subtitle}>عيّن كلمة مرور قوية وجديدة لحسابك في KIROPRO.</p>
            </>
          )}

          {step === 'SUCCESS' && (
            <>
              <div style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: '#ECFDF5',
                color: '#10B981',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 12px auto'
              }}>
                <CheckCircle2 size={36} />
              </div>
              <h1 className={styles.title} style={{ color: '#0F172A' }}>تم بنجاح!</h1>
              <p className={styles.subtitle}>تم تغيير كلمة المرور لحسابك بنجاح. يمكنك الآن تسجيل الدخول.</p>
            </>
          )}
        </div>

        {/* Global Error Banner */}
        {error && (
          <div className={styles.errorBanner}>
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Info Banner */}
        {infoMsg && step === 'OTP' && (
          <div style={{
            background: '#FFFBEB',
            border: '1px solid #FDE68A',
            color: '#92400E',
            borderRadius: 'var(--radius-md)',
            padding: '10px 14px',
            fontSize: '0.85rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            direction: 'rtl'
          }}>
            <ShieldCheck size={18} style={{ flexShrink: 0, color: '#D97706' }} />
            <span>{infoMsg}</span>
          </div>
        )}

        {/* STEP 1: EMAIL FORM */}
        {step === 'EMAIL' && (
          <form onSubmit={handleRequestOtp} className={styles.form}>
            <div className={styles.inputGroup}>
              <label className={styles.label} htmlFor="reset-email">البريد الإلكتروني</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="reset-email"
                  type="email"
                  required
                  className={styles.input}
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError(null);
                  }}
                  style={{ width: '100%', paddingRight: '40px' }}
                />
                <Mail 
                  size={18} 
                  style={{ 
                    position: 'absolute', 
                    right: 12, 
                    top: '50%', 
                    transform: 'translateY(-50%)', 
                    color: '#94A3B8' 
                  }} 
                />
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: 8, padding: '12px', fontWeight: 800 }}
              disabled={loading}
            >
              <span>{loading ? 'جاري التحقق وإرسال الرمز...' : 'إرسال رمز التحقق'}</span>
            </button>

            <div className={styles.footerText}>
              <span>تذكرت كلمة المرور؟</span>
              <button
                type="button"
                className={styles.link}
                onClick={() => navigateTo('login')}
                style={{ fontWeight: 800 }}
              >
                العودة لتسجيل الدخول
              </button>
            </div>
          </form>
        )}

        {/* STEP 2: 6-DIGIT OTP VERIFICATION */}
        {step === 'OTP' && (
          <div className={styles.form}>
            <div className={styles.otpGrid}>
              {digits.map((digit, idx) => (
                <input
                  key={idx}
                  ref={(el) => {
                    inputRefs.current[idx] = el;
                  }}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={1}
                  value={digit}
                  className={`${styles.otpCell} ${digit ? styles.otpCellFilled : ''}`}
                  onChange={(e) => handleDigitChange(idx, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(idx, e)}
                  onPaste={handlePaste}
                  autoComplete="one-time-code"
                />
              ))}
            </div>

            <button
              type="button"
              className="btn btn-primary"
              style={{ width: '100%', padding: '12px', fontWeight: 800 }}
              disabled={loading || digits.join('').length !== 6}
              onClick={() => handleVerifyOtp()}
            >
              <span>{loading ? 'جاري التحقق من الرمز...' : 'تحقق ومتابعة'}</span>
            </button>

            {/* Cooldown Timer & Resend Option */}
            <div className={styles.timerBox}>
              {countdown > 0 ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#64748B' }}>
                  <span>إعادة إرسال الرمز بعد:</span>
                  <strong style={{ color: '#0B0F19', fontFamily: 'monospace', direction: 'ltr' }}>
                    00:{countdown.toString().padStart(2, '0')}
                  </strong>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={isResending}
                  className={styles.link}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    color: '#F59E0B',
                    fontWeight: 700
                  }}
                >
                  <RefreshCw size={14} className={isResending ? 'animate-spin' : ''} />
                  <span>{isResending ? 'جاري الإرسال...' : 'إعادة إرسال رمز جديد'}</span>
                </button>
              )}

              <button
                type="button"
                className={styles.link}
                onClick={() => {
                  setStep('EMAIL');
                  setError(null);
                  setInfoMsg(null);
                }}
                style={{ fontSize: '0.8rem', color: '#64748B', marginTop: 4 }}
              >
                تعديل البريد الإلكتروني
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: NEW PASSWORD FORM */}
        {step === 'PASSWORD' && (
          <form onSubmit={handleResetPassword} className={styles.form}>
            <div className={styles.inputGroup}>
              <label className={styles.label} htmlFor="new-password">كلمة المرور الجديدة</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="new-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  className={styles.input}
                  placeholder="6 أحرف على الأقل"
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    setError(null);
                  }}
                  style={{ width: '100%', paddingLeft: '40px' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    left: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: '#94A3B8',
                    cursor: 'pointer'
                  }}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className={styles.inputGroup}>
              <label className={styles.label} htmlFor="confirm-password">تأكيد كلمة المرور الجديدة</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  className={styles.input}
                  placeholder="أعد كتابة كلمة المرور"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setError(null);
                  }}
                  style={{ width: '100%', paddingLeft: '40px' }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  style={{
                    position: 'absolute',
                    left: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: '#94A3B8',
                    cursor: 'pointer'
                  }}
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: 8, padding: '12px', fontWeight: 800 }}
              disabled={loading}
            >
              <span>{loading ? 'جاري حفظ كلمة المرور...' : 'حفظ كلمة المرور الجديدة'}</span>
            </button>
          </form>
        )}

        {/* STEP 4: SUCCESS VIEW */}
        {step === 'SUCCESS' && (
          <div className={styles.form}>
            <button
              type="button"
              className="btn btn-primary"
              style={{ width: '100%', padding: '12px', fontWeight: 800 }}
              onClick={() => navigateTo('login')}
            >
              <span>تسجيل الدخول الآن</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
