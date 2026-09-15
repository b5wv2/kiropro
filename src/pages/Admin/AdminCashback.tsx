import React, { useEffect, useState } from 'react';
import { 
  Coins, 
  Plus, 
  Trash2, 
  Power, 
  RefreshCw, 
  X
} from 'lucide-react';
import { api } from '../../lib/api';
import { formatCurrency } from '../../lib/formatters';
import { CashbackRule } from '../../types';

interface RedemptionItem {
  id: string;
  order_id: string;
  rule_id: string;
  amount_credited: number;
  currency: string;
  created_at: string;
  rule_name?: string;
  percentage?: number;
  customer_name?: string;
  customer_email?: string;
  package_name?: string;
}

export const AdminCashback: React.FC = () => {
  const [rules, setRules] = useState<CashbackRule[]>([]);
  const [redemptions, setRedemptions] = useState<RedemptionItem[]>([]);
  const [activeSubTab, setActiveSubTab] = useState<'rules' | 'redemptions'>('rules');
  const [loading, setLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [percentage, setPercentage] = useState<number | ''>('');
  const [scopeType, setScopeType] = useState<'ALL_PRODUCTS' | 'CATEGORY' | 'SELECTED_PRODUCTS'>('ALL_PRODUCTS');
  const [categoryName, setCategoryName] = useState('');
  const [maxCashbackUsd, setMaxCashbackUsd] = useState<number | ''>('');
  const [usageLimitTotal, setUsageLimitTotal] = useState<number | ''>('');
  const [usageLimitPerUser, setUsageLimitPerUser] = useState<number | ''>(1);
  const [allowPromoStacking, setAllowPromoStacking] = useState(false);
  const [startsAt, setStartsAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [isActive, setIsActive] = useState(true);
  
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchRules = async () => {
    try {
      const data = await api.get<CashbackRule[]>('/api/cashback/rules');
      setRules(data || []);
    } catch (err) {
      console.error('Failed to fetch cashback rules', err);
    }
  };

  const fetchRedemptions = async () => {
    try {
      const data = await api.get<RedemptionItem[]>('/api/cashback/redemptions');
      setRedemptions(data || []);
    } catch (err) {
      console.error('Failed to fetch cashback redemptions', err);
    }
  };

  const loadData = async () => {
    setLoading(true);
    await Promise.all([fetchRules(), fetchRedemptions()]);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg('يرجى كتابة اسم لحملة الكاش باك');
      return;
    }
    if (!percentage || Number(percentage) <= 0 || Number(percentage) > 100) {
      setErrorMsg('نسبة الكاش باك يجب أن تكون بين 1% و 100%');
      return;
    }
    if (scopeType === 'CATEGORY' && !categoryName.trim()) {
      setErrorMsg('يرجى تحديد الفئة المستهدفة');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      await api.post('/api/cashback/rules', {
        name: name.trim(),
        percentage: Number(percentage),
        scope_type: scopeType,
        eligible_ids: scopeType === 'CATEGORY' ? [categoryName.trim()] : [],
        max_cashback_usd: maxCashbackUsd ? Number(maxCashbackUsd) : null,
        usage_limit_total: usageLimitTotal ? Number(usageLimitTotal) : null,
        usage_limit_per_user: usageLimitPerUser ? Number(usageLimitPerUser) : 1,
        allow_promo_stacking: allowPromoStacking,
        starts_at: startsAt || null,
        expires_at: expiresAt || null,
        is_active: isActive
      });

      await fetchRules();
      closeModal();
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.error || err?.message || 'فشل حفظ قاعدة الكاش باك');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (id: string) => {
    try {
      await api.patch(`/api/cashback/rules/${id}/toggle`);
      setRules(prev => prev.map(r => r.id === id ? { ...r, is_active: !r.is_active } : r));
    } catch (err) {
      console.error('Failed to toggle rule', err);
    }
  };

  const handleDelete = async (id: string, ruleName: string) => {
    if (!window.confirm(`هل أنت متأكد من حذف قاعدة الكاش باك "${ruleName}" نهائياً؟`)) return;
    try {
      await api.delete(`/api/cashback/rules/${id}`);
      setRules(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      console.error('Failed to delete rule', err);
    }
  };

  const closeModal = () => {
    setIsCreateModalOpen(false);
    setName('');
    setPercentage('');
    setScopeType('ALL_PRODUCTS');
    setCategoryName('');
    setMaxCashbackUsd('');
    setUsageLimitTotal('');
    setUsageLimitPerUser(1);
    setAllowPromoStacking(false);
    setStartsAt('');
    setExpiresAt('');
    setIsActive(true);
    setErrorMsg(null);
  };

  return (
    <div>
      {/* Top Section */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#0B0F19', margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Coins size={26} color="#059669" />
            <span>نظام مكافآت الكاش باك (Cashback System)</span>
          </h2>
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
            إدارة عروض استرجاع الرصيد التلقائي للمحفظة فور إتمام الطلبات بنجاح.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={loadData} className="btn btn-secondary btn-sm" type="button">
            <RefreshCw size={15} />
            <span>تحديث</span>
          </button>
          <button onClick={() => setIsCreateModalOpen(true)} className="btn btn-primary btn-sm" type="button" style={{ fontWeight: 800 }}>
            <Plus size={16} />
            <span>إنشاء قاعدة كاش باك جديدة</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div style={{ background: '#FFFFFF', padding: '18px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 700, display: 'block', marginBottom: 6 }}>القواعد النشطة</span>
          <strong style={{ fontSize: '1.6rem', color: '#0B0F19' }}>
            {rules.filter(r => r.is_active).length} / {rules.length}
          </strong>
        </div>

        <div style={{ background: '#FFFFFF', padding: '18px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 700, display: 'block', marginBottom: 6 }}>إجمالي المكافآت الممنوحة</span>
          <strong style={{ fontSize: '1.6rem', color: '#15803d' }}>
            {redemptions.length} عملية
          </strong>
        </div>

        <div style={{ background: '#FFFFFF', padding: '18px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 700, display: 'block', marginBottom: 6 }}>الرصيد الموزع</span>
          <strong style={{ fontSize: '1.6rem', color: '#059669' }}>
            {redemptions.length} مكافأة مسجلة
          </strong>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '2px solid #e2e8f0', paddingBottom: '10px', marginBottom: '20px' }}>
        <button
          type="button"
          onClick={() => setActiveSubTab('rules')}
          style={{
            background: activeSubTab === 'rules' ? '#0B0F19' : 'transparent',
            color: activeSubTab === 'rules' ? '#facc15' : '#64748b',
            border: 'none',
            borderRadius: '8px',
            padding: '8px 18px',
            fontWeight: 800,
            fontSize: '0.9rem',
            cursor: 'pointer'
          }}
        >
          قواعد الكاش باك ({rules.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('redemptions')}
          style={{
            background: activeSubTab === 'redemptions' ? '#0B0F19' : 'transparent',
            color: activeSubTab === 'redemptions' ? '#facc15' : '#64748b',
            border: 'none',
            borderRadius: '8px',
            padding: '8px 18px',
            fontWeight: 800,
            fontSize: '0.9rem',
            cursor: 'pointer'
          }}
        >
          سجل المكافآت المكتسبة ({redemptions.length})
        </button>
      </div>

      {/* RULES LIST VIEW */}
      {activeSubTab === 'rules' && (
        <div style={{ background: '#FFFFFF', borderRadius: '14px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>جاري تحميل القواعد...</div>
          ) : rules.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
              <Coins size={44} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
              <p style={{ margin: 0, fontWeight: 700 }}>لا توجد أي قواعد كاش باك مضافة بعد.</p>
              <button onClick={() => setIsCreateModalOpen(true)} className="btn btn-primary btn-sm" style={{ marginTop: 14 }}>
                + إنشاء أول قاعدة الآن
              </button>
            </div>
          ) : (
            <div className="admin-table-container">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>اسم الحملة</th>
                    <th>نسبة الكاش باك</th>
                    <th>نطاق التطبيق</th>
                    <th>الحد الأقصى ($)</th>
                    <th>الدمج مع كود الخصم</th>
                    <th>مرات الاستخدام</th>
                    <th>الحالة</th>
                    <th>الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((rule) => (
                    <tr key={rule.id}>
                      <td style={{ fontWeight: 800 }}>
                        <span style={{ color: '#0B0F19', display: 'block' }}>{rule.name}</span>
                      </td>

                      <td>
                        <span style={{
                          background: '#ECFDF5',
                          color: '#059669',
                          fontWeight: 900,
                          fontSize: '0.85rem',
                          padding: '3px 10px',
                          borderRadius: 6,
                          direction: 'ltr',
                          display: 'inline-block'
                        }}>
                          +{rule.percentage}%
                        </span>
                      </td>

                      <td>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569' }}>
                          {rule.scope_type === 'ALL_PRODUCTS' ? 'جميع المنتجات' :
                           rule.scope_type === 'CATEGORY' ? `فئة: ${rule.eligible_ids?.[0] || 'محددة'}` : 'منتجات محددة'}
                        </span>
                      </td>

                      <td style={{ fontFamily: 'var(--font-latin)' }}>
                        {rule.max_cashback_usd ? `$${Number(rule.max_cashback_usd).toFixed(2)}` : 'بدون سقف'}
                      </td>

                      <td>
                        <span style={{
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          color: rule.allow_promo_stacking ? '#15803d' : '#94a3b8'
                        }}>
                          {rule.allow_promo_stacking ? 'مسموح' : 'غير مسموح'}
                        </span>
                      </td>

                      <td style={{ fontFamily: 'var(--font-latin)' }}>
                        {rule.totalRedemptionsCount || 0} {rule.usage_limit_total ? `/ ${rule.usage_limit_total}` : ''}
                      </td>

                      <td>
                        <span style={{
                          background: rule.is_active ? '#ecfdf5' : '#fef2f2',
                          color: rule.is_active ? '#059669' : '#dc2626',
                          border: `1px solid ${rule.is_active ? '#a7f3d0' : '#fecaca'}`,
                          padding: '2px 8px',
                          borderRadius: 12,
                          fontSize: '0.75rem',
                          fontWeight: 800
                        }}>
                          {rule.is_active ? 'نشطة' : 'معطلة'}
                        </span>
                      </td>

                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            type="button"
                            onClick={() => handleToggle(rule.id)}
                            className="btn btn-secondary btn-sm"
                            title={rule.is_active ? 'تعطيل' : 'تفعيل'}
                            style={{ padding: '6px' }}
                          >
                            <Power size={14} color={rule.is_active ? '#059669' : '#94a3b8'} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(rule.id, rule.name)}
                            className="btn btn-secondary btn-sm"
                            title="حذف"
                            style={{ padding: '6px', color: '#dc2626' }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* REDEMPTIONS LIST VIEW */}
      {activeSubTab === 'redemptions' && (
        <div style={{ background: '#FFFFFF', borderRadius: '14px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>جاري تحميل السجل...</div>
          ) : redemptions.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
              <Coins size={44} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
              <p style={{ margin: 0, fontWeight: 700 }}>لم تسجل أي عمليات كاش باك مكتسبة بعد.</p>
            </div>
          ) : (
            <div className="admin-table-container">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>العميل</th>
                    <th>اسم الحملة</th>
                    <th>النسبة</th>
                    <th>المبلغ المضاف للمحفظة</th>
                    <th>رقم الطلب</th>
                    <th>التاريخ والوقت</th>
                  </tr>
                </thead>
                <tbody>
                  {redemptions.map((red) => (
                    <tr key={red.id}>
                      <td style={{ fontWeight: 700 }}>
                        <span style={{ color: '#0B0F19', display: 'block' }}>{red.customer_name || 'عميل'}</span>
                        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{red.customer_email}</span>
                      </td>

                      <td style={{ fontWeight: 700, color: '#475569' }}>
                        {red.rule_name || 'كاش باك الطلب'}
                      </td>

                      <td>
                        <span style={{
                          background: '#ECFDF5',
                          color: '#059669',
                          fontWeight: 800,
                          fontSize: '0.8rem',
                          padding: '2px 8px',
                          borderRadius: 6
                        }}>
                          +{red.percentage}%
                        </span>
                      </td>

                      <td style={{ fontWeight: 900, color: '#15803d', fontFamily: 'var(--font-latin)', direction: 'ltr' }}>
                        +{formatCurrency(Number(red.amount_credited), red.currency || 'USD')}
                      </td>

                      <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#64748b' }}>
                        {red.order_id?.substring(0, 14)}...
                      </td>

                      <td style={{ fontSize: '0.8rem', color: '#64748b' }}>
                        {new Date(red.created_at).toLocaleString('ar-EG')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Create Rule Modal */}
      {isCreateModalOpen && (
        <div className="admin-modal-overlay">
          <div className="admin-modal" style={{ maxWidth: '540px' }}>
            <div className="admin-modal-header">
              <h3 className="admin-modal-title">إنشاء قاعدة كاش باك جديدة</h3>
              <button onClick={closeModal} className="admin-modal-close" type="button">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateRule}>
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

                <div style={{ marginBottom: '14px' }}>
                  <label className="admin-label">اسم الحملة / العرض *</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="مثال: كاش باك 5% على جميع منتجات فري فاير"
                    className="admin-input"
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                  <div>
                    <label className="admin-label">نسبة الكاش باك (%) *</label>
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      max="100"
                      required
                      value={percentage}
                      onChange={(e) => setPercentage(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="مثال: 5"
                      className="admin-input"
                    />
                  </div>

                  <div>
                    <label className="admin-label">أقصى حد للكاش باك ($) (اختياري)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0.5"
                      value={maxCashbackUsd}
                      onChange={(e) => setMaxCashbackUsd(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="مثال: 2 (سقف $2 بالطلب)"
                      className="admin-input"
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '14px' }}>
                  <label className="admin-label">نطاق تطبيق الكاش باك *</label>
                  <select
                    className="admin-input"
                    value={scopeType}
                    onChange={(e) => setScopeType(e.target.value as any)}
                  >
                    <option value="ALL_PRODUCTS">جميع المنتجات والكتالوج</option>
                    <option value="CATEGORY">فئة أو لعبة معينة فقط</option>
                  </select>
                </div>

                {scopeType === 'CATEGORY' && (
                  <div style={{ marginBottom: '14px' }}>
                    <label className="admin-label">اختر اللعبة / الفئة المستهدفة *</label>
                    <input
                      type="text"
                      required
                      value={categoryName}
                      onChange={(e) => setCategoryName(e.target.value)}
                      placeholder="مثال: Free Fire Middle East أو PUBG Mobile"
                      className="admin-input"
                    />
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                  <div>
                    <label className="admin-label">الحد الأقصى الإجمالي للمرات</label>
                    <input
                      type="number"
                      min="1"
                      value={usageLimitTotal}
                      onChange={(e) => setUsageLimitTotal(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="فارغ = غير محدود"
                      className="admin-input"
                    />
                  </div>

                  <div>
                    <label className="admin-label">الحد الأقصى لكل عميل</label>
                    <input
                      type="number"
                      min="1"
                      value={usageLimitPerUser}
                      onChange={(e) => setUsageLimitPerUser(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="الافتراضي: 1 مرة لكل عميل"
                      className="admin-input"
                    />
                  </div>
                </div>

                {/* Promo Stacking Checkbox */}
                <div style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '12px',
                  marginBottom: '16px'
                }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={allowPromoStacking}
                      onChange={(e) => setAllowPromoStacking(e.target.checked)}
                      style={{ width: '18px', height: '18px' }}
                    />
                    <div>
                      <strong style={{ fontSize: '0.85rem', color: '#0B0F19', display: 'block' }}>
                        السماح بالدمج مع كود الخصم (Promo Stacking)
                      </strong>
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        إذا كان غير مفعل، لن يحصل العميل على كاش باك إذا استخدم كود خصم في نفس الطلب.
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              <div className="admin-modal-footer">
                <button type="button" onClick={closeModal} className="btn btn-secondary btn-sm">
                  إلغاء
                </button>
                <button type="submit" disabled={submitting} className="btn btn-primary btn-sm" style={{ fontWeight: 800 }}>
                  {submitting ? 'جاري الحفظ...' : 'إنشاء قاعدة الكاش باك'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
