import React, { useEffect, useState } from 'react';
import { 
  Trophy, 
  Copy, 
  Check, 
  Share2, 
  HelpCircle,
  RefreshCw,
  Sparkles
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';

interface PublicLeaderboardItem {
  rank: number;
  badge: string | null;
  displayName: string;
  referralCode: string;
  qualifiedReferrals: number;
  totalReferrals: number;
}

interface UserRankData {
  hasRank: boolean;
  currentRank: number | null;
  totalReferrals: number;
  qualifiedReferrals: number;
  referralCode: string;
  neededToOvertake: number;
  targetRank: number | null;
  message: string;
}

export const LeaderboardPage: React.FC = () => {
  const { isAuthenticated, navigateTo } = useAuth();

  const [leaderboard, setLeaderboard] = useState<PublicLeaderboardItem[]>([]);
  const [userRank, setUserRank] = useState<UserRankData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const lbPromise = api.get<PublicLeaderboardItem[]>('/api/referral/leaderboard?limit=50');
      const rankPromise = isAuthenticated 
        ? api.get<UserRankData>('/api/referral/my-rank').catch(() => null)
        : Promise.resolve(null);

      const [lbData, rankData] = await Promise.all([lbPromise, rankPromise]);
      setLeaderboard(lbData || []);
      setUserRank(rankData || null);
    } catch (err) {
      console.error('[LeaderboardPage] Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [isAuthenticated]);

  const copyToClipboard = (text: string, isLink: boolean) => {
    navigator.clipboard.writeText(text);
    if (isLink) {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } else {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const top1 = leaderboard.find(item => item.rank === 1);
  const top2 = leaderboard.find(item => item.rank === 2);
  const top3 = leaderboard.find(item => item.rank === 3);
  const restLeaderboard = leaderboard.filter(item => item.rank > 3);

  const originUrl = typeof window !== 'undefined' ? window.location.origin : 'https://kiropro.store';
  const myShareUrl = userRank?.referralCode ? `${originUrl}/register?ref=${userRank.referralCode}` : '';

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px 16px 60px' }} dir="rtl">
      {/* Header Banner */}
      <div 
        style={{
          background: 'linear-gradient(135deg, #0B0F19 0%, #1E1B4B 50%, #0F172A 100%)',
          borderRadius: '24px',
          padding: '40px 24px',
          textAlign: 'center',
          color: '#FFFFFF',
          position: 'relative',
          overflow: 'hidden',
          marginBottom: '32px',
          border: '1px solid rgba(250, 204, 21, 0.2)',
          boxShadow: '0 20px 40px -15px rgba(0, 0, 0, 0.5)'
        }}
      >
        {/* Glow Effects */}
        <div style={{
          position: 'absolute',
          top: '-20%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '350px',
          height: '200px',
          background: 'radial-gradient(circle, rgba(234, 179, 8, 0.25) 0%, transparent 70%)',
          pointerEvents: 'none'
        }} />

        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(234, 179, 8, 0.15)', border: '1px solid rgba(234, 179, 8, 0.3)', borderRadius: '30px', padding: '6px 16px', color: '#FACC15', fontSize: '0.85rem', fontWeight: 800, marginBottom: '16px' }}>
          <Sparkles size={16} />
          <span>مسابقة وتحدي الإحالات الرسمي</span>
        </div>

        <h1 style={{ fontSize: '2.2rem', fontWeight: 900, margin: '0 0 12px 0', letterSpacing: '-0.5px' }}>
          🏆 لوحة المتصدرين (Referral Leaderboard)
        </h1>
        <p style={{ fontSize: '1rem', color: '#94A3B8', maxWidth: '600px', margin: '0 auto 20px', lineHeight: 1.6 }}>
          ادعُ أصدقاءك للتسجيل والشحن في KIROPRO، واكسب المكافآت المالية وتصدر قائمة الشرف للمنافسة على جوائز المسابقة!
        </p>

        <button
          type="button"
          onClick={fetchData}
          style={{
            background: 'rgba(255, 255, 255, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            color: '#FFFFFF',
            borderRadius: '12px',
            padding: '8px 18px',
            fontSize: '0.85rem',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          <span>تحديث الترتيب الحي</span>
        </button>
      </div>

      {/* Logged-In User Position Card */}
      {isAuthenticated && userRank && (
        <div
          style={{
            background: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)',
            borderRadius: '20px',
            padding: '24px',
            marginBottom: '32px',
            border: '1px solid rgba(250, 204, 21, 0.3)',
            color: '#FFFFFF',
            boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 48,
                height: 48,
                borderRadius: '14px',
                background: 'linear-gradient(135deg, #EAB308 0%, #CA8A04 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#0B0F19',
                fontWeight: 900,
                fontSize: '1.2rem'
              }}>
                {userRank.hasRank ? `#${userRank.currentRank}` : '—'}
              </div>

              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900 }}>
                  ترتيبي الحالي في المسابقة: {userRank.hasRank ? <span style={{ color: '#FACC15' }}>المركز #{userRank.currentRank}</span> : <span style={{ color: '#94A3B8' }}>غير مصنف بعد</span>}
                </h3>
                <div style={{ fontSize: '0.85rem', color: '#94A3B8', marginTop: 2 }}>
                  {userRank.message}
                </div>
              </div>
            </div>

            {/* Quick Copy Link */}
            {userRank.referralCode && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => copyToClipboard(userRank.referralCode, false)}
                  style={{
                    background: '#334155',
                    border: '1px solid #475569',
                    borderRadius: '10px',
                    padding: '8px 14px',
                    color: '#F8FAFC',
                    fontSize: '0.85rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  {copiedCode ? <Check size={14} color="#4ADE80" /> : <Copy size={14} />}
                  <span>كودي: {userRank.referralCode}</span>
                </button>

                <button
                  type="button"
                  onClick={() => copyToClipboard(myShareUrl, true)}
                  style={{
                    background: '#FACC15',
                    border: 'none',
                    borderRadius: '10px',
                    padding: '8px 16px',
                    color: '#0B0F19',
                    fontSize: '0.85rem',
                    fontWeight: 900,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  {copiedLink ? <Check size={14} /> : <Share2 size={14} />}
                  <span>نسخ رابط دعوتي</span>
                </button>
              </div>
            )}
          </div>

          {/* Stats Bar */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, background: 'rgba(0,0,0,0.2)', padding: '14px', borderRadius: '12px' }}>
            <div>
              <span style={{ fontSize: '0.75rem', color: '#94A3B8', display: 'block' }}>إجمالي الإحالات</span>
              <strong style={{ fontSize: '1.25rem', color: '#F8FAFC' }}>{userRank.totalReferrals}</strong>
            </div>

            <div>
              <span style={{ fontSize: '0.75rem', color: '#94A3B8', display: 'block' }}>الإحالات المؤهلة</span>
              <strong style={{ fontSize: '1.25rem', color: '#4ADE80' }}>{userRank.qualifiedReferrals}</strong>
            </div>

            <div>
              <span style={{ fontSize: '0.75rem', color: '#94A3B8', display: 'block' }}>لتجاوز المركز السابق</span>
              <strong style={{ fontSize: '1.25rem', color: '#FACC15' }}>
                {userRank.currentRank === 1 ? 'أنت الأول! 🏆' : `${userRank.neededToOvertake} إحالة مؤهلة`}
              </strong>
            </div>
          </div>
        </div>
      )}

      {/* Guest Invitation CTA */}
      {!isAuthenticated && (
        <div
          style={{
            background: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)',
            borderRadius: '18px',
            padding: '20px 24px',
            marginBottom: '32px',
            border: '1px solid #334155',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 16
          }}
        >
          <div>
            <h4 style={{ margin: '0 0 4px 0', fontSize: '1.05rem', color: '#F8FAFC', fontWeight: 800 }}>
              هل تريد معرفة ترتيبك في المسابقة والمنافسة على المراكز الأولى؟
            </h4>
            <p style={{ margin: 0, fontSize: '0.82rem', color: '#94A3B8' }}>
              سجّل دخولك الآن واحصل على كود الدعوة الخاص بك لتبدأ بمشاركة أصدقائك وجني النقاط.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={() => navigateTo('login')}
              style={{
                background: '#FACC15',
                color: '#0B0F19',
                border: 'none',
                borderRadius: '10px',
                padding: '8px 20px',
                fontSize: '0.85rem',
                fontWeight: 900,
                cursor: 'pointer'
              }}
            >
              تسجيل الدخول
            </button>
            <button
              type="button"
              onClick={() => navigateTo('register')}
              style={{
                background: 'transparent',
                color: '#F8FAFC',
                border: '1px solid #475569',
                borderRadius: '10px',
                padding: '8px 16px',
                fontSize: '0.85rem',
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              إنشاء حساب جديد
            </button>
          </div>
        </div>
      )}

      {/* Top 3 Podium (منصة التتويج) */}
      <div style={{ marginBottom: '36px' }}>
        <h3 style={{ fontSize: '1.3rem', fontWeight: 900, color: '#0B0F19', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Trophy size={22} color="#EAB308" />
          <span>منصة التتويج — الثلاثة الأوائل</span>
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16 }}>
          {/* 1st Place (Gold) */}
          <div
            style={{
              background: 'linear-gradient(135deg, #FEFCE8 0%, #FFFFFF 100%)',
              borderRadius: '18px',
              padding: '24px',
              border: '2px solid #FACC15',
              boxShadow: '0 12px 28px -8px rgba(234, 179, 8, 0.25)',
              textAlign: 'center',
              position: 'relative'
            }}
          >
            <div style={{ fontSize: '2.5rem', marginBottom: 4 }}>🥇</div>
            <div style={{ display: 'inline-block', background: '#FEF08A', color: '#854D0E', fontSize: '0.75rem', fontWeight: 900, padding: '3px 10px', borderRadius: 20, marginBottom: 8 }}>
              المركز الأول
            </div>
            <h4 style={{ margin: '0 0 4px 0', fontSize: '1.2rem', fontWeight: 900, color: '#0B0F19' }}>
              {top1 ? top1.displayName : 'بانتظار المتصدر'}
            </h4>
            <div style={{ fontSize: '0.8rem', color: '#64748B', marginBottom: 12 }}>
              كود: <strong>{top1 ? top1.referralCode : '—'}</strong>
            </div>
            <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 12, padding: '10px' }}>
              <span style={{ fontSize: '0.78rem', color: '#92400E', display: 'block' }}>الدعوات المؤهلة</span>
              <strong style={{ fontSize: '1.4rem', color: '#B45309' }}>
                {top1 ? top1.qualifiedReferrals : 0} إحالة
              </strong>
            </div>
          </div>

          {/* 2nd Place (Silver) */}
          <div
            style={{
              background: 'linear-gradient(135deg, #F8FAFC 0%, #FFFFFF 100%)',
              borderRadius: '18px',
              padding: '24px',
              border: '2px solid #CBD5E1',
              boxShadow: '0 8px 20px -8px rgba(100, 116, 139, 0.2)',
              textAlign: 'center',
              position: 'relative'
            }}
          >
            <div style={{ fontSize: '2.5rem', marginBottom: 4 }}>🥈</div>
            <div style={{ display: 'inline-block', background: '#E2E8F0', color: '#334155', fontSize: '0.75rem', fontWeight: 900, padding: '3px 10px', borderRadius: 20, marginBottom: 8 }}>
              المركز الثاني
            </div>
            <h4 style={{ margin: '0 0 4px 0', fontSize: '1.2rem', fontWeight: 900, color: '#0B0F19' }}>
              {top2 ? top2.displayName : 'بانتظار المتنافس'}
            </h4>
            <div style={{ fontSize: '0.8rem', color: '#64748B', marginBottom: 12 }}>
              كود: <strong>{top2 ? top2.referralCode : '—'}</strong>
            </div>
            <div style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 12, padding: '10px' }}>
              <span style={{ fontSize: '0.78rem', color: '#475569', display: 'block' }}>الدعوات المؤهلة</span>
              <strong style={{ fontSize: '1.4rem', color: '#1E293B' }}>
                {top2 ? top2.qualifiedReferrals : 0} إحالة
              </strong>
            </div>
          </div>

          {/* 3rd Place (Bronze) */}
          <div
            style={{
              background: 'linear-gradient(135deg, #FFF7ED 0%, #FFFFFF 100%)',
              borderRadius: '18px',
              padding: '24px',
              border: '2px solid #FDBA74',
              boxShadow: '0 8px 20px -8px rgba(249, 115, 22, 0.2)',
              textAlign: 'center',
              position: 'relative'
            }}
          >
            <div style={{ fontSize: '2.5rem', marginBottom: 4 }}>🥉</div>
            <div style={{ display: 'inline-block', background: '#FFEDD5', color: '#9A3412', fontSize: '0.75rem', fontWeight: 900, padding: '3px 10px', borderRadius: 20, marginBottom: 8 }}>
              المركز الثالث
            </div>
            <h4 style={{ margin: '0 0 4px 0', fontSize: '1.2rem', fontWeight: 900, color: '#0B0F19' }}>
              {top3 ? top3.displayName : 'بانتظار المتنافس'}
            </h4>
            <div style={{ fontSize: '0.8rem', color: '#64748B', marginBottom: 12 }}>
              كود: <strong>{top3 ? top3.referralCode : '—'}</strong>
            </div>
            <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 12, padding: '10px' }}>
              <span style={{ fontSize: '0.78rem', color: '#C2410C', display: 'block' }}>الدعوات المؤهلة</span>
              <strong style={{ fontSize: '1.4rem', color: '#EA580C' }}>
                {top3 ? top3.qualifiedReferrals : 0} إحالة
              </strong>
            </div>
          </div>
        </div>
      </div>

      {/* Full Leaderboard Table */}
      <div style={{ background: '#FFFFFF', borderRadius: '18px', border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', marginBottom: '32px' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #F1F5F9', background: '#F8FAFC', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900, color: '#0B0F19' }}>
            قائمة باقي المشاركين
          </h4>
          <span style={{ fontSize: '0.8rem', color: '#64748B' }}>
            إجمالي المشاركين النشطين: {leaderboard.length}
          </span>
        </div>

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>
            <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 8px', opacity: 0.5 }} />
            <div>جاري تحميل قائمة المتصدرين...</div>
          </div>
        ) : restLeaderboard.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>
            لا يوجد متنافسون إضافيون في القائمة حالياً.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #E2E8F0', color: '#64748B', fontWeight: 800, fontSize: '0.8rem' }}>
                  <th style={{ padding: '14px 20px' }}>الترتيب</th>
                  <th style={{ padding: '14px 20px' }}>المتسابق</th>
                  <th style={{ padding: '14px 20px' }}>كود الإحالة</th>
                  <th style={{ padding: '14px 20px' }}>الدعوات المؤهلة</th>
                  <th style={{ padding: '14px 20px' }}>إجمالي الإحالات</th>
                </tr>
              </thead>
              <tbody>
                {restLeaderboard.map((item) => (
                  <tr key={item.rank} style={{ borderBottom: '1px solid #F8FAFC' }}>
                    <td style={{ padding: '14px 20px', fontWeight: 900, color: '#475569' }}>
                      #{item.rank}
                    </td>

                    <td style={{ padding: '14px 20px', fontWeight: 800, color: '#0B0F19' }}>
                      {item.displayName}
                    </td>

                    <td style={{ padding: '14px 20px' }}>
                      <span style={{ background: '#F1F5F9', padding: '3px 8px', borderRadius: 6, fontSize: '0.78rem', fontWeight: 800, color: '#334155' }}>
                        {item.referralCode}
                      </span>
                    </td>

                    <td style={{ padding: '14px 20px' }}>
                      <span style={{ background: '#ECFDF5', color: '#059669', padding: '3px 10px', borderRadius: 12, fontWeight: 900, fontSize: '0.85rem' }}>
                        {item.qualifiedReferrals}
                      </span>
                    </td>

                    <td style={{ padding: '14px 20px', color: '#64748B' }}>
                      {item.totalReferrals}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Rules of Qualification Card */}
      <div style={{ background: '#F8FAFC', borderRadius: '16px', padding: '24px', border: '1px solid #E2E8F0' }}>
        <h4 style={{ margin: '0 0 10px 0', fontSize: '1rem', fontWeight: 900, color: '#0B0F19', display: 'flex', alignItems: 'center', gap: 6 }}>
          <HelpCircle size={18} color="#3B82F6" />
          <span>شروط احتساب الإحالة كـ "مؤهلة" (Qualified Referral)</span>
        </h4>
        <ul style={{ margin: 0, paddingRight: '20px', fontSize: '0.85rem', color: '#475569', lineHeight: 1.8 }}>
          <li>أن يقوم الصديق بالتسجيل باستخدام كود الإحالة الخاص بك مباشرة.</li>
          <li>أن يقوم الصديق بتأكيد وتوثيق بريده الإلكتروني بنجاح عبر رمز التحقق (OTP).</li>
          <li>أن يكون الحساب حقيقياً وغير محظور أو وهمي.</li>
          <li>في حال تعادل المتسابقين في عدد الإحالات المؤهلة، يتم الفصل بعدد المدعوين الذين قاموا بعمليات شحن، ثم إجمالي قيمة الشحن، ثم الأسبقية في الوصول للرقم.</li>
        </ul>
      </div>
    </div>
  );
};
