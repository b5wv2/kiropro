import React, { useEffect, useState, useMemo } from 'react';
import { usePartner } from '../../context/PartnerContext';
import { 
  ShoppingBag, 
  Search, 
  Copy, 
  Check, 
  RefreshCw,
  Eye,
  CreditCard,
  Key,
  ShieldCheck,
  X,
  EyeOff
} from 'lucide-react';

interface PartnerOrder {
  id: string;
  orderNumber: string;
  productName: string;
  productId?: string;
  gameId?: string;
  playerId?: string;
  quantity?: number;
  amountUsd: number;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';
  providerOrderId?: string;
  createdAt: string;
}

interface OrderCredentialsModal {
  orderId: string;
  orderNumber: string;
  productName: string;
  type: 'KIROPRO_CARD' | 'DIGITAL_ACCOUNT' | 'STANDARD';
  card?: {
    id: string;
    cardNumber: string;
    cardLast4: string;
    expDate: string;
    cvv: string;
    balance: number;
  };
  accounts?: Array<{
    id: string;
    email: string;
    password: string;
  }>;
}

export const PartnerOrders: React.FC = () => {
  const { partnerFetch } = usePartner();

  const [orders, setOrders] = useState<PartnerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Credentials reveal modal
  const [credentialsModal, setCredentialsModal] = useState<OrderCredentialsModal | null>(null);
  const [loadingCredentials, setLoadingCredentials] = useState(false);
  const [showPan, setShowPan] = useState(false);
  const [showCvv, setShowCvv] = useState(false);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const res = await partnerFetch<{ success: boolean; orders: PartnerOrder[] }>('/api/partner/orders?limit=100');
      if (res?.orders) {
        setOrders(res.orders);
      }
    } catch (err) {
      console.error('Failed to load partner orders', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleViewCredentials = async (ord: PartnerOrder) => {
    try {
      setLoadingCredentials(true);
      const res = await partnerFetch<any>(`/api/partner/orders/${ord.id}/credentials`);
      if (res && res.success) {
        setCredentialsModal({
          orderId: ord.id,
          orderNumber: ord.orderNumber,
          productName: ord.productName,
          type: res.type,
          card: res.card,
          accounts: res.accounts
        });
        setShowPan(false);
        setShowCvv(false);
      }
    } catch (err: any) {
      alert(err.message || 'تعذر جلب بيانات الاعتماد للطلب.');
    } finally {
      setLoadingCredentials(false);
    }
  };

  // Filtered orders
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const matchStatus = statusFilter === 'ALL' || o.status === statusFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchSearch = !q ||
        o.orderNumber.toLowerCase().includes(q) ||
        (o.playerId && o.playerId.toLowerCase().includes(q)) ||
        o.productName.toLowerCase().includes(q);
      return matchStatus && matchSearch;
    });
  }, [orders, statusFilter, searchQuery]);

  const getStatusBadge = (status: PartnerOrder['status']) => {
    switch (status) {
      case 'COMPLETED':
        return <span className="badge-status completed">مكتمل ✓</span>;
      case 'PROCESSING':
        return <span className="badge-status pending">جاري الشحن ⏳</span>;
      case 'PENDING':
        return <span className="badge-status pending">قيد الانتظار</span>;
      case 'REFUNDED':
        return <span className="badge-status refunded">مسترد لمحفظتك ↩</span>;
      case 'FAILED':
        return <span className="badge-status failed">فشل ✕</span>;
      default:
        return <span className="badge-status">{status}</span>;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShoppingBag size={22} color="#f59e0b" />
            <h2 style={{ fontSize: '1.35rem', fontWeight: 900 }}>سجل طلبات الشحن والعمليات</h2>
          </div>
          <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
            تتبع حالة شحن الألعاب لعملائك والبطاقات المصدرة وبيانات الحسابات المسلمة
          </p>
        </div>

        <button
          onClick={fetchOrders}
          className="btn-partner-secondary"
          title="تحديث قائمة الطلبات"
        >
          <RefreshCw size={15} className={loading ? 'spin-anim' : ''} />
          <span>تحديث الطلبات</span>
        </button>
      </div>

      {/* Main Table Card */}
      <div className="partner-card">
        {/* Controls: Search + Status filters */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          {/* Search Input */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid var(--partner-border)',
            borderRadius: 8,
            padding: '7px 12px',
            maxWidth: 320,
            width: '100%'
          }}>
            <Search size={15} color="#94a3b8" />
            <input
              type="text"
              placeholder="ابحث برقم الطلب أو الـ ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: '#fff',
                fontSize: '0.85rem',
                width: '100%',
                fontFamily: 'inherit'
              }}
            />
          </div>

          {/* Status Pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            {['ALL', 'COMPLETED', 'PROCESSING', 'FAILED', 'REFUNDED'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                style={{
                  background: statusFilter === st ? 'var(--partner-gold)' : 'rgba(255, 255, 255, 0.04)',
                  color: statusFilter === st ? '#090d16' : '#cbd5e1',
                  border: 'none',
                  padding: '5px 11px',
                  borderRadius: 6,
                  fontSize: '0.78rem',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                {st === 'ALL' && 'الكل'}
                {st === 'COMPLETED' && 'المكتملة'}
                {st === 'PROCESSING' && 'قيد التنفيذ'}
                {st === 'FAILED' && 'الفاشلة'}
                {st === 'REFUNDED' && 'المستردة'}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
            جاري مزامنة سجل الطلبات...
          </div>
        ) : filteredOrders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 30, color: '#94a3b8', fontSize: '0.85rem' }}>
            لم يتم العثور على أي طلبات تطابق معايير البحث.
          </div>
        ) : (
          <div className="partner-table-container">
            <table className="partner-table">
              <thead>
                <tr>
                  <th>رقم الطلب</th>
                  <th>المنتج / الباقة</th>
                  <th>معرف المستلم / النوع</th>
                  <th>المبلغ المخصوم</th>
                  <th>الحالة</th>
                  <th>التاريخ والوقت</th>
                  <th>البيانات</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((ord) => {
                  const isCard = ord.gameId === 'KIROPRO_CARD' || ord.productName?.includes('Mastercard');
                  const isDigital = ord.gameId === 'DIGITAL_ACCOUNT' || ord.productName?.includes('حساب');

                  return (
                    <tr key={ord.id}>
                      <td>
                        <span className="partner-num" style={{ fontWeight: 800, color: '#fff' }}>
                          #{ord.orderNumber}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 800 }}>{ord.productName}</div>
                        {ord.quantity && ord.quantity > 1 ? (
                          <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>الكمية: {ord.quantity}</span>
                        ) : null}
                      </td>
                      <td>
                        {ord.playerId ? (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <code style={{
                              background: 'rgba(56, 189, 248, 0.1)',
                              color: '#38bdf8',
                              padding: '2px 7px',
                              borderRadius: 4,
                              fontFamily: 'Outfit, monospace',
                              fontWeight: 700,
                              fontSize: '0.82rem'
                            }}>
                              {ord.playerId}
                            </code>
                            <button
                              onClick={() => handleCopy(ord.playerId || '', ord.id)}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: copiedId === ord.id ? '#10b981' : '#64748b',
                                cursor: 'pointer',
                                padding: 2
                              }}
                              title="نسخ معرف اللاعب"
                            >
                              {copiedId === ord.id ? <Check size={13} /> : <Copy size={13} />}
                            </button>
                          </div>
                        ) : isCard ? (
                          <span style={{ fontSize: '0.75rem', color: '#fbbf24', fontWeight: 700 }}>
                            بطاقة ماستركارد افتراضية
                          </span>
                        ) : isDigital ? (
                          <span style={{ fontSize: '0.75rem', color: '#34d399', fontWeight: 700 }}>
                            حساب رقمي جاهز
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>تسليم تلقائي</span>
                        )}
                      </td>
                      <td>
                        <span className="partner-currency" style={{
                          fontWeight: 900,
                          color: ord.status === 'REFUNDED' ? '#c084fc' : '#10b981'
                        }}>
                          ${Number(ord.amountUsd).toFixed(2)} USD
                        </span>
                      </td>
                      <td>{getStatusBadge(ord.status)}</td>
                      <td style={{ fontSize: '0.78rem', color: '#64748b', whiteSpace: 'nowrap' }}>
                        {new Date(ord.createdAt).toLocaleDateString('ar-SA', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </td>
                      <td>
                        {(isCard || isDigital) && ord.status === 'COMPLETED' ? (
                          <button
                            onClick={() => handleViewCredentials(ord)}
                            className="btn-partner-secondary"
                            style={{ padding: '4px 8px', fontSize: '0.72rem', gap: 4 }}
                            title="عرض تفاصيل وبيانات الاعتماد"
                          >
                            <Eye size={12} />
                            <span>كشف البيانات</span>
                          </button>
                        ) : (
                          <span style={{ color: '#64748b', fontSize: '0.75rem' }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Credentials Reveal Modal */}
      {credentialsModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 35000,
          padding: 16
        }}>
          <div className="partner-card" style={{ maxWidth: 520, width: '100%', background: '#0f172a', padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {credentialsModal.type === 'KIROPRO_CARD' ? <CreditCard size={20} color="#f59e0b" /> : <Key size={20} color="#10b981" />}
                <h3 style={{ fontSize: '1.2rem', fontWeight: 900, color: '#fff', margin: 0 }}>
                  بيانات الطلب #{credentialsModal.orderNumber}
                </h3>
              </div>
              <button
                onClick={() => setCredentialsModal(null)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* KiroPro Card Details */}
            {credentialsModal.type === 'KIROPRO_CARD' && credentialsModal.card && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{
                  background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  borderRadius: 12,
                  padding: 18,
                  textAlign: 'right'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <span style={{ fontWeight: 800, color: '#fbbf24' }}>Mastercard Virtual Prepaid</span>
                    <span className="partner-currency" style={{ color: '#10b981', fontWeight: 800 }}>$1.00 USD</span>
                  </div>

                  {/* Card Number */}
                  <div style={{ marginBottom: 10 }}>
                    <span style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'block' }}>رقم البطاقة (PAN)</span>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span className="partner-num" style={{ fontSize: '1.15rem', fontWeight: 800, color: '#fff', letterSpacing: '2px' }}>
                        {showPan ? credentialsModal.card.cardNumber : `•••• •••• •••• ${credentialsModal.card.cardLast4}`}
                      </span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => setShowPan(!showPan)}
                          style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                        >
                          {showPan ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                        <button
                          onClick={() => handleCopy(credentialsModal.card?.cardNumber || '', 'pan')}
                          style={{ background: 'transparent', border: 'none', color: copiedId === 'pan' ? '#10b981' : '#94a3b8', cursor: 'pointer' }}
                        >
                          {copiedId === 'pan' ? <Check size={15} /> : <Copy size={15} />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Exp Date & CVV */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                    <div>
                      <span style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'block' }}>تاريخ الانتهاء</span>
                      <span className="partner-num" style={{ fontWeight: 800, color: '#fff' }}>
                        {credentialsModal.card.expDate}
                      </span>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'block' }}>رمز الأمان (CVV)</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className="partner-num" style={{ fontWeight: 800, color: '#fff' }}>
                          {showCvv ? credentialsModal.card.cvv : '•••'}
                        </span>
                        <button
                          onClick={() => setShowCvv(!showCvv)}
                          style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                        >
                          {showCvv ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                        <button
                          onClick={() => handleCopy(credentialsModal.card?.cvv || '', 'cvv')}
                          style={{ background: 'transparent', border: 'none', color: copiedId === 'cvv' ? '#10b981' : '#94a3b8', cursor: 'pointer' }}
                        >
                          {copiedId === 'cvv' ? <Check size={13} /> : <Copy size={13} />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Digital Accounts List */}
            {credentialsModal.type === 'DIGITAL_ACCOUNT' && credentialsModal.accounts && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 360, overflowY: 'auto' }}>
                {credentialsModal.accounts.map((acc, idx) => (
                  <div key={acc.id || idx} style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: 8,
                    padding: 12,
                    textAlign: 'right'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: '0.75rem', color: '#fbbf24', fontWeight: 800 }}>حساب #{idx + 1}</span>
                      <button
                        onClick={() => handleCopy(`${acc.email} | ${acc.password}`, `acc-modal-${idx}`)}
                        className="btn-partner-secondary"
                        style={{ padding: '3px 8px', fontSize: '0.72rem', gap: 4 }}
                      >
                        {copiedId === `acc-modal-${idx}` ? <Check size={12} /> : <Copy size={12} />}
                        <span>نسخ الحساب</span>
                      </button>
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#fff', fontFamily: 'monospace', direction: 'ltr', textAlign: 'left', marginBottom: 2 }}>
                      <strong>Email:</strong> {acc.email}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#fff', fontFamily: 'monospace', direction: 'ltr', textAlign: 'left' }}>
                      <strong>Pass:</strong> {acc.password}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => setCredentialsModal(null)}
              className="btn-partner-primary"
              style={{ width: '100%', marginTop: 16 }}
            >
              إغلاق النافذة
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
