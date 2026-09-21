import React, { useEffect, useState } from 'react';
import { 
  Tag, 
  Plus, 
  Trash2, 
  Power, 
  RefreshCw, 
  Percent, 
  Gift,
  History,
  X,
  Users
} from 'lucide-react';
import { api } from '../../lib/api';
import { StatusBadge } from '../../components/admin/StatusBadge';

interface PromoCode {
  id: string;
  code: string;
  type: 'DISCOUNT' | 'WALLET_CREDIT';
  currency?: string;
  discount_type?: 'PERCENTAGE' | 'FIXED';
  discount_value?: number;
  max_discount?: number | null;
  credit_amount?: number;
  usage_limit: number | null;
  usage_count: number;
  per_user_limit: number;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
  redemptionCount?: number;
}

interface Redemption {
  id: string;
  discountAmount: number;
  creditAmount: number;
  createdAt: string;
  userName: string;
  userEmail: string;
  orderId?: string | null;
  packageName?: string | null;
  playerId?: string | null;
}

export const AdminPromoCodes: React.FC = () => {
  const [codes, setCodes] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Form State
  const [code, setCode] = useState('');
  const [type, setType] = useState<'DISCOUNT' | 'WALLET_CREDIT'>('DISCOUNT');
  const [creditCurrency, setCreditCurrency] = useState<'USD' | 'SDG'>('SDG');
  const [discountCurrency, setDiscountCurrency] = useState<'USD' | 'SDG'>('SDG');
  const [discountType, setDiscountType] = useState<'PERCENTAGE' | 'FIXED'>('PERCENTAGE');
  const [discountValue, setDiscountValue] = useState<number | ''>('');
  const [maxDiscount, setMaxDiscount] = useState<number | ''>('');
  const [creditAmount, setCreditAmount] = useState<number | ''>('');
  const [usageLimit, setUsageLimit] = useState<number | ''>('');
  const [expiresAt, setExpiresAt] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Redemptions History Modal State
  const [selectedPromoForHistory, setSelectedPromoForHistory] = useState<PromoCode | null>(null);
  const [historyList, setHistoryList] = useState<Redemption[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchCodes = async () => {
    try {
      const data = await api.get('/api/admin/promo-codes');
      setCodes(data);
    } catch (err) {
      console.error('Failed to load promo codes', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCodes();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) {
      setErrorMsg('يرجى إدخال رمز الكود');
      return;
    }

    if (type === 'DISCOUNT') {
      if (!discountValue || Number(discountValue) <= 0) {
        setErrorMsg('يرجى إدخال قيمة الخصم برقم أكبر من صفر');
        return;
      }
    } else {
      if (!creditAmount || Number(creditAmount) <= 0) {
        setErrorMsg('يرجى إدخال مبلغ الرصيد الهدية برقم أكبر من صفر');
        return;
      }
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const promoCurrency = type === 'WALLET_CREDIT' ? creditCurrency : discountCurrency;
      await api.post('/api/admin/promo-codes', {
        code: code.trim().toUpperCase(),
        type,
        currency: promoCurrency,
        discountType: type === 'DISCOUNT' ? discountType : undefined,
        discountValue: type === 'DISCOUNT' ? Number(discountValue) : undefined,
        maxDiscount: type === 'DISCOUNT' && maxDiscount ? Number(maxDiscount) : undefined,
        creditAmount: type === 'WALLET_CREDIT' ? Number(creditAmount) : undefined,
        usageLimit: usageLimit ? Number(usageLimit) : null,
        perUserLimit: 1, // Single use per customer
        isActive,
        expiresAt: expiresAt || null
      });

      await fetchCodes();
      closeModal();
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.error || err?.message || 'فشل إنشاء كود الخصم');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (id: string) => {
    try {
      await api.patch(`/api/admin/promo-codes/${id}/toggle`);
      setCodes(prev => prev.map(c => c.id === id ? { ...c, is_active: !c.is_active } : c));
    } catch (err) {
      console.error('Failed to toggle code', err);
    }
  };

  const handleDelete = async (id: string, codeName: string) => {
    if (!window.confirm(`هل أنت متأكد من حذف الكود ${codeName} نهائياً؟`)) return;
    try {
      await api.delete(`/api/admin/promo-codes/${id}`);
      setCodes(prev => prev.map(c => c.id === id ? { ...c, is_active: false } : c));
    } catch (err) {
      console.error('Failed to delete code', err);
    }
  };

  const openHistoryModal = async (promo: PromoCode) => {
    setSelectedPromoForHistory(promo);
    setHistoryLoading(true);
    setHistoryList([]);
    try {
      const data = await api.get(`/api/admin/promo-codes/${promo.id}/redemptions`);
      setHistoryList(data);
    } catch (err) {
      console.error('Failed to load history', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const closeModal = () => {
    setIsCreateModalOpen(false);
    setCode('');
    setType('DISCOUNT');
    setCreditCurrency('SDG');
    setDiscountType('PERCENTAGE');
    setDiscountValue('');
    setMaxDiscount('');
    setCreditAmount('');
    setUsageLimit('');
    setExpiresAt('');
    setIsActive(true);
    setErrorMsg(null);
  };

  return (
    <>
      {/* Top Header & Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>
            أكواد الخصم والترويج (Coupons & Gift Codes)
          </h2>
          <p style={{ fontSize: '0.825rem', color: '#64748b', margin: '4px 0 0 0' }}>
            إدارة أكواد الخصم على المشتريات وأكواد رصيد الهدايا للمحفظة مع حماية الاستخدام الفردي (Single Use)
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            onClick={() => setIsCreateModalOpen(true)}
            className="admin-btn admin-btn-primary"
          >
            <Plus size={18} />
            <span>إنشاء كود جديد</span>
          </button>
          <button 
            onClick={fetchCodes}
            className="admin-btn admin-btn-secondary admin-btn-sm"
            title="تحديث"
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {/* Codes Table Card */}
      <div className="admin-card">
        <div className="admin-card-header">
          <h3 className="admin-card-title">
            <Tag size={18} color="#f59e0b" />
            <span>الأكواد المتاحة في المتجر ({codes.length})</span>
          </h3>
        </div>

        <div className="admin-table-container">
          {loading ? (
            <div style={{ padding: '32px' }}>
              <div className="admin-skeleton" style={{ height: '40px', marginBottom: '12px' }} />
              <div className="admin-skeleton" style={{ height: '40px', marginBottom: '12px' }} />
              <div className="admin-skeleton" style={{ height: '40px' }} />
            </div>
          ) : codes.length === 0 ? (
            <div className="admin-empty-state">
              <Tag size={36} color="#94a3b8" />
              <p>لا توجد أكواد مسجلة حالياً</p>
            </div>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>رمز الكود</th>
                  <th>النوع</th>
                  <th>القيمة والخصم</th>
                  <th>الحد الأقصى للخصم</th>
                  <th>مرات الاستخدام</th>
                  <th>لكل مستخدم</th>
                  <th>الحالة</th>
                  <th>تاريخ الانتهاء</th>
                  <th>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {codes.map(c => {
                  const isExpired = c.expires_at && new Date(c.expires_at) < new Date();
                  return (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 800 }}>
                        <span style={{ 
                          fontFamily: 'var(--font-latin)', 
                          letterSpacing: '1px', 
                          background: '#F1F5F9', 
                          padding: '4px 10px', 
                          borderRadius: 6,
                          color: '#0B0F19'
                        }}>
                          {c.code}
                        </span>
                      </td>

                      <td>
                        {c.type === 'WALLET_CREDIT' ? (
                          <span style={{ 
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            gap: 4, 
                            background: '#ECFDF5', 
                            color: '#059669', 
                            fontSize: '0.75rem', 
                            fontWeight: 800, 
                            padding: '3px 8px', 
                            borderRadius: 6 
                          }}>
                            <Gift size={13} />
                            <span>رصيد هدية</span>
                          </span>
                        ) : (
                          <span style={{ 
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            gap: 4, 
                            background: '#EFF6FF', 
                            color: '#2563EB', 
                            fontSize: '0.75rem', 
                            fontWeight: 800, 
                            padding: '3px 8px', 
                            borderRadius: 6 
                          }}>
                            <Percent size={13} />
                            <span>خصم مشتريات</span>
                          </span>
                        )}
                      </td>

                      <td style={{ fontWeight: 800 }}>
                        {c.type === 'WALLET_CREDIT' ? (
                          <span style={{ color: '#059669' }}>
                            +{Number(c.credit_amount || 0).toLocaleString()} {c.currency || 'USD'}
                          </span>
                        ) : c.discount_type === 'PERCENTAGE' ? (
                          <span>{c.discount_value}%</span>
                        ) : (
                          <span>
                            {c.currency === 'SDG' 
                              ? `${Number(c.discount_value || 0).toLocaleString()} ج.س` 
                              : `$${Number(c.discount_value || 0).toFixed(2)}`}
                          </span>
                        )}
                      </td>

                      <td>
                        {c.type === 'DISCOUNT' && c.max_discount ? (
                          <span style={{ fontWeight: 700, color: '#D97706' }}>
                            {c.currency === 'SDG'
                              ? `${Number(c.max_discount).toLocaleString()} ج.س`
                              : `$${Number(c.max_discount).toFixed(2)}`}
                          </span>
                        ) : (
                          <span style={{ color: '#94A3B8' }}>—</span>
                        )}
                      </td>

                      <td>
                        <span style={{ fontWeight: 700 }}>
                          {c.usage_count}
                          {c.usage_limit ? ` / ${c.usage_limit}` : ' (غير محدود)'}
                        </span>
                      </td>

                      <td>
                        <span style={{ fontSize: '0.8rem', color: '#64748B' }}>
                          {c.per_user_limit || 1} مرة واحدة
                        </span>
                      </td>

                      <td>
                        <StatusBadge 
                          status={!c.is_active ? 'REJECTED' : isExpired ? 'PENDING' : 'APPROVED'} 
                          customLabel={!c.is_active ? 'معطل' : isExpired ? 'منتهي الصلاحية' : 'نشط'} 
                        />
                      </td>

                      <td>
                        {c.expires_at ? (
                          <span style={{ fontSize: '0.8rem', color: isExpired ? '#EF4444' : '#64748B' }}>
                            {new Date(c.expires_at).toLocaleDateString('ar-EG')}
                          </span>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>دائم</span>
                        )}
                      </td>

                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            onClick={() => openHistoryModal(c)}
                            className="admin-btn admin-btn-secondary admin-btn-sm"
                            title="عرض سجل الاستخدام"
                          >
                            <History size={14} />
                            <span style={{ fontSize: '0.75rem' }}>السجل</span>
                          </button>

                          <button
                            onClick={() => handleToggle(c.id)}
                            className={`admin-btn admin-btn-sm ${c.is_active ? 'admin-btn-secondary' : 'admin-btn-primary'}`}
                            title={c.is_active ? 'تعطيل الكود' : 'تفعيل الكود'}
                          >
                            <Power size={14} />
                          </button>

                          <button
                            onClick={() => handleDelete(c.id, c.code)}
                            className="admin-btn admin-btn-danger admin-btn-sm"
                            title="حذف الكود"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Create Promo Code Modal */}
      {isCreateModalOpen && (
        <div className="admin-modal-overlay">
          <div className="admin-modal" style={{ maxWidth: '520px' }}>
            <div className="admin-modal-header">
              <h3 className="admin-modal-title">إنشاء كود جديد (Promo / Gift)</h3>
              <button onClick={closeModal} className="admin-modal-close" type="button">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreate}>
              <div className="admin-modal-body">
                {errorMsg && (
                  <div style={{ 
                    padding: '10px 14px', 
                    background: '#fef2f2', 
                    border: '1px solid #f87171', 
                    borderRadius: '8px', 
                    color: '#b91c1c', 
                    fontSize: '0.85rem', 
                    marginBottom: '16px' 
                  }}>
                    {errorMsg}
                  </div>
                )}

                {/* Code Type Radio Tabs */}
                <div style={{ marginBottom: '18px' }}>
                  <label className="admin-label">نوع الكود *</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <button
                      type="button"
                      onClick={() => setType('DISCOUNT')}
                      style={{
                        padding: '12px',
                        borderRadius: '8px',
                        border: type === 'DISCOUNT' ? '2px solid #2563EB' : '1px solid var(--border-subtle)',
                        background: type === 'DISCOUNT' ? '#EFF6FF' : '#FFFFFF',
                        color: type === 'DISCOUNT' ? '#1E40AF' : '#64748B',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8
                      }}
                    >
                      <Percent size={18} />
                      <span>كود خصم مشتريات</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setType('WALLET_CREDIT')}
                      style={{
                        padding: '12px',
                        borderRadius: '8px',
                        border: type === 'WALLET_CREDIT' ? '2px solid #059669' : '1px solid var(--border-subtle)',
                        background: type === 'WALLET_CREDIT' ? '#ECFDF5' : '#FFFFFF',
                        color: type === 'WALLET_CREDIT' ? '#065F46' : '#64748B',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8
                      }}
                    >
                      <Gift size={18} />
                      <span>كود رصيد هدية</span>
                    </button>
                  </div>
                </div>

                {/* Code Name */}
                <div style={{ marginBottom: '14px' }}>
                  <label className="admin-label">رمز الكود (Code) *</label>
                  <input 
                    type="text" 
                    value={code} 
                    onChange={(e) => setCode(e.target.value.toUpperCase())} 
                    placeholder="مثال: WELCOME10 أو GIFT20" 
                    className="admin-input" 
                    style={{ textTransform: 'uppercase', fontFamily: 'var(--font-latin)', fontWeight: 800, letterSpacing: '1px' }}
                    required 
                  />
                </div>

                {/* DISCOUNT TYPE FIELDS */}
                {type === 'DISCOUNT' ? (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                      <div>
                        <label className="admin-label">نوع الخصم</label>
                        <select 
                          value={discountType} 
                          onChange={(e) => setDiscountType(e.target.value as any)}
                          className="admin-select"
                        >
                          <option value="PERCENTAGE">نسبة مئوية (%)</option>
                          <option value="FIXED">مبلغ ثابت</option>
                        </select>
                      </div>

                      <div>
                        <label className="admin-label">عملة الخصم *</label>
                        <select
                          className="admin-select"
                          value={discountCurrency}
                          onChange={(e) => setDiscountCurrency(e.target.value as 'USD' | 'SDG')}
                        >
                          <option value="SDG">SDG — الجنيه السوداني (ج.س)</option>
                          <option value="USD">USD — الدولار الأمريكي ($)</option>
                        </select>
                      </div>
                    </div>

                    <div style={{ marginBottom: '14px' }}>
                      <label className="admin-label">
                        {discountType === 'PERCENTAGE' 
                          ? 'نسبة الخصم (%) *' 
                          : `مبلغ الخصم الثابت (${discountCurrency === 'SDG' ? 'ج.س' : '$'}) *`}
                      </label>
                      <input 
                        type="number" 
                        step={discountCurrency === 'USD' ? '0.01' : '1'} 
                        min="0.1" 
                        max={discountType === 'PERCENTAGE' ? 100 : undefined} 
                        value={discountValue} 
                        onChange={(e) => setDiscountValue(e.target.value === '' ? '' : Number(e.target.value))} 
                        placeholder={discountType === 'PERCENTAGE' ? 'مثال: 10' : discountCurrency === 'SDG' ? 'مثال: 1000' : 'مثال: 5'} 
                        className="admin-input" 
                        required 
                      />
                    </div>

                    {discountType === 'PERCENTAGE' && (
                      <div style={{ marginBottom: '14px' }}>
                        <label className="admin-label">
                          الحد الأقصى للخصم ({discountCurrency === 'SDG' ? 'ج.س' : '$'}) (اختياري - Max Discount Cap)
                        </label>
                        <input 
                          type="number" 
                          step={discountCurrency === 'USD' ? '0.01' : '1'} 
                          min="0.1" 
                          value={maxDiscount} 
                          onChange={(e) => setMaxDiscount(e.target.value === '' ? '' : Number(e.target.value))} 
                          placeholder={discountCurrency === 'SDG' ? 'مثال: 5000' : 'مثال: 5'} 
                          className="admin-input" 
                        />
                      </div>
                    )}
                  </>
                ) : (
                  /* WALLET CREDIT FIELDS */
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                    <div>
                      <label className="admin-label">عملة الرصيد الهدية *</label>
                      <select
                        className="admin-input"
                        value="SDG"
                        disabled
                        style={{ background: '#f8fafc', color: '#059669', fontWeight: 700, cursor: 'not-allowed' }}
                      >
                        <option value="SDG">SDG — الجنيه السوداني (ج.س)</option>
                      </select>
                    </div>
                    <div>
                      <label className="admin-label">
                        {creditCurrency === 'USD' ? 'مبلغ الرصيد ($) *' : 'مبلغ الرصيد (ج.س) *'}
                      </label>
                      <input 
                        type="number" 
                        step={creditCurrency === 'USD' ? '0.01' : '100'} 
                        min="0.5" 
                        value={creditAmount} 
                        onChange={(e) => setCreditAmount(e.target.value === '' ? '' : Number(e.target.value))} 
                        placeholder={creditCurrency === 'USD' ? 'مثال: 10' : 'مثال: 50000'} 
                        className="admin-input" 
                        required 
                      />
                    </div>
                  </div>
                )}

                {/* Usage Limit & Expiry */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                  <div>
                    <label className="admin-label">الحد الأقصى الإجمالي للاستخدام</label>
                    <input 
                      type="number" 
                      min="1" 
                      value={usageLimit} 
                      onChange={(e) => setUsageLimit(e.target.value === '' ? '' : Number(e.target.value))} 
                      placeholder="اتركه فارغاً للاستخدام غير المحدود" 
                      className="admin-input" 
                    />
                  </div>

                  <div>
                    <label className="admin-label">تاريخ الانتهاء</label>
                    <input 
                      type="date" 
                      value={expiresAt} 
                      onChange={(e) => setExpiresAt(e.target.value)} 
                      className="admin-input" 
                    />
                  </div>
                </div>

                <div style={{ padding: '10px 12px', background: '#F8FAFC', borderRadius: 8, fontSize: '0.8rem', color: '#64748B' }}>
                  ℹ️ <strong>حماية الاستخدام:</strong> يتم تطبيق قاعدة (استخدام واحد لكل عميل) تلقائياً لمنع تكرار استخدام نفس الكود من نفس المستخدم.
                </div>
              </div>

              <div className="admin-modal-footer">
                <button type="button" onClick={closeModal} className="admin-btn admin-btn-secondary">
                  إلغاء
                </button>
                <button type="submit" disabled={submitting} className="admin-btn admin-btn-primary">
                  {submitting ? 'جاري الحفظ...' : 'إنشاء الكود'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Redemptions Usage History Modal */}
      {selectedPromoForHistory && (
        <div className="admin-modal-overlay">
          <div className="admin-modal" style={{ maxWidth: '680px' }}>
            <div className="admin-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <History size={20} color="#f59e0b" />
                <h3 className="admin-modal-title">
                  سجل استخدام الكود: <strong>{selectedPromoForHistory.code}</strong>
                </h3>
              </div>
              <button onClick={() => setSelectedPromoForHistory(null)} className="admin-modal-close" type="button">
                <X size={18} />
              </button>
            </div>

            <div className="admin-modal-body" style={{ maxHeight: '420px', overflowY: 'auto' }}>
              {historyLoading ? (
                <div style={{ padding: 24, textAlign: 'center' }}>جاري تحميل سجل الاستخدام...</div>
              ) : historyList.length === 0 ? (
                <div style={{ padding: '36px 12px', textAlign: 'center', color: '#94A3B8' }}>
                  <Users size={32} style={{ margin: '0 auto 8px', display: 'block', color: '#CBD5E1' }} />
                  <p style={{ margin: 0, fontWeight: 700 }}>لم يقم أي مستخدم باستبدال أو استخدام هذا الكود بعد.</p>
                </div>
              ) : (
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>المستخدم</th>
                      <th>نوع العملية / الطلب</th>
                      <th>المبلغ</th>
                      <th>تاريخ الاستخدام</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyList.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <div style={{ fontWeight: 800, color: '#0F172A' }}>{r.userName}</div>
                          <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{r.userEmail}</div>
                        </td>
                        <td>
                          {r.orderId ? (
                            <div>
                              <span style={{ fontWeight: 700, color: '#2563EB' }}>طلب شراء</span>
                              <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{r.packageName || r.orderId}</div>
                            </div>
                          ) : (
                            <span style={{ fontWeight: 700, color: '#059669' }}>إيداع رصيد بالمحفظة</span>
                          )}
                        </td>
                        <td style={{ fontWeight: 900 }}>
                          {r.discountAmount > 0 ? (
                            <span style={{ color: '#059669' }}>خصم ${Number(r.discountAmount).toFixed(2)}</span>
                          ) : (
                            <span style={{ color: '#059669' }}>رصيد +${Number(r.creditAmount).toFixed(2)}</span>
                          )}
                        </td>
                        <td style={{ fontSize: '0.8rem', color: '#64748B' }}>
                          {new Date(r.createdAt).toLocaleString('ar-EG')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="admin-modal-footer">
              <button 
                type="button" 
                onClick={() => setSelectedPromoForHistory(null)} 
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
