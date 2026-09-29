import React, { useEffect, useState } from 'react';
import { usePartner } from '../../context/PartnerContext';
import { 
  Zap, 
  Wallet, 
  History, 
  ShoppingBag, 
  TrendingUp, 
  Award, 
  ArrowUpRight, 
  RefreshCw, 
  ChevronLeft,
  Info
} from 'lucide-react';

interface RecentOrder {
  id: string;
  orderNumber: string;
  productName: string;
  playerId: string;
  amountUsd: number;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';
  createdAt: string;
}

export const PartnerDashboard: React.FC = () => {
  const { partner, wallet, nextLevel, setActiveTab, partnerFetch, refreshProfile } = usePartner();
  
  const [exchangeRate, setExchangeRate] = useState<number>(0);
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Welcome Banner */}
      <div className="partner-card partner-card-glow" style={{
        background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.85) 100%)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 20
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: '1.6rem', fontWeight: 900, color: '#fff' }}>
              مرحباً، {partner?.name}
            </span>
            {partner?.businessName && (
              <span style={{
                background: 'rgba(255, 255, 255, 0.08)',
                padding: '4px 10px',
                borderRadius: 6,
                fontSize: '0.85rem',
                color: '#cbd5e1'
              }}>
                {partner.businessName}
              </span>
            )}
          </div>
          <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.95rem' }}>
            أهلاً بك في منصة شركاء وتجار KIROPRO. ابدأ الشحن الفوري لعملائك بأفضل الأسعار وبضغطة زر واحدة.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={() => setActiveTab('buy')}
            className="btn-partner-primary"
            style={{ fontSize: '1.05rem', padding: '12px 24px' }}
          >
            <Zap size={20} />
            <span>شحن فوري جديد</span>
          </button>
          <button
            onClick={handleRefresh}
            className="btn-partner-secondary"
            title="تحديث البيانات"
          >
            <RefreshCw size={18} className={refreshing ? 'spin-anim' : ''} />
          </button>
        </div>
      </div>

      {/* 4 Stats Cards Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: 16
      }}>
        {/* Card 1: Balance */}
        <div className="partner-card" style={{ borderColor: 'rgba(16, 185, 129, 0.3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
            <span style={{ fontSize: '0.88rem', color: '#94a3b8', fontWeight: 800 }}>الرصيد المالي المتاح</span>
            <div style={{
              background: 'rgba(16, 185, 129, 0.15)',
              padding: 8,
              borderRadius: 10,
              color: '#10b981'
            }}>
              <Wallet size={20} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 12 }}>
            <span style={{ fontSize: '2rem', fontWeight: 900, color: '#10b981', fontFamily: 'Outfit, Cairo, sans-serif' }}>
              ${Number(wallet?.balance || 0).toFixed(2)}
            </span>
            <span style={{ fontSize: '0.9rem', color: '#6ee7b7', fontWeight: 800 }}>USD</span>
          </div>
          <button
            onClick={() => setActiveTab('deposits')}
            style={{
              background: 'transparent',
              border: 'none',
              padding: 0,
              color: '#34d399',
              fontSize: '0.82rem',
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

        {/* Card 2: Partner Tier & Progress */}
        <div className="partner-card" style={{ borderColor: 'rgba(245, 158, 11, 0.3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
            <span style={{ fontSize: '0.88rem', color: '#94a3b8', fontWeight: 800 }}>مستوى التاجر</span>
            <div style={{
              background: 'rgba(245, 158, 11, 0.15)',
              padding: 8,
              borderRadius: 10,
              color: '#f59e0b'
            }}>
              <Award size={20} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: '1.4rem', fontWeight: 900, color: partner?.badgeColor || '#fbbf24' }}>
              {partner?.levelArabicName || 'التاجر المعتمد'}
            </span>
            {partner?.discountPercent ? (
              <span style={{
                background: 'rgba(245, 158, 11, 0.2)',
                color: '#f59e0b',
                padding: '2px 8px',
                borderRadius: 6,
                fontSize: '0.78rem',
                fontWeight: 900
              }}>
                خصم {partner.discountPercent}%
              </span>
            ) : null}
          </div>

          {/* Level Progress */}
          {nextLevel?.nextLevelArabicName ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#94a3b8', marginBottom: 4 }}>
                <span>الترقية إلى: {nextLevel.nextLevelArabicName}</span>
                <span>باقي: ${Number(nextLevel.remainingSpend || 0).toFixed(0)}</span>
              </div>
              <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${Math.min(100, Math.max(0, nextLevel.progressPercent || 0))}%`,
                  background: 'linear-gradient(90deg, #f59e0b, #d97706)',
                  borderRadius: 3
                }} />
              </div>
            </div>
          ) : (
            <div style={{ fontSize: '0.78rem', color: '#10b981', fontWeight: 800 }}>
              أنت في أعلى رتبة تجارية حالياً! 🏆
            </div>
          )}
        </div>

        {/* Card 3: Orders Count & Spend */}
        <div className="partner-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
            <span style={{ fontSize: '0.88rem', color: '#94a3b8', fontWeight: 800 }}>إجمالي الطلبات المنفذة</span>
            <div style={{
              background: 'rgba(6, 182, 212, 0.15)',
              padding: 8,
              borderRadius: 10,
              color: '#06b6d4'
            }}>
              <ShoppingBag size={20} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
            <span style={{ fontSize: '2rem', fontWeight: 900, color: '#f8fafc', fontFamily: 'Outfit, Cairo, sans-serif' }}>
              {partner?.ordersCount || 0}
            </span>
            <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>طلب شحن</span>
          </div>
          <div style={{ fontSize: '0.82rem', color: '#94a3b8' }}>
            إجمالي المشتريات: <span style={{ color: '#fff', fontWeight: 800 }}>${Number(partner?.totalPurchasesUsd || 0).toFixed(2)}</span>
          </div>
        </div>

        {/* Card 4: Exchange Rate */}
        <div className="partner-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
            <span style={{ fontSize: '0.88rem', color: '#94a3b8', fontWeight: 800 }}>سعر صرف الإيداع (SDG)</span>
            <div style={{
              background: 'rgba(168, 85, 247, 0.15)',
              padding: 8,
              borderRadius: 10,
              color: '#c084fc'
            }}>
              <TrendingUp size={20} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
            <span style={{ fontSize: '1.7rem', fontWeight: 900, color: '#e2e8f0', fontFamily: 'Outfit, Cairo, sans-serif' }}>
              {exchangeRate ? exchangeRate.toLocaleString() : '---'}
            </span>
            <span style={{ fontSize: '0.82rem', color: '#94a3b8' }}>SDG / $1 USD</span>
          </div>
          <div style={{ fontSize: '0.78rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Info size={13} color="#94a3b8" />
            <span>يتم تحديث السعر تلقائياً وفق سياسة المنصة</span>
          </div>
        </div>
      </div>

      {/* Quick Action Banner */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 16
      }}>
        <div 
          onClick={() => setActiveTab('buy')}
          className="partner-card"
          style={{
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(15, 23, 42, 0.8))'
          }}
        >
          <div style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: 'var(--partner-gold-gradient)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#0b0f19'
          }}>
            <Zap size={24} />
          </div>
          <div>
            <h4 style={{ margin: '0 0 4px 0', fontSize: '1.05rem', fontWeight: 900 }}>شحن فوري سريع</h4>
            <span style={{ fontSize: '0.82rem', color: '#94a3b8' }}>اختر اللعبة وأدخل معرف اللاعب واشحن فورياً</span>
          </div>
        </div>

        <div 
          onClick={() => setActiveTab('deposits')}
          className="partner-card"
          style={{
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(15, 23, 42, 0.8))'
          }}
        >
          <div style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: 'linear-gradient(135deg, #10b981, #059669)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff'
          }}>
            <Wallet size={24} />
          </div>
          <div>
            <h4 style={{ margin: '0 0 4px 0', fontSize: '1.05rem', fontWeight: 900 }}>شحن رصيد المحفظة</h4>
            <span style={{ fontSize: '0.82rem', color: '#94a3b8' }}>إيداع بنكك أو فيزا أو فوري مع حاسبة التحويل</span>
          </div>
        </div>

        <div 
          onClick={() => setActiveTab('ledger')}
          className="partner-card"
          style={{
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(15, 23, 42, 0.8))'
          }}
        >
          <div style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff'
          }}>
            <History size={24} />
          </div>
          <div>
            <h4 style={{ margin: '0 0 4px 0', fontSize: '1.05rem', fontWeight: 900 }}>القيود وكشف الحساب</h4>
            <span style={{ fontSize: '0.82rem', color: '#94a3b8' }}>سجل مالي مفصل لكل عملية خصم أو إيداع أو استرداد</span>
          </div>
        </div>
      </div>

      {/* Recent Orders Section */}
      <div className="partner-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShoppingBag size={20} color="#f59e0b" />
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900 }}>أحدث طلبات الشحن</h3>
          </div>
          <button
            onClick={() => setActiveTab('orders')}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#fbbf24',
              fontWeight: 800,
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}
          >
            <span>عرض كافة الطلبات</span>
            <ChevronLeft size={16} />
          </button>
        </div>

        {loadingOrders ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
            جاري تحميل أحدث العمليات...
          </div>
        ) : recentOrders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
            لم تقم بتنفيذ أي طلب شحن حتى الآن. ابدأ الشحن الأول لعملائك!
          </div>
        ) : (
          <div className="partner-table-container">
            <table className="partner-table">
              <thead>
                <tr>
                  <th>رقم الطلب</th>
                  <th>الباقة / المنتج</th>
                  <th>معرف اللاعب (ID)</th>
                  <th>المبلغ</th>
                  <th>الحالة</th>
                  <th>الوقت</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((ord) => (
                  <tr key={ord.id}>
                    <td style={{ fontWeight: 800, fontFamily: 'Outfit, monospace', color: '#94a3b8' }}>
                      #{ord.orderNumber}
                    </td>
                    <td style={{ fontWeight: 800, color: '#fff' }}>
                      {ord.productName}
                    </td>
                    <td>
                      <code style={{ background: 'rgba(255,255,255,0.06)', padding: '3px 8px', borderRadius: 4, color: '#38bdf8' }}>
                        {ord.playerId}
                      </code>
                    </td>
                    <td style={{ fontWeight: 900, color: '#10b981', fontFamily: 'Outfit, sans-serif' }}>
                      ${Number(ord.amountUsd).toFixed(2)}
                    </td>
                    <td>{getStatusBadge(ord.status)}</td>
                    <td style={{ fontSize: '0.8rem', color: '#64748b' }}>
                      {new Date(ord.createdAt).toLocaleDateString('ar-SA', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
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
