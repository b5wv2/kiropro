import React, { useEffect, useState } from 'react';
import { 
  Users, 
  Wallet, 
  ShoppingCart, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  ArrowUpRight,
  Eye,
  RefreshCw
} from 'lucide-react';
import { api } from '../../lib/api';
import { formatCurrency } from '../../lib/formatters';
import { StatCard } from '../../components/admin/StatCard';
import { StatusBadge } from '../../components/admin/StatusBadge';

interface DashboardStats {
  totalCustomers: number;
  totalWalletBalance: number;
  totalOrders: number;
  pendingOrders: number;
  completedOrders: number;
  failedOrders: number;
  recentOrders: any[];
  recentWalletActivity: any[];
}

interface AdminDashboardProps {
  onNavigateTab?: (tab: any) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onNavigateTab }) => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);

  const fetchStats = async () => {
    try {
      const data = await api.get('/api/admin/stats');
      setStats(data);
    } catch (err) {
      console.error('Failed to load stats', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchStats();
  };

  if (loading) {
    return (
      <div className="admin-empty-state">
        <div className="admin-skeleton" style={{ width: '100%', height: '140px', borderRadius: '16px' }} />
        <div className="admin-skeleton" style={{ width: '100%', height: '320px', borderRadius: '16px', marginTop: '20px' }} />
      </div>
    );
  }

  const data = stats || {
    totalCustomers: 0,
    totalWalletBalance: 0,
    totalOrders: 0,
    pendingOrders: 0,
    completedOrders: 0,
    failedOrders: 0,
    recentOrders: [],
    recentWalletActivity: []
  };

  return (
    <>
      {/* Top Summary Bar with Refresh */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>مؤشرات الأداء الرئيسية (KPIs)</h2>
          <p style={{ fontSize: '0.825rem', color: '#64748b', margin: '4px 0 0 0' }}>مستخرجة مباشرة من قاعدة بيانات PostgreSQL</p>
        </div>
        <button 
          onClick={handleRefresh}
          className="admin-btn admin-btn-secondary admin-btn-sm"
          disabled={refreshing}
        >
          <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
          <span>{refreshing ? 'جاري التحديث...' : 'تحديث البيانات'}</span>
        </button>
      </div>

      {/* 6 KPI Cards Grid */}
      <div className="admin-stat-grid">
        <StatCard
          label="إجمالي العملاء"
          value={data.totalCustomers.toLocaleString('ar-EG')}
          icon={Users}
          iconColor="#3b82f6"
          iconBg="#eff6ff"
          subtitle="المسجلين بالمنصة"
        />

        <StatCard
          label="إجمالي أرصدة المحافظ"
          value={formatCurrency(data.totalWalletBalance)}
          icon={Wallet}
          iconColor="#f59e0b"
          iconBg="#fffbeb"
          subtitle="رصيد العملاء الفعلي"
        />

        <StatCard
          label="إجمالي الطلبات"
          value={data.totalOrders.toLocaleString('ar-EG')}
          icon={ShoppingCart}
          iconColor="#8b5cf6"
          iconBg="#f5f3ff"
          subtitle="كل العمليات المنفذة"
        />

        <StatCard
          label="طلبات قيد الانتظار"
          value={data.pendingOrders.toLocaleString('ar-EG')}
          icon={Clock}
          iconColor="#f59e0b"
          iconBg="#fffbeb"
          subtitle="تحتاج مراجعة أو تسليم"
        />

        <StatCard
          label="طلبات مكتملة"
          value={data.completedOrders.toLocaleString('ar-EG')}
          icon={CheckCircle2}
          iconColor="#10b981"
          iconBg="#ecfdf5"
          subtitle="تم تسليمها بنجاح"
        />

        <StatCard
          label="طلبات مرفوضة / مسترجعة"
          value={data.failedOrders.toLocaleString('ar-EG')}
          icon={XCircle}
          iconColor="#ef4444"
          iconBg="#fef2f2"
          subtitle="فشلت وأُعيد رصيدها"
        />
      </div>

      {/* Split Tables: Recent Orders & Recent Wallet Activity */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 480px), 1fr))', gap: '24px' }}>
        {/* Recent Orders Card */}
        <div className="admin-card">
          <div className="admin-card-header">
            <h3 className="admin-card-title">
              <ShoppingCart size={18} color="#f59e0b" />
              <span>أحدث الطلبات</span>
            </h3>
            {onNavigateTab && (
              <button 
                onClick={() => onNavigateTab('orders')}
                className="admin-btn admin-btn-secondary admin-btn-sm"
              >
                <span>عرض الكل</span>
                <ArrowUpRight size={14} />
              </button>
            )}
          </div>

          <div className="admin-table-container">
            {data.recentOrders && data.recentOrders.length > 0 ? (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>الطلب</th>
                    <th>العميل</th>
                    <th>المنتج</th>
                    <th>المبلغ</th>
                    <th>الحالة</th>
                    <th>إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentOrders.slice(0, 6).map((order) => (
                    <tr key={order.id}>
                      <td style={{ fontWeight: 700, fontFamily: 'monospace' }}>
                        #{order.id.slice(0, 8)}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{order.userName || 'مستخدم'}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{order.userEmail}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{order.packageName}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>ID: {order.playerId}</div>
                      </td>
                      <td style={{ fontWeight: 700, color: '#0f172a' }}>
                        {formatCurrency(order.amount)}
                      </td>
                      <td>
                        <StatusBadge status={order.status} />
                      </td>
                      <td>
                        <button
                          onClick={() => setSelectedOrder(order)}
                          className="admin-btn admin-btn-secondary admin-btn-sm"
                          title="عرض تفاصيل الطلب"
                        >
                          <Eye size={14} />
                          <span>عرض</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="admin-empty-state">
                <div className="admin-empty-icon">
                  <ShoppingCart size={28} />
                </div>
                <h4 className="admin-empty-title">لا توجد طلبات حتى الآن</h4>
                <p className="admin-empty-text">سيظهر أي طلب جديد يقدمه العملاء في هذا الجدول فوراً بشكل حي.</p>
              </div>
            )}
          </div>
        </div>

        {/* Recent Wallet Activity Card */}
        <div className="admin-card">
          <div className="admin-card-header">
            <h3 className="admin-card-title">
              <Wallet size={18} color="#f59e0b" />
              <span>آخر عمليات الرصيد</span>
            </h3>
            {onNavigateTab && (
              <button 
                onClick={() => onNavigateTab('wallet')}
                className="admin-btn admin-btn-secondary admin-btn-sm"
              >
                <span>عرض السجل</span>
                <ArrowUpRight size={14} />
              </button>
            )}
          </div>

          <div className="admin-table-container">
            {data.recentWalletActivity && data.recentWalletActivity.length > 0 ? (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>العميل</th>
                    <th>النوع</th>
                    <th>المبلغ</th>
                    <th>الوصف</th>
                    <th>التاريخ</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentWalletActivity.slice(0, 6).map((tx) => (
                    <tr key={tx.id}>
                      <td style={{ fontWeight: 600 }}>
                        {tx.userName || 'عميل'}
                      </td>
                      <td>
                        <StatusBadge status={tx.type} />
                      </td>
                      <td style={{ 
                        fontWeight: 700, 
                        color: tx.amount > 0 ? '#10b981' : '#dc2626' 
                      }}>
                        {tx.amount > 0 
                          ? `+${formatCurrency(tx.amount, tx.currency || 'USD')}` 
                          : formatCurrency(tx.amount, tx.currency || 'USD')}
                      </td>
                      <td style={{ fontSize: '0.8rem', color: '#64748b' }}>
                        {tx.description || '-'}
                      </td>
                      <td style={{ fontSize: '0.775rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                        {new Date(tx.createdAt).toLocaleDateString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="admin-empty-state">
                <div className="admin-empty-icon">
                  <Wallet size={28} />
                </div>
                <h4 className="admin-empty-title">لا توجد حركات مالية مسجلة</h4>
                <p className="admin-empty-text">عمليات الشحن، الشراء، والخصم الإداري ستسجل هنا بالتفصيل.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Order Details Quick Modal */}
      {selectedOrder && (
        <div className="admin-modal-backdrop" onClick={() => setSelectedOrder(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3 className="admin-modal-title">تفاصيل الطلب #{selectedOrder.id.slice(0, 8)}</h3>
              <button className="admin-modal-close" onClick={() => setSelectedOrder(null)}>✕</button>
            </div>
            <div className="admin-modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
                <div>
                  <div className="admin-label">العميل</div>
                  <div style={{ fontWeight: 700 }}>{selectedOrder.userName || 'مستخدم'}</div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{selectedOrder.userEmail}</div>
                </div>
                <div>
                  <div className="admin-label">حالة الطلب</div>
                  <StatusBadge status={selectedOrder.status} />
                </div>
                <div>
                  <div className="admin-label">المنتج / الباقة</div>
                  <div style={{ fontWeight: 700 }}>{selectedOrder.packageName}</div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b' }}>كود: {selectedOrder.gameId}</div>
                </div>
                <div>
                  <div className="admin-label">المبلغ المدفوع</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#f59e0b' }}>
                    {formatCurrency(selectedOrder.amount)}
                  </div>
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <div className="admin-label">معرّف الحساب / اللاعب (Player ID)</div>
                  <div style={{ 
                    padding: '10px 14px', 
                    background: '#f1f5f9', 
                    borderRadius: '8px', 
                    fontFamily: 'monospace', 
                    fontWeight: 700,
                    letterSpacing: '1px'
                  }}>
                    {selectedOrder.playerId}
                  </div>
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <div className="admin-label">تاريخ إنشاء الطلب</div>
                  <div style={{ fontSize: '0.875rem', color: '#475569' }}>
                    {new Date(selectedOrder.createdAt).toLocaleString('ar-EG')}
                  </div>
                </div>
              </div>
            </div>
            <div className="admin-modal-footer">
              <button 
                onClick={() => setSelectedOrder(null)} 
                className="admin-btn admin-btn-secondary"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
