import React, { useState, useEffect, useCallback } from 'react';
import {
  Gift,
  Search,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Edit3,
  Upload,
  Power,
  DollarSign,
  ShieldCheck
} from 'lucide-react';
import {
  fetchAdminVouchers,
  updateAdminVoucher,
  syncAdminVouchers,
  uploadProductImage
} from '../../services/api';
import { AdminVoucherProduct } from '../../types';
import { getProductImageUrl } from '../../utils/imageUrl';

export const AdminVouchersTab: React.FC = () => {
  const [products, setProducts] = useState<AdminVoucherProduct[]>([]);
  const [stats, setStats] = useState<{
    last_sync_at: string | null;
    freefire_categories_count: number;
    pubg_categories_count: number;
    products_count: number;
    products_in_stock_count: number;
    products_approved_count: number;
  }>({
    last_sync_at: null,
    freefire_categories_count: 0,
    pubg_categories_count: 0,
    products_count: 0,
    products_in_stock_count: 0,
    products_approved_count: 0
  });

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState('');
  const [gameFilter, setGameFilter] = useState<'all' | 'freefire' | 'pubg'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Edit Modal State
  const [editingVoucher, setEditingVoucher] = useState<AdminVoucherProduct | null>(null);
  const [editPriceUsd, setEditPriceUsd] = useState('');
  const [editArabicTitle, setEditArabicTitle] = useState('');
  const [editCustomImageUrl, setEditCustomImageUrl] = useState('');
  const [editIsActive, setEditIsActive] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Alert State
  const [alert, setAlert] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const loadVouchers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchAdminVouchers();
      if (res.success) {
        setProducts(res.products || []);
        if (res.stats) {
          setStats(res.stats);
        }
      }
    } catch (err: any) {
      console.error('[AdminVouchersTab] Error loading vouchers:', err);
      setAlert({
        type: 'error',
        text: err?.response?.data?.error || err.message || 'فشل تحميل كتالوج البطاقات الرقمية.'
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadVouchers();
  }, [loadVouchers]);

  const handleTriggerSync = async () => {
    setSyncing(true);
    setAlert(null);
    try {
      const res = await syncAdminVouchers();
      if (res.success) {
        setAlert({
          type: 'success',
          text: `✓ تم مزامنة كتالوج البطاقات الرقمية بنجاح (${res.stats?.products_count || 0} منتج).`
        });
        await loadVouchers();
      } else {
        setAlert({
          type: 'error',
          text: res.message || 'فشلت عملية المزامنة.'
        });
      }
    } catch (err: any) {
      setAlert({
        type: 'error',
        text: err?.response?.data?.error || err.message || 'تعذر استدعاء مزامنة البطاقات.'
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleOpenEdit = (v: AdminVoucherProduct) => {
    setEditingVoucher(v);
    setEditPriceUsd(v.customerPriceUsd !== null && v.customerPriceUsd !== undefined ? String(v.customerPriceUsd) : '');
    setEditArabicTitle(v.arabicTitle || v.title);
    setEditCustomImageUrl(v.customImageUrl || '');
    setEditIsActive(v.isActive);
  };

  const handleSaveEdit = async () => {
    if (!editingVoucher) return;
    setSavingEdit(true);
    try {
      const numPrice = editPriceUsd.trim() ? parseFloat(editPriceUsd) : null;
      if (editIsActive && (numPrice === null || isNaN(numPrice) || numPrice <= 0)) {
        setAlert({
          type: 'error',
          text: 'لا يمكن تفعيل البطاقة للبيع بدون تحديد سعر بيع صالح (Customer Price > 0).'
        });
        setSavingEdit(false);
        return;
      }

      const res = await updateAdminVoucher(editingVoucher.id, {
        customerPriceUsd: numPrice,
        arabicTitle: editArabicTitle.trim() || null,
        customImageUrl: editCustomImageUrl.trim() || null,
        isActive: editIsActive
      });

      if (res.success) {
        setAlert({
          type: 'success',
          text: `✓ تم تحديث بيانات البطاقة (${editingVoucher.title}) بنجاح.`
        });
        setEditingVoucher(null);
        await loadVouchers();
      }
    } catch (err: any) {
      setAlert({
        type: 'error',
        text: err?.response?.data?.error || err.message || 'فشل حفظ تعديلات البطاقة.'
      });
    } finally {
      setSavingEdit(false);
    }
  };

  const handleQuickToggleActive = async (v: AdminVoucherProduct) => {
    if (!v.isActive && (!v.customerPriceUsd || v.customerPriceUsd <= 0)) {
      setAlert({
        type: 'error',
        text: 'يجب تحديد سعر بيع للبطاقة أولاً قبل تفعيلها في المتجر.'
      });
      handleOpenEdit(v);
      return;
    }

    try {
      const nextActive = !v.isActive;
      await updateAdminVoucher(v.id, { isActive: nextActive });
      setAlert({
        type: 'success',
        text: `✓ تم ${nextActive ? 'تفعيل' : 'إيقاف'} البطاقة (${v.title}) بنجاح.`
      });
      await loadVouchers();
    } catch (err: any) {
      setAlert({
        type: 'error',
        text: err?.response?.data?.error || err.message || 'فشل تغيير حالة التفعيل.'
      });
    }
  };

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    try {
      const uploadRes = await uploadProductImage(file);
      if (uploadRes && uploadRes.imageUrl) {
        setEditCustomImageUrl(uploadRes.imageUrl);
        setAlert({
          type: 'success',
          text: '✓ تم رفع الصورة المخصصة للبطاقة بنجاح.'
        });
      }
    } catch (err: any) {
      setAlert({
        type: 'error',
        text: err?.response?.data?.error || err.message || 'فشل رفع الصورة.'
      });
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Filtered list
  const filteredProducts = products.filter(p => {
    if (gameFilter !== 'all' && p.gameKey !== gameFilter) return false;
    if (statusFilter === 'active' && !p.isActive) return false;
    if (statusFilter === 'inactive' && p.isActive) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchTitle = (p.title || '').toLowerCase().includes(q);
      const matchArabic = (p.arabicTitle || '').toLowerCase().includes(q);
      const matchCat = (p.categoryTitle || '').toLowerCase().includes(q);
      if (!matchTitle && !matchArabic && !matchCat) return false;
    }
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Alert banner */}
      {alert && (
        <div style={{
          padding: '12px 16px',
          borderRadius: 8,
          background: alert.type === 'success' ? '#ecfdf5' : alert.type === 'error' ? '#fef2f2' : '#eff6ff',
          border: `1px solid ${alert.type === 'success' ? '#10b981' : alert.type === 'error' ? '#ef4444' : '#3b82f6'}`,
          color: alert.type === 'success' ? '#065f46' : alert.type === 'error' ? '#991b1b' : '#1e40af',
          fontSize: '0.88rem',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {alert.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            <span>{alert.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setAlert(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 2 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Top Stats Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 14
      }}>
        <div style={{
          background: '#FFFFFF',
          borderRadius: 12,
          padding: '16px',
          border: '1px solid #E2E8F0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
        }}>
          <span style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 700, display: 'block', marginBottom: 4 }}>
            إجمالي البطاقات المسجلة
          </span>
          <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#0F172A' }}>
            {stats.products_count || products.length}
          </div>
          <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>
            {stats.freefire_categories_count || 1} فري فاير • {stats.pubg_categories_count || 1} ببجي UC
          </span>
        </div>

        <div style={{
          background: '#FFFFFF',
          borderRadius: 12,
          padding: '16px',
          border: '1px solid #E2E8F0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
        }}>
          <span style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 700, display: 'block', marginBottom: 4 }}>
            البطاقات المفعلة للبيع
          </span>
          <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#10B981' }}>
            {products.filter(p => p.isActive).length}
          </div>
          <span style={{ fontSize: '0.72rem', color: '#059669' }}>
            جاهزة ومسعرة للشراء المباشر
          </span>
        </div>

        <div style={{
          background: '#FFFFFF',
          borderRadius: 12,
          padding: '16px',
          border: '1px solid #E2E8F0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
        }}>
          <span style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 700, display: 'block', marginBottom: 4 }}>
            البطاقات المتوفرة بالمخزون
          </span>
          <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#3B82F6' }}>
            {products.filter(p => p.isInStock && p.stock > 0).length}
          </div>
          <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
            مخزون حي من الكتالوج
          </span>
        </div>

        <div style={{
          background: '#FFFFFF',
          borderRadius: 12,
          padding: '16px',
          border: '1px solid #E2E8F0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          <div>
            <span style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 700, display: 'block', marginBottom: 4 }}>
              آخر مزامنة للكتالوج
            </span>
            <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0F172A', direction: 'ltr', textAlign: 'right' }}>
              {stats.last_sync_at ? new Date(stats.last_sync_at).toLocaleString('ar-EG') : 'لم تتم بعد'}
            </div>
          </div>
          <button
            type="button"
            onClick={handleTriggerSync}
            disabled={syncing}
            style={{
              marginTop: 10,
              padding: '8px 12px',
              borderRadius: 8,
              background: '#0F172A',
              color: '#FFFFFF',
              border: 'none',
              fontWeight: 800,
              fontSize: '0.78rem',
              cursor: syncing ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6
            }}
          >
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            <span>{syncing ? 'جاري المزامنة...' : 'مزامنة الكتالوج والأسعار'}</span>
          </button>
        </div>
      </div>

      {/* Notice on Images and Hidden Provider Rule */}
      <div style={{
        background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
        border: '1.5px solid #cbd5e1',
        borderRadius: 12,
        padding: '14px 18px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12
      }}>
        <ShieldCheck size={22} color="#0284c7" style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ fontSize: '0.82rem', color: '#334155', lineHeight: 1.6 }}>
          <strong style={{ color: '#0f172a', display: 'block', fontSize: '0.88rem', marginBottom: 2 }}>
            قواعد صارمة لصور المنتجات وإخفاء هوية المزود:
          </strong>
          • <strong>صور المنتجات:</strong> لا يتم استخدام صور المزود نهائياً في واجهة المتجر. يمكنك تحديد ورفع صور مخصصة لكل بطاقة من هذا الجدول.<br />
          • <strong>هوية المزود:</strong> محجوبة بالكامل عن واجهات العملاء، وتظهر المنتجات كبطاقات وقسائم هدايا رقمية معتمدة من KIROPRO.
        </div>
      </div>

      {/* Filters Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
        background: '#FFFFFF',
        padding: '14px 16px',
        borderRadius: 12,
        border: '1px solid #E2E8F0'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 260 }}>
          <div style={{ position: 'relative', width: '100%' }}>
            <Search size={16} color="#94A3B8" style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', right: 12 }} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث باسم البطاقة أو القيمة أو الفئة..."
              style={{
                width: '100%',
                padding: '9px 36px 9px 12px',
                borderRadius: 8,
                border: '1px solid #CBD5E1',
                fontSize: '0.85rem',
                outline: 'none'
              }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Game Filter */}
          <select
            value={gameFilter}
            onChange={(e) => setGameFilter(e.target.value as any)}
            style={{
              padding: '9px 12px',
              borderRadius: 8,
              border: '1px solid #CBD5E1',
              fontSize: '0.85rem',
              fontWeight: 700,
              background: '#FFFFFF',
              color: '#334155',
              outline: 'none'
            }}
          >
            <option value="all">جميع الألعاب ({products.length})</option>
            <option value="freefire">قسائم فري فاير ({products.filter(p => p.gameKey === 'freefire').length})</option>
            <option value="pubg">بطاقات ببجي شدات ({products.filter(p => p.gameKey === 'pubg').length})</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            style={{
              padding: '9px 12px',
              borderRadius: 8,
              border: '1px solid #CBD5E1',
              fontSize: '0.85rem',
              fontWeight: 700,
              background: '#FFFFFF',
              color: '#334155',
              outline: 'none'
            }}
          >
            <option value="all">كل الحالات</option>
            <option value="active">مفعلة للبيع فقط</option>
            <option value="inactive">غير مفعلة</option>
          </select>

          <button
            type="button"
            onClick={loadVouchers}
            disabled={loading}
            style={{
              padding: '9px 14px',
              borderRadius: 8,
              background: '#F1F5F9',
              border: '1px solid #CBD5E1',
              color: '#334155',
              fontWeight: 800,
              fontSize: '0.82rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
            title="تحديث البيانات"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>تحديث</span>
          </button>
        </div>
      </div>

      {/* Vouchers Table */}
      <div style={{
        background: '#FFFFFF',
        borderRadius: 12,
        border: '1px solid #E2E8F0',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
      }}>
        {loading ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: '#64748B' }}>
            <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 10px' }} />
            <div style={{ fontWeight: 700 }}>جاري تحميل كتالوج البطاقات الرقمية...</div>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: '#64748B' }}>
            <Gift size={32} style={{ margin: '0 auto 10px', opacity: 0.5 }} />
            <div style={{ fontWeight: 800, fontSize: '1rem', color: '#0F172A', marginBottom: 4 }}>
              لا توجد بطاقات مطابقة لخيارات البحث
            </div>
            <p style={{ fontSize: '0.82rem' }}>جرب تغيير الكلمات المفتاحية أو اضغط "مزامنة الكتالوج والأسعار".</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontWeight: 800 }}>
                  <th style={{ padding: '12px 16px' }}>الصورة</th>
                  <th style={{ padding: '12px 16px' }}>البطاقة / القسيمة</th>
                  <th style={{ padding: '12px 16px' }}>اللعبة</th>
                  <th style={{ padding: '12px 16px' }}>الفئة الرقمية</th>
                  <th style={{ padding: '12px 16px' }}>تكلفة المزود</th>
                  <th style={{ padding: '12px 16px' }}>سعر البيع للعميل</th>
                  <th style={{ padding: '12px 16px' }}>المخزون</th>
                  <th style={{ padding: '12px 16px' }}>الحالة</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center' }}>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((p) => {
                  const defaultImg = p.gameKey === 'freefire'
                    ? '/uploads/products/prod_1789435947312_54dc7dd7.webp'
                    : '/uploads/products/PUGB-Mobile-Logo-1024x576.jpg';
                  const displayImg = p.customImageUrl || defaultImg;

                  return (
                    <tr
                      key={p.id}
                      style={{
                        borderBottom: '1px solid #F1F5F9',
                        transition: 'background 0.15s ease'
                      }}
                    >
                      {/* Image Preview */}
                      <td style={{ padding: '12px 16px', width: 64 }}>
                        <div style={{
                          width: 48,
                          height: 48,
                          borderRadius: 8,
                          overflow: 'hidden',
                          border: '1px solid #E2E8F0',
                          background: '#F8FAFC',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          <img
                            src={getProductImageUrl(displayImg)}
                            alt={p.title}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = defaultImg;
                            }}
                          />
                        </div>
                      </td>

                      {/* Title */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '0.88rem' }}>
                          {p.arabicTitle || p.title}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#64748B', direction: 'ltr', textAlign: 'right' }}>
                          {p.title}
                        </div>
                      </td>

                      {/* Game Key */}
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          display: 'inline-flex',
                          padding: '3px 8px',
                          borderRadius: 6,
                          fontSize: '0.75rem',
                          fontWeight: 800,
                          background: p.gameKey === 'freefire' ? '#FEF2F2' : '#EFF6FF',
                          color: p.gameKey === 'freefire' ? '#B91C1C' : '#1D4ED8'
                        }}>
                          {p.gameKey === 'freefire' ? 'فري فاير' : 'ببجي موبايل'}
                        </span>
                      </td>

                      {/* Face value */}
                      <td style={{ padding: '12px 16px', fontWeight: 800, color: '#334155' }}>
                        {p.faceValue ? `$${p.faceValue}` : '—'}
                      </td>

                      {/* Unit Price (Cost from G2Bulk) */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: 800, color: '#475569', direction: 'ltr', textAlign: 'right' }}>
                          ${Number(p.supplierUnitPrice).toFixed(3)}
                        </div>
                        <span style={{ fontSize: '0.68rem', color: '#94A3B8' }}>
                          تكلفة الوحدة الحية
                        </span>
                      </td>

                      {/* Customer Price */}
                      <td style={{ padding: '12px 16px' }}>
                        {p.customerPriceUsd && p.customerPriceUsd > 0 ? (
                          <div style={{ fontWeight: 900, color: '#10B981', fontSize: '0.92rem', direction: 'ltr', textAlign: 'right' }}>
                            ${Number(p.customerPriceUsd).toFixed(2)}
                          </div>
                        ) : (
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: 6,
                            background: '#FEF2F2',
                            color: '#DC2626',
                            fontSize: '0.75rem',
                            fontWeight: 800
                          }}>
                            غير مسعر
                          </span>
                        )}
                      </td>

                      {/* Stock */}
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          display: 'inline-flex',
                          padding: '3px 8px',
                          borderRadius: 6,
                          fontSize: '0.75rem',
                          fontWeight: 800,
                          background: (p.isInStock && p.stock > 0) ? '#ECFDF5' : '#FEF2F2',
                          color: (p.isInStock && p.stock > 0) ? '#059669' : '#DC2626'
                        }}>
                          {p.isInStock && p.stock > 0 ? `${p.stock} متوفر` : 'نفد المخزون'}
                        </span>
                      </td>

                      {/* Active Status */}
                      <td style={{ padding: '12px 16px' }}>
                        <button
                          type="button"
                          onClick={() => handleQuickToggleActive(p)}
                          style={{
                            border: 'none',
                            background: p.isActive ? '#ECFDF5' : '#F1F5F9',
                            color: p.isActive ? '#059669' : '#64748B',
                            padding: '4px 10px',
                            borderRadius: 20,
                            fontSize: '0.75rem',
                            fontWeight: 800,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4
                          }}
                        >
                          <Power size={12} />
                          <span>{p.isActive ? 'مفعل للبيع' : 'معطل'}</span>
                        </button>
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(p)}
                          style={{
                            background: '#0F172A',
                            color: '#FFFFFF',
                            border: 'none',
                            borderRadius: 6,
                            padding: '6px 12px',
                            fontSize: '0.75rem',
                            fontWeight: 800,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4
                          }}
                        >
                          <Edit3 size={12} />
                          <span>تعديل السعر والصورة</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Voucher Modal */}
      {editingVoucher && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.65)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: 16,
            maxWidth: 520,
            width: '100%',
            overflow: 'hidden',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)'
          }}>
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#F8FAFC'
            }}>
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 900, color: '#0F172A', margin: 0 }}>
                  تعديل تسعير وصورة البطاقة
                </h3>
                <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
                  {editingVoucher.title}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setEditingVoucher(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', fontSize: '1.2rem' }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Cost from Provider (Read-Only) */}
              <div style={{
                background: '#F1F5F9',
                borderRadius: 10,
                padding: '12px 16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: '#64748B', display: 'block' }}>تكلفة المزود الحية (Cost):</span>
                  <strong style={{ fontSize: '1.1rem', color: '#0F172A', direction: 'ltr', display: 'block' }}>
                    ${Number(editingVoucher.supplierUnitPrice).toFixed(3)}
                  </strong>
                </div>
                <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>
                  تُسحب تلقائياً من الكتالوج
                </span>
              </div>

              {/* Customer Selling Price */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 800, color: '#0F172A', marginBottom: 6 }}>
                  سعر البيع للعميل بالدولار (Customer Price USD) *:
                </label>
                <div style={{ position: 'relative' }}>
                  <DollarSign size={16} color="#64748B" style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', right: 12 }} />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editPriceUsd}
                    onChange={(e) => setEditPriceUsd(e.target.value)}
                    placeholder="مثال: 0.99"
                    style={{
                      width: '100%',
                      padding: '10px 36px 10px 12px',
                      borderRadius: 8,
                      border: '1.5px solid #CBD5E1',
                      fontSize: '0.95rem',
                      fontWeight: 700,
                      outline: 'none',
                      direction: 'ltr',
                      textAlign: 'right'
                    }}
                  />
                </div>
                <span style={{ fontSize: '0.72rem', color: '#64748B', marginTop: 4, display: 'block' }}>
                  يتم تحويله تلقائياً إلى الجنيه السوداني (SDG) بحسب سعر الصرف المعتمد للمنصة.
                </span>
              </div>

              {/* Arabic Display Title */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 800, color: '#0F172A', marginBottom: 6 }}>
                  الاسم المعروض بالعربية في المتجر:
                </label>
                <input
                  type="text"
                  value={editArabicTitle}
                  onChange={(e) => setEditArabicTitle(e.target.value)}
                  placeholder="مثال: بطاقة ببجي 60 شدة UC"
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: '1.5px solid #CBD5E1',
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    outline: 'none'
                  }}
                />
              </div>

              {/* Custom Image URL / Upload */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 800, color: '#0F172A', marginBottom: 6 }}>
                  صورة المنتج المخصصة (يحددها الأدمن حصراً):
                </label>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <input
                    type="text"
                    value={editCustomImageUrl}
                    onChange={(e) => setEditCustomImageUrl(e.target.value)}
                    placeholder="/uploads/products/... أو رابط صورة خارجي"
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: '1px solid #CBD5E1',
                      fontSize: '0.82rem',
                      direction: 'ltr',
                      outline: 'none'
                    }}
                  />
                  <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    accept="image/*"
                    onChange={handleImageFileChange}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingImage}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 8,
                      background: '#F1F5F9',
                      border: '1px solid #CBD5E1',
                      fontWeight: 800,
                      fontSize: '0.78rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    <Upload size={14} />
                    <span>{uploadingImage ? 'جاري الرفع...' : 'رفع صورة'}</span>
                  </button>
                </div>

                {/* Preview */}
                {editCustomImageUrl && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 8, overflow: 'hidden', border: '1px solid #CBD5E1' }}>
                      <img src={getProductImageUrl(editCustomImageUrl)} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                    <span style={{ fontSize: '0.72rem', color: '#10B981', fontWeight: 700 }}>
                      ✓ تم تحديد صورة مخصصة بنجاح
                    </span>
                  </div>
                )}
              </div>

              {/* Active Toggle */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 14px',
                borderRadius: 8,
                background: '#F8FAFC',
                border: '1px solid #E2E8F0'
              }}>
                <div>
                  <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0F172A', display: 'block' }}>
                    تفعيل البطاقة للبيع في المتجر
                  </span>
                  <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
                    تظهر للعملاء فور تفعيلها وتحديد سعر بيع صالح
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={editIsActive}
                  onChange={(e) => setEditIsActive(e.target.checked)}
                  style={{ width: 18, height: 18, cursor: 'pointer' }}
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div style={{
              padding: '14px 20px',
              borderTop: '1px solid #E2E8F0',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
              background: '#F8FAFC'
            }}>
              <button
                type="button"
                onClick={() => setEditingVoucher(null)}
                style={{
                  padding: '9px 16px',
                  borderRadius: 8,
                  background: 'transparent',
                  border: '1px solid #CBD5E1',
                  color: '#475569',
                  fontWeight: 800,
                  fontSize: '0.82rem',
                  cursor: 'pointer'
                }}
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={savingEdit}
                style={{
                  padding: '9px 20px',
                  borderRadius: 8,
                  background: '#0F172A',
                  color: '#FFFFFF',
                  border: 'none',
                  fontWeight: 900,
                  fontSize: '0.85rem',
                  cursor: savingEdit ? 'not-allowed' : 'pointer'
                }}
              >
                {savingEdit ? 'جاري الحفظ...' : 'حفظ التعديلات'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
