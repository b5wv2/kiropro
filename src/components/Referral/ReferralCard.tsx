import React, { useState, useEffect } from 'react';
import { 
  Gift, 
  Copy, 
  Check, 
  Users, 
  Share2, 
  TrendingUp, 
  Send, 
  Flame,
  CheckCircle2,
  Clock
} from 'lucide-react';
import { api } from '../../lib/api';
import { ReferralConfig, generateReferralCopy } from '../../utils/referralText';

interface FriendItem {
  id: string;
  status: 'PENDING' | 'COMPLETED' | 'CANCELLED';
  name: string;
  email: string;
  reward: number;
  currency: string;
  completedAt: string | null;
  createdAt: string;
}

interface UserReferralData {
  referralCode: string;
  shareUrl: string;
  stats: {
    totalReferred: number;
    successfulReferrals: number;
    totalEarned: number;
  };
  friends: FriendItem[];
  config: ReferralConfig;
}

export const ReferralCard: React.FC = () => {
  const [data, setData] = useState<UserReferralData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    let isMounted = true;
    api.get<UserReferralData>('/api/referral/my-details')
      .then((res) => {
        if (isMounted && res) {
          setData(res);
        }
      })
      .catch((err) => {
        console.warn('[ReferralCard] Failed to fetch user referral details:', err);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const copyToClipboard = (text: string, isLink: boolean) => {
    navigator.clipboard.writeText(text);
    if (isLink) {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } else {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2500);
    }
  };

  const copyObj = generateReferralCopy(data?.config);
  const code = data?.referralCode || 'KIROPRO';
  const shareUrl = data?.shareUrl || `${window.location.origin}/register?ref=${code}`;

  const shareText = encodeURIComponent(
    `🔥 ${copyObj.mainTitle}\n\n` +
    `استخدم كود الإحالة الخاص بي (${code}) أو سجل من خلال هذا الرابط للحصول على ${copyObj.formattedReferee} ${copyObj.currency} هدية ترحيبية:\n` +
    `${shareUrl}`
  );

  return (
    <div style={{
      background: 'linear-gradient(145deg, #0B0F19 0%, #111827 50%, #1e1b4b 100%)',
      borderRadius: 'var(--radius-xl)',
      border: '1.5px solid rgba(250, 204, 21, 0.35)',
      boxShadow: '0 20px 40px -15px rgba(0, 0, 0, 0.5), 0 0 25px rgba(250, 204, 21, 0.1)',
      color: '#FFFFFF',
      padding: 'clamp(20px, 4vw, 32px)',
      position: 'relative',
      overflow: 'hidden',
      marginBottom: '24px'
    }}>
      {/* Glow highlight */}
      <div style={{
        position: 'absolute',
        top: -60,
        right: -60,
        width: 200,
        height: 200,
        background: 'radial-gradient(circle, rgba(250, 204, 21, 0.25) 0%, transparent 70%)',
        pointerEvents: 'none'
      }} />

      {/* Top Banner Tag */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          background: 'rgba(250, 204, 21, 0.15)',
          border: '1px solid rgba(250, 204, 21, 0.4)',
          color: '#FACC15',
          borderRadius: 999,
          padding: '6px 14px',
          fontSize: '0.825rem',
          fontWeight: 800
        }}>
          <Gift size={15} />
          <span>برنامج مكافآت الأصدقاء</span>
          <Flame size={15} color="#f97316" />
        </div>

        {data?.config?.enabled === false && (
          <span style={{ fontSize: '0.75rem', background: 'rgba(239, 68, 68, 0.2)', color: '#fca5a5', padding: '4px 10px', borderRadius: 6, fontWeight: 700 }}>
            البرنامج متوقف مؤقتاً
          </span>
        )}
      </div>

      {/* Dynamic Titles & Copy */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{
          fontSize: 'clamp(1.4rem, 3.2vw, 2.1rem)',
          fontWeight: 900,
          color: '#FFFFFF',
          margin: '0 0 8px 0',
          lineHeight: 1.3,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap'
        }}>
          <span>{copyObj.mainTitle}</span>
        </h2>

        <h3 style={{
          fontSize: 'clamp(1.05rem, 2.2vw, 1.35rem)',
          fontWeight: 800,
          color: '#FACC15',
          margin: '0 0 12px 0'
        }}>
          {copyObj.subtitle}
        </h3>

        <p style={{
          color: '#CBD5E1',
          fontSize: 'clamp(0.9rem, 1.8vw, 1.025rem)',
          lineHeight: 1.7,
          maxWidth: 720,
          margin: 0
        }}>
          {copyObj.description}
        </p>
      </div>

      {/* Referral Code & Quick Share Box */}
      <div style={{
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: 'var(--radius-lg)',
        padding: '18px 20px',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        marginBottom: 24
      }}>
        {/* Code Section */}
        <div>
          <span style={{ fontSize: '0.75rem', color: '#94A3B8', fontWeight: 700, display: 'block', marginBottom: 4 }}>
            كود الإحالة الخاص بك:
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              fontFamily: 'monospace',
              fontSize: '1.45rem',
              fontWeight: 900,
              letterSpacing: 2,
              color: '#FACC15',
              background: 'rgba(0, 0, 0, 0.4)',
              padding: '6px 14px',
              borderRadius: 8,
              border: '1px dashed rgba(250, 204, 21, 0.5)'
            }}>
              {loading ? '...' : code}
            </span>

            <button
              type="button"
              onClick={() => copyToClipboard(code, false)}
              style={{
                background: copiedCode ? '#10B981' : '#FACC15',
                color: '#0B0F19',
                border: 'none',
                borderRadius: 8,
                padding: '9px 16px',
                fontWeight: 800,
                fontSize: '0.85rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                transition: 'all 0.2s ease'
              }}
            >
              {copiedCode ? <Check size={16} /> : <Copy size={16} />}
              <span>{copiedCode ? 'تم النسخ!' : 'نسخ الكود'}</span>
            </button>
          </div>
        </div>

        {/* Share buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => copyToClipboard(shareUrl, true)}
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              color: '#FFFFFF',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: 8,
              padding: '9px 14px',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            {copiedLink ? <Check size={16} color="#10B981" /> : <Share2 size={16} />}
            <span>{copiedLink ? 'تم نسخ الرابط!' : 'نسخ رابط الدعوة'}</span>
          </button>

          {/* WhatsApp Share */}
          <a
            href={`https://wa.me/?text=${shareText}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: '#25D366',
              color: '#FFFFFF',
              borderRadius: 8,
              padding: '9px 14px',
              fontWeight: 700,
              fontSize: '0.85rem',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <Send size={15} />
            <span>مشاركة واتساب</span>
          </a>
        </div>
      </div>

      {/* Stats Counter Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 14,
        marginBottom: 24
      }}>
        <div style={{
          background: 'rgba(0, 0, 0, 0.35)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 12,
          padding: '14px 16px',
          textAlign: 'center'
        }}>
          <span style={{ fontSize: '0.75rem', color: '#94A3B8', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontWeight: 700 }}>
            <Users size={14} color="#60A5FA" />
            الأصدقاء المسجلين
          </span>
          <span style={{ fontSize: '1.45rem', fontWeight: 900, color: '#FFFFFF', display: 'block', marginTop: 4 }}>
            {data?.stats?.totalReferred ?? 0}
          </span>
        </div>

        <div style={{
          background: 'rgba(0, 0, 0, 0.35)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 12,
          padding: '14px 16px',
          textAlign: 'center'
        }}>
          <span style={{ fontSize: '0.75rem', color: '#94A3B8', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontWeight: 700 }}>
            <CheckCircle2 size={14} color="#34D399" />
            الطلبات المكتملة
          </span>
          <span style={{ fontSize: '1.45rem', fontWeight: 900, color: '#34D399', display: 'block', marginTop: 4 }}>
            {data?.stats?.successfulReferrals ?? 0}
          </span>
        </div>

        <div style={{
          background: 'rgba(0, 0, 0, 0.35)',
          border: '1px solid rgba(250, 204, 21, 0.25)',
          borderRadius: 12,
          padding: '14px 16px',
          textAlign: 'center'
        }}>
          <span style={{ fontSize: '0.75rem', color: '#FACC15', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontWeight: 800 }}>
            <TrendingUp size={14} color="#FACC15" />
            إجمالي الأرباح المكتسبة
          </span>
          <span style={{ fontSize: '1.45rem', fontWeight: 900, color: '#FACC15', display: 'block', marginTop: 4 }}>
            +{(data?.stats?.totalEarned ?? 0).toLocaleString('en-US')} {copyObj.currency}
          </span>
        </div>
      </div>

      {/* 3 Step Visual Guide */}
      <div style={{
        background: 'rgba(255, 255, 255, 0.03)',
        borderRadius: 12,
        padding: '14px 18px',
        border: '1px solid rgba(255, 255, 255, 0.06)'
      }}>
        <span style={{ fontSize: '0.775rem', color: '#CBD5E1', fontWeight: 800, display: 'block', marginBottom: 10 }}>
          💡 كيف تكسب من برنامج الإحالة؟
        </span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, fontSize: '0.825rem', color: '#94A3B8' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <span style={{ background: '#FACC15', color: '#0B0F19', width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '0.75rem', flexShrink: 0 }}>1</span>
            <span>شارك كود الدعوة الخاص بك مع صاحبك.</span>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <span style={{ background: '#FACC15', color: '#0B0F19', width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '0.75rem', flexShrink: 0 }}>2</span>
            <span>صاحبك يسجل ويشحن أول طلب مؤهل.</span>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <span style={{ background: '#FACC15', color: '#0B0F19', width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '0.75rem', flexShrink: 0 }}>3</span>
            <span style={{ color: '#FACC15', fontWeight: 700 }}>
              أنت تاخد {copyObj.formattedReferrer} وهو ياخد {copyObj.formattedReferee} {copyObj.currency}!
            </span>
          </div>
        </div>
      </div>

      {/* Friends History List (If any) */}
      {data?.friends && data.friends.length > 0 && (
        <div style={{ marginTop: 20, borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: 16 }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#E2E8F0', display: 'block', marginBottom: 10 }}>
            سجل أصدقائك المدعوين ({data.friends.length}):
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 180, overflowY: 'auto' }}>
            {data.friends.map(f => (
              <div 
                key={f.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'rgba(0, 0, 0, 0.25)',
                  padding: '8px 12px',
                  borderRadius: 8,
                  fontSize: '0.8rem'
                }}
              >
                <div>
                  <span style={{ fontWeight: 700, color: '#FFFFFF' }}>{f.name}</span>
                  <span style={{ color: '#64748B', marginRight: 8, fontSize: '0.75rem' }}>({f.email})</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {f.status === 'COMPLETED' ? (
                    <span style={{ color: '#10B981', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700 }}>
                      <CheckCircle2 size={14} />
                      <span>+{f.reward.toLocaleString('en-US')} {f.currency}</span>
                    </span>
                  ) : (
                    <span style={{ color: '#F59E0B', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
                      <Clock size={14} />
                      <span>بانتظار أول طلب</span>
                    </span>
                  )}
                  <span style={{ color: '#64748B', fontSize: '0.7rem' }}>
                    {new Date(f.createdAt).toLocaleDateString('ar-EG')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
