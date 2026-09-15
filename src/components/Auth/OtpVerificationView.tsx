import React, { useState, useEffect, useRef } from 'react';
import styles from '../../pages/Auth/Auth.module.css';
import { useAuth } from '../../context/AuthContext';
import { Mail, Clock, RefreshCw, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react';

interface OtpVerificationViewProps {
  email: string;
  initialCooldown?: number;
  onChangeEmail: () => void;
  onSuccess?: () => void;
}

export const OtpVerificationView: React.FC<OtpVerificationViewProps> = ({
  email,
  initialCooldown = 60,
  onChangeEmail,
  onSuccess
}) => {
  const { verifyEmail, resendOtp } = useAuth();

  // 6 digits state
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  
  // Countdown timer for resend (default 60s)
  const [countdown, setCountdown] = useState<number>(initialCooldown);
  const [isResending, setIsResending] = useState(false);

  // Auto focus first cell on mount
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  // Timer countdown interval
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  // Helper to mask email: e.g. ahmed@gmail.com -> a***@gmail.com
  const maskEmail = (rawEmail: string): string => {
    if (!rawEmail || !rawEmail.includes('@')) return rawEmail;
    const [name, domain] = rawEmail.split('@');
    if (!name || name.length <= 1) return `*@${domain}`;
    return `${name.charAt(0)}***@${domain}`;
  };

  const handleDigitChange = (index: number, val: string) => {
    // Only accept numbers
    const cleanVal = val.replace(/\D/g, '');
    if (!cleanVal) {
      const newDigits = [...digits];
      newDigits[index] = '';
      setDigits(newDigits);
      return;
    }

    // Single digit input
    const singleDigit = cleanVal.slice(-1);
    const newDigits = [...digits];
    newDigits[index] = singleDigit;
    setDigits(newDigits);
    setError(null);

    // Auto advance to next input
    if (index < 5) {
      inputRefs.current[index + 1]?.focus();
    } else {
      // All 6 cells filled -> trigger auto submit
      const fullCode = newDigits.join('');
      if (fullCode.length === 6) {
        submitOtp(fullCode);
      }
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!digits[index] && index > 0) {
        // Move to previous cell on backspace if current cell is already empty
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

    // Focus last filled or 6th cell
    const nextFocus = Math.min(pastedData.length, 5);
    inputRefs.current[nextFocus]?.focus();

    // Auto submit if full 6 digits were pasted
    if (pastedData.length >= 6) {
      submitOtp(newDigits.join(''));
    }
  };

  const submitOtp = async (codeToVerify: string) => {
    if (codeToVerify.length !== 6) {
      setError('يرجى إدخال رمز التحقق كاملاً المكون من 6 أرقام.');
      return;
    }

    setLoading(true);
    setError(null);

    const res = await verifyEmail(email, codeToVerify);
    setLoading(false);

    if (res.success) {
      if (onSuccess) {
        onSuccess();
      }
    } else {
      setError(res.error || 'رمز التحقق غير صحيح أو منتهي الصلاحية.');
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitOtp(digits.join(''));
  };

  const handleResend = async () => {
    if (countdown > 0 || isResending) return;

    setIsResending(true);
    setError(null);
    setSuccessMsg(null);

    const res = await resendOtp(email);
    setIsResending(false);

    if (res.success) {
      setSuccessMsg('تم إرسال رمز تحقق جديد إلى بريدك الإلكتروني.');
      setCountdown(60);
      setDigits(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
      setTimeout(() => setSuccessMsg(null), 5000);
    } else {
      setError(res.error || 'فشل إعادة إرسال الرمز.');
      if (res.cooldownRemaining) {
        setCountdown(res.cooldownRemaining);
      }
    }
  };

  return (
    <div className={styles.authWrapper}>
      <div className={styles.authCard}>
        {/* Brand Header */}
        <div style={{ textAlign: 'center' }}>
          <div className={styles.brandBadge}>
            <span className={styles.brandKiro}>KIRO</span>
            <span className={styles.brandPro}>PRO</span>
          </div>

          <div style={{ 
            width: '48px', 
            height: '48px', 
            borderRadius: '50%', 
            background: '#FEF9C3', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            margin: '0 auto 12px',
            color: '#CA8A04'
          }}>
            <Mail size={24} />
          </div>

          <h1 className={styles.title} style={{ fontSize: '1.45rem' }}>
            تحقق من بريدك الإلكتروني
          </h1>
          <p className={styles.subtitle} style={{ marginBottom: 4 }}>
            أرسلنا رمز تحقق مكون من 6 أرقام إلى:
          </p>
          <div style={{ marginTop: 4 }}>
            <span className={styles.maskedEmail}>
              {maskEmail(email)}
            </span>
          </div>
        </div>

        {/* Notifications */}
        {error && (
          <div className={styles.errorBanner}>
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div style={{
            background: '#ECFDF5',
            border: '1px solid #10B981',
            color: '#065F46',
            borderRadius: 'var(--radius-md)',
            padding: '10px 14px',
            fontSize: '0.85rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            textAlign: 'right',
            direction: 'rtl'
          }}>
            <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
            <span>{successMsg}</span>
          </div>
        )}

        {/* 6 Cells OTP Form */}
        <form onSubmit={handleManualSubmit} className={styles.form}>
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
                onChange={(e) => handleDigitChange(idx, e.target.value)}
                onKeyDown={(e) => handleKeyDown(idx, e)}
                onPaste={handlePaste}
                disabled={loading}
                className={`${styles.otpCell} ${digit ? styles.otpCellFilled : ''}`}
                autoComplete="one-time-code"
                aria-label={`Digit ${idx + 1}`}
              />
            ))}
          </div>

          <p style={{ textAlign: 'center', fontSize: '0.78rem', color: '#64748b', margin: '0 0 4px 0' }}>
            ⏱️ الرمز صالح لمدة <strong>10 دقائق</strong>. أدخل الأرقام الستة للمتابعة.
          </p>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', padding: '12px', fontWeight: 800, marginTop: 4 }}
            disabled={loading || digits.join('').length !== 6}
          >
            {loading ? (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <RefreshCw size={16} className="animate-spin" />
                جاري التحقق من الرمز...
              </span>
            ) : (
              <span>تأكيد الحساب ومتابعة</span>
            )}
          </button>
        </form>

        {/* Resend OTP & Countdown */}
        <div className={styles.timerBox}>
          {countdown > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#64748b', fontWeight: 600 }}>
              <Clock size={15} />
              <span>إعادة إرسال الرمز بعد <strong>{countdown} ثانية</strong></span>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleResend}
              disabled={isResending}
              style={{
                background: 'none',
                border: 'none',
                color: '#0B0F19',
                fontWeight: 800,
                fontSize: '0.875rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                textDecoration: 'underline'
              }}
            >
              <RefreshCw size={15} className={isResending ? 'animate-spin' : ''} />
              <span>{isResending ? 'جاري الإرسال...' : 'إعادة إرسال رمز التحقق'}</span>
            </button>
          )}
        </div>

        {/* Change Email Button */}
        <div style={{ 
          borderTop: '1px solid var(--border-subtle)', 
          paddingTop: 16, 
          textAlign: 'center',
          marginTop: 4
        }}>
          <button
            type="button"
            onClick={onChangeEmail}
            style={{
              background: 'none',
              border: 'none',
              color: '#64748b',
              fontSize: '0.85rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <ArrowRight size={14} />
            <span>أدخلت بريداً خاطئاً؟ تغيير البريد الإلكتروني</span>
          </button>
        </div>
      </div>
    </div>
  );
};
