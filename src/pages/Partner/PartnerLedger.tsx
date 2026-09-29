import React, { useEffect, useState, useMemo } from 'react';
import { usePartner } from '../../context/PartnerContext';
import { 
  History, 
  ArrowUpRight, 
  ArrowDownLeft, 
  RotateCcw, 
  ShieldCheck, 
  Filter, 
  RefreshCw
} from 'lucide-react';

interface LedgerRecord {
  id: string;
  transactionType: 'DEPOSIT_CREDIT' | 'PURCHASE_DEBIT' | 'ORDER_REFUND' | 'ADMIN_CREDIT' | 'ADMIN_DEBIT';
  amount: number;
  currency: string;
  balanceBefore: number;
  balanceAfter: number;
  referenceType?: string;
  referenceId?: string;
  description?: string;
  createdAt: string;
}

export const PartnerLedger: React.FC = () => {
  const { partnerFetch, wallet } = usePartner();
  
  const [entries, setEntries] = useState<LedgerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>('ALL');

  const fetchLedger = async () => {
    try {
      setLoading(true);
      const res = await partnerFetch<{ success: boolean; ledger: LedgerRecord[] }>('/api/partner/ledger?limit=100');
      if (res?.ledger) {
        setEntries(res.ledger);
      }
    } catch (err) {
      console.error('Failed to load ledger', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLedger();
  }, []);

  // Filtered entries
  const filteredEntries = useMemo(() => {
    if (filterType === 'ALL') return entries;
    if (filterType === 'CREDIT') {
      return entries.filter((e) => e.transactionType.includes('CREDIT') || e.transactionType.includes('REFUND'));
    }
    if (filterType === 'DEBIT') {
      return entries.filter((e) => e.transactionType.includes('DEBIT'));
    }
    if (filterType === 'REFUND') {
      return entries.filter((e) => e.transactionType === 'ORDER_REFUND');
    }
    return entries;
  }, [entries, filterType]);

  // Aggregate stats
  const stats = useMemo(() => {
    let totalInflow = 0;
    let totalOutflow = 0;
    let totalRefunds = 0;

    entries.forEach((e) => {
      const amt = Number(e.amount);
      if (e.transactionType === 'ORDER_REFUND') {
        totalRefunds += amt;
        totalInflow += amt;
      } else if (e.transactionType.includes('CREDIT')) {
        totalInflow += amt;
      } else if (e.transactionType.includes('DEBIT')) {
        totalOutflow += amt;
      }
    });

    return { totalInflow, totalOutflow, totalRefunds };
  }, [entries]);

  const renderTypeBadge = (type: LedgerRecord['transactionType']) => {
    switch (type) {
      case 'DEPOSIT_CREDIT':
        return (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: 'rgba(16, 185, 129, 0.15)',
            color: '#34d399',
            padding: '3px 8px',
            borderRadius: 6,
            fontSize: '0.78rem',
            fontWeight: 800
          }}>
            <ArrowDownLeft size={14} />
            <span>إيداع رصيد</span>
          </span>
        );
      case 'PURCHASE_DEBIT':
        return (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: 'rgba(244, 63, 94, 0.15)',
            color: '#fb7185',
            padding: '3px 8px',
            borderRadius: 6,
            fontSize: '0.78rem',
            fontWeight: 800
          }}>
            <ArrowUpRight size={14} />
            <span>شحن فوري</span>
          </span>
        );
      case 'ORDER_REFUND':
        return (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: 'rgba(168, 85, 247, 0.15)',
            color: '#c084fc',
            padding: '3px 8px',
            borderRadius: 6,
            fontSize: '0.78rem',
            fontWeight: 800
          }}>
            <RotateCcw size={14} />
            <span>استرداد فوري</span>
          </span>
        );
      case 'ADMIN_CREDIT':
        return (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: 'rgba(56, 189, 248, 0.15)',
            color: '#38bdf8',
            padding: '3px 8px',
            borderRadius: 6,
            fontSize: '0.78rem',
            fontWeight: 800
          }}>
            <ShieldCheck size={14} />
            <span>تسوية إدارية (+)</span>
          </span>
        );
      case 'ADMIN_DEBIT':
        return (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: 'rgba(234, 179, 8, 0.15)',
            color: '#facc15',
            padding: '3px 8px',
            borderRadius: 6,
            fontSize: '0.78rem',
            fontWeight: 800
          }}>
            <ShieldCheck size={14} />
            <span>تسوية إدارية (-)</span>
          </span>
        );
      default:
        return <span>{type}</span>;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <History size={24} color="#6366f1" />
            <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900 }}>سجل القيود المالية وكشف الحساب</h2>
          </div>
          <p style={{ margin: '4px 0 0 0', color: '#94a3b8', fontSize: '0.88rem' }}>
            كشف حساب تفصيلي غير قابل للتعديل يوثق جميع الحركات المالية وتفاصيل الرصيد قبل وبعد كل حركة
          </p>
        </div>

        <button
          onClick={fetchLedger}
          className="btn-partner-secondary"
          title="تحديث كشف الحساب"
        >
          <RefreshCw size={16} className={loading ? 'spin-anim' : ''} />
          <span>تحديث</span>
        </button>
      </div>

      {/* Summary Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: 16
      }}>
        <div className="partner-card">
          <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 700 }}>إجمالي الإيداعات والمقبوضات</span>
          <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#10b981', fontFamily: 'Outfit, sans-serif', marginTop: 6 }}>
            +${stats.totalInflow.toFixed(2)} USD
          </div>
        </div>

        <div className="partner-card">
          <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 700 }}>إجمالي مسحوبات الشحن الفوري</span>
          <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#f43f5e', fontFamily: 'Outfit, sans-serif', marginTop: 6 }}>
            -${stats.totalOutflow.toFixed(2)} USD
          </div>
        </div>

        <div className="partner-card">
          <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 700 }}>إجمالي المبالغ المستردة</span>
          <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#c084fc', fontFamily: 'Outfit, sans-serif', marginTop: 6 }}>
            +${stats.totalRefunds.toFixed(2)} USD
          </div>
        </div>

        <div className="partner-card">
          <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 700 }}>الرصيد الفعلي الحالي</span>
          <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#fbbf24', fontFamily: 'Outfit, sans-serif', marginTop: 6 }}>
            ${Number(wallet?.balance || 0).toFixed(2)} USD
          </div>
        </div>
      </div>

      {/* Table Card */}
      <div className="partner-card">
        {/* Filter bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Filter size={16} color="#94a3b8" />
            <span style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 700 }}>تصفية العمليات:</span>
            {['ALL', 'CREDIT', 'DEBIT', 'REFUND'].map((mode) => (
              <button
                key={mode}
                onClick={() => setFilterType(mode)}
                style={{
                  background: filterType === mode ? 'var(--partner-gold)' : 'rgba(255, 255, 255, 0.05)',
                  color: filterType === mode ? '#0b0f19' : '#cbd5e1',
                  border: 'none',
                  padding: '5px 12px',
                  borderRadius: 6,
                  fontSize: '0.8rem',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                {mode === 'ALL' && 'الكل'}
                {mode === 'CREDIT' && 'الإيداعات (+)'}
                {mode === 'DEBIT' && 'المشتريات (-)'}
                {mode === 'REFUND' && 'الاستردادات'}
              </button>
            ))}
          </div>

          <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
            عرض {filteredEntries.length} قيد مالي
          </span>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 50, color: '#94a3b8' }}>
            جاري تدقيق القيود المالية...
          </div>
        ) : filteredEntries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
            لا توجد أي قيود مالية مطابقة لهذا الفلتر.
          </div>
        ) : (
          <div className="partner-table-container">
            <table className="partner-table">
              <thead>
                <tr>
                  <th>نوع الحركة</th>
                  <th>المبلغ</th>
                  <th>الرصيد السابق</th>
                  <th>الرصيد بعد الحركة</th>
                  <th>البيان والتفاصيل</th>
                  <th>التاريخ والوقت</th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((item) => {
                  const isPositive = item.transactionType.includes('CREDIT') || item.transactionType.includes('REFUND');

                  return (
                    <tr key={item.id}>
                      <td>{renderTypeBadge(item.transactionType)}</td>
                      <td style={{
                        fontWeight: 900,
                        fontSize: '1rem',
                        fontFamily: 'Outfit, sans-serif',
                        color: isPositive ? '#10b981' : '#f43f5e'
                      }}>
                        {isPositive ? '+' : '-'}${Number(item.amount).toFixed(2)} USD
                      </td>
                      <td style={{ color: '#94a3b8', fontFamily: 'Outfit, sans-serif' }}>
                        ${Number(item.balanceBefore).toFixed(2)}
                      </td>
                      <td style={{ fontWeight: 800, color: '#fff', fontFamily: 'Outfit, sans-serif' }}>
                        ${Number(item.balanceAfter).toFixed(2)}
                      </td>
                      <td style={{ color: '#cbd5e1', fontSize: '0.85rem' }}>
                        {item.description || '-'}
                      </td>
                      <td style={{ fontSize: '0.8rem', color: '#64748b', whiteSpace: 'nowrap' }}>
                        {new Date(item.createdAt).toLocaleDateString('ar-SA', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
