import React, { useState } from 'react';
import { usePartner } from '../../context/PartnerContext';
import { 
  User, 
  Mail, 
  Phone, 
  Building, 
  Lock, 
  Award, 
  ShieldCheck, 
  CheckCircle, 
  AlertCircle,
  Key
} from 'lucide-react';

export const PartnerProfilePage: React.FC = () => {
  const { partner, nextLevel, refreshProfile, partnerFetch } = usePartner();

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submittingPassword, setSubmittingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMsg(null);

    if (newPassword.length < 8) {
      setPasswordMsg({ type: 'error', text: 'كلمة المرور يجب أن لا تقل عن 8 أحرف وأرقام.' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: 'error', text: 'كلمتا المرور غير متطابقتين.' });
      return;
    }

    try {
      setSubmittingPassword(true);
      await partnerFetch('/api/partner/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword })
      });

      setPasswordMsg({ type: 'success', text: 'تم تحديث كلمة المرور بنجاح!' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      await refreshProfile();
    } catch (err: any) {
      setPasswordMsg({ type: 'error', text: err.message || 'فشل تحديث كلمة المرور' });
    } finally {
      setSubmittingPassword(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <User size={24} color="#f59e0b" />
          <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900 }}>الملف التجاري وإعدادات الأمان</h2>
        </div>
        <p style={{ margin: '4px 0 0 0', color: '#94a3b8', fontSize: '0.88rem' }}>
          بيانات حساب الشريك التجاري المعتمد ومستوى العضوية وكلمة المرور
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 24 }}>
        {/* Left Column: Business & Account Info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Profile Card */}
          <div className="partner-card">
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.15rem', fontWeight: 900, color: '#fff' }}>
              معلومات التاجر
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                background: 'rgba(255, 255, 255, 0.03)',
                padding: '12px 14px',
                borderRadius: 8
              }}>
                <User size={18} color="#94a3b8" />
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block' }}>اسم الشريك المسؤول</span>
                  <span style={{ fontWeight: 800, color: '#fff' }}>{partner?.name}</span>
                </div>
              </div>

              {partner?.businessName && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  background: 'rgba(255, 255, 255, 0.03)',
                  padding: '12px 14px',
                  borderRadius: 8
                }}>
                  <Building size={18} color="#94a3b8" />
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block' }}>اسم المتجر / النشاط التجاري</span>
                    <span style={{ fontWeight: 800, color: '#fbbf24' }}>{partner.businessName}</span>
                  </div>
                </div>
              )}

              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                background: 'rgba(255, 255, 255, 0.03)',
                padding: '12px 14px',
                borderRadius: 8
              }}>
                <Mail size={18} color="#94a3b8" />
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block' }}>البريد الإلكتروني المعتمد</span>
                  <span style={{ fontWeight: 700, color: '#cbd5e1', fontFamily: 'Outfit, monospace' }}>{partner?.email}</span>
                </div>
              </div>

              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                background: 'rgba(255, 255, 255, 0.03)',
                padding: '12px 14px',
                borderRadius: 8
              }}>
                <Phone size={18} color="#94a3b8" />
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block' }}>رقم الهاتف / الواتساب</span>
                  <span style={{ fontWeight: 700, color: '#cbd5e1', fontFamily: 'Outfit, monospace' }}>
                    {partner?.phone || 'غير مسجل'}
                  </span>
                </div>
              </div>

              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                background: 'rgba(255, 255, 255, 0.03)',
                padding: '12px 14px',
                borderRadius: 8
              }}>
                <ShieldCheck size={18} color={partner?.status === 'ACTIVE' ? '#10b981' : '#f43f5e'} />
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block' }}>حالة الحساب التجاري</span>
                  <span style={{ fontWeight: 900, color: partner?.status === 'ACTIVE' ? '#10b981' : '#f43f5e' }}>
                    {partner?.status === 'ACTIVE' ? 'نشط ومعتمد ✓' : 'موقف مؤقتاً'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Tier & Rewards Card */}
          <div className="partner-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <Award size={20} color="#f59e0b" />
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900, color: '#fff' }}>
                رتبة التاجر والمكافآت
              </h3>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <span style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block' }}>المستوى الحالي</span>
                <span style={{ fontSize: '1.4rem', fontWeight: 900, color: partner?.badgeColor || '#fbbf24' }}>
                  {partner?.levelArabicName || 'التاجر المعتمد'}
                </span>
              </div>
              {partner?.discountPercent ? (
                <div style={{
                  background: 'rgba(245, 158, 11, 0.15)',
                  color: '#fbbf24',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  padding: '6px 12px',
                  borderRadius: 8,
                  fontWeight: 900,
                  fontSize: '0.85rem'
                }}>
                  خصم إضافي {partner.discountPercent}%
                </div>
              ) : null}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: 12, borderRadius: 8 }}>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block' }}>نقاط الولاء</span>
                <span style={{ fontSize: '1.2rem', fontWeight: 900, color: '#38bdf8', fontFamily: 'Outfit, sans-serif' }}>
                  {partner?.totalPoints || 0} نقطة
                </span>
              </div>
              <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: 12, borderRadius: 8 }}>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block' }}>إجمالي المشتريات</span>
                <span style={{ fontSize: '1.2rem', fontWeight: 900, color: '#10b981', fontFamily: 'Outfit, sans-serif' }}>
                  ${Number(partner?.totalPurchasesUsd || 0).toFixed(2)}
                </span>
              </div>
            </div>

            {nextLevel?.nextLevelArabicName && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#94a3b8', marginBottom: 6 }}>
                  <span>الترقية إلى {nextLevel.nextLevelArabicName}</span>
                  <span>باقي: ${Number(nextLevel.remainingSpend || 0).toFixed(0)}</span>
                </div>
                <div style={{ height: 8, background: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${Math.min(100, Math.max(0, nextLevel.progressPercent || 0))}%`,
                    background: 'var(--partner-gold-gradient)',
                    borderRadius: 4
                  }} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Password Change Form */}
        <div className="partner-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Key size={20} color="#f59e0b" />
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900, color: '#fff' }}>
              تغيير كلمة المرور
            </h3>
          </div>

          <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: 20 }}>
            احرص على استخدام كلمة مرور قوية تحتوي على أرقام وحروف لتأمين محفظتك المالية وعمليات الشحن.
          </p>

          {passwordMsg && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: 12,
              borderRadius: 8,
              marginBottom: 20,
              fontSize: '0.85rem',
              fontWeight: 700,
              background: passwordMsg.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
              color: passwordMsg.type === 'success' ? '#34d399' : '#fb7185',
              border: `1px solid ${passwordMsg.type === 'success' ? '#10b981' : '#f43f5e'}`
            }}>
              {passwordMsg.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
              <span>{passwordMsg.text}</span>
            </div>
          )}

          <form onSubmit={handlePasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#cbd5e1', marginBottom: 6, fontWeight: 700 }}>
                كلمة المرور الحالية
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
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
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
                كلمة المرور الجديدة (8 خانات على الأقل)
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
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
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
                تأكيد كلمة المرور الجديدة
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
              disabled={submittingPassword}
              className="btn-partner-primary"
              style={{ padding: '14px', fontSize: '1rem', marginTop: 8 }}
            >
              {submittingPassword ? 'جاري الحفظ...' : 'تحديث كلمة المرور'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
