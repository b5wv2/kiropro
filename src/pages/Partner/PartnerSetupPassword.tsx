import React, { useState, useEffect } from 'react';
import { usePartner } from '../../context/PartnerContext';
import { KeyRound, CheckCircle, AlertCircle, Lock } from 'lucide-react';
import { BASE_URL } from '../../lib/api';

export const PartnerSetupPassword: React.FC = () => {
  const { refreshProfile } = usePartner();

  const [token, setToken] = useState<string>('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    // Extract token from URL search params or hash
    const params = new URLSearchParams(window.location.search);
    const t = params.get('token');
    if (t) {
      setToken(t);
    } else {
      setStatus({
        type: 'error',
        message: 'رابط تعيين كلمة المرور غير صالح أو مفقود. يرجى استخدام الرابط المستلم في بريدك الإلكتروني.'
      });
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);

    if (!token) {
      setStatus({ type: 'error', message: 'رمز التفعيل غير موجود.' });
      return;
    }

    if (password.length < 8) {
      setStatus({ type: 'error', message: 'كلمة المرور يجب أن لا تقل عن 8 أحرف وأرقام.' });
      return;
    }

    if (password !== confirmPassword) {
      setStatus({ type: 'error', message: 'كلمتا المرور غير متطابقتين.' });
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch(`${BASE_URL}/api/partner/setup-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token, newPassword: password })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'تعذر تعيين كلمة المرور.');
      }

      // Save token if returned
      if (data.token) {
        try {
          localStorage.setItem('partner_token', data.token);
        } catch {}
      }

      setStatus({
        type: 'success',
        message: 'تم تعيين كلمة المرور بنجاح! جاري تحويلك إلى لوحة التحكم...'
      });

      setTimeout(async () => {
        // Clear token param from URL without reload
        const newUrl = window.location.pathname;
        window.history.replaceState({}, '', newUrl);
        await refreshProfile();
        // Redirect to partner dashboard
        window.location.href = window.location.origin + (window.location.pathname.startsWith('/partner') ? '/partner' : '');
      }, 1500);
    } catch (err: any) {
      setStatus({
        type: 'error',
        message: err.message || 'حدث خطأ أثناء تعيين كلمة المرور.'
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="partner-portal-shell" style={{ justifyContent: 'center', alignItems: 'center', padding: 20 }}>
      <div style={{ maxWidth: 460, width: '100%' }}>
        {/* Brand */}
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
            <KeyRound size={28} />
          </div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#fff', margin: '0 0 6px 0' }}>
            تفعيل حساب الشريك
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem', margin: 0 }}>
            قم بتعيين كلمة مرور آمنة لحسابك التجاري للبدء في استخدام المنصة
          </p>
        </div>

        {/* Card */}
        <div className="partner-card partner-card-glow" style={{ background: 'rgba(15, 23, 42, 0.95)' }}>
          {status && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: 14,
              borderRadius: 8,
              marginBottom: 20,
              fontSize: '0.88rem',
              fontWeight: 700,
              background: status.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
              color: status.type === 'success' ? '#34d399' : '#fb7185',
              border: `1px solid ${status.type === 'success' ? '#10b981' : '#f43f5e'}`
            }}>
              {status.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
              <span>{status.message}</span>
            </div>
          )}

          {status?.type !== 'success' && (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#cbd5e1', marginBottom: 6, fontWeight: 700 }}>
                  كلمة المرور الجديدة
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
                <span style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 4, display: 'block' }}>
                  يجب أن تحتوي على 8 خانات على الأقل
                </span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#cbd5e1', marginBottom: 6, fontWeight: 700 }}>
                  تأكيد كلمة المرور
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
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
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
                disabled={submitting || !token}
                className="btn-partner-primary"
                style={{ padding: '14px', fontSize: '1rem', marginTop: 6 }}
              >
                {submitting ? 'جاري الحفظ والتفعيل...' : 'حفظ كلمة المرور والدخول'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
