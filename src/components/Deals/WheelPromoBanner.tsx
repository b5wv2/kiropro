import React from 'react';
import { Sparkles, Trophy, ArrowLeft } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const WheelPromoBanner: React.FC = () => {
  const { navigateTo } = useAuth();

  return (
    <section className="section" style={{ padding: '24px 0' }}>
      <div className="container">
        <div style={{
          background: 'linear-gradient(135deg, #0F172A 0%, #1E1B4B 50%, #172554 100%)',
          borderRadius: 'var(--radius-xl)',
          border: '1.5px solid rgba(245, 158, 11, 0.4)',
          padding: 'clamp(24px, 4vw, 36px)',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5), 0 0 30px rgba(245, 158, 11, 0.15)',
          direction: 'rtl'
        }}>
          {/* Subtle Ambient Glow */}
          <div style={{
            position: 'absolute',
            top: -60,
            left: -60,
            width: 220,
            height: 220,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(245, 158, 11, 0.25) 0%, transparent 70%)',
            pointerEvents: 'none'
          }} />

          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 24,
            position: 'relative',
            zIndex: 1
          }}>
            <div style={{ maxWidth: 620 }}>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                background: 'rgba(245, 158, 11, 0.15)',
                color: '#F59E0B',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                padding: '4px 12px',
                borderRadius: 999,
                fontSize: '0.8rem',
                fontWeight: 800,
                marginBottom: 12
              }}>
                <Sparkles size={14} />
                <span>عجلة الحظ اليومية • سحب مجاني كل 24 ساعة</span>
              </div>

              <h3 style={{
                fontSize: 'clamp(1.4rem, 3vw, 1.9rem)',
                fontWeight: 900,
                color: '#FFFFFF',
                margin: '0 0 8px 0',
                lineHeight: 1.3
              }}>
                أدر العجلة واربح <span style={{ color: '#FBBF24' }}>خصومات فورية وقسائم مجانية</span>
              </h3>

              <p style={{
                color: '#CBD5E1',
                fontSize: '0.95rem',
                lineHeight: 1.6,
                margin: 0
              }}>
                كل حساب مسجل يحصل على محاولة مجانية واحدة يومياً تتجدد تلقائياً عند منتصف الليل. اختبر حظك واربح كوبونات خصم تصل إلى 5,000 ج.س أو 20% فوراً!
              </p>
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => navigateTo('wheel')}
                style={{
                  background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
                  color: '#0B0F19',
                  fontWeight: 900,
                  fontSize: '1.05rem',
                  padding: '14px 28px',
                  borderRadius: 14,
                  boxShadow: '0 8px 25px rgba(245, 158, 11, 0.4)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 10,
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                <Trophy size={18} />
                <span>أدر العجلة الآن مجاناً 🎡</span>
                <ArrowLeft size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default WheelPromoBanner;
