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
  Flame
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
  gamesdropApiCode?: string;
  image?: string;
  minQuantity?: number;
  maxQuantity?: number;
}

export const PartnerQuickBuy: React.FC = () => {
  const { wallet, refreshProfile, partnerFetch } = usePartner();

  const [products, setProducts] = useState<PartnerProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedProduct, setSelectedProduct] = useState<PartnerProduct | null>(null);
  
  // Player ID
  const [playerId, setPlayerId] = useState('');
  const [playerIdTouched, setPlayerIdTouched] = useState(false);

  // Purchasing State
  const [purchasing, setPurchasing] = useState(false);
  const [orderResult, setOrderResult] = useState<{
    success: boolean;
    orderNumber?: string;
    productName?: string;
    amountUsd?: number;
    newBalance?: number;
    error?: string;
    autoRefunded?: boolean;
  } | null>(null);

  // Fetch Products
  const loadProducts = async () => {
    try {
      setLoading(true);
      const res = await partnerFetch<any>('/api/partner/products');
      const rawList = Array.isArray(res) ? res : (res?.products || []);

      const mappedList: PartnerProduct[] = rawList.map((p: any) => ({
        id: p.id,
        name: p.arabicName || p.offerName || p.productName || p.name || 'منتج',
        nameEn: p.productName || p.nameEn,
        category: p.categoryArabicName || p.categoryName || p.category || 'العاب',
        price: Number(p.retailPriceUsd ?? p.price ?? 0),
        effectivePartnerPriceUsd: Number(p.effectivePartnerPriceUsd ?? p.partnerPriceUsd ?? 0),
        hasCustomPrice: Boolean(p.hasCustomPrice),
        savingsPercent: Number(p.savingsPercent ?? 0),
        inStock: p.inStock !== false,
        gamesdropApiCode: p.gamesdropApiCode,
        image: p.categoryImageUrl || p.image,
        minQuantity: p.minQuantity,
        maxQuantity: p.maxQuantity
      }));

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

  // Execute Buy
  const executeBuy = async (productToBuy: PartnerProduct) => {
    if (!playerId.trim()) {
      setPlayerIdTouched(true);
      return;
    }

    const price = productToBuy.effectivePartnerPriceUsd;
    if (wallet && wallet.balance < price) {
      setOrderResult({
        success: false,
        error: `رصيد محفظتك الحالي ($${wallet.balance.toFixed(2)}) غير كافٍ لإتمام عملية الشحن ($${price.toFixed(2)}). يُرجى إيداع رصيد أولاً.`
      });
      return;
    }

    try {
      setPurchasing(true);
      setOrderResult(null);

      const res = await partnerFetch<{
        success: boolean;
        orderId?: string;
        order?: {
          id: string;
          orderNumber: string;
          productName: string;
          amountUsd: number;
          status: string;
        };
        newBalance: number;
        error?: string;
      }>('/api/partner/quick-buy', {
        method: 'POST',
        body: JSON.stringify({
          productId: productToBuy.id,
          playerId: playerId.trim()
        })
      });

      if (res && res.success) {
        setOrderResult({
          success: true,
          orderNumber: res.order?.orderNumber || (res.orderId ? String(res.orderId).slice(0, 8).toUpperCase() : 'OK'),
          productName: res.order?.productName || productToBuy.name,
          amountUsd: res.order?.amountUsd || productToBuy.effectivePartnerPriceUsd,
          newBalance: res.newBalance
        });
        // Refresh partner profile/balance in background
        refreshProfile();
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
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Zap size={24} color="#f59e0b" />
            <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900 }}>صالة الشحن الفوري (Quick Buy)</h2>
          </div>
          <p style={{ margin: '4px 0 0 0', color: '#94a3b8', fontSize: '0.88rem' }}>
            تنفيذ فوري مباشر عبر API المزود مع خصم مباشر من محفظتك الاستثمارية
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={loadProducts}
            className="btn-partner-secondary"
            title="تحديث قائمة الباقات والأسعار"
          >
            <RefreshCw size={16} className={loading ? 'spin-anim' : ''} />
            <span>تحديث الأسعار</span>
          </button>
        </div>
      </div>

      {/* Main Terminal Layout */}
      <div className="terminal-grid">
        {/* Left Column: Categories and Search */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Search Box */}
          <div className="partner-card" style={{ padding: 16 }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: 8,
              padding: '8px 12px'
            }}>
              <Search size={16} color="#94a3b8" />
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
                  fontSize: '0.88rem',
                  fontFamily: 'inherit'
                }}
              />
            </div>
          </div>

          {/* Categories Filter */}
          <div className="partner-card" style={{ padding: 16 }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#94a3b8', marginBottom: 10 }}>
              تصنيف الألعاب والخدمات
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button
                className={`game-sidebar-item ${selectedCategory === 'ALL' ? 'selected' : ''}`}
                onClick={() => setSelectedCategory('ALL')}
              >
                <Gamepad2 size={18} />
                <span>جميع الألعاب ({products.length})</span>
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  className={`game-sidebar-item ${selectedCategory === cat ? 'selected' : ''}`}
                  onClick={() => setSelectedCategory(cat)}
                >
                  <Flame size={18} />
                  <span>{cat}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Player ID Input & Packages Grid */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Player ID Input Banner */}
          <div className="partner-card" style={{
            background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.9))',
            borderColor: playerIdTouched && !playerId.trim() ? '#f43f5e' : 'rgba(245, 158, 11, 0.25)'
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ fontSize: '0.95rem', fontWeight: 900, color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>معرف اللاعب (Player ID)</span>
                  <span style={{ color: '#f59e0b' }}>*</span>
                </label>
                <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                  تأكد من إدخال الـ ID بدقة لتجنب الشحن لحساب خاطئ
                </span>
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <input
                  type="text"
                  placeholder="أدخل الـ Player ID هنا (مثال: 5123456789)..."
                  value={playerId}
                  onChange={(e) => {
                    setPlayerId(e.target.value);
                    if (playerIdTouched) setPlayerIdTouched(false);
                  }}
                  style={{
                    flex: 1,
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: 10,
                    padding: '14px 18px',
                    fontSize: '1.15rem',
                    color: '#38bdf8',
                    fontFamily: 'Outfit, monospace',
                    fontWeight: 700,
                    outline: 'none',
                    letterSpacing: '1px'
                  }}
                />
              </div>

              {playerIdTouched && !playerId.trim() && (
                <div style={{ color: '#fb7185', fontSize: '0.82rem', fontWeight: 800 }}>
                  يرجى إدخال معرف اللاعب أولاً قبل تنفيذ الشحن
                </div>
              )}
            </div>
          </div>

          {/* Packages List */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
              جاري تحميل الباقات والأسعار المخصصة...
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="partner-card" style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
              لم يتم العثور على أي باقات مطابقة للتصنيف أو البحث.
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 16
            }}>
              {filteredProducts.map((p) => {
                const isSelected = selectedProduct?.id === p.id;
                const canAfford = wallet ? wallet.balance >= p.effectivePartnerPriceUsd : false;

                return (
                  <div
                    key={p.id}
                    className={`package-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => setSelectedProduct(p)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div>
                      {/* Category & Savings Badge */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 700 }}>
                          {p.category || 'ألعاب'}
                        </span>
                        {p.savingsPercent > 0 && (
                          <span style={{
                            background: 'rgba(16, 185, 129, 0.15)',
                            color: '#34d399',
                            border: '1px solid rgba(16, 185, 129, 0.3)',
                            padding: '2px 8px',
                            borderRadius: 6,
                            fontSize: '0.75rem',
                            fontWeight: 900
                          }}>
                            توفير {p.savingsPercent}%
                          </span>
                        )}
                      </div>

                      {/* Product Name */}
                      <h4 style={{ margin: '0 0 12px 0', fontSize: '1.05rem', fontWeight: 900, color: '#fff' }}>
                        {p.name}
                      </h4>
                    </div>

                    <div>
                      {/* Price Section */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'baseline',
                        justifyContent: 'space-between',
                        padding: '10px 12px',
                        background: 'rgba(0, 0, 0, 0.25)',
                        borderRadius: 8,
                        marginBottom: 12
                      }}>
                        <div>
                          <span style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'block' }}>سعر التاجر</span>
                          <span style={{
                            fontSize: '1.35rem',
                            fontWeight: 900,
                            color: '#10b981',
                            fontFamily: 'Outfit, sans-serif'
                          }}>
                            ${p.effectivePartnerPriceUsd.toFixed(2)}
                          </span>
                        </div>

                        {p.price > p.effectivePartnerPriceUsd && (
                          <div style={{ textAlign: 'left' }}>
                            <span style={{ fontSize: '0.72rem', color: '#64748b', display: 'block' }}>السعر الأساسي</span>
                            <span style={{
                              fontSize: '0.95rem',
                              color: '#64748b',
                              textDecoration: 'line-through',
                              fontFamily: 'Outfit, sans-serif'
                            }}>
                              ${p.price.toFixed(2)}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Buy Action Button */}
                      <button
                        type="button"
                        disabled={purchasing || !canAfford}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedProduct(p);
                          executeBuy(p);
                        }}
                        className="btn-partner-primary"
                        style={{
                          width: '100%',
                          fontSize: '0.9rem',
                          padding: '10px',
                          background: canAfford ? undefined : '#334155',
                          color: canAfford ? undefined : '#94a3b8',
                          boxShadow: canAfford ? undefined : 'none'
                        }}
                      >
                        {purchasing && selectedProduct?.id === p.id ? (
                          <>
                            <RefreshCw size={16} className="spin-anim" />
                            <span>جاري الشحن الفوري...</span>
                          </>
                        ) : !canAfford ? (
                          <span>الرصيد غير كافٍ</span>
                        ) : (
                          <>
                            <Zap size={16} />
                            <span>شحن بضغطة واحدة (${p.effectivePartnerPriceUsd.toFixed(2)})</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Result Modal */}
      {orderResult && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 30000,
          padding: 16
        }}>
          <div className="partner-card" style={{
            maxWidth: 480,
            width: '100%',
            textAlign: 'center',
            padding: 32,
            background: '#0f172a',
            borderColor: orderResult.success ? '#10b981' : '#f43f5e'
          }}>
            {orderResult.success ? (
              <>
                <div style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  background: 'rgba(16, 185, 129, 0.15)',
                  color: '#10b981',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px auto'
                }}>
                  <CheckCircle size={36} />
                </div>
                <h3 style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fff', margin: '0 0 6px 0' }}>
                  تم تنفيذ الشحن بنجاح!
                </h3>
                <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: 20 }}>
                  تم إرسال الشحنة إلى حساب اللاعب فورياً وتحديث رصيد محفظتك.
                </p>

                <div style={{
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 10,
                  padding: 16,
                  textAlign: 'right',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  marginBottom: 24
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span style={{ color: '#94a3b8' }}>رقم الطلب:</span>
                    <span style={{ fontWeight: 800, color: '#fff', fontFamily: 'Outfit, monospace' }}>
                      #{orderResult.orderNumber}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span style={{ color: '#94a3b8' }}>الباقة:</span>
                    <span style={{ fontWeight: 800, color: '#fff' }}>{orderResult.productName}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span style={{ color: '#94a3b8' }}>المبلغ المخصوم:</span>
                    <span style={{ fontWeight: 900, color: '#10b981', fontFamily: 'Outfit, sans-serif' }}>
                      ${orderResult.amountUsd?.toFixed(2)} USD
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span style={{ color: '#94a3b8' }}>الرصيد المتبقي:</span>
                    <span style={{ fontWeight: 900, color: '#38bdf8', fontFamily: 'Outfit, sans-serif' }}>
                      ${orderResult.newBalance?.toFixed(2)} USD
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 12 }}>
                  <button
                    onClick={handleNextOrder}
                    className="btn-partner-primary"
                    style={{ flex: 1 }}
                  >
                    <span>تنفيذ طلب جديد</span>
                    <ArrowRight size={18} />
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  background: 'rgba(244, 63, 94, 0.15)',
                  color: '#fb7185',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px auto'
                }}>
                  <AlertCircle size={36} />
                </div>
                <h3 style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fff', margin: '0 0 6px 0' }}>
                  تعذر تنفيذ الشحن
                </h3>
                <p style={{ color: '#fb7185', fontSize: '0.9rem', marginBottom: 20 }}>
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
