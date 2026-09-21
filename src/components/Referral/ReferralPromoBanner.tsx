import React, { useEffect, useState } from 'react';
import { Gift, Flame, ArrowLeft } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { ReferralConfig, generateReferralCopy } from '../../utils/referralText';

export const ReferralPromoBanner: React.FC = () => {
  const { user, navigateTo } = useAuth();
  const [config, setConfig] = useState<ReferralConfig | null>(null);

  useEffect(() => {
    let isMounted = true;
    api.get<ReferralConfig>('/api/referral/config')
      .then((cfg) => {
        if (isMounted && cfg) {
          setConfig(cfg);
        }
      })
      .catch((err) => {
        console.warn('[ReferralPromoBanner] Failed to fetch referral config:', err);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // If disabled, don't show the promo banner on home
  if (config && config.enabled === false) {
    return null;
  }

  const copy = generateReferralCopy(config);

  const handleAction = () => {
    if (user) {
      navigateTo('account');
    } else {
      navigateTo('register');
    }
  };

  return (
    <section className="section" style={{ padding: '24px 0' }}>
      <div className="container">
        <div style={{
          background: 'linear-gradient(135deg, #0B0F19 0%, #1e1b4b 50%, #0f172a 100%)',
          borderRadius: 'var(--radius-xl)',
          border: '1.5px solid rgba(250, 204, 21, 0.4)',
          padding: 'clamp(24px, 4vw, 36px)',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: '0 20px 45px -10px rgba(0, 0, 0, 0.6), 0 0 30px rgba(250, 204, 21, 0.15)'
        }}>
          {/* Subtle decorative glow */}
          <div style={{
            position: 'absolute',
            top: -50,
            left: -50,
            width: 180,
            height: 180,
            background: 'radial-gradient(circle, rgba(250, 204, 21, 0.2) 0%, transparent 70%)',
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
            <div style={{ flex: '1 1 500px' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(250, 204, 21, 0.15)', border: '1px solid rgba(250, 204, 21, 0.4)', color: '#FACC15', borderRadius: 999, padding: '4px 12px', fontSize: '0.8rem', fontWeight: 800, marginBottom: 12 }}>
                <Gift size={14} />
                <span>مكافأة دعوة الأصدقاء</span>
                <Flame size={14} color="#f97316" />
              </div>

              <h2 style={{
                fontSize: 'clamp(1.4rem, 3.2vw, 2.2rem)',
                fontWeight: 900,
                color: '#FFFFFF',
                margin: '0 0 6px 0',
                lineHeight: 1.3
              }}>
                {copy.mainTitle}
              </h2>

              <h3 style={{
                fontSize: 'clamp(1rem, 2vw, 1.25rem)',
                fontWeight: 800,
                color: '#FACC15',
                margin: '0 0 10px 0'
              }}>
                {copy.subtitle}
              </h3>

              <p style={{
                color: '#CBD5E1',
                fontSize: 'clamp(0.875rem, 1.6vw, 0.975rem)',
                lineHeight: 1.65,
                margin: 0,
                maxWidth: 680
              }}>
                {copy.description}
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
              <button
                type="button"
                onClick={handleAction}
                className="btn btn-primary"
                style={{
                  padding: '14px 28px',
                  fontSize: '1rem',
                  fontWeight: 900,
                  boxShadow: '0 8px 25px rgba(250, 204, 21, 0.4)',
                  whiteSpace: 'nowrap'
                }}
              >
                <span>{user ? 'عرض كود الإحالة الخاص بك' : 'احصل على كودك وابدأ الربح'}</span>
                <ArrowLeft size={18} />
              </button>
              <span style={{ fontSize: '0.75rem', color: '#94A3B8', fontWeight: 600 }}>
                مكافأة فورية في رصيد المحفظة للطرفين
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
