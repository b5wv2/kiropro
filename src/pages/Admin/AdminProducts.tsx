import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Package, 
  Search, 
  Power, 
  CheckCircle, 
  RefreshCw, 
  Edit3, 
  Upload, 
  X, 
  DollarSign, 
  TrendingUp, 
  AlertCircle, 
  EyeOff,
  Star,
  Check,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Trash2,
  Sparkles
} from 'lucide-react';
import { 
  fetchAdminCatalog, 
  updateAdminProduct, 
  toggleAdminProductActive, 
  syncProviderPrices, 
  uploadProductImage,
  fetchAdminCategories,
  uploadAdminCategoryImage,
  removeAdminCategoryImage
} from '../../services/api';
import { getProductImageUrl } from '../../utils/imageUrl';
import { AdminProduct, AdminCatalogResponse, GameCategory } from '../../types';

export const AdminProducts: React.FC = () => {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({ totalCatalog: 0, activeCount: 0, inactiveCount: 0 });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  
  // Selected products for bulk actions
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  // Modals & Operations state
  const [editingProduct, setEditingProduct] = useState<AdminProduct | null>(null);
  const [editForm, setEditForm] = useState<{
    productName: string;
    offerName: string;
    arabicName: string;
    description: string;
    customerPriceUsd: string;
    isActive: boolean;
    imageUrl: string;
    displayOrder: number;
    isFeatured: boolean;
  }>({
    productName: '',
    offerName: '',
    arabicName: '',
    description: '',
    customerPriceUsd: '',
    isActive: false,
    imageUrl: '',
    displayOrder: 0,
    isFeatured: false,
  });

  const [savingProduct, setSavingProduct] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [syncingPrices, setSyncingPrices] = useState(false);
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [syncScope, setSyncScope] = useState<'ACTIVE' | 'SELECTED' | 'ALL'>('ACTIVE');
  const [alertInfo, setAlertInfo] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Sub-tabs: 'categories' (Category / Game Images) vs 'products' (Pricing & Catalog)
  const [activeAdminTab, setActiveAdminTab] = useState<'categories' | 'products'>('categories');
  const [categories, setCategories] = useState<GameCategory[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [uploadingCatId, setUploadingCatId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const categoryFileInputRef = useRef<HTMLInputElement | null>(null);

  const loadCategories = useCallback(async () => {
    setLoadingCategories(true);
    try {
      const data = await fetchAdminCategories();
      setCategories(data);
    } catch (err: any) {
      console.error('Failed to load categories:', err);
      setAlertInfo({ type: 'error', text: err.message || 'فشل تحميل فئات وألعاب المتجر' });
    } finally {
      setLoadingCategories(false);
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const handleTriggerCategoryUpload = (catId: string) => {
    setUploadingCatId(catId);
    if (categoryFileInputRef.current) {
      categoryFileInputRef.current.value = '';
      categoryFileInputRef.current.click();
    }
  };

  const handleCategoryFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadingCatId) return;

    setLoadingCategories(true);
    try {
      const res = await uploadAdminCategoryImage(uploadingCatId, file);
      setCategories(prev => prev.map(c => c.id === uploadingCatId ? res.category : c));
      setAlertInfo({ 
        type: 'success', 
        text: `تم تحديث وتطبيق صورة "${res.category.arabicName || res.category.name}" بنجاح على كافة الباقات التابعة لها في المتجر!` 
      });
    } catch (err: any) {
      setAlertInfo({ type: 'error', text: err.message || 'فشل رفع صورة الفئة' });
    } finally {
      setLoadingCategories(false);
      setUploadingCatId(null);
      if (categoryFileInputRef.current) categoryFileInputRef.current.value = '';
    }
  };

  const handleRemoveCategoryImg = async (category: GameCategory) => {
    if (!window.confirm(`هل أنت متأكد من رغبتك في إزالة صورة الفئة "${category.arabicName || category.name}" واستعادة الصورة الافتراضية؟`)) return;

    setLoadingCategories(true);
    try {
      const res = await removeAdminCategoryImage(category.id);
      setCategories(prev => prev.map(c => c.id === category.id ? res.category : c));
      setAlertInfo({ 
        type: 'success', 
        text: `تمت إزالة صورة الفئة "${category.arabicName || category.name}" بنجاح وتفعيل الصورة الافتراضية.` 
      });
    } catch (err: any) {
      setAlertInfo({ type: 'error', text: err.message || 'فشل إزالة صورة الفئة' });
    } finally {
      setLoadingCategories(false);
    }
  };

  const loadCatalog = useCallback(async (targetPage = page, querySearch = search, filter = statusFilter, catFilter = categoryFilter) => {
    setLoading(true);
    try {
      const res: AdminCatalogResponse = await fetchAdminCatalog({
        page: targetPage,
        limit,
        search: querySearch.trim() || undefined,
        status: filter,
        gameCategory: catFilter !== 'all' ? catFilter : undefined,
      });

      setProducts(res.products);
      setTotal(res.total);
      setTotalPages(res.totalPages || 1);
      setPage(res.page);
      if (res.stats) {
        setStats(res.stats);
      }
    } catch (err: any) {
      console.error('Failed to load admin catalog:', err);
      setAlertInfo({ type: 'error', text: err.message || 'فشل في تحميل كتالوج المنتجات' });
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, statusFilter, categoryFilter]);

  useEffect(() => {
    loadCatalog(page, search, statusFilter, categoryFilter);
  }, [page, statusFilter, categoryFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadCatalog(1, search, statusFilter, categoryFilter);
  };

  const handleFilterChange = (newFilter: 'all' | 'active' | 'inactive') => {
    setStatusFilter(newFilter);
    setPage(1);
  };

  const handleCategoryFilterChange = (newCat: string) => {
    setCategoryFilter(newCat);
    setPage(1);
  };

  const handleToggleActive = async (product: AdminProduct) => {
    try {
      const res = await toggleAdminProductActive(product.id);
      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, isActive: res.product.isActive } : p));
      setStats(prev => ({
        ...prev,
        activeCount: res.product.isActive ? prev.activeCount + 1 : Math.max(0, prev.activeCount - 1),
        inactiveCount: res.product.isActive ? Math.max(0, prev.inactiveCount - 1) : prev.inactiveCount + 1,
      }));
      setAlertInfo({
        type: 'success',
        text: `تم ${res.product.isActive ? 'تفعيل' : 'تعطيل'} المنتج "${product.productName} - ${product.offerName}" بنجاح.`,
      });
    } catch (err: any) {
      setAlertInfo({ type: 'error', text: err.message || 'فشل تغيير حالة المنتج' });
    }
  };

  const handleOpenEdit = (product: AdminProduct) => {
    setEditingProduct(product);
    setEditForm({
      productName: product.productName,
      offerName: product.offerName,
      arabicName: product.arabicName || '',
      description: product.description || '',
      customerPriceUsd: product.customerPriceUsd !== null ? String(product.customerPriceUsd) : '',
      isActive: product.isActive,
      imageUrl: product.imageUrl || '',
      displayOrder: product.displayOrder || 0,
      isFeatured: product.isFeatured || false,
    });
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;

    setSavingProduct(true);
    try {
      const priceNum = editForm.customerPriceUsd.trim() !== '' ? Number(editForm.customerPriceUsd) : null;
      if (priceNum !== null && (isNaN(priceNum) || priceNum < 0)) {
        throw new Error('يرجى إدخال سعر بيع صالح بالدولار');
      }

      const res = await updateAdminProduct(editingProduct.id, {
        productName: editForm.productName.trim(),
        offerName: editForm.offerName.trim(),
        arabicName: editForm.arabicName.trim() || null,
        description: editForm.description.trim() || null,
        customerPriceUsd: priceNum,
        isActive: editForm.isActive,
        imageUrl: editForm.imageUrl.trim() || null,
        displayOrder: Number(editForm.displayOrder) || 0,
        isFeatured: editForm.isFeatured,
      });

      setProducts(prev => prev.map(p => p.id === editingProduct.id ? res.product : p));
      setAlertInfo({ type: 'success', text: `تم حفظ تعديلات المنتج "${res.product.productName}" بنجاح.` });
      setEditingProduct(null);
    } catch (err: any) {
      setAlertInfo({ type: 'error', text: err.message || 'فشل حفظ بيانات المنتج' });
    } finally {
      setSavingProduct(false);
    }
  };

  const handleImageFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    try {
      const res = await uploadProductImage(file);
      setEditForm(prev => ({ ...prev, imageUrl: res.url }));
      setAlertInfo({ type: 'success', text: 'تم رفع صورة المنتج بنجاح وتجهيز رابط التخزين.' });
    } catch (err: any) {
      setAlertInfo({ type: 'error', text: err.message || 'فشل رفع الصورة' });
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleExecutePriceSync = async () => {
    setSyncingPrices(true);
    setAlertInfo(null);
    try {
      const res = await syncProviderPrices({
        scope: syncScope,
        productIds: syncScope === 'SELECTED' ? selectedIds : undefined,
      });

      setSyncModalOpen(false);
      setAlertInfo({
        type: 'success',
        text: `تم تحديث تكلفة المزود (${res.results?.updated || 0} منتج). أسعار البيع للعملاء لم تتغير ومحمية تماماً.`,
      });
      loadCatalog(page, search, statusFilter);
    } catch (err: any) {
      setAlertInfo({ type: 'error', text: err.message || 'فشل مزامنة الأسعار من المزود' });
    } finally {
      setSyncingPrices(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === products.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(products.map(p => p.id));
    }
  };

  const toggleSelectProduct = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  // Calculate live profit margin inside edit modal
  const editPriceNum = Number(editForm.customerPriceUsd);
  const editCostNum = editingProduct ? Number(editingProduct.gamesDropCostUsd || editingProduct.providerCostUsd || 0) : 0;
  const liveProfit = !isNaN(editPriceNum) && editPriceNum > 0 ? (editPriceNum - editCostNum).toFixed(2) : null;

  return (
    <>
      {/* Overview Stat Cards */}
      <div className="admin-stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <div className="admin-stat-card">
          <div className="admin-stat-card-header">
            <span className="admin-stat-label">كتالوج المنتجات المستوردة</span>
            <div className="admin-stat-icon-wrapper" style={{ background: '#eff6ff', color: '#3b82f6' }}>
              <Package size={22} color="#3b82f6" />
            </div>
          </div>
          <div className="admin-stat-value">{stats.totalCatalog.toLocaleString()}</div>
          <div className="admin-stat-footer">منتج مستورد من Snapshot</div>
        </div>

        <div className="admin-stat-card">
          <div className="admin-stat-card-header">
            <span className="admin-stat-label">المنتجات المعروضة للعملاء</span>
            <div className="admin-stat-icon-wrapper" style={{ background: '#ecfdf5', color: '#10b981' }}>
              <CheckCircle size={22} color="#10b981" />
            </div>
          </div>
          <div className="admin-stat-value" style={{ color: '#10b981' }}>{stats.activeCount.toLocaleString()}</div>
          <div className="admin-stat-footer">منتج نشط في المتجر حالياً</div>
        </div>

        <div className="admin-stat-card">
          <div className="admin-stat-card-header">
            <span className="admin-stat-label">منتجات معطلة / غير معروضة</span>
            <div className="admin-stat-icon-wrapper" style={{ background: '#f8fafc', color: '#64748b' }}>
              <EyeOff size={22} color="#64748b" />
            </div>
          </div>
          <div className="admin-stat-value" style={{ color: '#64748b' }}>{stats.inactiveCount.toLocaleString()}</div>
          <div className="admin-stat-footer">تنتظر تفعيل الأدمن وتحديد السعر</div>
        </div>

        <div className="admin-stat-card">
          <div className="admin-stat-card-header">
            <span className="admin-stat-label">التحكم بالأسعار والتكلفة</span>
            <div className="admin-stat-icon-wrapper" style={{ background: '#fffbeb', color: '#f59e0b' }}>
              <TrendingUp size={22} color="#f59e0b" />
            </div>
          </div>
          <div className="admin-stat-value" style={{ fontSize: '1.25rem', color: '#0f172a' }}>يدوي ومفصول</div>
          <div className="admin-stat-footer">سعر البيع لا يتأثر بتغيير التكلفة</div>
        </div>
      </div>

      {/* Alert Banner */}
      {alertInfo && (
        <div 
          style={{
            padding: '14px 18px',
            borderRadius: '10px',
            marginBottom: '18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: alertInfo.type === 'success' ? '#ecfdf5' : alertInfo.type === 'error' ? '#fef2f2' : '#eff6ff',
            color: alertInfo.type === 'success' ? '#065f46' : alertInfo.type === 'error' ? '#991b1b' : '#1e40af',
            border: `1px solid ${alertInfo.type === 'success' ? '#a7f3d0' : alertInfo.type === 'error' ? '#fecaca' : '#bfdbfe'}`,
            fontSize: '0.9rem',
            fontWeight: 600,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {alertInfo.type === 'success' ? <Check size={18} /> : <AlertCircle size={18} />}
            <span>{alertInfo.text}</span>
          </div>
          <button 
            onClick={() => setAlertInfo(null)} 
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Hidden file input for Category Image Upload */}
      <input
        type="file"
        ref={categoryFileInputRef}
        onChange={handleCategoryFileChange}
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        style={{ display: 'none' }}
      />

      {/* Section Sub-Navigation Tabs */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '2px solid #e2e8f0', paddingBottom: '12px' }}>
        <button
          type="button"
          onClick={() => setActiveAdminTab('categories')}
          style={{
            padding: '10px 18px',
            borderRadius: '8px',
            fontWeight: 800,
            fontSize: '0.92rem',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            border: 'none',
            background: activeAdminTab === 'categories' ? '#0f172a' : '#f8fafc',
            color: activeAdminTab === 'categories' ? '#ffffff' : '#64748b',
            boxShadow: activeAdminTab === 'categories' ? '0 4px 12px rgba(15,23,42,0.15)' : 'none',
            transition: 'all 0.15s ease'
          }}
        >
          <ImageIcon size={18} color={activeAdminTab === 'categories' ? '#f59e0b' : '#64748b'} />
          <span>صور وفئات الألعاب (Categories & Images)</span>
          <span style={{ 
            background: activeAdminTab === 'categories' ? '#f59e0b' : '#e2e8f0', 
            color: activeAdminTab === 'categories' ? '#0f172a' : '#475569',
            fontSize: '0.72rem',
            fontWeight: 800,
            padding: '2px 8px',
            borderRadius: '12px'
          }}>
            {categories.length} ألعاب
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveAdminTab('products')}
          style={{
            padding: '10px 18px',
            borderRadius: '8px',
            fontWeight: 800,
            fontSize: '0.92rem',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            border: 'none',
            background: activeAdminTab === 'products' ? '#0f172a' : '#f8fafc',
            color: activeAdminTab === 'products' ? '#ffffff' : '#64748b',
            boxShadow: activeAdminTab === 'products' ? '0 4px 12px rgba(15,23,42,0.15)' : 'none',
            transition: 'all 0.15s ease'
          }}
        >
          <Package size={18} color={activeAdminTab === 'products' ? '#f59e0b' : '#64748b'} />
          <span>كتالوج الباقات والأسعار (Products & Pricing)</span>
          <span style={{ 
            background: activeAdminTab === 'products' ? '#10b981' : '#e2e8f0', 
            color: activeAdminTab === 'products' ? '#ffffff' : '#475569',
            fontSize: '0.72rem',
            fontWeight: 800,
            padding: '2px 8px',
            borderRadius: '12px'
          }}>
            {stats.activeCount} نشط
          </span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* 1. CATEGORY & GAME IMAGES MANAGEMENT VIEW                                */}
      {/* ========================================================================= */}
      {activeAdminTab === 'categories' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '30px' }}>
          {/* Priority Explanation Card */}
          <div style={{
            background: 'linear-gradient(135deg, #fefce8 0%, #fffbeb 100%)',
            border: '1px solid #fef08a',
            borderRadius: '12px',
            padding: '18px 22px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '14px'
          }}>
            <Sparkles size={24} color="#d97706" style={{ marginTop: '2px', flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#92400e', marginBottom: '4px' }}>
                نظام إدارة صور الكتالوج الموحّد (Category Image Inheritance)
              </div>
              <p style={{ fontSize: '0.85rem', color: '#78350f', lineHeight: 1.6, margin: 0 }}>
                ارفع صورة واحدة فقط لكل لعبة أو فئة (مثل <strong>PUBG Mobile</strong> أو <strong>Free Fire</strong>) وسيتم تطبيقها تلقائياً على كافة الباقات التابعة لها في المتجر دون الحاجة لتكرار رفع نفس الصورة.
                <br />
                <strong>ترتيب الأولوية الذكي:</strong> 1. صورة المنتج المخصصة (إن وجدت) ← 2. صورة الفئة المعتمدة أدناه ← 3. الصورة الافتراضية العامة.
              </p>
            </div>
          </div>

          {/* Categories Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
            gap: '20px'
          }}>
            {categories.map((cat) => (
              <div 
                key={cat.id}
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '14px',
                  overflow: 'hidden',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                {/* Header */}
                <div style={{
                  padding: '16px 18px',
                  borderBottom: '1px solid #f1f5f9',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: '#f8fafc'
                }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>
                      {cat.arabicName || cat.name}
                    </h3>
                    <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                      {cat.name} • {cat.platform || 'Mobile'}
                    </span>
                  </div>

                  <span style={{
                    background: '#ecfdf5',
                    color: '#059669',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    padding: '4px 10px',
                    borderRadius: '16px',
                    border: '1px solid #a7f3d0'
                  }}>
                    {cat.activeProductCount ?? 0} باقة نشطة مرتبطة
                  </span>
                </div>

                {/* Image Preview Container */}
                <div style={{
                  position: 'relative',
                  width: '100%',
                  height: '200px',
                  background: '#0f172a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden'
                }}>
                  {cat.imageUrl ? (
                    <img 
                      src={getProductImageUrl(cat.imageUrl)} 
                      alt={cat.name}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover'
                      }}
                    />
                  ) : (
                    <div style={{ textAlign: 'center', color: '#94a3b8' }}>
                      <ImageIcon size={48} style={{ margin: '0 auto 8px', opacity: 0.6 }} />
                      <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>لا توجد صورة مخصصة</div>
                      <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>يتم استخدام الصورة الافتراضية</div>
                    </div>
                  )}

                  <div style={{
                    position: 'absolute',
                    top: '12px',
                    left: '12px',
                    background: 'rgba(15, 23, 42, 0.75)',
                    backdropFilter: 'blur(4px)',
                    color: '#ffffff',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: '6px'
                  }}>
                    {cat.imageUrl ? 'صورة معتمدة' : 'افتراضية'}
                  </div>
                </div>

                {/* Card Body & Actions */}
                <div style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px', flex: 1, justifyContent: 'space-between' }}>
                  <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b', lineHeight: 1.5 }}>
                    تُستخدم هذه الصورة كغلاف للعبة في المتجر وتورّث تلقائياً لكافة باقات <strong>{cat.name}</strong> الـ ({cat.activeProductCount || 0}) التابعة لها.
                  </p>

                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="admin-btn admin-btn-primary admin-btn-sm"
                      style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                      onClick={() => handleTriggerCategoryUpload(cat.id)}
                      disabled={loadingCategories}
                    >
                      <Upload size={15} />
                      <span>{cat.imageUrl ? 'تغيير صورة الفئة' : 'رفع صورة الفئة'}</span>
                    </button>

                    {cat.imageUrl && (
                      <button
                        type="button"
                        className="admin-btn admin-btn-secondary admin-btn-sm"
                        style={{ color: '#dc2626', borderColor: '#fecaca', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                        onClick={() => handleRemoveCategoryImg(cat)}
                        disabled={loadingCategories}
                        title="إزالة الصورة واستعادة الصورة الافتراضية"
                      >
                        <Trash2 size={15} />
                        <span>إزالة الصورة</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. PRODUCTS CATALOG & PRICING VIEW                                       */}
      {/* ========================================================================= */}
      {activeAdminTab === 'products' && (
        <>
          {/* Action and Filter Bar */}
          <div className="admin-filter-bar" style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'space-between' }}>
            <form onSubmit={handleSearchSubmit} className="admin-search-wrapper" style={{ flex: '1 1 320px' }}>
          <Search size={18} className="admin-search-icon" />
          <input
            type="text"
            className="admin-input admin-search-input"
            placeholder="ابحث باسم اللعبة، الباقة، أو الدولة/الريجون..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </form>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Game Category Filter Dropdown */}
          <select
            className="admin-input"
            style={{ width: 'auto', minWidth: '180px', fontWeight: 700, padding: '6px 12px', fontSize: '0.85rem' }}
            value={categoryFilter}
            onChange={(e) => handleCategoryFilterChange(e.target.value)}
          >
            <option value="all">جميع الألعاب ({stats.totalCatalog})</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.arabicName || c.name} ({c.totalProductCount ?? 0})
              </option>
            ))}
          </select>

          {/* Status Filter Tabs */}
          <div className="admin-filter-group">
            <button 
              className={`admin-btn ${statusFilter === 'all' ? 'admin-btn-primary' : 'admin-btn-secondary'} admin-btn-sm`}
              onClick={() => handleFilterChange('all')}
            >
              الكل ({stats.totalCatalog})
            </button>
            <button 
              className={`admin-btn ${statusFilter === 'active' ? 'admin-btn-primary' : 'admin-btn-secondary'} admin-btn-sm`}
              onClick={() => handleFilterChange('active')}
            >
              النشطة ({stats.activeCount})
            </button>
            <button 
              className={`admin-btn ${statusFilter === 'inactive' ? 'admin-btn-primary' : 'admin-btn-secondary'} admin-btn-sm`}
              onClick={() => handleFilterChange('inactive')}
            >
              المعطلة ({stats.inactiveCount})
            </button>
          </div>

          {/* Sync Provider Prices Button (Admin Only) */}
          <button 
            type="button"
            className="admin-btn admin-btn-primary admin-btn-sm"
            style={{ background: '#0f172a', borderColor: '#0f172a', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}
            onClick={() => setSyncModalOpen(true)}
            disabled={syncingPrices}
          >
            <RefreshCw size={15} className={syncingPrices ? 'spin' : ''} />
            <span>مزامنة تكلفة المزود</span>
          </button>
        </div>
      </div>

      {/* Products Catalog Table Card */}
      <div className="admin-card">
        <div className="admin-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="admin-card-title">
            <Package size={18} color="#f59e0b" />
            <span>كتالوج المنتجات المحلي ({total.toLocaleString()} منتج)</span>
          </h3>
          <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
            صفحة {page} من {totalPages}
          </div>
        </div>

        <div className="admin-table-container">
          <table className="admin-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>
                  <input 
                    type="checkbox" 
                    checked={products.length > 0 && selectedIds.length === products.length}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th>الصورة</th>
                <th>اللعبة والمنصة</th>
                <th>الباقة / الفئة</th>
                <th>تكلفة المورد (Supplier)</th>
                <th>تكلفة المزود (GamesDrop)</th>
                <th>سعر البيع للعميل</th>
                <th>هامش الربح</th>
                <th>المخزون</th>
                <th>الحالة في المتجر</th>
                <th>آخر مزامنة</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={12} style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
                      <RefreshCw size={18} className="spin" />
                      <span>جاري تحميل قائمة المنتجات من قاعدة البيانات المحلية...</span>
                    </div>
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={12} style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
                    لا توجد منتجات مطابقة لخيارات البحث الحالية.
                  </td>
                </tr>
              ) : (
                products.map((prod) => {
                  const isSelected = selectedIds.includes(prod.id);
                  const supplierCost = Number(prod.supplierCostUsd !== undefined ? prod.supplierCostUsd : (prod.gamesDropCostUsd || prod.providerCostUsd || 0));
                  const gdCost = Number(prod.gamesDropCostUsd !== undefined ? prod.gamesDropCostUsd : (prod.providerCostUsd || 0));
                  const sale = prod.customerPriceUsd !== null && prod.customerPriceUsd !== undefined ? Number(prod.customerPriceUsd) : null;
                  const profit = sale !== null ? (sale - gdCost).toFixed(2) : null;
                  const isProfitable = profit !== null && Number(profit) >= 0;

                  return (
                    <tr key={prod.id} style={{ background: isSelected ? '#f8fafc' : undefined }}>
                      <td>
                        <input 
                          type="checkbox" 
                          checked={isSelected}
                          onChange={() => toggleSelectProduct(prod.id)}
                        />
                      </td>
                      <td>
                        <div style={{ width: '42px', height: '42px', borderRadius: '8px', overflow: 'hidden', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {prod.imageUrl ? (
                            <img 
                              src={getProductImageUrl(prod.imageUrl)} 
                              alt={prod.productName} 
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          ) : (
                            <Package size={20} color="#94a3b8" />
                          )}
                        </div>
                      </td>
                      <td>
                        <div>
                          <div style={{ fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span>{prod.productName}</span>
                            {prod.isFeatured && (
                              <Star size={14} color="#f59e0b" fill="#f59e0b" />
                            )}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', gap: '6px', alignItems: 'center', marginTop: '4px', flexWrap: 'wrap' }}>
                            {prod.regionCode === 'GLB' || prod.gameCategoryId === 'blood-strike-global' || (prod.regionName && prod.regionName.toLowerCase().includes('global')) ? (
                              <span style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '1px 6px', borderRadius: '4px', fontWeight: 700, fontSize: '0.68rem' }}>
                                السيرفر العالمي (Global)
                              </span>
                            ) : prod.regionCode === 'ME' || prod.gameCategoryId === 'blood-strike-me' || (prod.regionName && (prod.regionName.toLowerCase().includes('middle') || prod.regionName.toLowerCase().includes('mena'))) ? (
                              <span style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', padding: '1px 6px', borderRadius: '4px', fontWeight: 700, fontSize: '0.68rem' }}>
                                الشرق الأوسط (Middle East)
                              </span>
                            ) : prod.regionName ? (
                              <span style={{ background: '#f1f5f9', color: '#475569', padding: '1px 6px', borderRadius: '4px', fontWeight: 600, fontSize: '0.68rem' }}>
                                {prod.regionName}
                              </span>
                            ) : null}
                            <span style={{ opacity: 0.8 }}>ID: {prod.providerOfferId}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 700, color: '#1e293b' }}>
                          {prod.offerName}
                        </div>
                        {prod.arabicName && (
                          <div style={{ fontSize: '0.78rem', color: '#b45309', fontWeight: 600, marginTop: '2px' }}>
                            {prod.arabicName}
                          </div>
                        )}
                        {prod.subCategory && (
                          <span style={{ fontSize: '0.65rem', background: '#fef3c7', color: '#92400e', padding: '1px 6px', borderRadius: '4px', display: 'inline-block', marginTop: '3px', fontWeight: 700 }}>
                            {prod.subCategory}
                          </span>
                        )}
                      </td>
                      <td>
                        <div style={{ fontWeight: 700, color: '#64748b', fontSize: '0.85rem' }}>
                          ${supplierCost.toFixed(2)}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.9rem' }}>
                          ${gdCost.toFixed(2)}
                          {prod.gamesDropAddedPercent ? (
                            <span style={{ fontSize: '0.72rem', color: '#f59e0b', marginRight: '4px', fontWeight: 600 }}>
                              (+{prod.gamesDropAddedPercent}%)
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        {sale !== null ? (
                          <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '1rem' }}>
                            ${sale.toFixed(2)}
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.8rem', color: '#ef4444', fontWeight: 600 }}>
                            غير محدد
                          </span>
                        )}
                      </td>
                      <td>
                        {profit !== null ? (
                          <span 
                            style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: '6px',
                              fontSize: '0.8rem',
                              fontWeight: 700,
                              background: isProfitable ? '#ecfdf5' : '#fef2f2',
                              color: isProfitable ? '#059669' : '#dc2626',
                            }}
                          >
                            {Number(profit) >= 0 ? `+$${profit}` : `-$${Math.abs(Number(profit)).toFixed(2)}`}
                          </span>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>-</span>
                        )}
                      </td>
                      <td>
                        <span 
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            color: prod.inStock ? '#10b981' : '#ef4444',
                          }}
                        >
                          {prod.inStock ? 'متوفر' : 'غير متوفر'}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => handleToggleActive(prod)}
                          style={{
                            background: prod.isActive ? '#ecfdf5' : '#f8fafc',
                            border: `1px solid ${prod.isActive ? '#a7f3d0' : '#e2e8f0'}`,
                            color: prod.isActive ? '#065f46' : '#64748b',
                            padding: '4px 10px',
                            borderRadius: '16px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                          }}
                        >
                          <Power size={12} color={prod.isActive ? '#10b981' : '#94a3b8'} />
                          <span>{prod.isActive ? 'معروض للعملاء' : 'معطل'}</span>
                        </button>
                      </td>
                      <td style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        {prod.lastProviderSyncAt 
                          ? new Date(prod.lastProviderSyncAt).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                          : 'لم تتم المزامنة'}
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(prod)}
                          className="admin-btn admin-btn-secondary admin-btn-sm"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                        >
                          <Edit3 size={14} />
                          <span>تعديل</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div style={{ padding: '16px 20px', borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
            عرض {products.length > 0 ? (page - 1) * limit + 1 : 0} إلى {Math.min(page * limit, total)} من أصل {total.toLocaleString()} منتج
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              type="button"
              className="admin-btn admin-btn-secondary admin-btn-sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage(p => Math.max(1, p - 1))}
            >
              <ChevronRight size={16} />
              <span>السابق</span>
            </button>

            <span style={{ fontSize: '0.85rem', fontWeight: 700, padding: '0 8px' }}>
              {page} / {totalPages}
            </span>

            <button
              type="button"
              className="admin-btn admin-btn-secondary admin-btn-sm"
              disabled={page >= totalPages || loading}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            >
              <span>التالي</span>
              <ChevronLeft size={16} />
            </button>
          </div>
        </div>
      </div>
      </>
      )}

      {/* Edit Product Modal */}
      {editingProduct && (
        <div className="admin-modal-backdrop" onClick={() => !savingProduct && setEditingProduct(null)}>
          <div className="admin-modal" style={{ maxWidth: '580px' }} onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3 className="admin-modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Edit3 size={18} color="#f59e0b" />
                <span>تعديل المنتج: {editingProduct.productName}</span>
              </h3>
              <button 
                type="button" 
                className="admin-modal-close" 
                onClick={() => !savingProduct && setEditingProduct(null)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="admin-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Product Internal Offer Information */}
              <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.8rem', color: '#475569', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <div><strong>معرّف المزود الداخلي:</strong> #{editingProduct.providerOfferId}</div>
                <div>
                  <strong>اللعبة:</strong> {editingProduct.productName} • <strong>السيرفر / المنطقة:</strong> {
                    editingProduct.gameCategoryId === 'blood-strike-global' || editingProduct.regionCode === 'GLB'
                      ? 'السيرفر العالمي (Global)'
                      : editingProduct.gameCategoryId === 'blood-strike-me' || editingProduct.regionCode === 'ME'
                      ? 'الشرق الأوسط (Middle East)'
                      : (editingProduct.regionName || 'Global')
                  }
                </div>
              </div>

              {/* Display Name & Offer Name */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="admin-label">اسم اللعبة / المنتج</label>
                  <input
                    type="text"
                    className="admin-input"
                    value={editForm.productName}
                    onChange={(e) => setEditForm(prev => ({ ...prev, productName: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <label className="admin-label">اسم الباقة / الفئة (English)</label>
                  <input
                    type="text"
                    className="admin-input"
                    value={editForm.offerName}
                    onChange={(e) => setEditForm(prev => ({ ...prev, offerName: e.target.value }))}
                    required
                  />
                </div>
              </div>

              {/* Arabic Name & Description */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label className="admin-label">الاسم المعروض بالعربية (Customer Arabic Name)</label>
                  <input
                    type="text"
                    className="admin-input"
                    value={editForm.arabicName}
                    onChange={(e) => setEditForm(prev => ({ ...prev, arabicName: e.target.value }))}
                    placeholder="مثال: 60 شدة UC أو اشتراك برايم — شهر"
                  />
                </div>
                <div>
                  <label className="admin-label">وصف الباقة للعميل (Description)</label>
                  <textarea
                    className="admin-input"
                    rows={2}
                    style={{ resize: 'vertical' }}
                    value={editForm.description}
                    onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="الوصف الاحترافي الدقيق للباقة الذي يظهر للعميل في المتجر..."
                  />
                </div>
              </div>

              {/* Pricing Section (Authoritative Separation) */}
              <div style={{ background: '#fdfbf7', padding: '14px', borderRadius: '8px', border: '1px solid #fef3c7' }}>
                <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#92400e', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <DollarSign size={16} />
                  <span>التحكم المستقل في الأسعار وهامش الربح</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '10px', alignItems: 'center' }}>
                  {/* Supplier Cost */}
                  <div>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>تكلفة المورد (Supplier)</span>
                    <div style={{ fontWeight: 800, fontSize: '1rem', color: '#475569', marginTop: '4px' }}>
                      ${Number(editingProduct.supplierCostUsd || editingProduct.gamesDropCostUsd || editingProduct.providerCostUsd || 0).toFixed(2)}
                    </div>
                  </div>

                  {/* GamesDrop Cost */}
                  <div>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>تكلفة المزود (GamesDrop)</span>
                    <div style={{ fontWeight: 800, fontSize: '1rem', color: '#0f172a', marginTop: '4px' }}>
                      ${Number(editingProduct.gamesDropCostUsd || editingProduct.providerCostUsd || 0).toFixed(2)}
                      {editingProduct.gamesDropAddedPercent ? (
                        <span style={{ fontSize: '0.7rem', color: '#f59e0b', marginRight: '4px' }}>
                          (+{editingProduct.gamesDropAddedPercent}%)
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {/* Customer Sale Price (Direct Input) */}
                  <div>
                    <label style={{ fontSize: '0.72rem', color: '#0f172a', fontWeight: 700 }}>سعر البيع للعميل ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="admin-input"
                      style={{ fontWeight: 800, fontSize: '1rem', marginTop: '4px', borderColor: '#f59e0b', padding: '6px 8px' }}
                      value={editForm.customerPriceUsd}
                      onChange={(e) => setEditForm(prev => ({ ...prev, customerPriceUsd: e.target.value }))}
                      placeholder="مثال: 1.20"
                      required
                    />
                  </div>

                  {/* Realtime Profit Preview */}
                  <div>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>هامش الربح المتوقع</span>
                    <div 
                      style={{ 
                        fontWeight: 800, 
                        fontSize: '1.05rem', 
                        marginTop: '4px',
                        color: liveProfit !== null && Number(liveProfit) >= 0 ? '#10b981' : '#ef4444' 
                      }}
                    >
                      {liveProfit !== null ? `${Number(liveProfit) >= 0 ? '+' : ''}$${liveProfit}` : '-'}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: '0.75rem', color: '#78350f', marginTop: '8px' }}>
                  * ملاحظة: مزامنة الأسعار لاحقاً ستقوم بتحديث تكلفة المزود فقط، ولن تغير سعر البيع للعميل أبداً.
                </div>
              </div>

              {/* Product Image Section */}
              <div>
                <label className="admin-label">صورة المنتج</label>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <div style={{ width: '60px', height: '60px', borderRadius: '8px', overflow: 'hidden', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #e2e8f0', flexShrink: 0 }}>
                    {editForm.imageUrl ? (
                      <img src={getProductImageUrl(editForm.imageUrl)} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <Package size={28} color="#94a3b8" />
                    )}
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="text"
                        className="admin-input"
                        placeholder="رابط الصورة أو ارفع ملف جديد..."
                        value={editForm.imageUrl}
                        onChange={(e) => setEditForm(prev => ({ ...prev, imageUrl: e.target.value }))}
                      />
                      <button
                        type="button"
                        className="admin-btn admin-btn-secondary"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingImage}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
                      >
                        <Upload size={16} />
                        <span>{uploadingImage ? 'جاري الرفع...' : 'رفع صورة'}</span>
                      </button>
                    </div>
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleImageFileSelected} 
                      accept="image/png,image/jpeg,image/webp,image/jpg" 
                      style={{ display: 'none' }} 
                    />
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      الامتدادات المدعومة: PNG, JPG, WEBP (الحجم الأقصى 5 ميجابايت)
                    </span>
                  </div>
                </div>
              </div>

              {/* Toggles: Active, Featured, Display Order */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', paddingTop: '6px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={editForm.isActive}
                    onChange={(e) => setEditForm(prev => ({ ...prev, isActive: e.target.checked }))}
                  />
                  <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>معروض في المتجر</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={editForm.isFeatured}
                    onChange={(e) => setEditForm(prev => ({ ...prev, isFeatured: e.target.checked }))}
                  />
                  <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>منتج مميز (Featured)</span>
                </label>

                <div>
                  <label style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>ترتيب العرض</label>
                  <input
                    type="number"
                    className="admin-input"
                    value={editForm.displayOrder}
                    onChange={(e) => setEditForm(prev => ({ ...prev, displayOrder: Number(e.target.value) }))}
                    style={{ padding: '6px 10px' }}
                  />
                </div>
              </div>

              <div className="admin-modal-footer" style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary"
                  onClick={() => setEditingProduct(null)}
                  disabled={savingProduct}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="admin-btn admin-btn-primary"
                  disabled={savingProduct}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  {savingProduct ? (
                    <>
                      <RefreshCw size={16} className="spin" />
                      <span>جاري الحفظ...</span>
                    </>
                  ) : (
                    <>
                      <Check size={16} />
                      <span>حفظ التعديلات</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sync Provider Prices Modal */}
      {syncModalOpen && (
        <div className="admin-modal-backdrop" onClick={() => !syncingPrices && setSyncModalOpen(false)}>
          <div className="admin-modal" style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3 className="admin-modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <RefreshCw size={18} color="#f59e0b" />
                <span>مزامنة تكلفة المنتجات من المزود (Price Sync)</span>
              </h3>
              <button 
                type="button" 
                className="admin-modal-close" 
                onClick={() => !syncingPrices && setSyncModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="admin-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ fontSize: '0.88rem', color: '#475569', lineHeight: 1.6 }}>
                هذه العملية مخصصة للأدمن فقط لتحديث أحدث تكلفة شراء (<code style={{ color: '#0f172a' }}>providerCostUsd</code>) مباشرة من استعلام المزود (find-one).
              </div>

              <div style={{ background: '#ecfdf5', padding: '12px 14px', borderRadius: '8px', border: '1px solid #a7f3d0', fontSize: '0.82rem', color: '#065f46', lineHeight: 1.5 }}>
                🔒 <strong>ضمان حماية سعر البيع:</strong> سعر البيع المحدد للعملاء لن يتغير تلقائياً، وسيظل ثابتاً كما حددته تماماً.
              </div>

              <div>
                <label className="admin-label">نطاق المزامنة المطلوب</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', cursor: 'pointer', background: syncScope === 'ACTIVE' ? '#f8fafc' : '#fff' }}>
                    <input
                      type="radio"
                      name="syncScope"
                      checked={syncScope === 'ACTIVE'}
                      onChange={() => setSyncScope('ACTIVE')}
                    />
                    <div>
                      <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.9rem' }}>المنتجات النشطة والمعروضة في المتجر فقط (مستحسن)</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>يحدث تكلفة المنتجات التي يراها العملاء حالياً ({stats.activeCount} منتج).</div>
                    </div>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', cursor: 'pointer', background: syncScope === 'SELECTED' ? '#f8fafc' : '#fff' }}>
                    <input
                      type="radio"
                      name="syncScope"
                      checked={syncScope === 'SELECTED'}
                      onChange={() => setSyncScope('SELECTED')}
                      disabled={selectedIds.length === 0}
                    />
                    <div>
                      <div style={{ fontWeight: 700, color: selectedIds.length === 0 ? '#94a3b8' : '#0f172a', fontSize: '0.9rem' }}>
                        المنتجات المحددة حالياً ({selectedIds.length} منتج محدد)
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>يحدث فقط العناصر التي قمت بتحديدها عبر مربعات الاختيار في الجدول.</div>
                    </div>
                  </label>
                </div>
              </div>

              <div className="admin-modal-footer" style={{ marginTop: '10px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary"
                  onClick={() => setSyncModalOpen(false)}
                  disabled={syncingPrices}
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn-primary"
                  onClick={handleExecutePriceSync}
                  disabled={syncingPrices || (syncScope === 'SELECTED' && selectedIds.length === 0)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  {syncingPrices ? (
                    <>
                      <RefreshCw size={16} className="spin" />
                      <span>جاري الاتصال بالمزود ومزامنة التكلفة...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw size={16} />
                      <span>بدء مزامنة الأسعار الآن</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
