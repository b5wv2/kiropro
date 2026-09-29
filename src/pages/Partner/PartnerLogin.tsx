import React, { useState } from 'react';
import { usePartner } from '../../context/PartnerContext';
import { Lock, Mail, ArrowRight, ShieldCheck, AlertCircle } from 'lucide-react';

export const PartnerLogin: React.FC = () => {
  const { login } = usePartner();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!email || !password) {
      setErrorMessage('يرجى إدخال البريد الإلكتروني وكلمة المرور.');
      return;
    }

    try {
      setSubmitting(true);
      const res = await login(email.trim(), password);
      if (!res.success) {
        setErrorMessage(res.error || 'بيانات الدخول غير صحيحة.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'فشل الاتصال بالخادم.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="partner-portal-shell" style={{ justifyContent: 'center', alignItems: 'center', padding: 20 }}>
      <div style={{ maxWidth: 460, width: '100%' }}>
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            background: 'linear-gradient(135deg, #f59e0b, #b45309)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#0b0f19',
            fontWeight: 900,
            fontSize: '1.8rem',
            boxShadow: '0 0 25px rgba(245, 158, 11, 0.4)',
            marginBottom: 16
          }}>
            K
          </div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#fff', margin: '0 0 6px 0' }}>
            KIROPRO <span style={{ color: '#fbbf24' }}>PARTNER</span>
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem', margin: 0 }}>
            بوابة تسجيل الدخول للتجار والشركاء المعتمدين
          </p>
        </div>

        {/* Card */}
        <div className="partner-card partner-card-glow" style={{ background: 'rgba(15, 23, 42, 0.95)' }}>
          {errorMessage && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: 12,
              borderRadius: 8,
              marginBottom: 20,
              fontSize: '0.85rem',
              fontWeight: 700,
              background: 'rgba(244, 63, 94, 0.15)',
              color: '#fb7185',
              border: '1px solid rgba(244, 63, 94, 0.3)'
            }}>
              <AlertCircle size={18} style={{ flexShrink: 0 }} />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#cbd5e1', marginBottom: 6, fontWeight: 700 }}>
                البريد الإلكتروني التجاري
              </label>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: 8,
                padding: '12px 14px'
              }}>
                <Mail size={18} color="#94a3b8" />
                <input
                  type="email"
                  required
                  dir="ltr"
                  placeholder="partner@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: '#fff',
                    fontSize: '0.95rem',
                    width: '100%',
                    fontFamily: 'inherit'
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#cbd5e1', marginBottom: 6, fontWeight: 700 }}>
                كلمة المرور
              </label>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: 8,
                padding: '12px 14px'
              }}>
                <Lock size={18} color="#94a3b8" />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: '#fff',
                    fontSize: '0.95rem',
                    width: '100%',
                    fontFamily: 'inherit'
                  }}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="btn-partner-primary"
              style={{ padding: '14px', fontSize: '1rem', marginTop: 6 }}
            >
              {submitting ? 'جاري التحقق...' : 'تسجيل الدخول للمنصة'}
            </button>
          </form>

          {/* Info Notice */}
          <div style={{
            marginTop: 24,
            paddingTop: 18,
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: '0.8rem',
            color: '#94a3b8'
          }}>
            <ShieldCheck size={20} color="#fbbf24" style={{ flexShrink: 0 }} />
            <span>
              الانضمام إلى شبكة تجار KIROPRO يتطلب اعتماداً مسبقاً من الإدارة. إذا كنت تاجراً جديداً تواصل معنا لإنشاء حسابك وتحديد أسعارك الخاصة.
            </span>
          </div>
        </div>

        {/* Back to main store */}
        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <a
            href="https://kiropro.store"
            style={{ color: '#64748b', fontSize: '0.85rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <span>العودة إلى متجر KIROPRO الرئيسي</span>
            <ArrowRight size={14} />
          </a>
        </div>
      </div>
    </div>
  );
};
