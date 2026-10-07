import React, { useEffect, useState, useMemo } from 'react';
import { usePartner } from '../../context/PartnerContext';
import { 
  Zap, 
  Search, 
  CheckCircle, 
  AlertCircle, 
  Gamepad2,
  ArrowRight, 
  RefreshCw, 
  Flame, 
  CreditCard,
  Copy,
  Check,
  ShieldCheck,
  Minus,
  Plus,
  Server,
  User,
  ShoppingBag,
  ExternalLink
} from 'lucide-react';

interface PartnerProduct {
  id: string;
  name: string;
  nameEn?: string;
  category: string;
  price: number; // Retail price USD
  effectivePartnerPriceUsd: number; // Resolved partner price USD
  hasCustomPrice: boolean;
  savingsPercent: number;
  inStock: boolean;
  availableStock?: number;
  fulfillmentType: 'DIRECT_TOPUP' | 'DIGITAL_ACCOUNT' | 'KIROPRO_CARD' | 'GIFT_CARD' | 'OTHER';
  requiresPlayerId: boolean;
  requiresServerId: boolean;
  requiresQuantity: boolean;
  requiresInventory: boolean;
  idFieldLabel?: string;
  idPlaceholder?: string;
  image?: string;
}

interface DeliveredAccount {
  id: string;
  email: string;
  password: string;
}

export const PartnerQuickBuy: React.FC = () => {
  const { wallet, refreshProfile, partnerFetch, setActiveTab } = usePartner();

  const [products, setProducts] = useState<PartnerProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedProduct, setSelectedProduct] = useState<PartnerProduct | null>(null);
  
  // Dynamic Inputs
  const [playerId, setPlayerId] = useState('');
  const [playerIdTouched, setPlayerIdTouched] = useState(false);
  const [serverId, setServerId] = useState('');
  const [serverIdTouched, setServerIdTouched] = useState(false);
  const [quantity, setQuantity] = useState<number>(1);

  // Copy Feedback
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Purchasing State
  const [purchasing, setPurchasing] = useState(false);
  const [orderResult, setOrderResult] = useState<{
    success: boolean;
    orderNumber?: string;
    productName?: string;
    amountUsd?: number;
    quantity?: number;
    newBalance?: number;
    error?: string;
    deliveredAccounts?: DeliveredAccount[];
    issuedCardLast4?: string;
    fulfillmentType?: string;
  } | null>(null);

  // Load Products
  const loadProducts = async () => {
    try {
      setLoading(true);
      const res = await partnerFetch<any>('/api/partner/products');
      const rawList = Array.isArray(res) ? res : (res?.products || []);

      const mappedList: PartnerProduct[] = rawList.map((p: any) => {
        const fulfillmentType = p.fulfillmentType || (
          p.productType === 'VIRTUAL_CARD' ? 'KIROPRO_CARD' :
          p.productType === 'DIGITAL_ACCOUNT' ? 'DIGITAL_ACCOUNT' :
          'DIRECT_TOPUP'
        );
        const isInventory = fulfillmentType === 'KIROPRO_CARD' || fulfillmentType === 'DIGITAL_ACCOUNT';
        const requiresPlayerId = p.requiresPlayerId !== undefined ? p.requiresPlayerId : (!isInventory && p.requiresGameUserId !== false);

        return {
          id: p.id,
          name: p.arabicName || p.offerName || p.productName || p.name || 'منتج',
          nameEn: p.productName || p.nameEn,
          category: p.categoryArabicName || p.categoryName || p.category || 'العاب',
          price: Number(p.retailPriceUsd ?? p.price ?? 0),
          effectivePartnerPriceUsd: Number(p.effectivePartnerPriceUsd ?? p.partnerPriceUsd ?? 0),
          hasCustomPrice: Boolean(p.hasCustomPrice),
          savingsPercent: Number(p.savingsPercent ?? 0),
          inStock: p.inStock !== false,
          availableStock: p.availableStock !== null && p.availableStock !== undefined ? Number(p.availableStock) : undefined,
          fulfillmentType,
          requiresPlayerId,
          requiresServerId: Boolean(p.requiresServerId || p.requiresGameServerId),
          requiresQuantity: Boolean(p.requiresQuantity || fulfillmentType === 'DIGITAL_ACCOUNT'),
          requiresInventory: Boolean(p.requiresInventory || isInventory),
          idFieldLabel: p.idFieldLabel || p.categoryIdFieldLabel,
          idPlaceholder: p.idPlaceholder || p.categoryIdPlaceholder,
          image: p.categoryImageUrl || p.image
        };
      });

      setProducts(mappedList);
      if (mappedList.length > 0 && !selectedProduct) {
        setSelectedProduct(mappedList[0]);
      }
    } catch (err) {
      console.error('Failed to load products', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  // Reset inputs when selected product changes
  useEffect(() => {
    setPlayerId('');
    setPlayerIdTouched(false);
    setServerId('');
    setServerIdTouched(false);
    setQuantity(1);
  }, [selectedProduct?.id]);

  // Distinct categories
  const categories = useMemo(() => {
    const cats = new Set<string>();
    products.forEach((p) => {
      if (p.category) cats.add(p.category);
    });
    return Array.from(cats);
  }, [products]);

  // Filtered products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchCat = selectedCategory === 'ALL' || p.category === selectedCategory;
      const matchQuery = !searchQuery || 
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.nameEn && p.nameEn.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchCat && matchQuery;
    });
  }, [products, selectedCategory, searchQuery]);

  // Copy helper
  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Calculations for selected product
  const effectiveQty = selectedProduct?.requiresQuantity ? Math.max(1, quantity) : 1;
  const unitPrice = selectedProduct?.effectivePartnerPriceUsd || 0;
  const totalChargeAmount = Math.round(unitPrice * effectiveQty * 100) / 100;
  const currentBalance = Number(wallet?.balance || 0);
  const canAfford = currentBalance >= totalChargeAmount;
  const isOutOfStock = selectedProduct?.requiresInventory && (selectedProduct?.availableStock !== undefined && selectedProduct.availableStock <= 0);

  // Execute Buy Flow
  const executeBuy = async (productToBuy: PartnerProduct) => {
    // 1. Validation for Player ID
    if (productToBuy.requiresPlayerId) {
      if (!playerId.trim()) {
        setPlayerIdTouched(true);
        return;
      }
    }

    // 2. Validation for Server ID
    if (productToBuy.requiresServerId) {
      if (!serverId.trim()) {
        setServerIdTouched(true);
        return;
      }
    }

    // 3. Balance Check
    if (wallet && wallet.balance < totalChargeAmount) {
      setOrderResult({
        success: false,
        error: `رصيد محفظتك ($${wallet.balance.toFixed(2)} USD) غير كافٍ لإتمام العملية ($${totalChargeAmount.toFixed(2)} USD). يرجى إيداع رصيد أولاً.`
      });
      return;
    }

    // 4. Stock Check
    if (productToBuy.requiresInventory && productToBuy.availableStock !== undefined) {
      if (productToBuy.availableStock < effectiveQty) {
        setOrderResult({
          success: false,
          error: `المخزون المتوفر (${productToBuy.availableStock}) لا يكفي للكمية المطلوبة (${effectiveQty}).`
        });
        return;
      }
    }

    try {
      setPurchasing(true);
      setOrderResult(null);

      const idempotencyKey = `partner-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const res = await partnerFetch<{
        success: boolean;
        orderId?: string;
        order?: {
          id: string;
          orderNumber: string;
          productName: string;
          amountUsd: number;
          quantity?: number;
          status: string;
          cardLast4?: string;
        };
        accounts?: DeliveredAccount[];
        newBalance: number;
        error?: string;
      }>('/api/partner/quick-buy', {
        method: 'POST',
        body: JSON.stringify({
          productId: productToBuy.id,
          playerId: productToBuy.requiresPlayerId ? playerId.trim() : undefined,
          serverId: productToBuy.requiresServerId ? serverId.trim() : undefined,
          quantity: effectiveQty,
          idempotencyKey
        })
      });

      if (res && res.success) {
        setOrderResult({
          success: true,
          orderNumber: res.order?.orderNumber || (res.orderId ? String(res.orderId).slice(0, 8).toUpperCase() : 'OK'),
          productName: res.order?.productName || productToBuy.name,
          amountUsd: res.order?.amountUsd || totalChargeAmount,
          quantity: effectiveQty,
          newBalance: res.newBalance,
          deliveredAccounts: res.accounts,
          issuedCardLast4: res.order?.cardLast4,
          fulfillmentType: productToBuy.fulfillmentType
        });
        // Refresh partner profile/balance in background
        refreshProfile();
        loadProducts();
      } else {
        setOrderResult({
          success: false,
          error: res.error || 'فشلت عملية الشحن'
        });
      }
    } catch (err: any) {
      setOrderResult({
        success: false,
        error: err.message || 'حدث خطأ أثناء معالجة الطلب'
      });
    } finally {
      setPurchasing(false);
    }
  };

  const handleNextOrder = () => {
    setOrderResult(null);
    setPlayerId('');
    setPlayerIdTouched(false);
    setServerId('');
    setServerIdTouched(false);
    setQuantity(1);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Zap size={22} color="#f59e0b" />
            <h2 style={{ fontSize: '1.35rem', fontWeight: 900 }}>صالة الشحن الفوري (Quick Buy)</h2>
          </div>
          <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
            تنفيذ فوري مباشر مع خصم تلقائي من محفظتك الاستثمارية بدون تعقيد
          </p>
        </div>

        <button
          onClick={loadProducts}
          className="btn-partner-secondary"
          title="تحديث قائمة الباقات والأسعار"
        >
          <RefreshCw size={15} className={loading ? 'spin-anim' : ''} />
          <span>تحديث الأسعار</span>
        </button>
      </div>

      {/* Main Terminal Layout */}
      <div className="partner-terminal-layout">
        {/* Left Column: Categories and Search */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Search Box */}
          <div className="partner-card" style={{ padding: 12 }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid var(--partner-border)',
              borderRadius: 8,
              padding: '8px 12px'
            }}>
              <Search size={15} color="#94a3b8" />
              <input
                type="text"
                placeholder="ابحث عن باقة أو لعبة..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: '#fff',
                  width: '100%',
                  fontSize: '0.85rem',
                  fontFamily: 'inherit'
                }}
              />
            </div>
          </div>

          {/* Categories Filter */}
          <div className="partner-card" style={{ padding: 14 }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#94a3b8', marginBottom: 8 }}>
              تصنيف الألعاب والخدمات
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <button
                className={`partner-nav-tab ${selectedCategory === 'ALL' ? 'active' : ''}`}
                style={{ width: '100%', justifyContent: 'flex-start', padding: '9px 12px' }}
                onClick={() => setSelectedCategory('ALL')}
              >
                <Gamepad2 size={16} />
                <span>جميع المنتجات ({products.length})</span>
              </button>

              {categories.map((cat) => (
                <button
                  key={cat}
                  className={`partner-nav-tab ${selectedCategory === cat ? 'active' : ''}`}
                  style={{ width: '100%', justifyContent: 'flex-start', padding: '9px 12px' }}
                  onClick={() => setSelectedCategory(cat)}
                >
                  <Flame size={16} />
                  <span>{cat}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Active Checkout Panel & Packages Grid */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Active Product Requirements & Checkout Box */}
          {selectedProduct && (
            <div className="partner-card partner-card-glow" style={{ padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <h3 style={{ fontSize: '1.2rem', fontWeight: 900, color: '#fff' }}>
                      {selectedProduct.name}
                    </h3>
                    <span className="badge-status" style={{
                      background: 'rgba(245, 158, 11, 0.15)',
                      color: '#fbbf24',
                      border: '1px solid rgba(245, 158, 11, 0.3)'
                    }}>
                      {selectedProduct.fulfillmentType === 'KIROPRO_CARD' && 'بطاقة ماستركارد'}
                      {selectedProduct.fulfillmentType === 'DIGITAL_ACCOUNT' && 'حساب رقمي جاهز'}
                      {selectedProduct.fulfillmentType === 'DIRECT_TOPUP' && 'شحن معرف مباشر'}
                      {selectedProduct.fulfillmentType === 'GIFT_CARD' && 'بطاقة هدايا'}
                    </span>
                  </div>
                  <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                    التصنيف: {selectedProduct.category}
                  </span>
                </div>

                {/* Price Display */}
                <div style={{ textAlign: 'left' }}>
                  <span style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'block' }}>سعر الشريك للوحدة</span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                    <span className="partner-currency" style={{ fontSize: '1.4rem', fontWeight: 900, color: '#10b981' }}>
                      ${selectedProduct.effectivePartnerPriceUsd.toFixed(2)}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 800 }}>USD</span>
                  </div>
                </div>
              </div>

              {/* Requirement: Player ID Input (Shown ONLY if requiresPlayerId is true) */}
              {selectedProduct.requiresPlayerId ? (
                <div style={{ marginBottom: 14 }}>
                  <label className="partner-label">
                    <span>{selectedProduct.idFieldLabel || 'معرف اللاعب (Player ID)'}</span>
                    <span style={{ color: '#f59e0b', marginRight: 4 }}>*</span>
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      placeholder={selectedProduct.idPlaceholder || 'أدخل معرف اللاعب (Player ID)...'}
                      value={playerId}
                      onChange={(e) => {
                        setPlayerId(e.target.value);
                        if (playerIdTouched) setPlayerIdTouched(false);
                      }}
                      className="partner-input"
                      style={{
                        padding: '12px 14px',
                        fontSize: '1.05rem',
                        color: '#38bdf8',
                        fontFamily: 'Outfit, monospace',
                        fontWeight: 700,
                        borderColor: playerIdTouched && !playerId.trim() ? '#f43f5e' : undefined
                      }}
                    />
                  </div>
                  {playerIdTouched && !playerId.trim() && (
                    <div style={{ color: '#fb7185', fontSize: '0.78rem', marginTop: 4, fontWeight: 700 }}>
                      يرجى إدخال معرف اللاعب أولاً قبل تنفيذ الشحن
                    </div>
                  )}
                </div>
              ) : (
                /* Information Note When NO Player ID is Required */
                <div style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 8,
                  padding: '10px 14px',
                  marginBottom: 14,
                  fontSize: '0.82rem',
                  color: '#cbd5e1',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                }}>
                  <ShieldCheck size={16} color="#10b981" style={{ flexShrink: 0 }} />
                  <span>
                    {selectedProduct.fulfillmentType === 'KIROPRO_CARD' && 'لا يلزم إدخال معرف — يتم تخصيص بيانات البطاقة فورياً بعد الدفع.'}
                    {selectedProduct.fulfillmentType === 'DIGITAL_ACCOUNT' && 'لا يلزم إدخال معرف — يتم تسليم بيانات الحساب (الإيميل وكلمة المرور) فورياً بمجرد إتمام الشراء.'}
                    {selectedProduct.fulfillmentType === 'GIFT_CARD' && 'لا يلزم إدخال معرف — يتم تسليم كود البطاقة تلقائياً.'}
                  </span>
                </div>
              )}

              {/* Requirement: Server ID Input (Shown ONLY if requiresServerId is true) */}
              {selectedProduct.requiresServerId && (
                <div style={{ marginBottom: 14 }}>
                  <label className="partner-label">
                    <span>خادم اللعبة (Server ID)</span>
                    <span style={{ color: '#f59e0b', marginRight: 4 }}>*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="أدخل معرف الخادم (Server ID)..."
                    value={serverId}
                    onChange={(e) => {
                      setServerId(e.target.value);
                      if (serverIdTouched) setServerIdTouched(false);
                    }}
                    className="partner-input"
                    style={{
                      borderColor: serverIdTouched && !serverId.trim() ? '#f43f5e' : undefined
                    }}
                  />
                  {serverIdTouched && !serverId.trim() && (
                    <div style={{ color: '#fb7185', fontSize: '0.78rem', marginTop: 4, fontWeight: 700 }}>
                      يرجى تحديد خادم اللعبة لإتمام الشحن
                    </div>
                  )}
                </div>
              )}

              {/* Requirement: Quantity & Stock Picker (For Digital Accounts or multi-quantity) */}
              {selectedProduct.requiresQuantity && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: 8,
                  padding: '10px 14px',
                  marginBottom: 14
                }}>
                  <div>
                    <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#fff', display: 'block' }}>
                      الكمية المطلوبة
                    </span>
                    {selectedProduct.availableStock !== undefined && (
                      <span style={{ fontSize: '0.75rem', color: selectedProduct.availableStock > 0 ? '#10b981' : '#f43f5e' }}>
                        المتاح حالياً: {selectedProduct.availableStock} حساب
                      </span>
                    )}
                  </div>

                  <div className="partner-qty-picker">
                    <button
                      type="button"
                      disabled={quantity <= 1}
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      className="partner-qty-btn"
                    >
                      <Minus size={14} />
                    </button>
                    <span className="partner-qty-value">{quantity}</span>
                    <button
                      type="button"
                      disabled={selectedProduct.availableStock !== undefined && quantity >= selectedProduct.availableStock}
                      onClick={() => setQuantity(quantity + 1)}
                      className="partner-qty-btn"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
              )}

              {/* Total & Action Row */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 12,
                paddingTop: 12,
                borderTop: '1px solid rgba(255, 255, 255, 0.08)'
              }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block' }}>المجموع الإجمالي للشراء</span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                    <span className="partner-currency" style={{ fontSize: '1.3rem', fontWeight: 900, color: '#f8fafc' }}>
                      ${totalChargeAmount.toFixed(2)}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>USD</span>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={purchasing || isOutOfStock || !canAfford}
                  onClick={() => executeBuy(selectedProduct)}
                  className="btn-partner-primary"
                  style={{ minWidth: 200 }}
                >
                  {purchasing ? (
                    <>
                      <RefreshCw size={16} className="spin-anim" />
                      <span>جاري التنفيذ الفوري...</span>
                    </>
                  ) : isOutOfStock ? (
                    <span>نفد المخزون حالياً</span>
                  ) : !canAfford ? (
                    <span>الرصيد غير كافٍ (${currentBalance.toFixed(2)})</span>
                  ) : (
                    <>
                      <Zap size={16} />
                      <span>شراء الآن (${totalChargeAmount.toFixed(2)} USD)</span>
                    </>
                  )}
                </button>
              </div>

              {!canAfford && (
                <div style={{ marginTop: 10, fontSize: '0.8rem', color: '#fb7185', textAlign: 'center' }}>
                  رصيد محفظتك (${currentBalance.toFixed(2)} USD) أقل من المطلوب (${totalChargeAmount.toFixed(2)} USD).{' '}
                  <button
                    onClick={() => setActiveTab('deposits')}
                    style={{ background: 'transparent', border: 'none', color: '#f59e0b', fontWeight: 800, cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    شحن الرصيد الآن
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Packages Grid */}
          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#94a3b8', marginBottom: 12 }}>
              قائمة الباقات والمنتجات المتاحة ({filteredProducts.length})
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
                جاري تحميل الباقات والأسعار المعتمدة...
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="partner-card" style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                لم يتم العثور على أي باقات مطابقة للتصنيف أو البحث.
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))',
                gap: 14
              }}>
                {filteredProducts.map((p) => {
                  const isSelected = selectedProduct?.id === p.id;
                  const itemOutOfStock = p.requiresInventory && (p.availableStock !== undefined && p.availableStock <= 0);

                  return (
                    <div
                      key={p.id}
                      className={`package-card ${isSelected ? 'selected' : ''}`}
                      onClick={() => setSelectedProduct(p)}
                      style={{
                        cursor: 'pointer',
                        padding: 14,
                        opacity: itemOutOfStock ? 0.6 : 1
                      }}
                    >
                      <div>
                        {/* Category & Badge */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700 }}>
                            {p.category}
                          </span>
                          {p.savingsPercent > 0 && (
                            <span style={{
                              background: 'rgba(16, 185, 129, 0.15)',
                              color: '#34d399',
                              border: '1px solid rgba(16, 185, 129, 0.3)',
                              padding: '2px 6px',
                              borderRadius: 4,
                              fontSize: '0.7rem',
                              fontWeight: 900
                            }}>
                              وفر {p.savingsPercent}%
                            </span>
                          )}
                        </div>

                        {/* Product Title */}
                        <h4 style={{ margin: '0 0 8px 0', fontSize: '0.98rem', fontWeight: 900, color: '#fff' }}>
                          {p.name}
                        </h4>

                        {/* Requirements Tag */}
                        <div style={{ marginBottom: 10 }}>
                          {p.requiresPlayerId ? (
                            <span style={{ fontSize: '0.7rem', color: '#38bdf8' }}>• يتطلب معرف اللاعب (ID)</span>
                          ) : (
                            <span style={{ fontSize: '0.7rem', color: '#10b981' }}>• تسليم فوري وتلقائي</span>
                          )}
                        </div>
                      </div>

                      <div>
                        {/* Price & Stock Display */}
                        <div style={{
                          display: 'flex',
                          alignItems: 'baseline',
                          justifyContent: 'space-between',
                          padding: '8px 10px',
                          background: 'rgba(0, 0, 0, 0.25)',
                          borderRadius: 6,
                          marginBottom: 8
                        }}>
                          <div>
                            <span style={{ fontSize: '0.68rem', color: '#94a3b8', display: 'block' }}>سعر التاجر</span>
                            <span className="partner-currency" style={{
                              fontSize: '1.2rem',
                              fontWeight: 900,
                              color: '#10b981'
                            }}>
                              ${p.effectivePartnerPriceUsd.toFixed(2)}
                            </span>
                          </div>

                          {p.price > p.effectivePartnerPriceUsd && (
                            <div style={{ textAlign: 'left' }}>
                              <span style={{ fontSize: '0.68rem', color: '#64748b', display: 'block' }}>الأساسي</span>
                              <span className="partner-currency" style={{
                                fontSize: '0.85rem',
                                color: '#64748b',
                                textDecoration: 'line-through'
                              }}>
                                ${p.price.toFixed(2)}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Select Button */}
                        <button
                          type="button"
                          className={isSelected ? 'btn-partner-primary' : 'btn-partner-secondary'}
                          style={{ width: '100%', padding: '8px', fontSize: '0.85rem' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedProduct(p);
                          }}
                        >
                          {isSelected ? 'الباقة المحددة ✓' : 'تحديد الباقة'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Result Modal */}
      {orderResult && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 30000,
          padding: 16
        }}>
          <div className="partner-card" style={{
            maxWidth: 520,
            width: '100%',
            textAlign: 'center',
            padding: 24,
            background: '#0f172a',
            borderColor: orderResult.success ? '#10b981' : '#f43f5e'
          }}>
            {orderResult.success ? (
              <>
                <div style={{
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  background: 'rgba(16, 185, 129, 0.15)',
                  color: '#10b981',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 12px auto'
                }}>
                  <CheckCircle size={32} />
                </div>
                <h3 style={{ fontSize: '1.3rem', fontWeight: 900, color: '#fff', margin: '0 0 4px 0' }}>
                  تم تنفيذ الطلب بنجاح! 🎉
                </h3>
                <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: 16 }}>
                  تم خصم المبلغ من محفظتك وتأكيد العملية بنجاح.
                </p>

                {/* Summary Info */}
                <div style={{
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 10,
                  padding: 14,
                  textAlign: 'right',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  marginBottom: 16
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                    <span style={{ color: '#94a3b8' }}>رقم الطلب:</span>
                    <span className="partner-num" style={{ fontWeight: 800, color: '#fff' }}>
                      #{orderResult.orderNumber}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                    <span style={{ color: '#94a3b8' }}>المنتج:</span>
                    <span style={{ fontWeight: 800, color: '#fff' }}>{orderResult.productName}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                    <span style={{ color: '#94a3b8' }}>المبلغ المخصوم:</span>
                    <span className="partner-currency" style={{ fontWeight: 900, color: '#10b981' }}>
                      ${orderResult.amountUsd?.toFixed(2)} USD
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                    <span style={{ color: '#94a3b8' }}>الرصيد المتبقي:</span>
                    <span className="partner-currency" style={{ fontWeight: 900, color: '#38bdf8' }}>
                      ${orderResult.newBalance?.toFixed(2)} USD
                    </span>
                  </div>
                </div>

                {/* Delivered Digital Accounts Box (If any) */}
                {orderResult.deliveredAccounts && orderResult.deliveredAccounts.length > 0 && (
                  <div style={{
                    background: 'rgba(16, 185, 129, 0.08)',
                    border: '1px solid rgba(16, 185, 129, 0.25)',
                    borderRadius: 10,
                    padding: 14,
                    textAlign: 'right',
                    marginBottom: 16
                  }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 900, color: '#34d399', marginBottom: 10 }}>
                      بيانات الحسابات المسلمة ({orderResult.deliveredAccounts.length}):
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {orderResult.deliveredAccounts.map((acc, idx) => (
                        <div key={acc.id || idx} style={{
                          background: 'rgba(0, 0, 0, 0.3)',
                          padding: '10px 12px',
                          borderRadius: 8,
                          fontSize: '0.8rem'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <span style={{ color: '#94a3b8' }}>الحساب {idx + 1}:</span>
                            <button
                              onClick={() => handleCopy(`${acc.email} | ${acc.password}`, `acc-${idx}`)}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: copiedKey === `acc-${idx}` ? '#10b981' : '#cbd5e1',
                                cursor: 'pointer',
                                fontSize: '0.75rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4
                              }}
                            >
                              {copiedKey === `acc-${idx}` ? <Check size={13} /> : <Copy size={13} />}
                              <span>{copiedKey === `acc-${idx}` ? 'تم النسخ' : 'نسخ الحساب'}</span>
                            </button>
                          </div>
                          <div style={{ color: '#fff', fontFamily: 'monospace', direction: 'ltr', textAlign: 'left' }}>
                            <strong>Email:</strong> {acc.email}
                          </div>
                          <div style={{ color: '#fff', fontFamily: 'monospace', direction: 'ltr', textAlign: 'left' }}>
                            <strong>Password:</strong> {acc.password}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Issued Card Notification (If any) */}
                {orderResult.issuedCardLast4 && (
                  <div style={{
                    background: 'rgba(245, 158, 11, 0.1)',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                    borderRadius: 10,
                    padding: 14,
                    textAlign: 'right',
                    marginBottom: 16,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <div>
                      <div style={{ fontWeight: 800, color: '#fbbf24', fontSize: '0.88rem' }}>
                        تم تخصيص البطاقة •••• {orderResult.issuedCardLast4}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                        يمكنك الاطلاع على تفاصيل البطاقة المشفرة في تبويب البطاقات
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setOrderResult(null);
                        setActiveTab('cards');
                      }}
                      className="btn-partner-secondary"
                      style={{ padding: '6px 12px', fontSize: '0.78rem' }}
                    >
                      <ExternalLink size={14} />
                      <span>عرض البطاقة</span>
                    </button>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={handleNextOrder}
                    className="btn-partner-primary"
                    style={{ flex: 1 }}
                  >
                    <span>تنفيذ طلب جديد</span>
                    <ArrowRight size={16} />
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  background: 'rgba(244, 63, 94, 0.15)',
                  color: '#fb7185',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 12px auto'
                }}>
                  <AlertCircle size={32} />
                </div>
                <h3 style={{ fontSize: '1.3rem', fontWeight: 900, color: '#fff', margin: '0 0 6px 0' }}>
                  تعذر تنفيذ العملية
                </h3>
                <p style={{ color: '#fb7185', fontSize: '0.88rem', marginBottom: 20 }}>
                  {orderResult.error}
                </p>

                <button
                  onClick={() => setOrderResult(null)}
                  className="btn-partner-secondary"
                  style={{ width: '100%' }}
                >
                  إغلاق والمحاولة مجدداً
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
