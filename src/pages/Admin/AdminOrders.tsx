import React, { useEffect, useState } from 'react';
import { 
  Search, 
  ShoppingCart, 
  CheckCircle2, 
  XCircle, 
  Eye, 
  RefreshCw,
  Key,
  Play,
  Zap,
  ShieldCheck,
  Loader2
} from 'lucide-react';
import { api } from '../../lib/api';
import { adminManualExecuteOrder, adminValidateOrderPlayer } from '../../services/api';
import { formatCurrency } from '../../lib/formatters';
import { StatusBadge } from '../../components/admin/StatusBadge';

interface Order {
  id: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  gameId: string;
  packageId: string;
  packageName: string;
  playerId: string;
  serverId?: string;
  playerName?: string;
  amount: number;
  customerPriceUsd?: number;
  chargedAmount?: number;
  chargedCurrency?: string;
  exchangeRateUsed?: number;
  costUsd?: number;
  profitUsd?: number;
  promoCode?: string;
  promoDiscount?: number;
  cashbackRate?: number;
  cashbackAmount?: number;
  cashbackCurrency?: string;
  cashbackStatus?: string;
  discountAmount?: number;
  cost?: number;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';
  provider?: string;
  providerOrderId?: number | string;
  providerOfferId?: number;
  providerStatus?: string;
  fulfillmentKey?: string;
  failureReason?: string;
  createdAt: string;
  completedAt?: string;
}

export const AdminOrders: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'REFUNDED'>('ALL');

  // Selected Order Modal
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Manual Execution Confirmation Modal
  const [executingOrder, setExecutingOrder] = useState<Order | null>(null);
  const [manualExecuteLoading, setManualExecuteLoading] = useState(false);
  const [adminVerifying, setAdminVerifying] = useState(false);

  const fetchOrders = async () => {
    try {
      const data = await api.get('/api/admin/orders');
      setOrders(data);
    } catch (err) {
      console.error('Failed to fetch orders', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const handleManualExecute = async () => {
    if (!executingOrder) return;
    setManualExecuteLoading(true);
    setActionMsg(null);
    try {
      const res = await adminManualExecuteOrder(executingOrder.id);
      setActionMsg({
        type: 'success',
        text: res.message || 'تم إرسال الطلب بنجاح لمزود الخدمة!'
      });

      // Update local state
      setOrders(prev => prev.map(o => o.id === executingOrder.id ? { 
        ...o, 
        status: (res.newStatus as any) || 'PROCESSING',
        providerOrderId: res.providerOrderId || o.providerOrderId,
        providerStatus: res.providerStatus || o.providerStatus
      } : o));

      if (selectedOrder && selectedOrder.id === executingOrder.id) {
        setSelectedOrder(prev => prev ? {
          ...prev,
          status: (res.newStatus as any) || 'PROCESSING',
          providerOrderId: res.providerOrderId || prev.providerOrderId,
          providerStatus: res.providerStatus || prev.providerStatus
        } : null);
      }

      setExecutingOrder(null);
    } catch (err: any) {
      setActionMsg({
        type: 'error',
        text: err?.message || 'فشل تنفيذ الطلب يدويًا.'
      });
      setExecutingOrder(null);
    } finally {
      setManualExecuteLoading(false);
    }
  };

  const handleAdminVerifyPlayer = async (orderId: string) => {
    setAdminVerifying(true);
    try {
      const res = await adminValidateOrderPlayer(orderId);
      if (res.valid) {
        setActionMsg({
          type: 'success',
          text: `✓ تم التحقق من الحساب بنجاح! اسم اللاعب: ${res.playerName || 'صالح'}`
        });
        if (res.playerName) {
          setOrders(prev => prev.map(o => o.id === orderId ? { ...o, playerName: res.playerName } : o));
          if (selectedOrder && selectedOrder.id === orderId) {
            setSelectedOrder(prev => prev ? { ...prev, playerName: res.playerName } : null);
          }
        }
      } else {
        setActionMsg({
          type: 'error',
          text: res.message || 'تعذر التحقق من معرّف اللاعب. تأكد من الرقم وحاول مرة أخرى.'
        });
      }
    } catch (err: any) {
      setActionMsg({
        type: 'error',
        text: err?.message || 'حدث خطأ أثناء التحقق من معرّف اللاعب.'
      });
    } finally {
      setAdminVerifying(false);
    }
  };

  const handleUpdateStatus = async (orderId: string, newStatus: 'COMPLETED' | 'FAILED') => {
    setActionLoading(true);
    setActionMsg(null);
    try {
      await api.put(`/api/admin/orders/${orderId}/status`, { status: newStatus });
      setActionMsg({
        type: 'success',
        text: newStatus === 'COMPLETED' ? 'تم تنفيذ الطلب بنجاح وتحديث حالته إلى مكتمل.' : 'تم تغيير حالة الطلب إلى مرفوض واسترجاع الرصيد للمحفظة تلقائياً.'
      });

      // Update local state
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder({ ...selectedOrder, status: newStatus });
      }
    } catch (err: any) {
      setActionMsg({
        type: 'error',
        text: err.message || 'فشل تحديث حالة الطلب'
      });
    } finally {
      setActionLoading(false);
    }
  };

  const filteredOrders = orders.filter(o => {
    const matchesSearch = 
      o.id.toLowerCase().includes(search.toLowerCase()) ||
      (o.userName || '').toLowerCase().includes(search.toLowerCase()) ||
      (o.userEmail || '').toLowerCase().includes(search.toLowerCase()) ||
      (o.packageName || '').toLowerCase().includes(search.toLowerCase()) ||
      o.playerId.toLowerCase().includes(search.toLowerCase());

    if (!matchesSearch) return false;
    if (statusFilter !== 'ALL' && o.status !== statusFilter) return false;
    return true;
  });

  return (
    <>
      {/* Search & Filters */}
      <div className="admin-filter-bar">
        <div className="admin-search-wrapper">
          <Search size={18} className="admin-search-icon" />
          <input
            type="text"
            className="admin-input admin-search-input"
            placeholder="ابحث برقم الطلب، العميل، المعرّف، أو الباقة..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="admin-filter-group">
          <button 
            className={`admin-btn ${statusFilter === 'ALL' ? 'admin-btn-primary' : 'admin-btn-secondary'} admin-btn-sm`}
            onClick={() => setStatusFilter('ALL')}
          >
            الكل ({orders.length})
          </button>
          <button 
            className={`admin-btn ${statusFilter === 'PENDING' ? 'admin-btn-primary' : 'admin-btn-secondary'} admin-btn-sm`}
            onClick={() => setStatusFilter('PENDING')}
          >
            قيد الانتظار ({orders.filter(o => o.status === 'PENDING').length})
          </button>
          <button 
            className={`admin-btn ${statusFilter === 'PROCESSING' ? 'admin-btn-primary' : 'admin-btn-secondary'} admin-btn-sm`}
            onClick={() => setStatusFilter('PROCESSING')}
          >
            قيد التنفيذ ({orders.filter(o => o.status === 'PROCESSING').length})
          </button>
          <button 
            className={`admin-btn ${statusFilter === 'COMPLETED' ? 'admin-btn-primary' : 'admin-btn-secondary'} admin-btn-sm`}
            onClick={() => setStatusFilter('COMPLETED')}
          >
            مكتملة ({orders.filter(o => o.status === 'COMPLETED').length})
          </button>
          <button 
            className={`admin-btn ${statusFilter === 'FAILED' ? 'admin-btn-primary' : 'admin-btn-secondary'} admin-btn-sm`}
            onClick={() => setStatusFilter('FAILED')}
          >
            فاشلة / مرفوضة ({orders.filter(o => o.status === 'FAILED').length})
          </button>
          <button 
            className={`admin-btn ${statusFilter === 'REFUNDED' ? 'admin-btn-primary' : 'admin-btn-secondary'} admin-btn-sm`}
            onClick={() => setStatusFilter('REFUNDED')}
          >
            مسترجعة ({orders.filter(o => o.status === 'REFUNDED').length})
          </button>
          <button 
            onClick={fetchOrders}
            className="admin-btn admin-btn-secondary admin-btn-sm"
            title="تحديث القائمة"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Orders Table Card */}
      <div className="admin-card">
        <div className="admin-card-header">
          <h3 className="admin-card-title">
            <ShoppingCart size={18} color="#f59e0b" />
            <span>سجل الطلبات الكامل ({filteredOrders.length})</span>
          </h3>
        </div>

        <div className="admin-table-container">
          {loading ? (
            <div style={{ padding: '32px' }}>
              <div className="admin-skeleton" style={{ height: '40px', marginBottom: '12px' }} />
              <div className="admin-skeleton" style={{ height: '40px', marginBottom: '12px' }} />
              <div className="admin-skeleton" style={{ height: '40px' }} />
            </div>
          ) : filteredOrders.length > 0 ? (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>رقم الطلب</th>
                  <th>العميل</th>
                  <th>الباقة</th>
                  <th>سعر البيع ($)</th>
                  <th>المخصوم</th>
                  <th>سعر الصرف</th>
                  <th>كاش باك</th>
                  <th>تكلفة المزود ($)</th>
                  <th>الربح ($)</th>
                  <th>الحالة</th>
                  <th>تاريخ الإنشاء</th>
                  <th>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => {
                  const saleUsd = Number(order.customerPriceUsd || order.amount || 0);
                  const chargedAmt = Number(order.chargedAmount || order.amount || 0);
                  const chargedCurr = order.chargedCurrency || 'USD';
                  const rate = Number(order.exchangeRateUsed || 0);
                  const cashbackAmt = Number(order.cashbackAmount || 0);
                  const costUsd = Number(order.cost || 0);
                  const profitUsd = saleUsd > 0 ? (saleUsd - Number(order.discountAmount || 0) - costUsd) : 0;

                  return (
                    <tr key={order.id}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 800, color: '#0f172a' }}>
                        #{order.id.slice(0, 8)}
                      </td>
                      <td>
                        <div style={{ fontWeight: 700 }}>{order.userName || 'عميل'}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{order.userEmail}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{order.packageName}</div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>ID: {order.playerId}</div>
                      </td>
                      <td style={{ fontWeight: 800, color: '#0f172a', fontFamily: 'var(--font-latin)' }}>
                        ${saleUsd.toFixed(2)}
                      </td>
                      <td style={{ fontWeight: 800, color: '#0f172a', fontFamily: 'var(--font-latin)' }}>
                        {formatCurrency(chargedAmt, chargedCurr)}
                      </td>
                      <td style={{ fontSize: '0.8rem', color: '#64748b', fontFamily: 'var(--font-latin)' }}>
                        {rate > 0 ? `1$ = ${rate.toLocaleString()}` : '-'}
                      </td>
                      <td>
                        {cashbackAmt > 0 ? (
                          <span style={{ fontSize: '0.75rem', color: '#15803d', fontWeight: 800 }}>
                            +{formatCurrency(cashbackAmt, chargedCurr)}
                          </span>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>-</span>
                        )}
                      </td>
                      <td style={{ fontWeight: 700, color: '#64748b', fontFamily: 'var(--font-latin)' }}>
                        {costUsd > 0 ? `$${costUsd.toFixed(2)}` : '-'}
                      </td>
                      <td style={{ fontWeight: 800, color: profitUsd >= 0 ? '#15803d' : '#dc2626', fontFamily: 'var(--font-latin)' }}>
                        {saleUsd > 0 ? `${profitUsd >= 0 ? '+' : ''}$${profitUsd.toFixed(2)}` : '-'}
                      </td>
                      <td>
                        <StatusBadge status={order.status} />
                      </td>
                      <td style={{ fontSize: '0.8rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                        {new Date(order.createdAt).toLocaleDateString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <button
                            onClick={() => {
                              setSelectedOrder(order);
                              setActionMsg(null);
                            }}
                            className="admin-btn admin-btn-secondary admin-btn-sm"
                          >
                            <Eye size={14} />
                            <span>تفاصيل</span>
                          </button>

                          {['PENDING', 'FAILED'].includes(order.status) && (
                            <button
                              onClick={() => {
                                setExecutingOrder(order);
                                setActionMsg(null);
                              }}
                              className="admin-btn admin-btn-primary admin-btn-sm"
                              style={{ background: '#f59e0b', color: '#0f172a', fontWeight: 800, whiteSpace: 'nowrap' }}
                              title="تنفيذ يدوي لدى مزود الخدمة"
                            >
                              <Play size={12} fill="#0f172a" />
                              <span>تنفيذ يدوي</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="admin-empty-state">
              <div className="admin-empty-icon">
                <ShoppingCart size={28} />
              </div>
              <h4 className="admin-empty-title">لا توجد طلبات مطابقة</h4>
              <p className="admin-empty-text">لم يتم العثور على أي طلب يطابق معايير الفلترة المحددة.</p>
            </div>
          )}
        </div>
      </div>

      {/* Order Details & Execution Modal */}
      {selectedOrder && (
        <div className="admin-modal-backdrop" onClick={() => setSelectedOrder(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3 className="admin-modal-title">
                إدارة الطلب #{selectedOrder.id.slice(0, 8)}
              </h3>
              <button className="admin-modal-close" onClick={() => setSelectedOrder(null)}>✕</button>
            </div>

            <div className="admin-modal-body">
              {actionMsg && (
                <div style={{ 
                  padding: '12px', 
                  borderRadius: '8px', 
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  background: actionMsg.type === 'success' ? '#ecfdf5' : '#fef2f2',
                  border: `1px solid ${actionMsg.type === 'success' ? '#a7f3d0' : '#fecaca'}`,
                  color: actionMsg.type === 'success' ? '#065f46' : '#991b1b'
                }}>
                  {actionMsg.text}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
                <div>
                  <div className="admin-label">صاحب الطلب</div>
                  <div style={{ fontWeight: 700 }}>{selectedOrder.userName || 'مستخدم'}</div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{selectedOrder.userEmail}</div>
                </div>

                <div>
                  <div className="admin-label">الحالة الحالية</div>
                  <StatusBadge status={selectedOrder.status} />
                </div>

                <div>
                  <div className="admin-label">المنتج / الباقة المطلوبة</div>
                  <div style={{ fontWeight: 700 }}>{selectedOrder.packageName}</div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b' }}>كود النظام: {selectedOrder.gameId}</div>
                </div>

                <div style={{ gridColumn: 'span 2', padding: '14px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                  <div className="admin-label" style={{ marginBottom: '8px', color: '#1e293b', fontWeight: 800 }}>
                    تفاصيل التسعير والعملات (Financial Breakdown)
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
                    <div>
                      <span style={{ fontSize: '0.72rem', color: '#64748b', display: 'block' }}>المبلغ المخصوم من العميل</span>
                      <strong style={{ fontSize: '1.05rem', color: '#0284c7' }}>
                        {formatCurrency(selectedOrder.chargedAmount ?? selectedOrder.amount, (selectedOrder.chargedCurrency as any) || 'USD')}
                      </strong>
                    </div>

                    <div>
                      <span style={{ fontSize: '0.72rem', color: '#64748b', display: 'block' }}>سعر البيع (USD)</span>
                      <strong style={{ fontSize: '1.05rem', color: '#334155' }}>
                        {formatCurrency(selectedOrder.customerPriceUsd ?? selectedOrder.amount, 'USD')}
                      </strong>
                    </div>

                    {selectedOrder.chargedCurrency === 'SDG' && (
                      <div>
                        <span style={{ fontSize: '0.72rem', color: '#64748b', display: 'block' }}>سعر الصرف المعتمد</span>
                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#475569' }}>
                          1$ = {Number(selectedOrder.exchangeRateUsed || 3000).toLocaleString()} ج.س
                        </span>
                      </div>
                    )}

                    {selectedOrder.promoDiscount != null && Number(selectedOrder.promoDiscount) > 0 && (
                      <div>
                        <span style={{ fontSize: '0.72rem', color: '#64748b', display: 'block' }}>خصم الكوبون ({selectedOrder.promoCode})</span>
                        <strong style={{ fontSize: '0.9rem', color: '#16a34a' }}>
                          -{formatCurrency(selectedOrder.promoDiscount, 'USD')}
                        </strong>
                      </div>
                    )}

                    <div>
                      <span style={{ fontSize: '0.72rem', color: '#64748b', display: 'block' }}>الكاش باك الممنوح</span>
                      <strong style={{ fontSize: '0.9rem', color: selectedOrder.cashbackAmount && Number(selectedOrder.cashbackAmount) > 0 ? '#16a34a' : '#94a3b8' }}>
                        {selectedOrder.cashbackAmount && Number(selectedOrder.cashbackAmount) > 0
                          ? `+${formatCurrency(selectedOrder.cashbackAmount, (selectedOrder.cashbackCurrency as any) || 'USD')}`
                          : 'لا يوجد كاش باك'}
                      </strong>
                    </div>

                    <div>
                      <span style={{ fontSize: '0.72rem', color: '#64748b', display: 'block' }}>تكلفة المزود (USD)</span>
                      <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#64748b' }}>
                        {selectedOrder.costUsd != null ? formatCurrency(selectedOrder.costUsd, 'USD') : '—'}
                      </span>
                    </div>

                    <div>
                      <span style={{ fontSize: '0.72rem', color: '#64748b', display: 'block' }}>هامش الربح (USD)</span>
                      <strong style={{ 
                        fontSize: '0.95rem', 
                        color: selectedOrder.profitUsd != null ? (Number(selectedOrder.profitUsd) >= 0 ? '#16a34a' : '#dc2626') : '#94a3b8' 
                      }}>
                        {selectedOrder.profitUsd != null ? formatCurrency(selectedOrder.profitUsd, 'USD') : '—'}
                      </strong>
                    </div>
                  </div>
                </div>

                <div style={{ gridColumn: 'span 2', padding: '14px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div className="admin-label" style={{ margin: 0, fontWeight: 800, color: '#1e293b' }}>
                      بيانات اللاعب والتنفيذ (Player & Server Details)
                    </div>
                    {selectedOrder.playerId && (
                      <button
                        type="button"
                        onClick={() => handleAdminVerifyPlayer(selectedOrder.id)}
                        disabled={adminVerifying}
                        className="admin-btn admin-btn-secondary admin-btn-sm"
                        style={{ padding: '4px 12px', fontSize: '0.78rem', fontWeight: 700, gap: 6 }}
                      >
                        {adminVerifying ? (
                          <>
                            <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                            <span>جارٍ التحقق...</span>
                          </>
                        ) : (
                          <>
                            <ShieldCheck size={14} color="#0284c7" />
                            <span>تحقق من ID</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
                    <div>
                      <span style={{ fontSize: '0.72rem', color: '#64748b', display: 'block', marginBottom: 2 }}>معرّف الحساب (Player ID):</span>
                      <code style={{ fontSize: '1rem', fontWeight: 900, color: '#0f172a', background: '#ffffff', padding: '4px 8px', borderRadius: 4, border: '1px solid #cbd5e1', display: 'inline-block' }}>
                        {selectedOrder.playerId}
                      </code>
                    </div>

                    {selectedOrder.serverId && (
                      <div>
                        <span style={{ fontSize: '0.72rem', color: '#64748b', display: 'block', marginBottom: 2 }}>خادم اللعبة (Server ID):</span>
                        <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#334155' }}>
                          {selectedOrder.serverId}
                        </span>
                      </div>
                    )}

                    {selectedOrder.playerName ? (
                      <div>
                        <span style={{ fontSize: '0.72rem', color: '#059669', display: 'block', fontWeight: 700, marginBottom: 2 }}>اسم اللاعب المتحقق منه:</span>
                        <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#065f46' }}>
                          ✓ {selectedOrder.playerName}
                        </span>
                      </div>
                    ) : (
                      <div>
                        <span style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'block', marginBottom: 2 }}>اسم اللاعب:</span>
                        <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>لم يتم التحقق بعد</span>
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ gridColumn: 'span 2' }}>
                  <div className="admin-label">تاريخ ووقت الإنشاء</div>
                  <div style={{ fontSize: '0.875rem', color: '#475569' }}>
                    {new Date(selectedOrder.createdAt).toLocaleString('ar-EG')}
                  </div>
                </div>

                {/* Provider & Fulfillment Information */}
                <div style={{ gridColumn: 'span 2', padding: '12px', background: '#f1f5f9', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                  <div className="admin-label">تفاصيل المزود (GamesDrop Partner API)</div>
                  <div style={{ fontSize: '0.85rem', color: '#1e293b', fontWeight: 700 }}>
                    المزود: {selectedOrder.provider || 'GAMESDROP'} • رقم طلب المزود: {selectedOrder.providerOrderId ? `#${selectedOrder.providerOrderId}` : 'قيد الإنشاء / محلي'}
                  </div>
                  {selectedOrder.providerStatus && (
                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 2 }}>
                      حالة المزود الخام: <code>{selectedOrder.providerStatus}</code>
                    </div>
                  )}
                  {selectedOrder.failureReason && (
                    <div style={{ fontSize: '0.8rem', color: '#b91c1c', marginTop: 4 }}>
                      سبب الفشل / التعثر: {selectedOrder.failureReason}
                    </div>
                  )}
                </div>

                {/* Delivered Key */}
                {selectedOrder.fulfillmentKey && (
                  <div style={{ gridColumn: 'span 2', padding: '12px', background: '#0B0F19', borderRadius: '8px', border: '1.5px solid var(--accent-yellow)', color: '#fff' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--accent-yellow)', fontWeight: 800 }}>
                      <Key size={16} />
                      <span>مفتاح التفعيل المسلّم (Digital Key):</span>
                    </div>
                    <code style={{ display: 'block', marginTop: '6px', fontSize: '1.1rem', fontWeight: 900, color: '#facc15', letterSpacing: '1px', fontFamily: 'monospace' }}>
                      {selectedOrder.fulfillmentKey}
                    </code>
                  </div>
                )}
              </div>

              {/* Manual Provider Execution Card */}
              {['PENDING', 'FAILED'].includes(selectedOrder.status) && (
                <div style={{ 
                  marginTop: '16px', 
                  padding: '16px', 
                  background: '#fef3c7', 
                  border: '1.5px solid #f59e0b', 
                  borderRadius: '12px' 
                }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#92400e', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Zap size={18} color="#d97706" />
                    <span>تنفيذ الطلب يدويًا لدى المزود (GamesDrop)</span>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: '#78350f', margin: '0 0 12px 0', lineHeight: 1.5 }}>
                    سيتم إرسال الطلب فوراً إلى مزود الخدمة واستخدام نفس دورة المعالجة والمتابعة الآلية مع حماية تامة ضد التكرار.
                  </p>
                  <button
                    onClick={() => setExecutingOrder(selectedOrder)}
                    disabled={actionLoading || manualExecuteLoading}
                    className="admin-btn admin-btn-primary"
                    style={{ width: '100%', padding: '12px', fontSize: '0.95rem', fontWeight: 800, gap: 8, background: '#f59e0b', color: '#0f172a' }}
                  >
                    <Play size={16} fill="#0f172a" />
                    <span>تنفيذ الطلب يدويًا</span>
                  </button>
                </div>
              )}

              {/* Administrative Status Override Actions */}
              {selectedOrder.status === 'PENDING' && (
                <div style={{ 
                  marginTop: '12px', 
                  padding: '16px', 
                  background: '#fffbeb', 
                  border: '1px solid #fde68a', 
                  borderRadius: '12px' 
                }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#92400e', marginBottom: '8px' }}>
                    تغيير الحالة المباشر (تخطي المزود):
                  </div>
                  <p style={{ fontSize: '0.8rem', color: '#78350f', margin: '0 0 12px 0' }}>
                    يمكنك تأكيد تسليم الشحنة للعميل يدوياً أو رفضها مع استرجاع المبلغ لمحفظته فوراً.
                  </p>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      onClick={() => handleUpdateStatus(selectedOrder.id, 'COMPLETED')}
                      disabled={actionLoading}
                      className="admin-btn admin-btn-primary admin-btn-sm"
                      style={{ flex: 1 }}
                    >
                      <CheckCircle2 size={16} />
                      <span>تسليم يدوي (مكتمل)</span>
                    </button>
                    <button
                      onClick={() => handleUpdateStatus(selectedOrder.id, 'FAILED')}
                      disabled={actionLoading}
                      className="admin-btn admin-btn-danger admin-btn-sm"
                      style={{ flex: 1 }}
                    >
                      <XCircle size={16} />
                      <span>رفض واسترجاع الرصيد</span>
                    </button>
                  </div>
                </div>
              )}
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

      {/* Manual Execution Confirmation Modal */}
      {executingOrder && (
        <div className="admin-modal-backdrop" style={{ zIndex: 1100 }}>
          <div className="admin-modal" style={{ maxWidth: '440px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: '24px 20px 16px' }}>
              <div style={{
                width: '54px',
                height: '54px',
                borderRadius: '50%',
                background: '#fef3c7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
                border: '2px solid #f59e0b'
              }}>
                <Zap size={28} color="#d97706" />
              </div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 900, color: '#0f172a', marginBottom: '8px' }}>
                تأكيد التنفيذ اليدوي
              </h3>
              <p style={{ fontSize: '1rem', fontWeight: 800, color: '#1e293b', marginBottom: '8px' }}>
                هل تريد تنفيذ هذا الطلب يدويًا؟
              </p>
              <p style={{ fontSize: '0.82rem', color: '#64748b', margin: 0, lineHeight: 1.5 }}>
                الطلب: <strong>#{executingOrder.id.slice(0, 8)}</strong> ({executingOrder.packageName})<br />
                اللاعب: <code style={{ fontWeight: 800 }}>{executingOrder.playerId}</code>
                {executingOrder.serverId ? ` • السيرفر: ${executingOrder.serverId}` : ''}
              </p>
            </div>

            <div className="admin-modal-footer" style={{ display: 'flex', gap: 10, padding: '14px 20px' }}>
              <button
                onClick={handleManualExecute}
                disabled={manualExecuteLoading}
                className="admin-btn admin-btn-primary"
                style={{ flex: 1, padding: '10px', fontWeight: 800, background: '#f59e0b', color: '#0f172a' }}
              >
                {manualExecuteLoading ? 'جارٍ التنفيذ...' : 'تنفيذ'}
              </button>
              <button
                onClick={() => setExecutingOrder(null)}
                disabled={manualExecuteLoading}
                className="admin-btn admin-btn-secondary"
                style={{ flex: 1, padding: '10px', fontWeight: 700 }}
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
