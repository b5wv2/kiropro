import React, { useEffect, useState } from 'react';
import { 
  Wallet, 
  Search, 
  ArrowDownLeft, 
  ArrowUpRight, 
  RefreshCw
} from 'lucide-react';
import { api } from '../../lib/api';
import { formatCurrency } from '../../lib/formatters';
import { StatusBadge } from '../../components/admin/StatusBadge';

interface Transaction {
  id: string;
  walletId: string;
  userName?: string;
  userEmail?: string;
  amount: number;
  currency?: string;
  type: string;
  description?: string;
  createdAt: string;
}

export const AdminWallet: React.FC = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');

  const fetchTransactions = async () => {
    try {
      const data = await api.get('/api/admin/wallet/transactions');
      setTransactions(data);
    } catch (err) {
      console.error('Failed to load wallet transactions', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, []);

  const filteredTransactions = transactions.filter(t => {
    const matchesSearch = 
      (t.userName || '').toLowerCase().includes(search.toLowerCase()) ||
      (t.userEmail || '').toLowerCase().includes(search.toLowerCase()) ||
      (t.description || '').toLowerCase().includes(search.toLowerCase());

    if (!matchesSearch) return false;
    if (typeFilter !== 'ALL' && t.type !== typeFilter) return false;
    return true;
  });

  const creditsUsd = transactions
    .filter(t => t.amount > 0 && (!t.currency || t.currency === 'USD'))
    .reduce((acc, t) => acc + Number(t.amount), 0);
  const creditsSdg = transactions
    .filter(t => t.amount > 0 && t.currency === 'SDG')
    .reduce((acc, t) => acc + Number(t.amount), 0);

  const debitsUsd = transactions
    .filter(t => t.amount < 0 && (!t.currency || t.currency === 'USD'))
    .reduce((acc, t) => acc + Math.abs(Number(t.amount)), 0);
  const debitsSdg = transactions
    .filter(t => t.amount < 0 && t.currency === 'SDG')
    .reduce((acc, t) => acc + Math.abs(Number(t.amount)), 0);

  return (
    <>
      {/* Overview Cards */}
      <div className="admin-stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <div className="admin-stat-card">
          <div className="admin-stat-card-header">
            <span className="admin-stat-label">إجمالي التدفقات الواردة (Credits)</span>
            <div className="admin-stat-icon-wrapper" style={{ background: '#ecfdf5', color: '#10b981' }}>
              <ArrowDownLeft size={22} color="#10b981" />
            </div>
          </div>
          <div className="admin-stat-value" style={{ color: '#10b981', fontSize: '1.4rem' }}>
            +{formatCurrency(creditsUsd, 'USD')}
            {creditsSdg > 0 && (
              <div style={{ fontSize: '0.95rem', marginTop: '4px', opacity: 0.9 }}>
                +{formatCurrency(creditsSdg, 'SDG')}
              </div>
            )}
          </div>
          <div className="admin-stat-footer">شحنات، إيداعات، واسترجاعات</div>
        </div>

        <div className="admin-stat-card">
          <div className="admin-stat-card-header">
            <span className="admin-stat-label">إجمالي التدفقات الصادرة (Debits)</span>
            <div className="admin-stat-icon-wrapper" style={{ background: '#fef2f2', color: '#ef4444' }}>
              <ArrowUpRight size={22} color="#ef4444" />
            </div>
          </div>
          <div className="admin-stat-value" style={{ color: '#ef4444', fontSize: '1.4rem' }}>
            -{formatCurrency(debitsUsd, 'USD')}
            {debitsSdg > 0 && (
              <div style={{ fontSize: '0.95rem', marginTop: '4px', opacity: 0.9 }}>
                -{formatCurrency(debitsSdg, 'SDG')}
              </div>
            )}
          </div>
          <div className="admin-stat-footer">مشتريات وخصومات إدارية</div>
        </div>

        <div className="admin-stat-card">
          <div className="admin-stat-card-header">
            <span className="admin-stat-label">عدد الحركات المسجلة</span>
            <div className="admin-stat-icon-wrapper" style={{ background: '#fffbeb', color: '#f59e0b' }}>
              <Wallet size={22} color="#f59e0b" />
            </div>
          </div>
          <div className="admin-stat-value">
            {transactions.length.toLocaleString('ar-EG')}
          </div>
          <div className="admin-stat-footer">عملية مالية في النظام</div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="admin-filter-bar">
        <div className="admin-search-wrapper">
          <Search size={18} className="admin-search-icon" />
          <input
            type="text"
            className="admin-input admin-search-input"
            placeholder="ابحث باسم العميل، البريد، أو تفاصيل العملية..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="admin-filter-group">
          {['ALL', 'TOPUP', 'PURCHASE', 'ADMIN_ADJUSTMENT', 'REFUND'].map((t) => (
            <button
              key={t}
              className={`admin-btn ${typeFilter === t ? 'admin-btn-primary' : 'admin-btn-secondary'} admin-btn-sm`}
              onClick={() => setTypeFilter(t)}
            >
              {t === 'ALL' ? 'الكل' : t}
            </button>
          ))}
          <button 
            onClick={fetchTransactions}
            className="admin-btn admin-btn-secondary admin-btn-sm"
            title="تحديث الحركات"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Transactions Table Card */}
      <div className="admin-card">
        <div className="admin-card-header">
          <h3 className="admin-card-title">
            <Wallet size={18} color="#f59e0b" />
            <span>سجل حركة المحافظ ({filteredTransactions.length})</span>
          </h3>
        </div>

        <div className="admin-table-container">
          {loading ? (
            <div style={{ padding: '32px' }}>
              <div className="admin-skeleton" style={{ height: '40px', marginBottom: '12px' }} />
              <div className="admin-skeleton" style={{ height: '40px', marginBottom: '12px' }} />
              <div className="admin-skeleton" style={{ height: '40px' }} />
            </div>
          ) : filteredTransactions.length > 0 ? (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>العميل</th>
                  <th>نوع العملية</th>
                  <th>المبلغ</th>
                  <th>تفاصيل العملية / السبب</th>
                  <th>التاريخ والوقت</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.map((tx) => (
                  <tr key={tx.id}>
                    <td>
                      <div style={{ fontWeight: 700 }}>{tx.userName || 'عميل'}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{tx.userEmail}</div>
                    </td>
                    <td>
                      <StatusBadge status={tx.type} />
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ 
                          fontWeight: 800, 
                          fontSize: '0.95rem',
                          color: tx.amount > 0 ? '#10b981' : '#dc2626' 
                        }}>
                          {tx.amount > 0 
                            ? `+${formatCurrency(tx.amount, tx.currency || 'USD')}` 
                            : formatCurrency(tx.amount, tx.currency || 'USD')}
                        </span>
                        <span className="admin-badge admin-badge-neutral" style={{ fontSize: '0.7rem', padding: '1px 5px' }}>
                          {tx.currency || 'USD'}
                        </span>
                      </div>
                    </td>
                    <td style={{ color: '#475569', fontSize: '0.85rem' }}>
                      {tx.description || '-'}
                    </td>
                    <td style={{ fontSize: '0.8rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                      {new Date(tx.createdAt).toLocaleString('ar-EG')}
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
              <h4 className="admin-empty-title">لا توجد حركات مالية مطابقة</h4>
              <p className="admin-empty-text">لم يتم العثور على أي حركة تطابق معايير الفلترة المحددة.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
