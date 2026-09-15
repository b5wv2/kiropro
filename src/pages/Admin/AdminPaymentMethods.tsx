import React, { useEffect, useState } from 'react';
import { 
  CreditCard, 
  Plus, 
  Edit3, 
  Trash2, 
  CheckCircle2, 
  RefreshCw, 
  AlertCircle,
  Building2
} from 'lucide-react';
import { api } from '../../lib/api';

export interface PaymentMethod {
  id: string;
  name: string;
  type: string;
  currency: string;
  account_name: string;
  account_number: string;
  bank_name: string;
  instructions: string | null;
  enabled: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export const AdminPaymentMethods: React.FC = () => {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMethod, setEditingMethod] = useState<PaymentMethod | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form fields
  const [formData, setFormData] = useState({
    name: '',
    type: 'BANK_TRANSFER',
    currency: 'SDG',
    bank_name: '',
    account_name: '',
    account_number: '',
    instructions: '',
    display_order: 1,
    enabled: true
  });

  const fetchMethods = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.get<PaymentMethod[]>('/api/admin/payment-methods');
      setMethods(data);
    } catch (err: any) {
      console.error('Failed to load payment methods', err);
      setError('فشل تحميل طرق الدفع من الخادم.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMethods();
  }, []);

  const openAddModal = () => {
    setEditingMethod(null);
    setFormData({
      name: '',
      type: 'BANK_TRANSFER',
      currency: 'SDG',
      bank_name: '',
      account_name: '',
      account_number: '',
      instructions: '',
      display_order: methods.length + 1,
      enabled: true
    });
    setError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (method: PaymentMethod) => {
    setEditingMethod(method);
    setFormData({
      name: method.name,
      type: method.type,
      currency: method.currency,
      bank_name: method.bank_name,
      account_name: method.account_name,
      account_number: method.account_number,
      instructions: method.instructions || '',
      display_order: method.display_order,
      enabled: method.enabled
    });
    setError(null);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      if (editingMethod) {
        await api.patch(`/api/admin/payment-methods/${editingMethod.id}`, formData);
        setSuccessMessage('تم تحديث طريقة الدفع بنجاح.');
      } else {
        await api.post('/api/admin/payment-methods', formData);
        setSuccessMessage('تمت إضافة طريقة الدفع الجديدة بنجاح.');
      }
      setIsModalOpen(false);
      fetchMethods();
      setTimeout(() => setSuccessMessage(null), 3500);
    } catch (err: any) {
      console.error('Failed to save payment method', err);
      setError(err?.data?.error || err.message || 'فشل حفظ طريقة الدفع.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEnabled = async (method: PaymentMethod) => {
    try {
      await api.patch(`/api/admin/payment-methods/${method.id}`, {
        enabled: !method.enabled
      });
      setMethods(prev => prev.map(m => m.id === method.id ? { ...m, enabled: !m.enabled } : m));
    } catch (err) {
      console.error('Failed to toggle status', err);
      alert('فشل تغيير حالة طريقة الدفع.');
    }
  };

  const handleDelete = async (method: PaymentMethod) => {
    if (!window.confirm(`هل أنت متأكد من حذف طريقة الدفع "${method.name}"؟`)) {
      return;
    }
    try {
      await api.delete(`/api/admin/payment-methods/${method.id}`);
      setSuccessMessage('تم حذف طريقة الدفع بنجاح.');
      fetchMethods();
      setTimeout(() => setSuccessMessage(null), 3500);
    } catch (err: any) {
      console.error('Failed to delete payment method', err);
      alert(err?.data?.error || 'فشل حذف طريقة الدفع.');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Action Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>
            طرق الدفع والتحويل البنكي
          </h2>
          <p style={{ fontSize: '0.825rem', color: '#64748b', margin: '4px 0 0 0' }}>
            إدارة الحسابات البنكية ومحافظ التحويل المحلي المعروضة للعملاء عند شحن الرصيد
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button 
            onClick={fetchMethods} 
            className="admin-btn admin-btn-secondary admin-btn-sm"
            disabled={loading}
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            <span>تحديث</span>
          </button>

          <button 
            onClick={openAddModal} 
            className="admin-btn admin-btn-primary admin-btn-sm"
          >
            <Plus size={16} />
            <span>إضافة طريقة دفع جديدة</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {successMessage && (
        <div style={{ 
          background: '#ecfdf5', 
          border: '1px solid #10b981', 
          color: '#065f46', 
          borderRadius: '10px', 
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontSize: '0.875rem',
          fontWeight: 600
        }}>
          <CheckCircle2 size={18} />
          <span>{successMessage}</span>
        </div>
      )}

      {error && !isModalOpen && (
        <div style={{ 
          background: '#fef2f2', 
          border: '1px solid #ef4444', 
          color: '#991b1b', 
          borderRadius: '10px', 
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontSize: '0.875rem'
        }}>
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Table / List Container */}
      <div className="admin-card">
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
            <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 12px' }} />
            <p style={{ margin: 0 }}>جاري تحميل طرق الدفع من قاعدة البيانات...</p>
          </div>
        ) : methods.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', color: '#64748b' }}>
            <CreditCard size={48} style={{ margin: '0 auto 16px', opacity: 0.4 }} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>
              لا توجد طرق دفع مسجلة حالياً
            </h3>
            <p style={{ fontSize: '0.875rem', maxWidth: '420px', margin: '0 auto 20px' }}>
              قم بإضافة الحسابات البنكية المحلية لتمكين العملاء من تحويل المبالغ ورفع إيصالات الدفع.
            </p>
            <button onClick={openAddModal} className="admin-btn admin-btn-primary admin-btn-sm">
              <Plus size={16} />
              <span>إضافة أول طريقة دفع</span>
            </button>
          </div>
        ) : (
          <div className="admin-table-responsive">
            <table className="admin-table">
              <thead>
                <tr>
                  <th style={{ width: '60px' }}>الترتيب</th>
                  <th>طريقة الدفع / البنك</th>
                  <th>العملة</th>
                  <th>اسم الحساب</th>
                  <th>رقم الحساب / IBAN</th>
                  <th>التعليمات</th>
                  <th>الحالة</th>
                  <th style={{ width: '120px', textAlign: 'center' }}>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {methods.map((method) => (
                  <tr key={method.id}>
                    <td style={{ fontWeight: 700, color: '#64748b', textAlign: 'center' }}>
                      #{method.display_order}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ 
                          width: '36px', 
                          height: '36px', 
                          borderRadius: '8px', 
                          background: '#f1f5f9', 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center',
                          color: '#0284c7',
                          fontWeight: 800
                        }}>
                          <Building2 size={18} />
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, color: '#0f172a' }}>{method.name}</div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{method.bank_name}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="admin-badge admin-badge-info">
                        {method.currency}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600, color: '#1e293b' }}>
                      {method.account_name}
                    </td>
                    <td>
                      <code style={{ 
                        background: '#f8fafc', 
                        padding: '4px 8px', 
                        borderRadius: '6px', 
                        border: '1px solid #e2e8f0',
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        color: '#0f172a',
                        fontFamily: 'monospace'
                      }}>
                        {method.account_number}
                      </code>
                    </td>
                    <td>
                      <span style={{ 
                        fontSize: '0.8rem', 
                        color: '#64748b', 
                        maxWidth: '220px', 
                        display: 'inline-block',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }} title={method.instructions || ''}>
                        {method.instructions || '—'}
                      </span>
                    </td>
                    <td>
                      <button
                        onClick={() => handleToggleEnabled(method)}
                        className={`admin-badge ${method.enabled ? 'admin-badge-success' : 'admin-badge-danger'}`}
                        style={{ cursor: 'pointer', border: 'none' }}
                        title="انقر للتفعيل / التعطيل"
                      >
                        {method.enabled ? 'مفعّلة' : 'معطّلة'}
                      </button>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                        <button
                          onClick={() => openEditModal(method)}
                          className="admin-btn admin-btn-secondary admin-btn-sm"
                          style={{ padding: '6px 8px' }}
                          title="تعديل البيانات"
                        >
                          <Edit3 size={15} />
                        </button>
                        <button
                          onClick={() => handleDelete(method)}
                          className="admin-btn admin-btn-outline-danger admin-btn-sm"
                          style={{ padding: '6px 8px' }}
                          title="حذف"
                        >
                          <Trash2 size={15} />
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

      {/* Modal: Add/Edit Payment Method */}
      {isModalOpen && (
        <div className="admin-modal-backdrop" onClick={() => !saving && setIsModalOpen(false)}>
          <div 
            className="admin-modal" 
            style={{ maxWidth: '580px', width: '95%' }} 
            onClick={(e) => e.stopPropagation()}
          >
            <div className="admin-modal-header">
              <h3 className="admin-modal-title">
                {editingMethod ? 'تعديل بيانات طريقة الدفع' : 'إضافة طريقة دفع جديدة'}
              </h3>
              <button 
                className="admin-modal-close" 
                onClick={() => !saving && setIsModalOpen(false)}
                disabled={saving}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSave} className="admin-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {error && (
                <div style={{ 
                  background: '#fef2f2', 
                  border: '1px solid #ef4444', 
                  color: '#991b1b', 
                  borderRadius: '8px', 
                  padding: '10px 14px',
                  fontSize: '0.85rem'
                }}>
                  {error}
                </div>
              )}

              <div className="admin-form-group">
                <label className="admin-label">اسم طريقة الدفع (كما يظهر للمستخدم)*</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: بنك الخرطوم (تطبيق بنكك)"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="admin-input"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="admin-form-group">
                  <label className="admin-label">اسم البنك / المزود*</label>
                  <input
                    type="text"
                    required
                    placeholder="Bank of Khartoum"
                    value={formData.bank_name}
                    onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                    className="admin-input"
                  />
                </div>

                <div className="admin-form-group">
                  <label className="admin-label">العملة المستلمة*</label>
                  <input
                    type="text"
                    required
                    placeholder="SDG"
                    value={formData.currency}
                    onChange={(e) => setFormData({ ...formData, currency: e.target.value.toUpperCase() })}
                    className="admin-input"
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="admin-form-group">
                  <label className="admin-label">اسم صاحب الحساب المستلم*</label>
                  <input
                    type="text"
                    required
                    placeholder="KIROPRO Services"
                    value={formData.account_name}
                    onChange={(e) => setFormData({ ...formData, account_name: e.target.value })}
                    className="admin-input"
                  />
                </div>

                <div className="admin-form-group">
                  <label className="admin-label">رقم الحساب / الآيبان*</label>
                  <input
                    type="text"
                    required
                    placeholder="1829304"
                    value={formData.account_number}
                    onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
                    className="admin-input"
                  />
                </div>
              </div>

              <div className="admin-form-group">
                <label className="admin-label">تعليمات التحويل للعميل</label>
                <textarea
                  rows={3}
                  placeholder="مثال: قم بالتحويل من حسابك الشخصي، ثم التقط صورة الإشعار وارفعها في الخطوة التالية..."
                  value={formData.instructions}
                  onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
                  className="admin-input"
                  style={{ resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', alignItems: 'center' }}>
                <div className="admin-form-group">
                  <label className="admin-label">ترتيب العرض</label>
                  <input
                    type="number"
                    min="1"
                    value={formData.display_order}
                    onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value) || 1 })}
                    className="admin-input"
                  />
                </div>

                <div className="admin-form-group" style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '22px' }}>
                  <input
                    type="checkbox"
                    id="method_enabled"
                    checked={formData.enabled}
                    onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <label htmlFor="method_enabled" style={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', color: '#1e293b' }}>
                    تفعيل طريقة الدفع للمستخدمين
                  </label>
                </div>
              </div>

              <div className="admin-modal-footer" style={{ marginTop: '12px' }}>
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)} 
                  className="admin-btn admin-btn-secondary"
                  disabled={saving}
                >
                  إلغاء
                </button>
                <button 
                  type="submit" 
                  className="admin-btn admin-btn-primary"
                  disabled={saving}
                >
                  {saving ? 'جاري الحفظ...' : editingMethod ? 'حفظ التعديلات' : 'إضافة طريقة الدفع'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
