import React, { useEffect, useState } from 'react';
import { 
  Coins, 
  Search, 
  CheckCircle2, 
  XCircle, 
  RefreshCw, 
  Copy, 
  Check, 
  ExternalLink, 
  ShieldAlert, 
  ArrowUpRight, 
  Lock, 
  DollarSign, 
  Sliders, 
  Eye, 
  Globe,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { api } from '../../lib/api';

interface CryptoStats {
  inventory: {
    available: number;
    reserved: number;
    sold: number;
    minOrderAmount: number;
    exchangeRate: number;
    updatedAt: string;
  };
  ordersSummary: {
    totalCryptoOrders: string | number;
    awaitingOrders: string | number;
    completedOrders: string | number;
    canceledOrders: string | number;
  };
  networks: Array<{
    id: string;
    identifier: string;
    name: string;
    currency: string;
    validator_type: string;
    min_amount: number;
    enabled: boolean;
    display_order: number;
  }>;
}

interface CryptoOrder {
  id: string;
  userId: string;
  userEmail: string;
  userName: string | null;
  usdtAmount: number;
  cryptoNetwork: string;
  walletAddress: string;
  chargedAmount: number;
  chargedCurrency: string;
  exchangeRateUsed: number;
  status: 'AWAITING_TRANSFER' | 'COMPLETED' | 'CANCELED';
  txHash: string | null;
  createdAt: string;
  completedAt: string | null;
  canceledAt: string | null;
  canceledReason: string | null;
}

export const AdminCrypto: React.FC = () => {
  const [stats, setStats] = useState<CryptoStats | null>(null);
  const [orders, setOrders] = useState<CryptoOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'AWAITING_TRANSFER' | 'COMPLETED' | 'CANCELED'>('ALL');

  // Copy feedback state
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Modals state
  const [completeModalOrder, setCompleteModalOrder] = useState<CryptoOrder | null>(null);
  const [txHashInput, setTxHashInput] = useState('');
  const [isCompleting, setIsCompleting] = useState(false);

  const [cancelModalOrder, setCancelModalOrder] = useState<CryptoOrder | null>(null);
  const [cancelReasonInput, setCancelReasonInput] = useState('');
  const [isCanceling, setIsCanceling] = useState(false);

  const [inventoryModalOpen, setInventoryModalOpen] = useState(false);
  const [newAvailableInput, setNewAvailableInput] = useState<number | string>('');
  const [isSavingInventory, setIsSavingInventory] = useState(false);

  const [rateModalOpen, setRateModalOpen] = useState(false);
  const [newRateInput, setNewRateInput] = useState<number | string>('');
  const [isSavingRate, setIsSavingRate] = useState(false);

  const [activeTab, setActiveTab] = useState<'orders' | 'networks'>('orders');

  const fetchData = async () => {
    try {
      setRefreshing(true);
      const [statsRes, ordersRes] = await Promise.all([
        api.get('/api/admin/crypto/stats'),
        api.get(`/api/admin/crypto/orders?status=${statusFilter}&search=${encodeURIComponent(search)}`)
      ]);

      if (statsRes) setStats(statsRes);
      if (ordersRes?.orders) setOrders(ordersRes.orders);
    } catch (err) {
      console.error('Failed to load crypto admin data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [statusFilter, search]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleOpenCompleteModal = (order: CryptoOrder) => {
    setCompleteModalOrder(order);
    setTxHashInput('');
  };

  const handleConfirmComplete = async () => {
    if (!completeModalOrder) return;
    setIsCompleting(true);
    try {
      await api.post(`/api/admin/crypto/orders/${completeModalOrder.id}/complete`, {
        txHash: txHashInput.trim() || undefined
      });
      setCompleteModalOrder(null);
      await fetchData();
    } catch (err: any) {
      alert(err.message || 'فشل إكمال الطلب.');
    } finally {
      setIsCompleting(false);
    }
  };

  const handleOpenCancelModal = (order: CryptoOrder) => {
    setCancelModalOrder(order);
    setCancelReasonInput('');
  };

  const handleConfirmCancel = async () => {
    if (!cancelModalOrder) return;
    setIsCanceling(true);
    try {
      await api.post(`/api/admin/crypto/orders/${cancelModalOrder.id}/cancel`, {
        reason: cancelReasonInput.trim() || 'إلغاء من قبل إدارة المنصة'
      });
      setCancelModalOrder(null);
      await fetchData();
    } catch (err: any) {
      alert(err.message || 'فشل إلغاء الطلب.');
    } finally {
      setIsCanceling(false);
    }
  };

  const handleSaveInventory = async () => {
    const num = Number(newAvailableInput);
    if (isNaN(num) || num < 0) {
      alert('الكمية المتاحة يجب أن تكون رقماً أكبر من أو يساوي 0.');
      return;
    }
    setIsSavingInventory(true);
    try {
      await api.patch('/api/admin/crypto/inventory', { available: num });
      setInventoryModalOpen(false);
      await fetchData();
    } catch (err: any) {
      alert(err.message || 'فشل تحديث المخزون.');
    } finally {
      setIsSavingInventory(false);
    }
  };

  const handleSaveRate = async () => {
    const num = Number(newRateInput);
    if (isNaN(num) || num <= 0) {
      alert('سعر الصرف يجب أن يكون رقماً أكبر من 0.');
      return;
    }
    setIsSavingRate(true);
    try {
      await api.patch('/api/admin/crypto/rate', { rate: num });
      setRateModalOpen(false);
      await fetchData();
    } catch (err: any) {
      alert(err.message || 'فشل تحديث سعر الصرف.');
    } finally {
      setIsSavingRate(false);
    }
  };

  const handleToggleNetwork = async (networkId: string, currentEnabled: boolean) => {
    try {
      await api.patch(`/api/admin/crypto/networks/${networkId}`, {
        enabled: !currentEnabled
      });
      await fetchData();
    } catch (err: any) {
      alert(err.message || 'فشل تعديل حالة الشبكة.');
    }
  };

  return (
    <div className="admin-page-container">
      {/* Page Header */}
      <div className="admin-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ background: 'rgba(245, 158, 11, 0.15)', border: '1px solid #F59E0B', padding: 8, borderRadius: 10 }}>
              <Coins size={24} color="#F59E0B" />
            </div>
            <h1 className="admin-page-title" style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>
              إدارة USDT والتحويل الفوري (Manual Transfer)
            </h1>
          </div>
          <p style="margin: 6px 0 0 0; color: #94A3B8; font-size: 14px;">
            متابعة طلبات تحويل USDT الفورية، إدارة المخزون الذري، وضبط أسعار الصرف والشبكات المدعومة.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            onClick={fetchData}
            disabled={refreshing}
            className="admin-btn admin-btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#1E293B', color: '#F8FAFC', border: '1px solid #334155', padding: '10px 16px', borderRadius: 8, cursor: 'pointer' }}
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            <span>تحديث البيانات</span>
          </button>
        </div>
      </div>

      {/* Top Stats Cards */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
          {/* Available Inventory */}
          <div style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 12, padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ color: '#94A3B8', fontSize: 13, fontWeight: 600 }}>المخزون المتاح (Available)</span>
              <button 
                type="button"
                onClick={() => {
                  setNewAvailableInput(stats.inventory.available);
                  setInventoryModalOpen(true);
                }}
                style={{ background: 'transparent', border: 'none', color: '#38BDF8', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <Sliders size={14} /> تعديل
              </button>
            </div>
            <div style={{ fontSize: 26, fontWeight: 900, color: '#10B981' }}>
              {stats.inventory.available.toLocaleString()} <span style={{ fontSize: 14, color: '#94A3B8' }}>USDT</span>
            </div>
          </div>

          {/* Reserved Inventory */}
          <div style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 12, padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ color: '#94A3B8', fontSize: 13, fontWeight: 600 }}>المحجوز حالياً (Reserved)</span>
              <Lock size={16} color="#F59E0B" />
            </div>
            <div style={{ fontSize: 26, fontWeight: 900, color: '#F59E0B' }}>
              {stats.inventory.reserved.toLocaleString()} <span style={{ fontSize: 14, color: '#94A3B8' }}>USDT</span>
            </div>
          </div>

          {/* Sold Inventory */}
          <div style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 12, padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ color: '#94A3B8', fontSize: 13, fontWeight: 600 }}>إجمالي المباع (Sold)</span>
              <ArrowUpRight size={16} color="#38BDF8" />
            </div>
            <div style={{ fontSize: 26, fontWeight: 900, color: '#38BDF8' }}>
              {stats.inventory.sold.toLocaleString()} <span style={{ fontSize: 14, color: '#94A3B8' }}>USDT</span>
            </div>
          </div>

          {/* Exchange Rate */}
          <div style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 12, padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ color: '#94A3B8', fontSize: 13, fontWeight: 600 }}>سعر الصرف (1 USD)</span>
              <button 
                type="button"
                onClick={() => {
                  setNewRateInput(stats.inventory.exchangeRate);
                  setRateModalOpen(true);
                }}
                style={{ background: 'transparent', border: 'none', color: '#38BDF8', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <DollarSign size={14} /> تعديل
              </button>
            </div>
            <div style={{ fontSize: 26, fontWeight: 900, color: '#F8FAFC' }}>
              {stats.inventory.exchangeRate.toLocaleString()} <span style={{ fontSize: 14, color: '#94A3B8' }}>SDG</span>
            </div>
          </div>

          {/* Minimum Purchase */}
          <div style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 12, padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ color: '#94A3B8', fontSize: 13, fontWeight: 600 }}>الحد الأدنى للشراء</span>
              <span style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#10B981', fontSize: 11, padding: '2px 8px', borderRadius: 6, fontWeight: 700 }}>Hard Floor</span>
            </div>
            <div style={{ fontSize: 26, fontWeight: 900, color: '#F8FAFC' }}>
              {stats.inventory.minOrderAmount} <span style={{ fontSize: 14, color: '#94A3B8' }}>USDT (إجباري)</span>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', gap: 12, borderBottom: '1px solid #1E293B', marginBottom: 20 }}>
        <button
          type="button"
          onClick={() => setActiveTab('orders')}
          style={{
            padding: '12px 20px',
            background: 'transparent',
            border: 'none',
            borderBottom: activeTab === 'orders' ? '2px solid #F59E0B' : '2px solid transparent',
            color: activeTab === 'orders' ? '#F59E0B' : '#94A3B8',
            fontWeight: 800,
            cursor: 'pointer',
            fontSize: 15
          }}
        >
          قائمة الطلبات ({stats?.ordersSummary.totalCryptoOrders || 0})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('networks')}
          style={{
            padding: '12px 20px',
            background: 'transparent',
            border: 'none',
            borderBottom: activeTab === 'networks' ? '2px solid #F59E0B' : '2px solid transparent',
            color: activeTab === 'networks' ? '#F59E0B' : '#94A3B8',
            fontWeight: 800,
            cursor: 'pointer',
            fontSize: 15
          }}
        >
          الشبكات المدعومة ({stats?.networks.length || 0})
        </button>
      </div>

      {activeTab === 'orders' ? (
        <>
          {/* Filters and Search Bar */}
          <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['ALL', 'AWAITING_TRANSFER', 'COMPLETED', 'CANCELED'] as const).map(tab => {
                const labels: Record<string, string> = {
                  ALL: 'الكل',
                  AWAITING_TRANSFER: '⏳ في انتظار التحويل',
                  COMPLETED: '✅ مكتملة',
                  CANCELED: '❌ ملغية'
                };
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setStatusFilter(tab)}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 8,
                      border: statusFilter === tab ? '1px solid #F59E0B' : '1px solid #334155',
                      background: statusFilter === tab ? 'rgba(245, 158, 11, 0.15)' : '#1E293B',
                      color: statusFilter === tab ? '#F59E0B' : '#94A3B8',
                      fontWeight: 700,
                      fontSize: 13,
                      cursor: 'pointer'
                    }}
                  >
                    {labels[tab]}
                  </button>
                );
              })}
            </div>

            <div style={{ position: 'relative', width: 320 }}>
              <Search size={16} color="#64748B" style={{ position: 'absolute', right: 12, top: 12 }} />
              <input
                type="text"
                placeholder="بحث برقم الطلب، المحفظة، أو العميل..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  width: '100%',
                  background: '#0F172A',
                  border: '1px solid #1E293B',
                  borderRadius: 8,
                  padding: '10px 38px 10px 14px',
                  color: '#F8FAFC',
                  fontSize: 13
                }}
              />
            </div>
          </div>

          {/* Orders Table */}
          <div style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 12, overflow: 'hidden' }}>
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>
                <Loader2 size={32} className="animate-spin" style={{ margin: '0 auto 12px' }} />
                <p>جاري تحميل طلبات التحويل...</p>
              </div>
            ) : orders.length === 0 ? (
              <div style={{ padding: 60, textAlign: 'center', color: '#64748B' }}>
                <Coins size={44} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
                <p style={{ fontSize: 16, fontWeight: 700 }}>لا توجد طلبات تحويل مطابقة حالياً.</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#1E293B', color: '#94A3B8', borderBottom: '1px solid #334155' }}>
                      <th style={{ padding: '14px 16px' }}>رقم الطلب</th>
                      <th style={{ padding: '14px 16px' }}>العميل</th>
                      <th style={{ padding: '14px 16px' }}>المبلغ المطلوب</th>
                      <th style={{ padding: '14px 16px' }}>الشبكة</th>
                      <th style={{ padding: '14px 16px' }}>عنوان المحفظة</th>
                      <th style={{ padding: '14px 16px' }}>المبلغ المخصوم</th>
                      <th style={{ padding: '14px 16px' }}>الحالة</th>
                      <th style={{ padding: '14px 16px' }}>التاريخ</th>
                      <th style={{ padding: '14px 16px', textAlign: 'center' }}>الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map(order => {
                      const isAwaiting = order.status === 'AWAITING_TRANSFER';
                      const isCompleted = order.status === 'COMPLETED';
                      const isCanceled = order.status === 'CANCELED';

                      return (
                        <tr key={order.id} style={{ borderBottom: '1px solid #1E293B', transition: 'background 0.2s' }}>
                          {/* Order ID */}
                          <td style={{ padding: '14px 16px', fontFamily: 'monospace', fontWeight: 800, color: '#F8FAFC' }}>
                            #{order.id.slice(0, 8).toUpperCase()}
                          </td>

                          {/* Customer */}
                          <td style={{ padding: '14px 16px' }}>
                            <div style={{ fontWeight: 700, color: '#F8FAFC' }}>{order.userName || 'عميل'}</div>
                            <div style={{ fontSize: 11, color: '#64748B' }}>{order.userEmail}</div>
                          </td>

                          {/* Amount */}
                          <td style={{ padding: '14px 16px' }}>
                            <span style={{ fontSize: 15, fontWeight: 900, color: '#10B981' }}>
                              {order.usdtAmount} USDT
                            </span>
                          </td>

                          {/* Network */}
                          <td style={{ padding: '14px 16px' }}>
                            <span style={{ background: '#1E293B', border: '1px solid #334155', padding: '3px 8px', borderRadius: 6, fontSize: 12, fontWeight: 700 }}>
                              {order.cryptoNetwork}
                            </span>
                          </td>

                          {/* Wallet Address with Copy */}
                          <td style={{ padding: '14px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, direction: 'ltr' }}>
                              <span style={{ fontFamily: 'monospace', color: '#94A3B8', fontSize: 12 }}>
                                {order.walletAddress.length > 18 
                                  ? `${order.walletAddress.slice(0, 8)}...${order.walletAddress.slice(-6)}` 
                                  : order.walletAddress}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleCopy(order.walletAddress, order.id)}
                                title="نسخ العنوان بالكامل"
                                style={{ background: 'transparent', border: 'none', color: copiedId === order.id ? '#10B981' : '#64748B', cursor: 'pointer', padding: 2 }}
                              >
                                {copiedId === order.id ? <Check size={14} /> : <Copy size={14} />}
                              </button>
                            </div>
                          </td>

                          {/* Charged Price */}
                          <td style={{ padding: '14px 16px', fontWeight: 700, color: '#F8FAFC' }}>
                            {Number(order.chargedAmount).toLocaleString()} {order.chargedCurrency}
                          </td>

                          {/* Status */}
                          <td style={{ padding: '14px 16px' }}>
                            {isAwaiting && (
                              <span style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#F59E0B', border: '1px solid rgba(245, 158, 11, 0.3)', padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 800 }}>
                                ⏳ قيد المعالجة
                              </span>
                            )}
                            {isCompleted && (
                              <span style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10B981', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 800 }}>
                                ✓ تم التحويل
                              </span>
                            )}
                            {isCanceled && (
                              <span style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#EF4444', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 800 }}>
                                ✕ ملغي
                              </span>
                            )}
                          </td>

                          {/* Created Date */}
                          <td style={{ padding: '14px 16px', color: '#64748B', fontSize: 12 }}>
                            {new Date(order.createdAt).toLocaleString('ar-SA', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </td>

                          {/* Actions */}
                          <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                              {isAwaiting ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenCompleteModal(order)}
                                    title="تأكيد التحويل وإكمال الطلب"
                                    style={{
                                      background: '#10B981',
                                      color: '#064E3B',
                                      border: 'none',
                                      borderRadius: 6,
                                      padding: '6px 12px',
                                      fontWeight: 800,
                                      fontSize: 12,
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 4
                                    }}
                                  >
                                    <CheckCircle2 size={14} />
                                    تم التحويل
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleOpenCancelModal(order)}
                                    title="إلغاء الطلب ورد الرصيد"
                                    style={{
                                      background: 'rgba(239, 68, 68, 0.2)',
                                      color: '#EF4444',
                                      border: '1px solid rgba(239, 68, 68, 0.3)',
                                      borderRadius: 6,
                                      padding: '6px 10px',
                                      fontWeight: 700,
                                      fontSize: 12,
                                      cursor: 'pointer'
                                    }}
                                  >
                                    إلغاء
                                  </button>
                                </>
                              ) : isCompleted ? (
                                <span style={{ fontSize: 12, color: '#94A3B8' }}>
                                  {order.txHash ? (
                                    <span title={order.txHash} style={{ fontFamily: 'monospace', color: '#38BDF8' }}>
                                      Tx: {order.txHash.slice(0, 8)}...
                                    </span>
                                  ) : (
                                    'مكتمل'
                                  )}
                                </span>
                              ) : (
                                <span style={{ fontSize: 12, color: '#EF4444' }} title={order.canceledReason || ''}>
                                  مسترجع
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        /* Networks Tab */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
          {stats?.networks.map(net => (
            <div key={net.id} style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 12, padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ background: '#1E293B', padding: 8, borderRadius: 8 }}>
                    <Globe size={20} color="#F59E0B" />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#F8FAFC' }}>{net.name}</h3>
                    <span style={{ fontSize: 12, color: '#64748B', fontFamily: 'monospace' }}>{net.identifier} ({net.validator_type})</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleToggleNetwork(net.id, net.enabled)}
                  style={{
                    background: net.enabled ? '#10B981' : '#334155',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: 20,
                    padding: '4px 12px',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  {net.enabled ? 'مفعلة' : 'معطلة'}
                </button>
              </div>

              <div style={{ background: '#1E293B', padding: 12, borderRadius: 8, fontSize: 13, color: '#94A3B8', display: 'flex', justifyContent: 'space-between' }}>
                <span>الحد الأدنى للتحويل:</span>
                <span style={{ fontWeight: 800, color: '#F8FAFC' }}>{net.min_amount} USDT</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Complete Order Confirmation Modal */}
      {completeModalOrder && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ background: '#0F172A', border: '1px solid #10B981', borderRadius: 14, width: '100%', maxWidth: 480, padding: 24, boxShadow: '0 20px 40px rgba(0,0,0,0.6)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, color: '#10B981' }}>
              <CheckCircle2 size={24} />
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>تأكيد إتمام تحويل USDT</h2>
            </div>

            <p style={{ color: '#94A3B8', fontSize: 14, lineHeight: 1.6, marginBottom: 18 }}>
              هل قمت بالفعل بتحويل <strong style={{ color: '#F8FAFC' }}>{completeModalOrder.usdtAmount} USDT</strong> على شبكة <strong style={{ color: '#F8FAFC' }}>{completeModalOrder.cryptoNetwork}</strong> إلى العنوان التالي:
            </p>

            <div style={{ background: '#1E293B', padding: 12, borderRadius: 8, fontFamily: 'monospace', fontSize: 13, color: '#38BDF8', direction: 'ltr', wordBreak: 'break-all', marginBottom: 18 }}>
              {completeModalOrder.walletAddress}
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#94A3B8', marginBottom: 6 }}>
                رمز المعاملة (TxID / Hash) - اختياري:
              </label>
              <input
                type="text"
                placeholder="0x..."
                value={txHashInput}
                onChange={(e) => setTxHashInput(e.target.value)}
                style={{
                  width: '100%',
                  background: '#0B0F19',
                  border: '1px solid #334155',
                  borderRadius: 8,
                  padding: '10px 14px',
                  color: '#F8FAFC',
                  fontFamily: 'monospace',
                  fontSize: 13
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setCompleteModalOrder(null)}
                disabled={isCompleting}
                style={{ background: '#1E293B', color: '#94A3B8', border: 'none', padding: '10px 18px', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleConfirmComplete}
                disabled={isCompleting}
                style={{ background: '#10B981', color: '#064E3B', border: 'none', padding: '10px 20px', borderRadius: 8, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                {isCompleting ? <Loader2 size={16} className="animate-spin" /> : null}
                تأكيد إتمام التحويل
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Order Modal */}
      {cancelModalOrder && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ background: '#0F172A', border: '1px solid #EF4444', borderRadius: 14, width: '100%', maxWidth: 480, padding: 24, boxShadow: '0 20px 40px rgba(0,0,0,0.6)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, color: '#EF4444' }}>
              <XCircle size={24} />
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>إلغاء طلب التحويل ورد الرصيد</h2>
            </div>

            <p style={{ color: '#94A3B8', fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>
              سيتم فك حجز <strong style={{ color: '#F8FAFC' }}>{cancelModalOrder.usdtAmount} USDT</strong> وإعادتها للمخزون، وإعادة مبلغ <strong style={{ color: '#F8FAFC' }}>{Number(cancelModalOrder.chargedAmount).toLocaleString()} {cancelModalOrder.chargedCurrency}</strong> تلقائياً إلى رصيد محفظة العميل.
            </p>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#94A3B8', marginBottom: 6 }}>
                سبب الإلغاء (يظهر للعميل في الإشعار والبريد):
              </label>
              <textarea
                rows={3}
                placeholder="مثال: عنوان المحفظة غير صحيح، أو تعذر إتمام المعاملة."
                value={cancelReasonInput}
                onChange={(e) => setCancelReasonInput(e.target.value)}
                style={{
                  width: '100%',
                  background: '#0B0F19',
                  border: '1px solid #334155',
                  borderRadius: 8,
                  padding: '10px 14px',
                  color: '#F8FAFC',
                  fontSize: 13,
                  resize: 'none'
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setCancelModalOrder(null)}
                disabled={isCanceling}
                style={{ background: '#1E293B', color: '#94A3B8', border: 'none', padding: '10px 18px', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}
              >
                تراجع
              </button>
              <button
                type="button"
                onClick={handleConfirmCancel}
                disabled={isCanceling}
                style={{ background: '#EF4444', color: '#FFFFFF', border: 'none', padding: '10px 20px', borderRadius: 8, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                {isCanceling ? <Loader2 size={16} className="animate-spin" /> : null}
                تأكيد الإلغاء ورد الرصيد
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Inventory Modal */}
      {inventoryModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ background: '#0F172A', border: '1px solid #38BDF8', borderRadius: 14, width: '100%', maxWidth: 420, padding: 24 }}>
            <h2 style={{ margin: '0 0 14px 0', fontSize: 18, fontWeight: 900, color: '#F8FAFC' }}>تعديل المخزون المتاح (Available)</h2>
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 13, color: '#94A3B8', marginBottom: 6 }}>الكمية المتاحة (USDT):</label>
              <input
                type="number"
                step="any"
                value={newAvailableInput}
                onChange={(e) => setNewAvailableInput(e.target.value)}
                style={{ width: '100%', background: '#0B0F19', border: '1px solid #334155', borderRadius: 8, padding: '10px 14px', color: '#F8FAFC', fontSize: 16, fontWeight: 700 }}
              />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setInventoryModalOpen(false)} style={{ background: '#1E293B', color: '#94A3B8', border: 'none', padding: '10px 16px', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>إلغاء</button>
              <button type="button" onClick={handleSaveInventory} disabled={isSavingInventory} style={{ background: '#38BDF8', color: '#0B0F19', border: 'none', padding: '10px 20px', borderRadius: 8, fontWeight: 900, cursor: 'pointer' }}>حفظ التعديل</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Rate Modal */}
      {rateModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ background: '#0F172A', border: '1px solid #F59E0B', borderRadius: 14, width: '100%', maxWidth: 420, padding: 24 }}>
            <h2 style={{ margin: '0 0 14px 0', fontSize: 18, fontWeight: 900, color: '#F8FAFC' }}>تعديل سعر صرف USDT</h2>
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 13, color: '#94A3B8', marginBottom: 6 }}>سعر 1 USD بالجنيه السوداني (SDG):</label>
              <input
                type="number"
                step="any"
                value={newRateInput}
                onChange={(e) => setNewRateInput(e.target.value)}
                style={{ width: '100%', background: '#0B0F19', border: '1px solid #334155', borderRadius: 8, padding: '10px 14px', color: '#F8FAFC', fontSize: 16, fontWeight: 700 }}
              />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setRateModalOpen(false)} style={{ background: '#1E293B', color: '#94A3B8', border: 'none', padding: '10px 16px', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>إلغاء</button>
              <button type="button" onClick={handleSaveRate} disabled={isSavingRate} style={{ background: '#F59E0B', color: '#0B0F19', border: 'none', padding: '10px 20px', borderRadius: 8, fontWeight: 900, cursor: 'pointer' }}>حفظ السعر</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminCrypto;
