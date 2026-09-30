import React, { useState, useEffect, useCallback } from 'react';
import {
  Key,
  Plus,
  Upload,
  Search,
  Trash2,
  Edit3,
  Eye,
  EyeOff,
  Check,
  Copy,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  X,
  Shield,
  Mail,
  Lock,
  ChevronLeft,
  ChevronRight,
  Database,
  UserCheck
} from 'lucide-react';
import {
  fetchDigitalAccountStats,
  fetchDigitalAccounts,
  fetchAdminDigitalProducts,
  createDigitalAccount,
  bulkImportDigitalAccounts,
  updateDigitalAccount,
  deleteDigitalAccount,
  revealDigitalAccountPassword
} from '../../services/api';
import { DigitalAccount, DigitalAccountStats } from '../../types';

interface AdminDigitalAccountsTabProps {
  products: Array<{ id: string; productName: string; offerName: string; category?: string; productType?: string | null }>;
}

export const AdminDigitalAccountsTab: React.FC<AdminDigitalAccountsTabProps> = ({ products }) => {
  const [stats, setStats] = useState<DigitalAccountStats>({
    total: 0,
    available: 0,
    reserved: 0,
    sold: 0,
    disabled: 0
  });

  const [accounts, setAccounts] = useState<DigitalAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit] = useState(25);

  // Digital Products state (loaded strictly from Backend DIGITAL_ACCOUNT endpoint)
  const [digitalProducts, setDigitalProducts] = useState<Array<{
    id: string;
    productName: string;
    arabicName: string;
    offerName: string;
    category?: string;
    productType?: string;
  }>>([]);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedProductId, setSelectedProductId] = useState<string>('');

  // Password Reveals cache: accountId -> revealed password string
  const [revealedPasswords, setRevealedPasswords] = useState<{ [id: string]: string }>({});
  const [revealingId, setRevealingId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Single Add Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    productId: '',
    email: '',
    password: '',
    status: 'AVAILABLE'
  });
  const [addingAccount, setAddingAccount] = useState(false);

  // Bulk Import Modal State
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkProductId, setBulkProductId] = useState('');
  const [bulkRawData, setBulkRawData] = useState('');
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ inserted: number; rejected: number; errors: string[] } | null>(null);

  // Edit Modal State
  const [editingAccount, setEditingAccount] = useState<DigitalAccount | null>(null);
  const [editForm, setEditForm] = useState({
    email: '',
    password: '',
    status: 'AVAILABLE'
  });
  const [savingEdit, setSavingEdit] = useState(false);

  // Global Alert State
  const [alert, setAlert] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Load digital account products from authoritative backend API
  useEffect(() => {
    let isMounted = true;
    fetchAdminDigitalProducts()
      .then(prods => {
        if (!isMounted) return;
        setDigitalProducts(prods);
        if (prods.length > 0 && !selectedProductId) {
          setSelectedProductId(prods[0].id);
          setAddForm(prev => ({ ...prev, productId: prods[0].id }));
          setBulkProductId(prods[0].id);
        }
      })
      .catch(err => {
        console.error('[AdminDigitalAccounts] Failed to fetch digital products:', err);
        // Fallback: Filter incoming products strictly by DIGITAL_ACCOUNT
        const filtered = products.filter(p => p.productType === 'DIGITAL_ACCOUNT' || p.category === 'DIGITAL_ACCOUNT');
        if (isMounted && filtered.length > 0) {
          setDigitalProducts(filtered as any);
          if (!selectedProductId) {
            setSelectedProductId(filtered[0].id);
            setAddForm(prev => ({ ...prev, productId: filtered[0].id }));
            setBulkProductId(filtered[0].id);
          }
        }
      });
    return () => { isMounted = false; };
  }, [products]);

  const loadStats = useCallback(async () => {
    try {
      const res = await fetchDigitalAccountStats(selectedProductId || undefined);
      if (res.success && res.stats) {
        setStats(res.stats);
      }
    } catch (err: any) {
      console.error('Failed to load digital account stats:', err);
    }
  }, [selectedProductId]);

  const loadAccounts = useCallback(async (targetPage = 1) => {
    setLoading(true);
    try {
      const res = await fetchDigitalAccounts({
        productId: selectedProductId || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        search: search.trim() || undefined,
        page: targetPage,
        limit
      });
      if (res.success) {
        setAccounts(res.accounts || []);
        setTotal(res.total || 0);
        setPage(res.page || 1);
        setTotalPages(res.totalPages || 1);
      }
    } catch (err: any) {
      setAlert({ type: 'error', text: err?.message || 'فشل تحميل قائمة الحسابات الرقمية' });
    } finally {
      setLoading(false);
    }
  }, [selectedProductId, statusFilter, search, limit]);

  useEffect(() => {
    loadStats();
    loadAccounts(1);
  }, [loadStats, loadAccounts]);

  const handleCopy = (text: string, keyName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(keyName);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const handleRevealPassword = async (id: string) => {
    if (revealedPasswords[id]) {
      // Toggle hide
      const next = { ...revealedPasswords };
      delete next[id];
      setRevealedPasswords(next);
      return;
    }

    setRevealingId(id);
    try {
      const res = await revealDigitalAccountPassword(id);
      if (res.success && res.password) {
        setRevealedPasswords(prev => ({ ...prev, [id]: res.password }));
      }
    } catch (err: any) {
      setAlert({ type: 'error', text: err?.message || 'فشل كشف كلمة المرور أو ليس لديك صلاحية.' });
    } finally {
      setRevealingId(null);
    }
  };

  const handleCreateSingleAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.productId || !addForm.email.trim() || !addForm.password.trim()) {
      setAlert({ type: 'error', text: 'يرجى ملء جميع الحقول المطلوبة (المنتج، البريد الإلكتروني، كلمة المرور)' });
      return;
    }

    setAddingAccount(true);
    try {
      const res = await createDigitalAccount({
        productId: addForm.productId,
        email: addForm.email.trim(),
        password: addForm.password.trim(),
        status: addForm.status
      });

      if (res.success) {
        setAlert({ type: 'success', text: 'تمت إضافة الحساب بنجاح إلى المخزون وتشفير كلمة المرور.' });
        setIsAddModalOpen(false);
        setAddForm(prev => ({ ...prev, email: '', password: '', status: 'AVAILABLE' }));
        loadStats();
        loadAccounts(page);
      }
    } catch (err: any) {
      setAlert({ type: 'error', text: err?.message || 'فشل إضافة الحساب' });
    } finally {
      setAddingAccount(false);
    }
  };

  const handleBulkImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkProductId) {
      setAlert({ type: 'error', text: 'يرجى اختيار المنتج الرقمي للاستيراد' });
      return;
    }
    if (!bulkRawData.trim()) {
      setAlert({ type: 'error', text: 'يرجى إدخال بيانات الحسابات أولاً' });
      return;
    }

    setBulkImporting(true);
    setBulkResult(null);
    try {
      const res = await bulkImportDigitalAccounts({
        productId: bulkProductId,
        rawData: bulkRawData
      });

      if (res.success) {
        setBulkResult({
          inserted: res.inserted,
          rejected: res.rejected,
          errors: res.errors || []
        });
        setAlert({
          type: 'success',
          text: `تم استيراد ${res.inserted} حساب بنجاح إلى المخزون (${res.rejected} مرفوض / مكرر).`
        });
        loadStats();
        loadAccounts(1);
      }
    } catch (err: any) {
      setAlert({ type: 'error', text: err?.message || 'فشلت عملية الاستيراد الجماعي' });
    } finally {
      setBulkImporting(false);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAccount) return;

    setSavingEdit(true);
    try {
      const payload: { email?: string; password?: string; status?: string } = {
        status: editForm.status
      };
      if (editingAccount.status !== 'SOLD') {
        if (editForm.email.trim()) payload.email = editForm.email.trim();
        if (editForm.password.trim()) payload.password = editForm.password.trim();
      }

      const res = await updateDigitalAccount(editingAccount.id, payload);
      if (res.success) {
        setAlert({ type: 'success', text: 'تم تحديث بيانات الحساب بنجاح.' });
        setEditingAccount(null);
        loadStats();
        loadAccounts(page);
      }
    } catch (err: any) {
      setAlert({ type: 'error', text: err?.message || 'فشل تحديث بيانات الحساب' });
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async (account: DigitalAccount) => {
    if (account.status === 'SOLD') {
      setAlert({ type: 'error', text: 'غير مسموح بحذف الحسابات المباعة للعملاء لحفظ سجل الطلبات.' });
      return;
    }

    if (!window.confirm(`هل أنت متأكد من حذف الحساب "${account.email}" من المخزون نهائياً؟`)) {
      return;
    }

    try {
      const res = await deleteDigitalAccount(account.id);
      if (res.success) {
        setAlert({ type: 'success', text: 'تم حذف الحساب من المخزون بنجاح.' });
        loadStats();
        loadAccounts(page);
      }
    } catch (err: any) {
      setAlert({ type: 'error', text: err?.message || 'فشل حذف الحساب' });
    }
  };

  // Live count parser for bulk textarea
  const bulkLineCount = React.useMemo(() => {
    if (!bulkRawData) return 0;
    return bulkRawData.split(/\r?\n/).filter(line => line.trim().length > 0).length;
  }, [bulkRawData]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Alert Banner */}
      {alert && (
        <div
          style={{
            padding: '12px 18px',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: alert.type === 'success' ? '#ecfdf5' : alert.type === 'error' ? '#fef2f2' : '#eff6ff',
            color: alert.type === 'success' ? '#065f46' : alert.type === 'error' ? '#991b1b' : '#1e40af',
            border: `1px solid ${alert.type === 'success' ? '#a7f3d0' : alert.type === 'error' ? '#fecaca' : '#bfdbfe'}`,
            fontSize: '0.88rem',
            fontWeight: 700
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {alert.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
            <span>{alert.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setAlert(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Inventory Stat Cards */}
      <div className="admin-stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        {/* Available Stock */}
        <div className="admin-stat-card">
          <div className="admin-stat-card-header">
            <span className="admin-stat-label">المخزون المتاح للبيع (Available)</span>
            <div className="admin-stat-icon-wrapper" style={{ background: '#ecfdf5', color: '#10b981' }}>
              <Key size={22} color="#10b981" />
            </div>
          </div>
          <div className="admin-stat-value" style={{ color: '#059669' }}>
            {stats.available.toLocaleString()}
          </div>
          <div className="admin-stat-footer">جاهز للتسليم الفوري عند شراء العميل</div>
        </div>

        {/* Sold Accounts */}
        <div className="admin-stat-card">
          <div className="admin-stat-card-header">
            <span className="admin-stat-label">الحسابات المباعة (Sold)</span>
            <div className="admin-stat-icon-wrapper" style={{ background: '#eff6ff', color: '#3b82f6' }}>
              <UserCheck size={22} color="#3b82f6" />
            </div>
          </div>
          <div className="admin-stat-value" style={{ color: '#2563eb' }}>
            {stats.sold.toLocaleString()}
          </div>
          <div className="admin-stat-footer">تم تسليمها للعملاء ومسجلة في الطلبات</div>
        </div>

        {/* Disabled Accounts */}
        <div className="admin-stat-card">
          <div className="admin-stat-card-header">
            <span className="admin-stat-label">حسابات معطلة (Disabled)</span>
            <div className="admin-stat-icon-wrapper" style={{ background: '#f8fafc', color: '#64748b' }}>
              <Shield size={22} color="#64748b" />
            </div>
          </div>
          <div className="admin-stat-value" style={{ color: '#64748b' }}>
            {stats.disabled.toLocaleString()}
          </div>
          <div className="admin-stat-footer">موقوفة مؤقتاً ولا تباع</div>
        </div>

        {/* Total Stock */}
        <div className="admin-stat-card">
          <div className="admin-stat-card-header">
            <span className="admin-stat-label">إجمالي المخزون الرقمي</span>
            <div className="admin-stat-icon-wrapper" style={{ background: '#fdf4ff', color: '#a855f7' }}>
              <Database size={22} color="#a855f7" />
            </div>
          </div>
          <div className="admin-stat-value" style={{ color: '#7e22ce' }}>
            {stats.total.toLocaleString()}
          </div>
          <div className="admin-stat-footer">كل الحسابات المسجلة في النظام</div>
        </div>
      </div>

      {/* Control Bar: Filters & Actions */}
      <div style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
        padding: '16px 20px',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 14
      }}>
        {/* Search & Filter */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, flex: 1, minWidth: 280 }}>
          {/* Search Box */}
          <div style={{ position: 'relative', flex: 1, minWidth: 200, maxWidth: 360 }}>
            <Search size={16} color="#94a3b8" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث بالبريد الإلكتروني..."
              style={{
                width: '100%',
                padding: '9px 36px 9px 12px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '0.85rem',
                outline: 'none'
              }}
            />
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: '9px 14px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              fontSize: '0.85rem',
              fontWeight: 700,
              color: '#334155',
              background: '#fff'
            }}
          >
            <option value="all">كل الحالات ({stats.total})</option>
            <option value="AVAILABLE">متاح للبيع ({stats.available})</option>
            <option value="SOLD">تم البيع ({stats.sold})</option>
            <option value="DISABLED">معطل ({stats.disabled})</option>
          </select>

          {/* Product Filter */}
          <select
            value={selectedProductId}
            onChange={(e) => setSelectedProductId(e.target.value)}
            style={{
              padding: '9px 14px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              fontSize: '0.85rem',
              fontWeight: 700,
              color: '#334155',
              background: '#fff',
              maxWidth: 260
            }}
          >
            <option value="">جميع المنتجات الرقمية</option>
            {digitalProducts.map(p => (
              <option key={p.id} value={p.id}>
                {p.arabicName || p.productName || 'حساب نقاط تشغيل / Google'}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => {
              loadStats();
              loadAccounts(page);
            }}
            disabled={loading}
            className="btn btn-secondary btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            title="تحديث البيانات"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>تحديث</span>
          </button>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setBulkResult(null);
              setIsBulkModalOpen(true);
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              fontWeight: 800
            }}
          >
            <Upload size={15} color="#2563eb" />
            <span>استيراد جماعي (Bulk)</span>
          </button>

          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setIsAddModalOpen(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontWeight: 800
            }}
          >
            <Plus size={16} />
            <span>إضافة حساب جديد</span>
          </button>
        </div>
      </div>

      {/* Accounts Table */}
      <div style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-sm)'
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 800 }}>
                <th style={{ padding: '14px 18px' }}>البريد الإلكتروني (Email)</th>
                <th style={{ padding: '14px 18px' }}>الحالة (Status)</th>
                <th style={{ padding: '14px 18px' }}>كلمة المرور المشفرة (AES-256-GCM)</th>
                <th style={{ padding: '14px 18px' }}>المنتج المربوط</th>
                <th style={{ padding: '14px 18px' }}>الطلب / العميل</th>
                <th style={{ padding: '14px 18px' }}>تاريخ الإضافة</th>
                <th style={{ padding: '14px 18px', textAlign: 'center' }}>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                    <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 10px', opacity: 0.6 }} />
                    <div>جاري تحميل مخزون الحسابات الرقمية...</div>
                  </td>
                </tr>
              ) : accounts.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                    <Key size={36} style={{ margin: '0 auto 10px', opacity: 0.3 }} />
                    <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>لا توجد حسابات مسجلة في هذا المخزون حالياً.</div>
                    <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '4px 0 14px' }}>
                      قم بإضافة حساب جديد أو استيراد ملف حسابات جاهز.
                    </p>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => setIsAddModalOpen(true)}
                    >
                      + إضافة حساب الآن
                    </button>
                  </td>
                </tr>
              ) : (
                accounts.map(acc => {
                  const isSold = acc.status === 'SOLD';
                  const isAvailable = acc.status === 'AVAILABLE';
                  const isDisabled = acc.status === 'DISABLED';
                  const revealedPassword = revealedPasswords[acc.id];
                  const isRevealing = revealingId === acc.id;

                  return (
                    <tr
                      key={acc.id}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        transition: 'background 0.15s ease'
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = '#ffffff')}
                    >
                      {/* Email */}
                      <td style={{ padding: '12px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Mail size={14} color="#64748b" />
                          <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#0f172a', direction: 'ltr' }}>
                            {acc.email}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopy(acc.email, `email_${acc.id}`)}
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              padding: 2,
                              color: copiedKey === `email_${acc.id}` ? '#10b981' : '#94a3b8'
                            }}
                            title="نسخ الإيميل"
                          >
                            {copiedKey === `email_${acc.id}` ? <Check size={13} /> : <Copy size={13} />}
                          </button>
                        </div>
                      </td>

                      {/* Status Badge */}
                      <td style={{ padding: '12px 18px' }}>
                        {isAvailable && (
                          <span style={{
                            fontSize: '0.72rem',
                            fontWeight: 800,
                            padding: '3px 8px',
                            borderRadius: '12px',
                            background: '#ecfdf5',
                            color: '#065f46',
                            border: '1px solid #a7f3d0',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4
                          }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />
                            متاح (AVAILABLE)
                          </span>
                        )}
                        {isSold && (
                          <span style={{
                            fontSize: '0.72rem',
                            fontWeight: 800,
                            padding: '3px 8px',
                            borderRadius: '12px',
                            background: '#eff6ff',
                            color: '#1e40af',
                            border: '1px solid #bfdbfe',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4
                          }}>
                            <UserCheck size={12} />
                            تم البيع (SOLD)
                          </span>
                        )}
                        {isDisabled && (
                          <span style={{
                            fontSize: '0.72rem',
                            fontWeight: 800,
                            padding: '3px 8px',
                            borderRadius: '12px',
                            background: '#f1f5f9',
                            color: '#475569',
                            border: '1px solid #cbd5e1',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4
                          }}>
                            معطل (DISABLED)
                          </span>
                        )}
                      </td>

                      {/* Password Reveal */}
                      <td style={{ padding: '12px 18px' }}>
                        {revealedPassword ? (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#0B0F19', padding: '4px 8px', borderRadius: 6 }}>
                            <code style={{ color: '#38bdf8', fontSize: '0.82rem', fontFamily: 'monospace', fontWeight: 800, direction: 'ltr' }}>
                              {revealedPassword}
                            </code>
                            <button
                              type="button"
                              onClick={() => handleCopy(revealedPassword, `pwd_${acc.id}`)}
                              style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                padding: 2,
                                color: copiedKey === `pwd_${acc.id}` ? '#10b981' : '#facc15'
                              }}
                              title="نسخ كلمة المرور"
                            >
                              {copiedKey === `pwd_${acc.id}` ? <Check size={12} /> : <Copy size={12} />}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRevealPassword(acc.id)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#94a3b8' }}
                              title="إخفاء"
                            >
                              <EyeOff size={12} />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleRevealPassword(acc.id)}
                            disabled={isRevealing}
                            style={{
                              background: '#f8fafc',
                              border: '1px solid #cbd5e1',
                              borderRadius: '6px',
                              padding: '4px 10px',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              color: '#334155',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5
                            }}
                          >
                            {isRevealing ? (
                              <>
                                <RefreshCw size={12} className="animate-spin" />
                                <span>فك التشفير...</span>
                              </>
                            ) : (
                              <>
                                <Eye size={12} />
                                <span>كشف كلمة المرور</span>
                              </>
                            )}
                          </button>
                        )}
                      </td>

                      {/* Product Name */}
                      <td style={{ padding: '12px 18px', color: '#475569', fontSize: '0.8rem' }}>
                        {acc.productName || 'حساب نقاط تشغيل / Google'}
                      </td>

                      {/* Sold To / Order */}
                      <td style={{ padding: '12px 18px', fontSize: '0.78rem' }}>
                        {isSold ? (
                          <div>
                            <span style={{ color: '#0369a1', fontWeight: 700, display: 'block' }}>
                              طلب: {acc.orderId?.substring(0, 10)}...
                            </span>
                            <span style={{ color: '#64748b' }}>
                              مستخدم: {acc.assignedToUserId?.substring(0, 8)}...
                            </span>
                          </div>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>-</span>
                        )}
                      </td>

                      {/* Created Date */}
                      <td style={{ padding: '12px 18px', color: '#64748b', fontSize: '0.78rem' }}>
                        {new Date(acc.createdAt).toLocaleDateString('ar-EG')}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '12px 18px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingAccount(acc);
                              setEditForm({
                                email: acc.email,
                                password: '',
                                status: acc.status
                              });
                            }}
                            style={{
                              background: '#eff6ff',
                              border: '1px solid #bfdbfe',
                              color: '#1d4ed8',
                              padding: '4px 8px',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4
                            }}
                            title="تعديل الحساب"
                          >
                            <Edit3 size={13} />
                            <span>تعديل</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDelete(acc)}
                            disabled={isSold}
                            style={{
                              background: isSold ? '#f1f5f9' : '#fef2f2',
                              border: `1px solid ${isSold ? '#e2e8f0' : '#fecaca'}`,
                              color: isSold ? '#94a3b8' : '#dc2626',
                              padding: '4px 8px',
                              borderRadius: '6px',
                              cursor: isSold ? 'not-allowed' : 'pointer',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4
                            }}
                            title={isSold ? 'لا يمكن حذف حساب مباع' : 'حذف من المخزون'}
                          >
                            <Trash2 size={13} />
                            <span>حذف</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '14px 20px',
            borderTop: '1px solid #e2e8f0',
            background: '#f8fafc',
            fontSize: '0.85rem'
          }}>
            <span style={{ color: '#64748b' }}>
              إجمالي الحسابات: <strong>{total}</strong> (صفحة {page} من {totalPages})
            </span>

            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => loadAccounts(page - 1)}
                disabled={page <= 1 || loading}
                style={{ padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                <ChevronRight size={16} />
                <span>السابق</span>
              </button>

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => loadAccounts(page + 1)}
                disabled={page >= totalPages || loading}
                style={{ padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                <span>التالي</span>
                <ChevronLeft size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* SINGLE ADD MODAL */}
      {isAddModalOpen && (
        <div className="admin-modal-backdrop" onClick={() => setIsAddModalOpen(false)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="admin-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: '8px', background: '#ecfdf5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Plus size={20} />
                </div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>إضافة حساب جديد إلى المخزون</h3>
              </div>
              <button type="button" onClick={() => setIsAddModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateSingleAccount} style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 16 }}>
              {/* Product */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: 6 }}>
                  المنتج الرقمي:
                </label>
                <select
                  value={addForm.productId}
                  onChange={(e) => setAddForm({ ...addForm, productId: e.target.value })}
                  required
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                >
                  {digitalProducts.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.arabicName || p.productName || 'حساب نقاط تشغيل / Google'}
                    </option>
                  ))}
                </select>
              </div>

              {/* Email */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: 6 }}>
                  البريد الإلكتروني (Email):
                </label>
                <div style={{ position: 'relative' }}>
                  <Mail size={16} color="#94a3b8" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)' }} />
                  <input
                    type="email"
                    value={addForm.email}
                    onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                    placeholder="example@gmail.com"
                    required
                    style={{ width: '100%', padding: '10px 36px 10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem', direction: 'ltr' }}
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: 6 }}>
                  كلمة المرور (Password):
                </label>
                <div style={{ position: 'relative' }}>
                  <Lock size={16} color="#94a3b8" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)' }} />
                  <input
                    type="text"
                    value={addForm.password}
                    onChange={(e) => setAddForm({ ...addForm, password: e.target.value })}
                    placeholder="أدخل كلمة المرور الخاصة بالحساب"
                    required
                    style={{ width: '100%', padding: '10px 36px 10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem', direction: 'ltr' }}
                  />
                </div>
                <span style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 4, display: 'block' }}>
                  🔒 سيتم تشفير كلمة المرور فوراً باستخدام AES-256-GCM قبل حفظها في قاعدة البيانات.
                </span>
              </div>

              {/* Status */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: 6 }}>
                  الحالة الابتدائية:
                </label>
                <select
                  value={addForm.status}
                  onChange={(e) => setAddForm({ ...addForm, status: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                >
                  <option value="AVAILABLE">متاح للبيع فوراً (AVAILABLE)</option>
                  <option value="DISABLED">معطل مؤقتاً (DISABLED)</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsAddModalOpen(false)}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={addingAccount}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  {addingAccount ? <RefreshCw size={14} className="animate-spin" /> : <Check size={15} />}
                  <span>{addingAccount ? 'جاري الحفظ والتشفير...' : 'حفظ وإضافة للمخزون'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BULK IMPORT MODAL */}
      {isBulkModalOpen && (
        <div className="admin-modal-backdrop" onClick={() => setIsBulkModalOpen(false)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <div className="admin-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: '8px', background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Upload size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>استيراد جماعي لحسابات المخزون</h3>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>إضافة عدة حسابات دفعة واحدة مع التحقق التلقائي والتشفير</span>
                </div>
              </div>
              <button type="button" onClick={() => setIsBulkModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleBulkImport} style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 16 }}>
              {/* Product Target */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: 6 }}>
                  اختر المنتج الرقمي المستهدف:
                </label>
                <select
                  value={bulkProductId}
                  onChange={(e) => setBulkProductId(e.target.value)}
                  required
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                >
                  {digitalProducts.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.arabicName || p.productName || 'حساب نقاط تشغيل / Google'}
                    </option>
                  ))}
                </select>
              </div>

              {/* Format Hint */}
              <div style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '10px 14px',
                fontSize: '0.8rem',
                color: '#475569',
                lineHeight: 1.5
              }}>
                <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 2 }}>
                  الصيغ المدعومة (سطر لكل حساب):
                </div>
                <code style={{ direction: 'ltr', display: 'block', background: '#e2e8f0', padding: '4px 8px', borderRadius: 4, margin: '4px 0' }}>
                  email@gmail.com,password123
                  <br />
                  user2@gmail.com:password456
                </code>
                يتم تجاهل السطور الفارغة والتحقق من صحة الإيميل ومنع التكرار تلقائياً.
              </div>

              {/* Text Area */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: '0.85rem' }}>
                  <label style={{ fontWeight: 700 }}>بيانات الحسابات:</label>
                  <span style={{ color: '#0369a1', fontWeight: 800 }}>
                    عدد الأسطر المكتشفة: {bulkLineCount}
                  </span>
                </div>
                <textarea
                  rows={8}
                  value={bulkRawData}
                  onChange={(e) => setBulkRawData(e.target.value)}
                  placeholder={`acc1@gmail.com,pass123\nacc2@gmail.com,pass456`}
                  required
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.85rem',
                    fontFamily: 'monospace',
                    direction: 'ltr',
                    lineHeight: 1.4
                  }}
                />
              </div>

              {/* Bulk Result Summary if any */}
              {bulkResult && (
                <div style={{
                  padding: '12px 14px',
                  borderRadius: '8px',
                  background: bulkResult.rejected > 0 ? '#fffbeb' : '#ecfdf5',
                  border: `1px solid ${bulkResult.rejected > 0 ? '#fde68a' : '#a7f3d0'}`,
                  fontSize: '0.82rem'
                }}>
                  <div style={{ fontWeight: 800, color: bulkResult.rejected > 0 ? '#b45309' : '#065f46' }}>
                    ✓ تم إدخال {bulkResult.inserted} حساب بنجاح | ✕ تم رفض {bulkResult.rejected} حساب
                  </div>
                  {bulkResult.errors.length > 0 && (
                    <ul style={{ margin: '6px 0 0 16px', padding: 0, color: '#991b1b', fontSize: '0.78rem' }}>
                      {bulkResult.errors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsBulkModalOpen(false)}
                >
                  إغلاق
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={bulkImporting || bulkLineCount === 0}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  {bulkImporting ? <RefreshCw size={14} className="animate-spin" /> : <Upload size={15} />}
                  <span>{bulkImporting ? 'جاري التحقق والاستيراد...' : `استيراد (${bulkLineCount}) حساب`}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {editingAccount && (
        <div className="admin-modal-backdrop" onClick={() => setEditingAccount(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div className="admin-modal-header">
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>تعديل بيانات الحساب الرقمي</h3>
              <button type="button" onClick={() => setEditingAccount(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 16 }}>
              {editingAccount.status === 'SOLD' && (
                <div style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  background: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  fontSize: '0.8rem',
                  color: '#1e40af',
                  lineHeight: 1.5
                }}>
                  🔒 هذا الحساب تم بيعه وتسليمه للعميل. لا يمكن تعديل الإيميل أو كلمة المرور لحماية حقوق العميل وتطابق الطلب.
                </div>
              )}

              {/* Email */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: 6 }}>
                  البريد الإلكتروني:
                </label>
                <input
                  type="email"
                  value={editForm.email}
                  disabled={editingAccount.status === 'SOLD'}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.9rem',
                    direction: 'ltr',
                    background: editingAccount.status === 'SOLD' ? '#f1f5f9' : '#fff'
                  }}
                />
              </div>

              {/* Password */}
              {editingAccount.status !== 'SOLD' && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: 6 }}>
                    تغيير كلمة المرور (اتركه فارغاً للإبقاء على الحالية):
                  </label>
                  <input
                    type="text"
                    value={editForm.password}
                    onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                    placeholder="أدخل كلمة مرور جديدة أو اتركه فارغاً"
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem', direction: 'ltr' }}
                  />
                </div>
              )}

              {/* Status */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: 6 }}>
                  حالة الحساب:
                </label>
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                >
                  <option value="AVAILABLE">متاح للبيع (AVAILABLE)</option>
                  <option value="DISABLED">معطل مؤقتاً (DISABLED)</option>
                  {editingAccount.status === 'SOLD' && (
                    <option value="SOLD">تم البيع (SOLD)</option>
                  )}
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setEditingAccount(null)}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={savingEdit}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  {savingEdit ? <RefreshCw size={14} className="animate-spin" /> : <Check size={15} />}
                  <span>{savingEdit ? 'جاري الحفظ...' : 'حفظ التعديلات'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
