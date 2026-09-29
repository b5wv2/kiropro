import React, { useEffect, useState, useMemo } from 'react';
import { usePartner } from '../../context/PartnerContext';
import { 
  ShoppingBag, 
  Search, 
  Copy, 
  Check, 
  RefreshCw
} from 'lucide-react';

interface PartnerOrder {
  id: string;
  orderNumber: string;
  productName: string;
  productId: string;
  playerId: string;
  amountUsd: number;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';
  providerOrderId?: string;
  providerResponse?: any;
  refundLedgerId?: string;
  createdAt: string;
}

export const PartnerOrders: React.FC = () => {
  const { partnerFetch } = usePartner();

  const [orders, setOrders] = useState<PartnerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [copiedId, setCopiedId] = useState<string | null>(null);

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

  // Filtered orders
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const matchStatus = statusFilter === 'ALL' || o.status === statusFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchSearch = !q ||
        o.orderNumber.toLowerCase().includes(q) ||
        o.playerId.toLowerCase().includes(q) ||
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShoppingBag size={24} color="#f59e0b" />
            <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900 }}>سجل طلبات الشحن الفوري</h2>
          </div>
          <p style={{ margin: '4px 0 0 0', color: '#94a3b8', fontSize: '0.88rem' }}>
            تتبع حالة شحن الألعاب لعملائك ومعرفات اللاعبين ومفاتيح التفعيل
          </p>
        </div>

        <button
          onClick={fetchOrders}
          className="btn-partner-secondary"
          title="تحديث قائمة الطلبات"
        >
          <RefreshCw size={16} className={loading ? 'spin-anim' : ''} />
          <span>تحديث الطلبات</span>
        </button>
      </div>

      {/* Main Table Card */}
      <div className="partner-card">
        {/* Controls: Search + Status filters */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14, marginBottom: 20 }}>
          {/* Search Input */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 8,
            padding: '8px 14px',
            maxWidth: 340,
            width: '100%'
          }}>
            <Search size={16} color="#94a3b8" />
            <input
              type="text"
              placeholder="ابحث برقم الطلب أو Player ID..."
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {['ALL', 'COMPLETED', 'PROCESSING', 'FAILED', 'REFUNDED'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                style={{
                  background: statusFilter === st ? 'var(--partner-gold)' : 'rgba(255, 255, 255, 0.05)',
                  color: statusFilter === st ? '#0b0f19' : '#cbd5e1',
                  border: 'none',
                  padding: '6px 12px',
                  borderRadius: 6,
                  fontSize: '0.8rem',
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
          <div style={{ textAlign: 'center', padding: 50, color: '#94a3b8' }}>
            جاري مزامنة سجل الطلبات...
          </div>
        ) : filteredOrders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
            لم يتم العثور على أي طلبات تطابق معايير البحث.
          </div>
        ) : (
          <div className="partner-table-container">
            <table className="partner-table">
              <thead>
                <tr>
                  <th>رقم الطلب</th>
                  <th>الباقة / اللعبة</th>
                  <th>معرف اللاعب (ID)</th>
                  <th>المبلغ المخصوم</th>
                  <th>الحالة</th>
                  <th>التاريخ والوقت</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((ord) => (
                  <tr key={ord.id}>
                    <td>
                      <span style={{ fontFamily: 'Outfit, monospace', fontWeight: 800, color: '#fff' }}>
                        #{ord.orderNumber}
                      </span>
                    </td>
                    <td style={{ fontWeight: 800 }}>
                      {ord.productName}
                    </td>
                    <td>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <code style={{
                          background: 'rgba(56, 189, 248, 0.1)',
                          color: '#38bdf8',
                          padding: '3px 8px',
                          borderRadius: 6,
                          fontFamily: 'Outfit, monospace',
                          fontWeight: 700
                        }}>
                          {ord.playerId}
                        </code>
                        <button
                          onClick={() => handleCopy(ord.playerId, ord.id)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: copiedId === ord.id ? '#10b981' : '#64748b',
                            cursor: 'pointer',
                            padding: 2
                          }}
                          title="نسخ معرف اللاعب"
                        >
                          {copiedId === ord.id ? <Check size={14} /> : <Copy size={14} />}
                        </button>
                      </div>
                    </td>
                    <td style={{
                      fontWeight: 900,
                      fontFamily: 'Outfit, sans-serif',
                      color: ord.status === 'REFUNDED' ? '#c084fc' : '#10b981'
                    }}>
                      ${Number(ord.amountUsd).toFixed(2)} USD
                    </td>
                    <td>{getStatusBadge(ord.status)}</td>
                    <td style={{ fontSize: '0.8rem', color: '#64748b', whiteSpace: 'nowrap' }}>
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
