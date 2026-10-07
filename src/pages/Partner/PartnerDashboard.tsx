import React, { useEffect, useState } from 'react';
import { usePartner } from '../../context/PartnerContext';
import { 
  Zap, 
  Wallet, 
  ShoppingBag, 
  TrendingUp, 
  Award, 
  ArrowUpRight, 
  RefreshCw, 
  CreditCard,
  Building,
  Info
} from 'lucide-react';

interface RecentOrder {
  id: string;
  orderNumber: string;
  productName: string;
  playerId?: string;
  amountUsd: number;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';
  createdAt: string;
}

export const PartnerDashboard: React.FC = () => {
  const { partner, wallet, nextLevel, setActiveTab, partnerFetch, refreshProfile } = usePartner();
  
  const [exchangeRate, setExchangeRate] = useState<number>(3500);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboardData = async () => {
    try {
      setLoadingOrders(true);
      // Fetch exchange rate
      const rateRes = await partnerFetch<{ success: boolean; rate: number }>('/api/partner/exchange-rate');
      if (rateRes?.rate) {
        setExchangeRate(rateRes.rate);
      }

      // Fetch recent orders
      const ordersRes = await partnerFetch<{ success: boolean; orders: RecentOrder[] }>('/api/partner/orders?limit=5');
      if (ordersRes?.orders) {
        setRecentOrders(ordersRes.orders);
      }
    } catch (err) {
      console.error('Failed to load dashboard data', err);
    } finally {
      setLoadingOrders(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refreshProfile(), fetchDashboardData()]);
    setRefreshing(false);
  };

  const getStatusBadge = (status: RecentOrder['status']) => {
    switch (status) {
      case 'COMPLETED':
        return <span className="badge-status completed">مكتمل ✓</span>;
      case 'PROCESSING':
        return <span className="badge-status pending">جاري التنفيذ ⏳</span>;
      case 'PENDING':
        return <span className="badge-status pending">قيد المعالجة</span>;
      case 'REFUNDED':
        return <span className="badge-status refunded">مسترجع ↩</span>;
      case 'FAILED':
        return <span className="badge-status failed">فشل ✕</span>;
      default:
        return <span className="badge-status">{status}</span>;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Welcome Banner */}
      <div className="partner-card partner-card-glow" style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 16
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <h2 style={{ fontSize: '1.45rem', fontWeight: 900, color: '#fff' }}>
              مرحباً، {partner?.name}
            </h2>
            {partner?.businessName && (
              <span style={{
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid var(--partner-border)',
                padding: '3px 8px',
                borderRadius: 6,
                fontSize: '0.8rem',
                color: '#fbbf24',
                fontWeight: 700
              }}>
                {partner.businessName}
              </span>
            )}
          </div>
          <p style={{ color: '#94a3b8', fontSize: '0.88rem' }}>
            أهلاً بك في منصة شركاء وتجار KIROPRO. ابدأ الشحن الفوري لعملائك أو إصدار البطاقات بأفضل الأسعار.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            onClick={() => setActiveTab('buy')}
            className="btn-partner-primary"
            style={{ padding: '10px 20px', fontSize: '0.95rem' }}
          >
            <Zap size={18} />
            <span>شحن فوري جديد</span>
          </button>
          <button
            onClick={handleRefresh}
            className="btn-partner-secondary"
            title="تحديث البيانات"
          >
            <RefreshCw size={16} className={refreshing ? 'spin-anim' : ''} />
          </button>
        </div>
      </div>

      {/* 4 Stats Cards Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))',
        gap: 14
      }}>
        {/* Card 1: Balance */}
        <div className="partner-card" style={{ borderColor: 'rgba(16, 185, 129, 0.25)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <span style={{ fontSize: '0.82rem', color: '#94a3b8', fontWeight: 800 }}>الرصيد المالي المتاح</span>
            <div style={{
              background: 'rgba(16, 185, 129, 0.12)',
              padding: 6,
              borderRadius: 8,
              color: '#10b981'
            }}>
              <Wallet size={18} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
            <span className="partner-currency" style={{ fontSize: '1.8rem', fontWeight: 900, color: '#10b981' }}>
              ${Number(wallet?.balance || 0).toFixed(2)}
            </span>
            <span style={{ fontSize: '0.85rem', color: '#6ee7b7', fontWeight: 800 }}>USD</span>
          </div>
          <button
            onClick={() => setActiveTab('deposits')}
            style={{
              background: 'transparent',
              border: 'none',
              padding: 0,
              color: '#34d399',
              fontSize: '0.8rem',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}
          >
            <span>إيداع رصيد جديد الآن</span>
            <ArrowUpRight size={14} />
          </button>
        </div>

        {/* Card 2: Partner Tier */}
        <div className="partner-card" style={{ borderColor: 'rgba(245, 158, 11, 0.25)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <span style={{ fontSize: '0.82rem', color: '#94a3b8', fontWeight: 800 }}>مستوى التاجر</span>
            <div style={{
              background: 'rgba(245, 158, 11, 0.12)',
              padding: 6,
              borderRadius: 8,
              color: '#f59e0b'
            }}>
              <Award size={18} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: '1.35rem', fontWeight: 900, color: partner?.badgeColor || '#fbbf24' }}>
              {partner?.levelArabicName || 'التاجر المعتمد'}
            </span>
            {partner?.discountPercent ? (
              <span style={{
                background: 'rgba(245, 158, 11, 0.15)',
                color: '#f59e0b',
                padding: '2px 7px',
                borderRadius: 5,
                fontSize: '0.75rem',
                fontWeight: 900
              }}>
                خصم {partner.discountPercent}%
              </span>
            ) : null}
          </div>

          {/* Level Progress */}
          {nextLevel?.nextLevelArabicName ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#94a3b8', marginBottom: 4 }}>
                <span>الترقية إلى: {nextLevel.nextLevelArabicName}</span>
                <span className="partner-currency">باقي: ${Number(nextLevel.remainingSpend || 0).toFixed(0)}</span>
              </div>
              <div style={{ height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${Math.min(100, Math.max(0, nextLevel.progressPercent || 0))}%`,
                  background: 'var(--partner-gold-gradient)',
                  borderRadius: 3
                }} />
              </div>
            </div>
          ) : (
            <div style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 800 }}>
              أنت في أعلى رتبة تجارية حالياً! 🏆
            </div>
          )}
        </div>

        {/* Card 3: Orders Count & Spend */}
        <div className="partner-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <span style={{ fontSize: '0.82rem', color: '#94a3b8', fontWeight: 800 }}>الطلبات المنفذة</span>
            <div style={{
              background: 'rgba(255, 255, 255, 0.06)',
              padding: 6,
              borderRadius: 8,
              color: '#fff'
            }}>
              <ShoppingBag size={18} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
            <span className="partner-num" style={{ fontSize: '1.8rem', fontWeight: 900, color: '#f8fafc' }}>
              {partner?.ordersCount || 0}
            </span>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>طلب شحن</span>
          </div>
          <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
            المشتريات: <span className="partner-currency" style={{ color: '#fff', fontWeight: 800 }}>${Number(partner?.totalPurchasesUsd || 0).toFixed(2)} USD</span>
          </div>
        </div>

        {/* Card 4: Exchange Rate */}
        <div className="partner-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <span style={{ fontSize: '0.82rem', color: '#94a3b8', fontWeight: 800 }}>سعر صرف الإيداع (SDG)</span>
            <div style={{
              background: 'rgba(245, 158, 11, 0.12)',
              padding: 6,
              borderRadius: 8,
              color: '#fbbf24'
            }}>
              <TrendingUp size={18} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
            <span className="partner-currency" style={{ fontSize: '1.6rem', fontWeight: 900, color: '#f8fafc' }}>
              {exchangeRate ? exchangeRate.toLocaleString() : '---'}
            </span>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>SDG / $1 USD</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Info size={12} color="#94a3b8" />
            <span>سعر الصرف معتمد ومعلن من المنصة</span>
          </div>
        </div>
      </div>

      {/* Quick Action Banner */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
        gap: 14
      }}>
        <div 
          onClick={() => setActiveTab('buy')}
          className="partner-card"
          style={{
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(15, 23, 42, 0.9) 100%)'
          }}
        >
          <div style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            background: 'var(--partner-gold-gradient)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#090d16',
            flexShrink: 0
          }}>
            <Zap size={22} />
          </div>
          <div>
            <h4 style={{ margin: '0 0 2px 0', fontSize: '1rem', fontWeight: 900 }}>شحن فوري سريع</h4>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>اختر اللعبة وأدخل معرف اللاعب واشحن فورياً</span>
          </div>
        </div>

        <div 
          onClick={() => setActiveTab('cards')}
          className="partner-card"
          style={{
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(15, 23, 42, 0.9) 100%)'
          }}
        >
          <div style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            background: 'var(--partner-gold-gradient)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#090d16',
            flexShrink: 0
          }}>
            <CreditCard size={22} />
          </div>
          <div>
            <h4 style={{ margin: '0 0 2px 0', fontSize: '1rem', fontWeight: 900 }}>بطاقات ماستركارد ($1.13)</h4>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>إصدار وتفعيل بطاقات ماستركارد الافتراضية للعملاء</span>
          </div>
        </div>

        <div 
          onClick={() => setActiveTab('deposits')}
          className="partner-card"
          style={{
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(15, 23, 42, 0.9) 100%)'
          }}
        >
          <div style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            flexShrink: 0
          }}>
            <Wallet size={22} />
          </div>
          <div>
            <h4 style={{ margin: '0 0 2px 0', fontSize: '1rem', fontWeight: 900 }}>إيداع بنكي فوري</h4>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>شحن المحفظة عبر الحسابات البنكية المعتمدة</span>
          </div>
        </div>
      </div>

      {/* Recent Orders Section */}
      <div className="partner-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900 }}>أحدث عمليات الشحن المنفذة</h3>
          <button
            onClick={() => setActiveTab('orders')}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#f59e0b',
              fontWeight: 800,
              fontSize: '0.82rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}
          >
            <span>عرض كل الطلبات</span>
            <ArrowUpRight size={14} />
          </button>
        </div>

        {loadingOrders ? (
          <div style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>
            جاري تحميل أحدث العمليات...
          </div>
        ) : recentOrders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 24, color: '#94a3b8', fontSize: '0.85rem' }}>
            لا توجد أي عمليات شحن سابقة حتى الآن. ابدأ شحن أول طلب لعملائك!
          </div>
        ) : (
          <div className="partner-table-container">
            <table className="partner-table">
              <thead>
                <tr>
                  <th>رقم الطلب</th>
                  <th>الباقة</th>
                  <th>المعرف / المستلم</th>
                  <th>المبلغ</th>
                  <th>الحالة</th>
                  <th>التوقيت</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((ord) => (
                  <tr key={ord.id}>
                    <td>
                      <span className="partner-num" style={{ fontWeight: 800, color: '#fff' }}>
                        #{ord.orderNumber}
                      </span>
                    </td>
                    <td style={{ fontWeight: 800 }}>{ord.productName}</td>
                    <td>
                      {ord.playerId ? (
                        <code style={{
                          background: 'rgba(56, 189, 248, 0.1)',
                          color: '#38bdf8',
                          padding: '2px 6px',
                          borderRadius: 4,
                          fontFamily: 'Outfit, monospace',
                          fontSize: '0.8rem'
                        }}>
                          {ord.playerId}
                        </code>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>تسليم تلقائي</span>
                      )}
                    </td>
                    <td>
                      <span className="partner-currency" style={{ fontWeight: 900, color: '#10b981' }}>
                        ${Number(ord.amountUsd).toFixed(2)} USD
                      </span>
                    </td>
                    <td>{getStatusBadge(ord.status)}</td>
                    <td style={{ fontSize: '0.78rem', color: '#64748b', whiteSpace: 'nowrap' }}>
                      {new Date(ord.createdAt).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
