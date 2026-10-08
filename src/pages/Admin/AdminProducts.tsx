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
  TrendingUp, 
  AlertCircle, 
  EyeOff,
  Star,
  Check,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Trash2,
  Sparkles,
  Key,
  CreditCard,
  Zap
} from 'lucide-react';
import { 
  fetchAdminCatalog, 
  updateAdminProduct, 
  toggleAdminProductActive, 
  syncProviderPrices, 
  uploadProductImage,
  fetchAdminCategories,
  uploadAdminCategoryImage,
  removeAdminCategoryImage,
  triggerGamesDropCatalogSync,
  GamesDropCatalogSyncResult,
  triggerG2BulkCatalogSync,
  G2BulkCatalogSyncResult
} from '../../services/api';
import { getProductImageUrl } from '../../utils/imageUrl';
import { AdminProduct, AdminCatalogResponse, GameCategory } from '../../types';
import { AdminDigitalAccountsTab } from '../../components/admin/AdminDigitalAccountsTab';
import { AdminKiroProCards } from './AdminKiroProCards';

export const AdminProducts: React.FC = () => {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({ 
    totalCatalog: 0, 
    activeCount: 0, 
    inactiveCount: 0,
    outOfStockCount: 0,
    hasGamesDropCount: 0,
    hasG2BulkCount: 0,
    bothProvidersCount: 0,
    gamesDropOnlyCount: 0,
    g2BulkOnlyCount: 0,
    missingProviderCount: 0
  });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [providerFilter, setProviderFilter] = useState<string>('all');
  const [stockFilter, setStockFilter] = useState<string>('all');
  
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
    inStock: boolean;
    imageUrl: string;
    displayOrder: number;
    isFeatured: boolean;
    primaryProvider: string;
    fallbackProvider: string;
    fallbackEnabled: boolean;
    providerMappings: Array<{
      provider: string;
      isActive: boolean;
      costUsd: number;
    }>;
  }>({
    productName: '',
    offerName: '',
    arabicName: '',
    description: '',
    customerPriceUsd: '',
    isActive: false,
    inStock: true,
    imageUrl: '',
    displayOrder: 0,
    isFeatured: false,
    primaryProvider: 'GAMESDROP',
    fallbackProvider: '',
    fallbackEnabled: false,
    providerMappings: []
  });

  const [savingProduct, setSavingProduct] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [syncingPrices, setSyncingPrices] = useState(false);
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [syncScope, setSyncScope] = useState<'ACTIVE' | 'SELECTED' | 'ALL'>('ACTIVE');
  const [catalogSyncModalOpen, setCatalogSyncModalOpen] = useState(false);
  const [catalogSyncing, setCatalogSyncing] = useState(false);
  const [catalogSyncStats, setCatalogSyncStats] = useState<GamesDropCatalogSyncResult['stats'] | null>(null);
  const [g2BulkSyncing, setG2BulkSyncing] = useState(false);
  const [g2BulkSyncModalOpen, setG2BulkSyncModalOpen] = useState(false);
  const [g2BulkSyncStats, setG2BulkSyncStats] = useState<G2BulkCatalogSyncResult['stats'] | null>(null);
  const [providerOrdersEnabled, setProviderOrdersEnabled] = useState<Record<string, boolean>>({ GAMESDROP: true, G2BULK: false });
  const [alertInfo, setAlertInfo] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Sub-tabs: 'categories' (Category / Game Images) vs 'products' (Pricing & Catalog) vs 'digital-accounts' (Digital Accounts Inventory) vs 'kiropro-cards' (Mastercard Cards Vault)
  const [activeAdminTab, setActiveAdminTab] = useState<'categories' | 'products' | 'digital-accounts' | 'kiropro-cards'>('categories');
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

  const loadCatalog = useCallback(async (
    targetPage = page, 
    querySearch = search, 
    filter = statusFilter, 
    catFilter = categoryFilter,
    provFilter = providerFilter,
    stkFilter = stockFilter
  ) => {
    setLoading(true);
    try {
      const res: AdminCatalogResponse = await fetchAdminCatalog({
        page: targetPage,
        limit,
        search: querySearch.trim() || undefined,
        status: filter,
        gameCategory: catFilter !== 'all' ? catFilter : undefined,
        providerFilter: provFilter !== 'all' ? provFilter : undefined,
        stockFilter: stkFilter !== 'all' ? stkFilter : undefined,
      });

      setProducts(res.products);
      setTotal(res.total);
      setTotalPages(res.totalPages || 1);
      setPage(res.page);
      if (res.providerOrdersEnabled) {
        setProviderOrdersEnabled(res.providerOrdersEnabled);
      }
      if (res.stats) {
        setStats({
          totalCatalog: res.stats.totalCatalog || 0,
          activeCount: res.stats.activeCount || 0,
          inactiveCount: res.stats.inactiveCount || 0,
          outOfStockCount: res.stats.outOfStockCount || 0,
          hasGamesDropCount: res.stats.hasGamesDropCount || 0,
          hasG2BulkCount: res.stats.hasG2BulkCount || 0,
          bothProvidersCount: res.stats.bothProvidersCount || 0,
          gamesDropOnlyCount: res.stats.gamesDropOnlyCount || 0,
          g2BulkOnlyCount: res.stats.g2BulkOnlyCount || 0,
          missingProviderCount: res.stats.missingProviderCount || 0
        });
      }
    } catch (err: any) {
      console.error('Failed to load admin catalog:', err);
      setAlertInfo({ type: 'error', text: err.message || 'فشل في تحميل كتالوج المنتجات' });
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, statusFilter, categoryFilter, providerFilter, stockFilter]);

  useEffect(() => {
    loadCatalog(page, search, statusFilter, categoryFilter, providerFilter, stockFilter);
  }, [page, statusFilter, categoryFilter, providerFilter, stockFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadCatalog(1, search, statusFilter, categoryFilter, providerFilter, stockFilter);
  };

  const handleFilterChange = (newFilter: 'all' | 'active' | 'inactive') => {
    setStatusFilter(newFilter);
    setPage(1);
  };

  const handleCategoryFilterChange = (newCat: string) => {
    setCategoryFilter(newCat);
    setPage(1);
  };

  const handleProviderFilterChange = (newProv: string) => {
    setProviderFilter(newProv);
    setPage(1);
  };

  const handleStockFilterChange = (newStock: string) => {
    setStockFilter(newStock);
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
    const gdMapping = product.providerMappings?.find(m => m.provider === 'GAMESDROP');
    const g2Mapping = product.providerMappings?.find(m => m.provider === 'G2BULK');
    setEditForm({
      productName: product.productName,
      offerName: product.offerName,
      arabicName: product.arabicName || '',
      description: product.description || '',
      customerPriceUsd: product.customerPriceUsd !== null && product.customerPriceUsd !== undefined ? String(product.customerPriceUsd) : '',
      isActive: product.isActive,
      inStock: Boolean(product.inStock),
      imageUrl: product.imageUrl || '',
      displayOrder: product.displayOrder || 0,
      isFeatured: product.isFeatured || false,
      primaryProvider: product.primaryProvider || 'GAMESDROP',
      fallbackProvider: product.fallbackProvider || '',
      fallbackEnabled: Boolean(product.fallbackEnabled),
      providerMappings: [
        {
          provider: 'GAMESDROP',
          isActive: gdMapping ? gdMapping.isActive : Boolean(product.hasGamesDrop),
          costUsd: gdMapping ? gdMapping.costUsd : Number(product.gamesDropCostUsd || product.providerCostUsd || 0)
        },
        {
          provider: 'G2BULK',
          isActive: g2Mapping ? g2Mapping.isActive : Boolean(product.hasG2Bulk),
          costUsd: g2Mapping ? g2Mapping.costUsd : Number(product.g2BulkCostUsd || 0)
        }
      ]
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
        inStock: editForm.inStock,
        imageUrl: editForm.imageUrl.trim() || null,
        displayOrder: Number(editForm.displayOrder) || 0,
        isFeatured: editForm.isFeatured,
        primaryProvider: editForm.primaryProvider,
        fallbackProvider: editForm.fallbackProvider || null,
        fallbackEnabled: editForm.fallbackEnabled,
        providerMappings: editForm.providerMappings
      });

      setProducts(prev => prev.map(p => p.id === editingProduct.id ? { ...p, ...res.product } : p));
      setAlertInfo({ type: 'success', text: `تم حفظ تعديلات المنتج "${res.product.productName}" بنجاح.` });
      setEditingProduct(null);
      loadCatalog(page, search, statusFilter, categoryFilter, providerFilter, stockFilter);
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
      loadCatalog(page, search, statusFilter, categoryFilter, providerFilter, stockFilter);
    } catch (err: any) {
      setAlertInfo({ type: 'error', text: err.message || 'فشل مزامنة الأسعار من المزود' });
    } finally {
      setSyncingPrices(false);
    }
  };

  const handleRunCatalogSync = async () => {
    setCatalogSyncing(true);
    try {
      const res = await triggerGamesDropCatalogSync();
      setCatalogSyncStats(res.stats);
      setCatalogSyncModalOpen(true);
      await loadCategories();
      await loadCatalog(page, search, statusFilter, categoryFilter, providerFilter, stockFilter);
      setAlertInfo({ type: 'success', text: 'تمت مزامنة الكتالوج وتحديث أحدث العروض والأسعار من GamesDrop بنجاح!' });
    } catch (err: any) {
      setAlertInfo({ type: 'error', text: err.message || 'فشلت مزامنة الكتالوج من GamesDrop' });
    } finally {
      setCatalogSyncing(false);
    }
  };

  const handleRunG2BulkSync = async () => {
    setG2BulkSyncing(true);
    try {
      const res = await triggerG2BulkCatalogSync();
      setG2BulkSyncStats(res.stats);
      setG2BulkSyncModalOpen(true);
      await loadCategories();
      await loadCatalog(page, search, statusFilter, categoryFilter, providerFilter, stockFilter);
      setAlertInfo({
        type: 'success',
        text: `تمت مزامنة كتالوج G2Bulk بنجاح! تم فحص ${res.stats?.gamesFetched || 0} لعبة، ودمج ${res.stats?.matched || 0} باقة وإضافة ${res.stats?.newProducts || 0} باقة جديدة.`
      });
    } catch (err: any) {
      setAlertInfo({ type: 'error', text: err.message || 'فشلت مزامنة كتالوج G2Bulk' });
    } finally {
      setG2BulkSyncing(false);
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

        <button
          type="button"
          onClick={() => setActiveAdminTab('digital-accounts')}
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
            background: activeAdminTab === 'digital-accounts' ? '#0f172a' : '#f8fafc',
            color: activeAdminTab === 'digital-accounts' ? '#ffffff' : '#64748b',
            boxShadow: activeAdminTab === 'digital-accounts' ? '0 4px 12px rgba(15,23,42,0.15)' : 'none',
            transition: 'all 0.15s ease'
          }}
        >
          <Key size={18} color={activeAdminTab === 'digital-accounts' ? '#f59e0b' : '#64748b'} />
          <span>مخزون الحسابات الرقمية (Google Play Points)</span>
          <span style={{ 
            background: activeAdminTab === 'digital-accounts' ? '#f59e0b' : '#e2e8f0', 
            color: activeAdminTab === 'digital-accounts' ? '#0f172a' : '#475569',
            fontSize: '0.72rem',
            fontWeight: 800,
            padding: '2px 8px',
            borderRadius: '12px'
          }}>
            تسليم فوري 🔑
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveAdminTab('kiropro-cards')}
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
            background: activeAdminTab === 'kiropro-cards' ? '#0f172a' : '#f8fafc',
            color: activeAdminTab === 'kiropro-cards' ? '#ffffff' : '#64748b',
            boxShadow: activeAdminTab === 'kiropro-cards' ? '0 4px 12px rgba(15,23,42,0.15)' : 'none',
            transition: 'all 0.15s ease'
          }}
        >
          <CreditCard size={18} color={activeAdminTab === 'kiropro-cards' ? '#f59e0b' : '#64748b'} />
          <span>خزنة بطاقات ماستركارد (KiroPro Card)</span>
          <span style={{ 
            background: activeAdminTab === 'kiropro-cards' ? '#f59e0b' : '#e2e8f0', 
            color: activeAdminTab === 'kiropro-cards' ? '#0f172a' : '#475569',
            fontSize: '0.72rem',
            fontWeight: 800,
            padding: '2px 8px',
            borderRadius: '12px'
          }}>
            Mastercard 💳
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
          <div className="admin-filter-bar" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'space-between', alignItems: 'center' }}>
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

                {/* GamesDrop Catalog Sync Button */}
                <button 
                  type="button"
                  className="admin-btn admin-btn-sm"
                  style={{ 
                    background: 'linear-gradient(135deg, #059669, #047857)', 
                    borderColor: '#059669', 
                    color: '#ffffff', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '6px',
                    fontWeight: 700,
                    boxShadow: '0 2px 6px rgba(5, 150, 105, 0.25)'
                  }}
                  onClick={handleRunCatalogSync}
                  disabled={catalogSyncing}
                >
                  <Sparkles size={14} className={catalogSyncing ? 'spin' : ''} />
                  <span>{catalogSyncing ? 'مزامنة GamesDrop...' : 'مزامنة GamesDrop'}</span>
                </button>

                {/* G2Bulk Catalog Sync Button (Requirement 25) */}
                <button 
                  type="button"
                  className="admin-btn admin-btn-sm"
                  style={{ 
                    background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', 
                    borderColor: '#7c3aed', 
                    color: '#ffffff', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '6px',
                    fontWeight: 700,
                    boxShadow: '0 2px 6px rgba(124, 58, 237, 0.25)'
                  }}
                  onClick={handleRunG2BulkSync}
                  disabled={g2BulkSyncing}
                >
                  <Zap size={14} className={g2BulkSyncing ? 'spin' : ''} />
                  <span>{g2BulkSyncing ? 'مزامنة G2Bulk...' : 'مزامنة ألعاب G2Bulk'}</span>
                </button>

                {/* Sync Provider Prices Button */}
                <button 
                  type="button"
                  className="admin-btn admin-btn-primary admin-btn-sm"
                  style={{ background: '#0f172a', borderColor: '#0f172a', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '6px' }}
                  onClick={() => setSyncModalOpen(true)}
                  disabled={syncingPrices}
                >
                  <RefreshCw size={14} className={syncingPrices ? 'spin' : ''} />
                  <span>مزامنة التكلفة</span>
                </button>
              </div>
            </div>

            {/* Multi-Provider Filter Pills & Counters Bar (Requirement 23 & 24) */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', paddingTop: '8px', borderTop: '1px solid #f1f5f9' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#475569', marginLeft: '4px' }}>
                فلترة الكتالوج الموحد:
              </span>

              <button
                type="button"
                className={`admin-btn admin-btn-sm ${providerFilter === 'all' && stockFilter === 'all' ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
                style={{ fontSize: '0.78rem', padding: '3px 10px', borderRadius: '14px' }}
                onClick={() => { setProviderFilter('all'); setStockFilter('all'); setPage(1); }}
              >
                الكل ({stats.totalCatalog.toLocaleString()})
              </button>

              <button
                type="button"
                className={`admin-btn admin-btn-sm ${providerFilter === 'has_gamesdrop' ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
                style={{ fontSize: '0.78rem', padding: '3px 10px', borderRadius: '14px', borderColor: providerFilter === 'has_gamesdrop' ? undefined : '#bfdbfe', color: providerFilter === 'has_gamesdrop' ? undefined : '#1d4ed8' }}
                onClick={() => handleProviderFilterChange('has_gamesdrop')}
              >
                🎮 GamesDrop ({stats.hasGamesDropCount.toLocaleString()})
              </button>

              <button
                type="button"
                className={`admin-btn admin-btn-sm ${providerFilter === 'has_g2bulk' ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
                style={{ fontSize: '0.78rem', padding: '3px 10px', borderRadius: '14px', borderColor: providerFilter === 'has_g2bulk' ? undefined : '#ddd6fe', color: providerFilter === 'has_g2bulk' ? undefined : '#6d28d9' }}
                onClick={() => handleProviderFilterChange('has_g2bulk')}
              >
                ⚡ G2Bulk ({stats.hasG2BulkCount.toLocaleString()})
              </button>

              <button
                type="button"
                className={`admin-btn admin-btn-sm ${providerFilter === 'both' ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
                style={{ fontSize: '0.78rem', padding: '3px 10px', borderRadius: '14px', borderColor: providerFilter === 'both' ? undefined : '#a7f3d0', color: providerFilter === 'both' ? undefined : '#047857' }}
                onClick={() => handleProviderFilterChange('both')}
              >
                ✨ كلا المزودين ({stats.bothProvidersCount.toLocaleString()})
              </button>

              <button
                type="button"
                className={`admin-btn admin-btn-sm ${providerFilter === 'gamesdrop_only' ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
                style={{ fontSize: '0.78rem', padding: '3px 10px', borderRadius: '14px' }}
                onClick={() => handleProviderFilterChange('gamesdrop_only')}
              >
                GamesDrop فقط ({stats.gamesDropOnlyCount.toLocaleString()})
              </button>

              <button
                type="button"
                className={`admin-btn admin-btn-sm ${providerFilter === 'g2bulk_only' ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
                style={{ fontSize: '0.78rem', padding: '3px 10px', borderRadius: '14px' }}
                onClick={() => handleProviderFilterChange('g2bulk_only')}
              >
                G2Bulk فقط ({stats.g2BulkOnlyCount.toLocaleString()})
              </button>

              <button
                type="button"
                className={`admin-btn admin-btn-sm ${providerFilter === 'missing_provider' ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
                style={{ fontSize: '0.78rem', padding: '3px 10px', borderRadius: '14px', borderColor: providerFilter === 'missing_provider' ? undefined : '#fecaca', color: providerFilter === 'missing_provider' ? undefined : '#b91c1c' }}
                onClick={() => handleProviderFilterChange('missing_provider')}
              >
                بدون مزود ({stats.missingProviderCount.toLocaleString()})
              </button>

              <button
                type="button"
                className={`admin-btn admin-btn-sm ${stockFilter === 'out_of_stock' ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
                style={{ fontSize: '0.78rem', padding: '3px 10px', borderRadius: '14px', borderColor: stockFilter === 'out_of_stock' ? undefined : '#fed7aa', color: stockFilter === 'out_of_stock' ? undefined : '#c2410c' }}
                onClick={() => handleStockFilterChange(stockFilter === 'out_of_stock' ? 'all' : 'out_of_stock')}
              >
                غير متوفر بالمخزون ({stats.outOfStockCount.toLocaleString()})
              </button>
            </div>
          </div>

      {/* Products Catalog Table Card */}
      <div className="admin-card">
        <div className="admin-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="admin-card-title">
            <Package size={18} color="#f59e0b" />
            <span>الكتالوج الموحد ({total.toLocaleString()} منتج)</span>
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
                <th>تكلفة المزودين (GamesDrop & G2Bulk)</th>
                <th>سعر البيع للعميل</th>
                <th>هامش الربح (Margin)</th>
                <th>التوجيه (Routing)</th>
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
                      <span>جاري تحميل الكتالوج الموحد من قاعدة البيانات...</span>
                    </div>
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={12} style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
                    لا توجد منتجات مطابقة لخيارات البحث والفلترة المحددة.
                  </td>
                </tr>
              ) : (
                products.map((prod) => {
                  const isSelected = selectedIds.includes(prod.id);
                  const gdCost = prod.gamesDropCostUsd !== null && prod.gamesDropCostUsd !== undefined ? Number(prod.gamesDropCostUsd) : null;
                  const g2Cost = prod.g2BulkCostUsd !== null && prod.g2BulkCostUsd !== undefined ? Number(prod.g2BulkCostUsd) : null;
                  const sale = prod.customerPriceUsd !== null && prod.customerPriceUsd !== undefined ? Number(prod.customerPriceUsd) : null;
                  const isLowestGd = prod.lowestProvider === 'GAMESDROP' && g2Cost !== null;
                  const isLowestG2 = prod.lowestProvider === 'G2BULK' && gdCost !== null;

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
                            <span style={{ opacity: 0.8 }}>ID: {prod.providerOfferId || prod.id.slice(0, 8)}</span>
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

                      {/* Provider Costs (Side-by-Side Unified View - Requirement 8 & 26) */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', minWidth: '155px' }}>
                          {/* GamesDrop Cost */}
                          <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'space-between', 
                            padding: '3px 6px', 
                            borderRadius: '4px',
                            background: isLowestGd ? '#ecfdf5' : '#f8fafc',
                            border: `1px solid ${isLowestGd ? '#a7f3d0' : '#e2e8f0'}`
                          }}>
                            <span style={{ fontSize: '0.75rem', color: '#2563eb', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                              🎮 GD:
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span style={{ fontWeight: 800, fontSize: '0.85rem', color: gdCost !== null ? '#0f172a' : '#94a3b8' }}>
                                {gdCost !== null ? `$${gdCost.toFixed(2)}` : 'غير متوفر'}
                              </span>
                              {isLowestGd && (
                                <span style={{ fontSize: '0.62rem', background: '#059669', color: '#ffffff', padding: '0 4px', borderRadius: '3px', fontWeight: 800 }}>الأرخص</span>
                              )}
                            </div>
                          </div>

                          {/* G2Bulk Cost */}
                          <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'space-between', 
                            padding: '3px 6px', 
                            borderRadius: '4px',
                            background: isLowestG2 ? '#ecfdf5' : '#f8fafc',
                            border: `1px solid ${isLowestG2 ? '#a7f3d0' : '#e2e8f0'}`
                          }}>
                            <span style={{ fontSize: '0.75rem', color: '#7c3aed', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                              ⚡ G2:
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span style={{ fontWeight: 800, fontSize: '0.85rem', color: g2Cost !== null ? '#0f172a' : '#94a3b8' }}>
                                {g2Cost !== null ? `$${g2Cost.toFixed(2)}` : 'غير متوفر'}
                              </span>
                              {isLowestG2 && (
                                <span style={{ fontSize: '0.62rem', background: '#059669', color: '#ffffff', padding: '0 4px', borderRadius: '3px', fontWeight: 800 }}>الأرخص</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Single Sale Price (Requirement 9 & 27) */}
                      <td>
                        {sale !== null ? (
                          <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '1.05rem' }}>
                            ${sale.toFixed(2)}
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.78rem', color: '#ef4444', fontWeight: 700 }}>
                            غير محدد
                          </span>
                        )}
                      </td>

                      {/* Margins for Each Provider (Requirement 10) */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '0.78rem' }}>
                          {prod.gamesDropMarginUsd !== null && prod.gamesDropMarginUsd !== undefined ? (
                            <span style={{ 
                              color: prod.gamesDropMarginUsd >= 0 ? '#059669' : '#dc2626', 
                              fontWeight: 700,
                              background: prod.gamesDropMarginUsd >= 0 ? '#ecfdf5' : '#fef2f2',
                              padding: '1px 5px',
                              borderRadius: '4px',
                              display: 'inline-block'
                            }}>
                              GD: {prod.gamesDropMarginUsd >= 0 ? `+$${prod.gamesDropMarginUsd.toFixed(2)}` : `-$${Math.abs(prod.gamesDropMarginUsd).toFixed(2)}`}
                            </span>
                          ) : null}
                          {prod.g2BulkMarginUsd !== null && prod.g2BulkMarginUsd !== undefined ? (
                            <span style={{ 
                              color: prod.g2BulkMarginUsd >= 0 ? '#059669' : '#dc2626', 
                              fontWeight: 700,
                              background: prod.g2BulkMarginUsd >= 0 ? '#ecfdf5' : '#fef2f2',
                              padding: '1px 5px',
                              borderRadius: '4px',
                              display: 'inline-block'
                            }}>
                              G2: {prod.g2BulkMarginUsd >= 0 ? `+$${prod.g2BulkMarginUsd.toFixed(2)}` : `-$${Math.abs(prod.g2BulkMarginUsd).toFixed(2)}`}
                            </span>
                          ) : null}
                          {prod.gamesDropMarginUsd === null && prod.g2BulkMarginUsd === null && (
                            <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>-</span>
                          )}
                        </div>
                      </td>

                      {/* Routing (Primary & Fallback - Requirement 11 & 12) */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '0.72rem',
                            fontWeight: 800,
                            background: prod.primaryProvider === 'G2BULK' ? '#f5f3ff' : '#eff6ff',
                            color: prod.primaryProvider === 'G2BULK' ? '#7c3aed' : '#2563eb',
                            border: `1px solid ${prod.primaryProvider === 'G2BULK' ? '#ddd6fe' : '#bfdbfe'}`
                          }}>
                            أساسي: {prod.primaryProvider === 'G2BULK' ? '⚡ G2Bulk' : '🎮 GamesDrop'}
                          </span>
                          {prod.fallbackEnabled && prod.fallbackProvider && (
                            <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 600 }}>
                              احتياطي: {prod.fallbackProvider === 'G2BULK' ? '⚡ G2Bulk' : '🎮 GamesDrop'}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Stock (Requirement 20) */}
                      <td>
                        <span 
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            color: prod.inStock ? '#10b981' : '#ef4444',
                            background: prod.inStock ? '#ecfdf5' : '#fef2f2',
                            padding: '2px 7px',
                            borderRadius: '4px',
                            display: 'inline-block'
                          }}
                        >
                          {prod.inStock ? 'متوفر' : 'غير متوفر'}
                        </span>
                      </td>

                      {/* Storefront Active Toggle */}
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

                      <td style={{ fontSize: '0.72rem', color: '#64748b' }}>
                        {prod.lastProviderSyncAt 
                          ? new Date(prod.lastProviderSyncAt).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                          : 'لم تتم المزامنة'}
                      </td>
                      <td>
                        <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(prod)}
                            className="admin-btn admin-btn-secondary admin-btn-sm"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                          >
                            <Edit3 size={14} />
                            <span>تعديل</span>
                          </button>
                          {(prod.category === 'VIRTUAL_CARD' || prod.productName?.toLowerCase().includes('mastercard') || prod.productName?.includes('كيرو برو')) && (
                            <button
                              type="button"
                              onClick={() => setActiveAdminTab('kiropro-cards')}
                              className="admin-btn admin-btn-primary admin-btn-sm"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: '#d97706', borderColor: '#b45309' }}
                              title="إدارة مخزون بطاقات ماستركارد"
                            >
                              <CreditCard size={14} />
                              <span>المخزون</span>
                            </button>
                          )}
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

      {/* ========================================================================= */}
      {/* 3. DIGITAL PRODUCT ACCOUNTS INVENTORY VIEW                               */}
      {/* ========================================================================= */}
      {activeAdminTab === 'digital-accounts' && (
        <AdminDigitalAccountsTab products={products} />
      )}

      {/* ========================================================================= */}
      {/* 4. KIROPRO MASTERCARD CARDS INVENTORY VIEW                               */}
      {/* ========================================================================= */}
      {activeAdminTab === 'kiropro-cards' && (
        <AdminKiroProCards />
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

              {/* Unified Multi-Provider Cards & Costs (Requirement 12, 13, 26, 27) */}
              {(() => {
                const editPriceNum = Number(editForm.customerPriceUsd);
                return (
                  <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontWeight: 800, fontSize: '0.92rem', color: '#0f172a', marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Zap size={17} color="#f59e0b" />
                        <span>مزودو الخدمة والتكاليف (Provider Mappings & Costs)</span>
                      </div>
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>منتج موحد • تكاليف متعددة</span>
                    </div>

                    {/* 2 Side-by-side Provider Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      {/* GamesDrop Provider Card */}
                      {(() => {
                        const gdMap = editForm.providerMappings.find(m => m.provider === 'GAMESDROP');
                    const gdCost = gdMap ? gdMap.costUsd : Number(editingProduct.gamesDropCostUsd || editingProduct.providerCostUsd || 0);
                    const gdProfit = !isNaN(editPriceNum) && editPriceNum > 0 ? (editPriceNum - gdCost).toFixed(2) : null;
                    const gdEnabled = gdMap ? gdMap.isActive : Boolean(editingProduct.hasGamesDrop);
                    const gdGlobalOff = providerOrdersEnabled['GAMESDROP'] === false;

                    return (
                      <div style={{ 
                        background: '#ffffff', 
                        padding: '12px', 
                        borderRadius: '8px', 
                        border: `1.5px solid ${gdEnabled ? '#bfdbfe' : '#e2e8f0'}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                          <span style={{ fontWeight: 800, fontSize: '0.88rem', color: '#1d4ed8' }}>
                            🎮 GamesDrop
                          </span>
                          <span style={{ 
                            fontSize: '0.7rem', 
                            padding: '1px 6px', 
                            borderRadius: '4px', 
                            fontWeight: 700,
                            background: gdEnabled ? '#ecfdf5' : '#f1f5f9',
                            color: gdEnabled ? '#059669' : '#64748b'
                          }}>
                            {gdEnabled ? 'مفعّل' : 'معطّل'}
                          </span>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '6px 0' }}>
                          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>التكلفة (Cost):</span>
                          <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#0f172a' }}>
                            ${gdCost.toFixed(2)}
                          </span>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '6px 0' }}>
                          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>الهامش (Margin):</span>
                          <span style={{ fontWeight: 800, fontSize: '0.85rem', color: gdProfit && Number(gdProfit) >= 0 ? '#10b981' : '#ef4444' }}>
                            {gdProfit ? `${Number(gdProfit) >= 0 ? '+' : ''}$${gdProfit}` : '-'}
                          </span>
                        </div>

                        <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid #f1f5f9' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700, color: '#334155' }}>
                            <input
                              type="checkbox"
                              checked={gdEnabled}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setEditForm(prev => ({
                                  ...prev,
                                  providerMappings: prev.providerMappings.map(m => m.provider === 'GAMESDROP' ? { ...m, isActive: checked } : m)
                                }));
                              }}
                            />
                            <span>مفعّل للمنتج (Status: {gdEnabled ? 'Enabled' : 'Disabled'})</span>
                          </label>
                          {gdGlobalOff && (
                            <div style={{ fontSize: '0.68rem', color: '#dc2626', marginTop: '4px' }}>
                              * معطل عالمياً عن استقبال الطلبات
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* G2Bulk Provider Card */}
                  {(() => {
                    const g2Map = editForm.providerMappings.find(m => m.provider === 'G2BULK');
                    const hasG2 = editingProduct.hasG2Bulk || (g2Map && g2Map.costUsd > 0);
                    const g2Cost = g2Map ? g2Map.costUsd : Number(editingProduct.g2BulkCostUsd || 0);
                    const g2Profit = !isNaN(editPriceNum) && editPriceNum > 0 && hasG2 ? (editPriceNum - g2Cost).toFixed(2) : null;
                    const g2Enabled = g2Map ? g2Map.isActive : Boolean(editingProduct.hasG2Bulk);
                    const g2GlobalOff = providerOrdersEnabled['G2BULK'] === false;

                    return (
                      <div style={{ 
                        background: '#ffffff', 
                        padding: '12px', 
                        borderRadius: '8px', 
                        border: `1.5px solid ${g2Enabled && hasG2 ? '#ddd6fe' : '#e2e8f0'}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                          <span style={{ fontWeight: 800, fontSize: '0.88rem', color: '#7c3aed' }}>
                            ⚡ G2Bulk
                          </span>
                          <span style={{ 
                            fontSize: '0.7rem', 
                            padding: '1px 6px', 
                            borderRadius: '4px', 
                            fontWeight: 700,
                            background: !hasG2 ? '#fef2f2' : (g2Enabled ? '#ecfdf5' : '#f1f5f9'),
                            color: !hasG2 ? '#dc2626' : (g2Enabled ? '#059669' : '#64748b')
                          }}>
                            {!hasG2 ? 'غير مسجل' : (g2Enabled ? 'مفعّل' : 'معطّل')}
                          </span>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '6px 0' }}>
                          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>التكلفة (Cost):</span>
                          <span style={{ fontWeight: 800, fontSize: '0.95rem', color: hasG2 ? '#0f172a' : '#94a3b8' }}>
                            {hasG2 ? `$${g2Cost.toFixed(2)}` : 'غير متوفر'}
                          </span>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '6px 0' }}>
                          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>الهامش (Margin):</span>
                          <span style={{ fontWeight: 800, fontSize: '0.85rem', color: g2Profit && Number(g2Profit) >= 0 ? '#10b981' : '#ef4444' }}>
                            {g2Profit ? `${Number(g2Profit) >= 0 ? '+' : ''}$${g2Profit}` : '-'}
                          </span>
                        </div>

                        <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid #f1f5f9' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700, color: '#334155' }}>
                            <input
                              type="checkbox"
                              checked={g2Enabled}
                              disabled={!hasG2}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setEditForm(prev => ({
                                  ...prev,
                                  providerMappings: prev.providerMappings.map(m => m.provider === 'G2BULK' ? { ...m, isActive: checked } : m)
                                }));
                              }}
                            />
                            <span>مفعّل للمنتج (Status: {g2Enabled ? 'Enabled' : 'Disabled'})</span>
                          </label>
                          {g2GlobalOff && (
                            <div style={{ fontSize: '0.68rem', color: '#dc2626', marginTop: '4px' }}>
                              * معطل عالمياً عن استقبال الطلبات
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Single Customer Sale Price Input (Requirement 9 & 27) */}
                <div style={{ marginTop: '14px', background: '#fdfbf7', padding: '12px 14px', borderRadius: '8px', border: '1.5px solid #fde68a' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                    <div>
                      <label style={{ fontSize: '0.82rem', color: '#92400e', fontWeight: 800, display: 'block' }}>
                        سعر البيع الموحد للعميل في المتجر ($) — One Sale Price
                      </label>
                      <span style={{ fontSize: '0.72rem', color: '#78350f' }}>
                        سعر موحد في المتجر لجميع المزودين ولا يتأثر بمزامنة التكلفة.
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 800, fontSize: '1.1rem', color: '#0f172a' }}>$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        className="admin-input"
                        style={{ fontWeight: 900, fontSize: '1.1rem', borderColor: '#f59e0b', width: '130px', padding: '6px 10px', textAlign: 'center' }}
                        value={editForm.customerPriceUsd}
                        onChange={(e) => setEditForm(prev => ({ ...prev, customerPriceUsd: e.target.value }))}
                        placeholder="1.00"
                        required
                      />
                    </div>
                  </div>
                </div>

                {/* Provider Routing & Failover Controls (Requirement 11 & 12) */}
                <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #e2e8f0' }}>
                  <div style={{ fontWeight: 800, fontSize: '0.85rem', color: '#0f172a', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Zap size={15} color="#3b82f6" />
                    <span>توجيه المزود ومسار التنفيذ (Routing: Primary & Fallback)</span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label className="admin-label">المزود الأساسي (Primary)</label>
                      <select
                        className="admin-input"
                        value={editForm.primaryProvider}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (providerOrdersEnabled[val] === false) {
                            setAlertInfo({
                              type: 'error',
                              text: `المزود (${val}) معطل حالياً لاستقبال الطلبات من صفحة المزودين ولا يمكن اختياره كمزود أساسي.`
                            });
                            return;
                          }
                          setEditForm(prev => ({ 
                            ...prev, 
                            primaryProvider: val,
                            fallbackProvider: prev.fallbackProvider === val ? '' : prev.fallbackProvider
                          }));
                        }}
                      >
                        <option value="GAMESDROP" disabled={providerOrdersEnabled['GAMESDROP'] === false}>
                          GamesDrop {providerOrdersEnabled['GAMESDROP'] === false ? '❌ (معطّل للاستقبال)' : ''}
                        </option>
                        <option value="G2BULK" disabled={providerOrdersEnabled['G2BULK'] === false}>
                          G2Bulk {providerOrdersEnabled['G2BULK'] === false ? '❌ (معطّل للاستقبال)' : ''}
                        </option>
                      </select>
                    </div>

                    <div>
                      <label className="admin-label">المزود الاحتياطي (Fallback)</label>
                      <select
                        className="admin-input"
                        value={editForm.fallbackProvider}
                        disabled={!editForm.fallbackEnabled}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val && providerOrdersEnabled[val] === false) {
                            setAlertInfo({
                              type: 'error',
                              text: `المزود (${val}) معطل حالياً لاستقبال الطلبات من صفحة المزودين ولا يمكن اختياره كمزود احتياطي.`
                            });
                            return;
                          }
                          setEditForm(prev => ({ ...prev, fallbackProvider: val }));
                        }}
                      >
                        <option value="">بدون مزود احتياطي</option>
                        {editForm.primaryProvider !== 'GAMESDROP' && (
                          <option value="GAMESDROP" disabled={providerOrdersEnabled['GAMESDROP'] === false}>
                            GamesDrop {providerOrdersEnabled['GAMESDROP'] === false ? '❌ (معطّل للاستقبال)' : ''}
                          </option>
                        )}
                        {editForm.primaryProvider !== 'G2BULK' && (
                          <option value="G2BULK" disabled={providerOrdersEnabled['G2BULK'] === false}>
                            G2Bulk {providerOrdersEnabled['G2BULK'] === false ? '❌ (معطّل للاستقبال)' : ''}
                          </option>
                        )}
                      </select>
                    </div>
                  </div>

                  <div style={{ marginTop: '10px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={editForm.fallbackEnabled}
                        onChange={(e) => setEditForm(prev => ({ 
                          ...prev, 
                          fallbackEnabled: e.target.checked,
                          fallbackProvider: e.target.checked ? (prev.primaryProvider === 'GAMESDROP' ? 'G2BULK' : 'GAMESDROP') : ''
                        }))}
                      />
                      <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>
                        تفعيل التبديل التلقائي إلى المزود الاحتياطي عند فشل المزود الأساسي (Safe Failover)
                      </span>
                    </label>
                  </div>
                </div>

                {/* Stock Checkbox (Requirement 20) */}
                <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #e2e8f0' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={editForm.inStock}
                      onChange={(e) => setEditForm(prev => ({ ...prev, inStock: e.target.checked }))}
                    />
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>
                      المنتج متوفر في المخزون (In Stock)
                    </span>
                  </label>
                </div>
              </div>
            );
          })()}

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

      {/* GamesDrop Catalog Sync Results Modal */}
      {catalogSyncModalOpen && catalogSyncStats && (
        <div className="admin-modal-backdrop" onClick={() => setCatalogSyncModalOpen(false)}>
          <div className="admin-modal" style={{ maxWidth: '620px' }} onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3 className="admin-modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <RefreshCw size={20} color="#10b981" />
                <span>تقرير نتائج مزامنة الكتالوج (GamesDrop Live Sync)</span>
              </h3>
              <button 
                type="button" 
                className="admin-modal-close" 
                onClick={() => setCatalogSyncModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="admin-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ fontSize: '0.88rem', color: '#475569', lineHeight: 1.6 }}>
                تم الاتصال المباشر مع <strong>GamesDrop Partner API</strong> وسحب كافة عروض المنتجات المستهدفة وتحديث تكاليفها الحالية في قاعدة بيانات KIROPRO بنجاح.
              </div>

              {/* 5 Stats Cards Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700, marginBottom: '4px' }}>العروض المفحوصة</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#0f172a' }}>{catalogSyncStats.productsChecked}</div>
                </div>

                <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.75rem', color: '#065f46', fontWeight: 700, marginBottom: '4px' }}>عروض جديدة مضافة</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#059669' }}>+{catalogSyncStats.newOffers}</div>
                </div>

                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.75rem', color: '#1e40af', fontWeight: 700, marginBottom: '4px' }}>عروض تم تحديثها</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#2563eb' }}>{catalogSyncStats.updatedOffers}</div>
                </div>

                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.75rem', color: '#92400e', fontWeight: 700, marginBottom: '4px' }}>تغيرات في الأسعار</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#d97706' }}>{catalogSyncStats.priceChanges}</div>
                </div>

                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.75rem', color: '#991b1b', fontWeight: 700, marginBottom: '4px' }}>عروض نفدت (Out of Stock)</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#dc2626' }}>{catalogSyncStats.outOfStock}</div>
                </div>
              </div>

              {/* Category Breakdown */}
              {catalogSyncStats.details && (
                <div style={{ background: '#f1f5f9', borderRadius: '10px', padding: '12px 16px', fontSize: '0.85rem' }}>
                  <div style={{ fontWeight: 800, color: '#1e293b', marginBottom: '8px' }}>تفاصيل الفئات المستهدفة:</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                    <span>💎 Likee: <strong>{catalogSyncStats.details.likeeOffers} عرض</strong></span>
                    <span>⭐ Telegram Stars: <strong>{catalogSyncStats.details.telegramStarsOffers} عرض</strong></span>
                    <span>👑 Telegram Premium: <strong>{catalogSyncStats.details.telegramPremiumOffers} عرض</strong></span>
                  </div>
                </div>
              )}

              {/* Manual Pricing Safe Notice */}
              <div style={{ background: '#ecfdf5', padding: '12px 14px', borderRadius: '8px', border: '1px solid #a7f3d0', fontSize: '0.82rem', color: '#065f46', lineHeight: 1.5 }}>
                🔒 <strong>التسعير والأرباح اليدوية:</strong> كافة المنتجات والعروض الجديدة تُترك غير مفعلة افتراضياً حتى تقوم بتحديد سعر البيع للعملاء بالدولار/الجنيه وهامش الربح المطلوب وتفعيلها يدوياً بأمان تام.
              </div>

              <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                وقت المزامنة: {new Date(catalogSyncStats.lastSyncTime).toLocaleString('ar-EG')}
              </div>

              <div className="admin-modal-footer" style={{ marginTop: '8px', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="admin-btn admin-btn-primary"
                  onClick={() => setCatalogSyncModalOpen(false)}
                >
                  إغلاق
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* G2Bulk Catalog Sync Result Modal (Requirement 25) */}
      {g2BulkSyncModalOpen && g2BulkSyncStats && (
        <div className="admin-modal-backdrop" onClick={() => setG2BulkSyncModalOpen(false)}>
          <div className="admin-modal" style={{ maxWidth: '620px' }} onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3 className="admin-modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#7c3aed' }}>
                <Zap size={20} color="#7c3aed" />
                <span>تقرير مزامنة كتالوج G2Bulk الموحد (G2Bulk Sync Complete)</span>
              </h3>
              <button 
                type="button" 
                className="admin-modal-close" 
                onClick={() => setG2BulkSyncModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="admin-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ background: '#f5f3ff', padding: '12px 16px', borderRadius: '8px', border: '1px solid #ddd6fe', color: '#5b21b6', fontSize: '0.88rem', fontWeight: 600 }}>
                تمت مزامنة الكتالوج بنجاح مع G2Bulk API وإدخال الباقات في الكتالوج الموحد دون تكرار أي منتج مشترك.
              </div>

              {/* 6 Stats Cards Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700, marginBottom: '4px' }}>الألعاب (Fetched)</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#0f172a' }}>{g2BulkSyncStats.gamesFetched}</div>
                  <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>لعبة مفحوصة</div>
                </div>

                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700, marginBottom: '4px' }}>الباقات (Products)</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#0f172a' }}>{g2BulkSyncStats.cataloguesChecked}</div>
                  <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>باقة معالجة</div>
                </div>

                <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.75rem', color: '#065f46', fontWeight: 700, marginBottom: '4px' }}>تم دمجها (Matched)</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#059669' }}>+{g2BulkSyncStats.matched}</div>
                  <div style={{ fontSize: '0.7rem', color: '#10b981' }}>باقة موحدة</div>
                </div>

                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.75rem', color: '#1e40af', fontWeight: 700, marginBottom: '4px' }}>جديدة (New Products)</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#2563eb' }}>+{g2BulkSyncStats.newProducts}</div>
                  <div style={{ fontSize: '0.7rem', color: '#3b82f6' }}>باقة حصرية</div>
                </div>

                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.75rem', color: '#92400e', fontWeight: 700, marginBottom: '4px' }}>ملتبسة (Ambiguous)</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#d97706' }}>{g2BulkSyncStats.ambiguous}</div>
                  <div style={{ fontSize: '0.7rem', color: '#f59e0b' }}>تخطي بأمان</div>
                </div>

                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.75rem', color: '#991b1b', fontWeight: 700, marginBottom: '4px' }}>مستبعدة (Rejected)</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#dc2626' }}>{g2BulkSyncStats.rejected}</div>
                  <div style={{ fontSize: '0.7rem', color: '#ef4444' }}>بدون مطابقة</div>
                </div>
              </div>

              {/* Pricing Safety Reminder (Requirement 28) */}
              <div style={{ background: '#ecfdf5', padding: '12px 14px', borderRadius: '8px', border: '1px solid #a7f3d0', fontSize: '0.82rem', color: '#065f46', lineHeight: 1.5 }}>
                🔒 <strong>حماية أسعار البيع:</strong> تمت إضافة وتحديث تكاليف المزود (Provider Cost) والمخططات فقط. لم يتم تعديل أي سعر بيع للعملاء (<code style={{ color: '#047857' }}>customerPriceUsd</code>) حفاظاً على هوامش الربح.
              </div>

              <div style={{ fontSize: '0.78rem', color: '#94a3b8', textAlign: 'center' }}>
                وقت المزامنة: {new Date(g2BulkSyncStats.lastSyncTime).toLocaleString('ar-EG')}
              </div>

              <div className="admin-modal-footer" style={{ marginTop: '8px', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="admin-btn admin-btn-primary"
                  onClick={() => setG2BulkSyncModalOpen(false)}
                >
                  إغلاق التقرير
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
