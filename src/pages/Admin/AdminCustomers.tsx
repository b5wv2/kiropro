import React, { useEffect, useState } from 'react';
import { 
  Search, 
  User, 
  PlusCircle, 
  MinusCircle, 
  Eye, 
  ShoppingCart, 
  Clock, 
  RefreshCw,
  AlertTriangle
} from 'lucide-react';
import { api } from '../../lib/api';
import { formatCurrency } from '../../lib/formatters';
import { StatusBadge } from '../../components/admin/StatusBadge';

interface Customer {
  id: string;
  name: string;
  email: string;
  balance: number;
  currency?: string;
  ordersCount: string | number;
  createdAt: string;
}

export const AdminCustomers: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'with_balance'>('all');

  // Customer Details Modal State
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [customerDetails, setCustomerDetails] = useState<any | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  // Wallet Adjustment Modal State
  const [walletModalType, setWalletModalType] = useState<'CREDIT' | 'DEBIT' | null>(null);
  const [targetCustomer, setTargetCustomer] = useState<{
    id: string;
    name: string;
    email: string;
    balance: number;
    currency: string;
  } | null>(null);
  const [amount, setAmount] = useState<number | ''>('');
  const [walletCurrency, setWalletCurrency] = useState<'USD' | 'SDG'>('USD');
  const [reason, setReason] = useState('');
  const [confirmStep, setConfirmStep] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchCustomers = async () => {
    try {
      const data = await api.get('/api/admin/users');
      setCustomers(data);
    } catch (err) {
      console.error('Failed to fetch customers', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const openCustomerDetails = async (customerId: string) => {
    setSelectedCustomerId(customerId);
    setDetailsLoading(true);
    setCustomerDetails(null);
    try {
      const data = await api.get(`/api/admin/customers/${customerId}`);
      setCustomerDetails(data);
    } catch (err) {
      console.error('Failed to load customer details', err);
    } finally {
      setDetailsLoading(false);
    }
  };

  const openWalletModal = (
    type: 'CREDIT' | 'DEBIT',
    cust: { id: string; name: string; email: string; balance: number; currency?: string }
  ) => {
    const custCurrency = cust.currency === 'SDG' ? 'SDG' : 'USD';
    setTargetCustomer({
      id: cust.id,
      name: cust.name || 'عميل',
      email: cust.email,
      balance: Number(cust.balance) || 0,
      currency: custCurrency
    });
    setWalletCurrency(custCurrency);
    setWalletModalType(type);
    setAmount('');
    setReason('');
    setConfirmStep(false);
    setErrorMsg(null);
  };

  const handleWalletSubmit = async () => {
    if (!targetCustomer || !walletModalType || !amount || Number(amount) <= 0) return;
    if (!['USD', 'SDG'].includes(walletCurrency)) {
      setErrorMsg('يجب تحديد عملة صحيحة (USD أو SDG)');
      return;
    }
    if (walletCurrency !== targetCustomer.currency) {
      setErrorMsg(`عملة العملية (${walletCurrency}) تختلف عن عملة محفظة العميل (${targetCustomer.currency}). النظام يمنع العمليات بعملات مختلفة.`);
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const endpoint = walletModalType === 'CREDIT'
        ? `/api/admin/users/${targetCustomer.id}/wallet/credit`
        : `/api/admin/users/${targetCustomer.id}/wallet/debit`;

      await api.post(endpoint, {
        amount: Number(amount),
        currency: walletCurrency,
        reason: reason || (walletModalType === 'CREDIT' 
          ? `إيداع يدوي ${formatCurrency(Number(amount), walletCurrency)} من لوحة الإدارة` 
          : `خصم يدوي ${formatCurrency(Number(amount), walletCurrency)} من لوحة الإدارة`)
      });

      // Refresh both list and details
      await fetchCustomers();
      if (selectedCustomerId) {
        await openCustomerDetails(selectedCustomerId);
      }
      closeWalletModal();
    } catch (err: any) {
      setErrorMsg(err.message || 'فشلت العملية، تأكد من صحة الرصيد والبيانات');
    } finally {
      setSubmitting(false);
    }
  };

  const closeWalletModal = () => {
    setWalletModalType(null);
    setTargetCustomer(null);
    setAmount('');
    setReason('');
    setConfirmStep(false);
    setErrorMsg(null);
  };

  const filteredCustomers = customers.filter(c => {
    const matchesSearch = 
      (c.name || '').toLowerCase().includes(search.toLowerCase()) || 
      (c.email || '').toLowerCase().includes(search.toLowerCase());

    if (!matchesSearch) return false;
    if (statusFilter === 'with_balance') return Number(c.balance) > 0;
    return true;
  });

  return (
    <>
      {/* Top Filter & Search Bar */}
      <div className="admin-filter-bar">
        <div className="admin-search-wrapper">
          <Search size={18} className="admin-search-icon" />
          <input
            type="text"
            className="admin-input admin-search-input"
            placeholder="ابحث بالاسم أو البريد الإلكتروني..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="admin-filter-group">
          <button 
            className={`admin-btn ${statusFilter === 'all' ? 'admin-btn-primary' : 'admin-btn-secondary'} admin-btn-sm`}
            onClick={() => setStatusFilter('all')}
          >
            الكل ({customers.length})
          </button>
          <button 
            className={`admin-btn ${statusFilter === 'with_balance' ? 'admin-btn-primary' : 'admin-btn-secondary'} admin-btn-sm`}
            onClick={() => setStatusFilter('with_balance')}
          >
            لديهم رصيد ({customers.filter(c => Number(c.balance) > 0).length})
          </button>
          <button 
            onClick={fetchCustomers}
            className="admin-btn admin-btn-secondary admin-btn-sm"
            title="تحديث القائمة"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Customers Table Card */}
      <div className="admin-card">
        <div className="admin-card-header">
          <h3 className="admin-card-title">
            <User size={18} color="#f59e0b" />
            <span>قائمة العملاء ({filteredCustomers.length})</span>
          </h3>
        </div>

        <div className="admin-table-container">
          {loading ? (
            <div style={{ padding: '32px' }}>
              <div className="admin-skeleton" style={{ height: '40px', marginBottom: '12px' }} />
              <div className="admin-skeleton" style={{ height: '40px', marginBottom: '12px' }} />
              <div className="admin-skeleton" style={{ height: '40px' }} />
            </div>
          ) : filteredCustomers.length > 0 ? (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>العميل</th>
                  <th>البريد الإلكتروني</th>
                  <th>رصيد المحفظة</th>
                  <th>عدد الطلبات</th>
                  <th>تاريخ التسجيل</th>
                  <th>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>{c.name || 'عميل'}</div>
                    </td>
                    <td>
                      <span style={{ color: '#475569', fontSize: '0.85rem' }}>{c.email}</span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ 
                          fontWeight: 800, 
                          color: Number(c.balance) > 0 ? '#10b981' : '#64748b' 
                        }}>
                          {formatCurrency(Number(c.balance), c.currency || 'USD')}
                        </span>
                        <span className="admin-badge admin-badge-neutral" style={{ fontSize: '0.7rem', padding: '2px 6px' }}>
                          {c.currency || 'USD'}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className="admin-badge admin-badge-neutral">
                        {c.ordersCount || 0} طلب
                      </span>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                      {new Date(c.createdAt).toLocaleDateString('ar-EG')}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button
                          onClick={() => openCustomerDetails(c.id)}
                          className="admin-btn admin-btn-secondary admin-btn-sm"
                          title="عرض ملف العميل"
                        >
                          <Eye size={14} />
                          <span>عرض</span>
                        </button>
                        <button
                          onClick={() => openWalletModal('CREDIT', c)}
                          className="admin-btn admin-btn-primary admin-btn-sm"
                          title="إضافة رصيد سريع"
                          style={{ padding: '6px 8px' }}
                        >
                          <PlusCircle size={14} />
                        </button>
                        <button
                          onClick={() => openWalletModal('DEBIT', c)}
                          className="admin-btn admin-btn-danger admin-btn-sm"
                          title="خصم رصيد سريع"
                          style={{ padding: '6px 8px' }}
                        >
                          <MinusCircle size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="admin-empty-state">
              <div className="admin-empty-icon">
                <User size={28} />
              </div>
              <h4 className="admin-empty-title">لا يوجد عملاء مطابقين</h4>
              <p className="admin-empty-text">لم يتم العثور على أي عميل يطابق معايير البحث أو الفلترة المحددة.</p>
            </div>
          )}
        </div>
      </div>

      {/* Customer Profile & Operations Details Modal */}
      {selectedCustomerId && (
        <div className="admin-modal-backdrop" onClick={() => setSelectedCustomerId(null)}>
          <div className="admin-modal admin-modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3 className="admin-modal-title">
                الملف الشخصي للعميل
              </h3>
              <button className="admin-modal-close" onClick={() => setSelectedCustomerId(null)}>✕</button>
            </div>

            <div className="admin-modal-body">
              {detailsLoading || !customerDetails ? (
                <div style={{ padding: '24px' }}>
                  <div className="admin-skeleton" style={{ height: '80px', marginBottom: '16px' }} />
                  <div className="admin-skeleton" style={{ height: '140px' }} />
                </div>
              ) : (
                <>
                  {/* Profile Header & Wallet Operations Bar */}
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    flexWrap: 'wrap', 
                    gap: '16px',
                    padding: '20px',
                    background: '#f8fafc',
                    borderRadius: '16px',
                    border: '1px solid #e2e8f0'
                  }}>
                    <div>
                      <h4 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 4px 0', color: '#0f172a' }}>
                        {customerDetails.customer.name || 'عميل'}
                      </h4>
                      <p style={{ margin: 0, fontSize: '0.875rem', color: '#64748b' }}>
                        {customerDetails.customer.email}
                      </p>
                      <p style={{ margin: '4px 0 0 0', fontSize: '0.775rem', color: '#94a3b8' }}>
                        مسجل منذ: {new Date(customerDetails.customer.createdAt).toLocaleDateString('ar-EG')}
                      </p>
                    </div>

                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
                        <span>الرصيد الحالي</span>
                        <span className="admin-badge admin-badge-primary" style={{ fontSize: '0.7rem' }}>
                          {customerDetails.customer.currency || 'USD'}
                        </span>
                      </div>
                      <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#f59e0b' }}>
                        {formatCurrency(customerDetails.customer.balance, customerDetails.customer.currency || 'USD')}
                      </div>
                      <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                        <button
                          onClick={() => openWalletModal('CREDIT', customerDetails.customer)}
                          className="admin-btn admin-btn-primary admin-btn-sm"
                        >
                          <PlusCircle size={15} />
                          <span>إضافة رصيد</span>
                        </button>
                        <button
                          onClick={() => openWalletModal('DEBIT', customerDetails.customer)}
                          className="admin-btn admin-btn-danger admin-btn-sm"
                        >
                          <MinusCircle size={15} />
                          <span>خصم رصيد</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Customer Orders History */}
                  <div>
                    <h5 style={{ fontSize: '1rem', fontWeight: 800, margin: '16px 0 12px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <ShoppingCart size={16} color="#f59e0b" />
                      <span>سجل طلبات العميل ({customerDetails.orders.length})</span>
                    </h5>

                    {customerDetails.orders.length > 0 ? (
                      <div className="admin-table-container" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                        <table className="admin-table">
                          <thead>
                            <tr>
                              <th>الطلب</th>
                              <th>الباقة</th>
                              <th>المعرف</th>
                              <th>المبلغ</th>
                              <th>الحالة</th>
                              <th>التاريخ</th>
                            </tr>
                          </thead>
                          <tbody>
                            {customerDetails.orders.map((o: any) => (
                              <tr key={o.id}>
                                <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>#{o.id.slice(0, 8)}</td>
                                <td>{o.packageName}</td>
                                <td>{o.playerId}</td>
                                <td style={{ fontWeight: 700 }}>
                                  {formatCurrency(o.amount, o.currency || customerDetails.customer.currency || 'USD')}
                                </td>
                                <td><StatusBadge status={o.status} /></td>
                                <td style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                                  {new Date(o.createdAt).toLocaleDateString('ar-EG')}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: 0 }}>لا توجد طلبات سابقة لهذا العميل.</p>
                    )}
                  </div>

                  {/* Customer Wallet Transactions History */}
                  <div>
                    <h5 style={{ fontSize: '1rem', fontWeight: 800, margin: '16px 0 12px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Clock size={16} color="#f59e0b" />
                      <span>حركات المحفظة ({customerDetails.transactions.length})</span>
                    </h5>

                    {customerDetails.transactions.length > 0 ? (
                      <div className="admin-table-container" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                        <table className="admin-table">
                          <thead>
                            <tr>
                              <th>النوع</th>
                              <th>المبلغ</th>
                              <th>الوصف</th>
                              <th>التاريخ</th>
                            </tr>
                          </thead>
                          <tbody>
                            {customerDetails.transactions.map((t: any) => (
                              <tr key={t.id}>
                                <td><StatusBadge status={t.type} /></td>
                                <td style={{ 
                                  fontWeight: 700, 
                                  color: t.amount > 0 ? '#10b981' : '#dc2626' 
                                }}>
                                  {t.amount > 0 
                                    ? `+${formatCurrency(t.amount, t.currency || customerDetails.customer.currency || 'USD')}` 
                                    : formatCurrency(t.amount, t.currency || customerDetails.customer.currency || 'USD')}
                                </td>
                                <td style={{ fontSize: '0.825rem', color: '#64748b' }}>{t.description || '-'}</td>
                                <td style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                                  {new Date(t.createdAt).toLocaleString('ar-EG')}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: 0 }}>لا توجد حركات محفظة مسجلة لهذا العميل.</p>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="admin-modal-footer">
              <button 
                onClick={() => setSelectedCustomerId(null)} 
                className="admin-btn admin-btn-secondary"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Wallet Adjustment Confirmation Modal */}
      {walletModalType && (
        <div className="admin-modal-backdrop" onClick={closeWalletModal} style={{ zIndex: 110 }}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3 className="admin-modal-title">
                {walletModalType === 'CREDIT' ? 'إضافة رصيد للعميل' : 'خصم رصيد من العميل'}
              </h3>
              <button className="admin-modal-close" onClick={closeWalletModal}>✕</button>
            </div>

            <div className="admin-modal-body">
              {errorMsg && (
                <div style={{ 
                  padding: '12px', 
                  background: '#fef2f2', 
                  border: '1px solid #fecaca', 
                  borderRadius: '8px', 
                  color: '#991b1b',
                  fontSize: '0.875rem' 
                }}>
                  {errorMsg}
                </div>
              )}

              {/* Customer Info Context */}
              {targetCustomer && (
                <div style={{
                  padding: '12px 16px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  marginBottom: '16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '8px'
                }}>
                  <div>
                    <div style={{ fontWeight: 700, color: '#0f172a' }}>{targetCustomer.name}</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{targetCustomer.email}</div>
                  </div>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span>عملة المحفظة:</span>
                      <strong style={{ color: '#0f172a' }}>{targetCustomer.currency}</strong>
                    </div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#f59e0b' }}>
                      الرصيد: {formatCurrency(targetCustomer.balance, targetCustomer.currency)}
                    </div>
                  </div>
                </div>
              )}

              {!confirmStep ? (
                <>
                  {/* Currency Selection */}
                  <div className="admin-input-group">
                    <label className="admin-label" style={{ fontWeight: 700 }}>
                      العملة (Currency):
                    </label>
                    <select
                      className="admin-input"
                      value={walletCurrency}
                      onChange={(e) => {
                        setWalletCurrency(e.target.value as 'USD' | 'SDG');
                        setErrorMsg(null);
                      }}
                      style={{ fontWeight: 600 }}
                    >
                      <option value="SDG">الجنيه السوداني (SDG)</option>
                      <option value="USD">الدولار الأمريكي (USD)</option>
                    </select>
                  </div>

                  {/* Currency Mismatch Warning */}
                  {targetCustomer && walletCurrency !== targetCustomer.currency && (
                    <div style={{
                      padding: '10px 14px',
                      background: '#fff1f2',
                      border: '1px solid #fecdd3',
                      borderRadius: '8px',
                      color: '#be123c',
                      fontSize: '0.825rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                      <div>
                        <strong>تنبيه اختلاف العملة:</strong> عملة العملية المختارة (<strong>{walletCurrency}</strong>) تختلف عن عملة محفظة العميل (<strong>{targetCustomer.currency}</strong>). النظام يرفض العمليات بعملات مختلفة لمنع الأخطاء المحاسبية. يرجى اختيار <strong>{targetCustomer.currency}</strong>.
                      </div>
                    </div>
                  )}

                  {/* Amount Input */}
                  <div className="admin-input-group">
                    <label className="admin-label" style={{ fontWeight: 700 }}>
                      المبلغ المطلوب ({walletModalType === 'CREDIT' ? 'إيداعه' : 'خصمه'}):
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="number"
                        step={walletCurrency === 'SDG' ? '1' : '0.01'}
                        min={walletCurrency === 'SDG' ? '1' : '0.01'}
                        placeholder={walletCurrency === 'SDG' ? 'مثال: 25000' : 'مثال: 25.00'}
                        className="admin-input"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
                        style={{ fontSize: '1.05rem', fontWeight: 700 }}
                      />
                      <span style={{
                        position: 'absolute',
                        left: '12px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: '#64748b',
                        fontWeight: 700,
                        fontSize: '0.85rem'
                      }}>
                        {walletCurrency === 'SDG' ? 'ج.س (SDG)' : '$ (USD)'}
                      </span>
                    </div>
                  </div>

                  {/* Real-time Preview & Projected Balance */}
                  {Number(amount) > 0 && targetCustomer && (
                    <div style={{
                      padding: '12px 16px',
                      background: walletCurrency === targetCustomer.currency ? '#f0fdf4' : '#f8fafc',
                      border: `1px solid ${walletCurrency === targetCustomer.currency ? '#bbf7d0' : '#e2e8f0'}`,
                      borderRadius: '10px',
                      fontSize: '0.875rem'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <span style={{ color: '#475569' }}>المبلغ المحدد:</span>
                        <strong style={{ 
                          color: walletModalType === 'CREDIT' ? '#16a34a' : '#dc2626',
                          fontSize: '1rem' 
                        }}>
                          {walletModalType === 'CREDIT' ? '+' : '-'}{formatCurrency(Number(amount), walletCurrency)}
                        </strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <span style={{ color: '#475569' }}>الرصيد الحالي:</span>
                        <strong style={{ color: '#334155' }}>
                          {formatCurrency(targetCustomer.balance, targetCustomer.currency)}
                        </strong>
                      </div>
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        paddingTop: '6px', 
                        borderTop: '1px dashed #cbd5e1' 
                      }}>
                        <span style={{ fontWeight: 700, color: '#0f172a' }}>الرصيد المتوقع بعد العملية:</span>
                        <strong style={{ 
                          fontSize: '1.05rem',
                          color: (targetCustomer.balance + (walletModalType === 'CREDIT' ? Number(amount) : -Number(amount))) < 0 
                            ? '#dc2626' 
                            : '#0284c7' 
                        }}>
                          {formatCurrency(
                            targetCustomer.balance + (walletModalType === 'CREDIT' ? Number(amount) : -Number(amount)),
                            targetCustomer.currency
                          )}
                        </strong>
                      </div>
                      {walletModalType === 'DEBIT' && Number(amount) > targetCustomer.balance && (
                        <div style={{ color: '#dc2626', fontSize: '0.75rem', marginTop: '6px', fontWeight: 600 }}>
                          ⚠️ تنبيه: المبلغ المطلوب خصمه يتجاوز رصيد العميل الحالي!
                        </div>
                      )}
                    </div>
                  )}

                  {/* Reason Input */}
                  <div className="admin-input-group">
                    <label className="admin-label">سبب العملية (يُسجل في سجل التدقيق المالي Audit):</label>
                    <input
                      type="text"
                      placeholder={walletModalType === 'CREDIT' 
                        ? 'مثال: تعويض عن تأخير / إيداع رصيد بطلب العميل' 
                        : 'مثال: تسوية حساب / تصحيح رصيد'}
                      className="admin-input"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </div>
                </>
              ) : (
                /* Step 2: Strict Financial Confirmation View */
                <div style={{ padding: '8px 0' }}>
                  <div style={{ 
                    width: '52px', 
                    height: '52px', 
                    borderRadius: '50%', 
                    background: walletModalType === 'CREDIT' ? '#ecfdf5' : '#fef2f2',
                    color: walletModalType === 'CREDIT' ? '#10b981' : '#dc2626',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 12px auto'
                  }}>
                    <AlertTriangle size={26} />
                  </div>
                  <h4 style={{ fontSize: '1.1rem', fontWeight: 800, textAlign: 'center', margin: '0 0 16px 0', color: '#0f172a' }}>
                    تأكيد العملية المالية ({walletModalType === 'CREDIT' ? 'إيداع رصيد' : 'خصم رصيد'})
                  </h4>

                  <div style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    padding: '16px',
                    fontSize: '0.875rem'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                      <span style={{ color: '#64748b' }}>العميل المستهدف:</span>
                      <strong style={{ color: '#0f172a' }}>{targetCustomer?.name} ({targetCustomer?.email})</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                      <span style={{ color: '#64748b' }}>عملة المحفظة:</span>
                      <span className="admin-badge admin-badge-primary">{targetCustomer?.currency}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                      <span style={{ color: '#64748b' }}>الرصيد الحالي:</span>
                      <strong>{formatCurrency(targetCustomer?.balance || 0, targetCustomer?.currency || 'USD')}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                      <span style={{ fontWeight: 700, color: '#0f172a' }}>
                        المبلغ المطلوب {walletModalType === 'CREDIT' ? 'إيداعه' : 'خصمه'}:
                      </span>
                      <strong style={{ 
                        fontSize: '1.15rem', 
                        color: walletModalType === 'CREDIT' ? '#10b981' : '#dc2626' 
                      }}>
                        {walletModalType === 'CREDIT' ? '+' : '-'}{formatCurrency(Number(amount), walletCurrency)}
                      </strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                      <span style={{ fontWeight: 700, color: '#0f172a' }}>الرصيد بعد العملية:</span>
                      <strong style={{ fontSize: '1.15rem', color: '#0284c7' }}>
                        {formatCurrency(
                          (targetCustomer?.balance || 0) + (walletModalType === 'CREDIT' ? Number(amount) : -Number(amount)),
                          targetCustomer?.currency || 'USD'
                        )}
                      </strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                      <span style={{ color: '#64748b' }}>سبب العملية:</span>
                      <span style={{ color: '#334155' }}>{reason || 'تعديل إداري مباشر'}</span>
                    </div>
                  </div>

                  <p style={{ fontSize: '0.775rem', color: '#94a3b8', textAlign: 'center', marginTop: '12px' }}>
                    هذه العملية ستُسجل فوراً في محفظة العميل وفي سجل التدقيق المالي (Audit Log).
                  </p>
                </div>
              )}
            </div>

            <div className="admin-modal-footer">
              <button 
                type="button"
                onClick={confirmStep ? () => setConfirmStep(false) : closeWalletModal} 
                className="admin-btn admin-btn-secondary"
                disabled={submitting}
              >
                {confirmStep ? 'تعديل البيانات' : 'إلغاء'}
              </button>

              {!confirmStep ? (
                <button
                  type="button"
                  onClick={() => {
                    const num = Number(amount);
                    if (!num || num <= 0) {
                      setErrorMsg('يرجى إدخال مبلغ صحيح أكبر من الصفر');
                      return;
                    }
                    if (targetCustomer && walletCurrency !== targetCustomer.currency) {
                      setErrorMsg(`عملة العملية (${walletCurrency}) تختلف عن عملة محفظة العميل (${targetCustomer.currency}). لا يمكن الاستمرار.`);
                      return;
                    }
                    if (walletModalType === 'DEBIT' && targetCustomer && num > targetCustomer.balance) {
                      setErrorMsg('المبلغ المراد خصمه يتجاوز رصيد العميل الحالي');
                      return;
                    }
                    setErrorMsg(null);
                    setConfirmStep(true);
                  }}
                  className={`admin-btn ${walletModalType === 'CREDIT' ? 'admin-btn-primary' : 'admin-btn-danger'}`}
                  disabled={targetCustomer ? walletCurrency !== targetCustomer.currency : false}
                >
                  متابعة التأكيد
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleWalletSubmit}
                  className={`admin-btn ${walletModalType === 'CREDIT' ? 'admin-btn-primary' : 'admin-btn-danger'}`}
                  disabled={submitting}
                >
                  {submitting 
                    ? 'جاري التنفيذ...' 
                    : walletModalType === 'CREDIT' 
                      ? 'تأكيد إضافة الرصيد' 
                      : 'تأكيد خصم الرصيد'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
