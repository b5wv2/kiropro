import React, { useState, useEffect } from 'react';
import {
  marketplaceApi,
  AccountListing,
  MarketplaceFilterParams,
  GameCategoryInfo,
  MarketplaceSettings
} from '../../services/marketplaceApi';
import { useAuth } from '../../context/AuthContext';
import {
  Store,
  PlusCircle,
  ListFilter,
  Gamepad2,
  Flame,
  Search,
  RotateCcw,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Eye,
  Camera,
  Layers
} from 'lucide-react';
import styles from './Marketplace.module.css';

interface MarketplaceHomePageProps {
  initialGame?: 'PUBG_MOBILE' | 'FREE_FIRE';
  onNavigateDetail?: (code: string) => void;
  onNavigateCreate?: () => void;
  onNavigateMyListings?: () => void;
}

export const MarketplaceHomePage: React.FC<MarketplaceHomePageProps> = ({
  initialGame,
  onNavigateDetail,
  onNavigateCreate,
  onNavigateMyListings
}) => {
  const { isAuthenticated, navigateTo } = useAuth();

  const [listings, setListings] = useState<AccountListing[]>([]);
  const [games, setGames] = useState<GameCategoryInfo[]>([]);
  const [settings, setSettings] = useState<MarketplaceSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters state
  const [selectedGame, setSelectedGame] = useState<string>(initialGame || 'ALL');
  const [selectedLevel, setSelectedLevel] = useState<string>('');
  const [selectedBinding, setSelectedBinding] = useState<string>('');
  const [minPrice, setMinPrice] = useState<string>('');
  const [maxPrice, setMaxPrice] = useState<string>('');
  const [negotiableOnly, setNegotiableOnly] = useState<boolean>(false);
  const [sort, setSort] = useState<'LATEST' | 'PRICE_ASC' | 'PRICE_DESC' | 'LEVEL_DESC'>('LATEST');
  const [search, setSearch] = useState<string>('');

  // Pagination
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);

  // Show filter drawer on mobile
  const [showFilters, setShowFilters] = useState(false);

  // Load Settings & Games once
  useEffect(() => {
    let mounted = true;
    marketplaceApi.getSettings()
      .then(res => {
        if (mounted) {
          setSettings(res.settings);
          setGames(res.games);
        }
      })
      .catch(err => {
        console.warn('Failed to load marketplace settings:', err);
      });
    return () => { mounted = false; };
  }, []);

  // Fetch listings on filter change
  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);

    const params: MarketplaceFilterParams = {
      page: currentPage,
      limit: 12,
      sort,
      ...(selectedGame !== 'ALL' ? { game: selectedGame } : {}),
      ...(selectedLevel ? { level: selectedLevel } : {}),
      ...(selectedBinding ? { binding: selectedBinding } : {}),
      ...(minPrice ? { minPrice: parseFloat(minPrice) } : {}),
      ...(maxPrice ? { maxPrice: parseFloat(maxPrice) } : {}),
      ...(negotiableOnly ? { negotiable: true } : {}),
      ...(search.trim() ? { search: search.trim() } : {})
    };

    marketplaceApi.getListings(params)
      .then(res => {
        if (mounted) {
          setListings(res.listings);
          setTotalPages(res.pagination.totalPages || 1);
          setTotalCount(res.pagination.total || 0);
          setLoading(false);
        }
      })
      .catch(err => {
        if (mounted) {
          setError(err.message || 'فشل جلب الإعلانات.');
          setLoading(false);
        }
      });

    return () => { mounted = false; };
  }, [selectedGame, selectedLevel, selectedBinding, minPrice, maxPrice, negotiableOnly, sort, search, currentPage]);

  const handleResetFilters = () => {
    setSelectedGame('ALL');
    setSelectedLevel('');
    setSelectedBinding('');
    setMinPrice('');
    setMaxPrice('');
    setNegotiableOnly(false);
    setSort('LATEST');
    setSearch('');
    setCurrentPage(1);
  };

  const handleListingClick = (code: string) => {
    if (onNavigateDetail) {
      onNavigateDetail(code);
    } else {
      window.history.pushState({}, '', `/marketplace/${code}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  const handleCreateClick = () => {
    if (!isAuthenticated) {
      navigateTo('login');
      return;
    }
    if (onNavigateCreate) {
      onNavigateCreate();
    } else {
      window.history.pushState({}, '', '/marketplace/create');
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  const handleMyListingsClick = () => {
    if (!isAuthenticated) {
      navigateTo('login');
      return;
    }
    if (onNavigateMyListings) {
      onNavigateMyListings();
    } else {
      window.history.pushState({}, '', '/marketplace/my-ads');
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  const activeBindings = selectedGame === 'PUBG_MOBILE'
    ? games.find(g => g.id === 'PUBG_MOBILE')?.bindings || []
    : selectedGame === 'FREE_FIRE'
      ? games.find(g => g.id === 'FREE_FIRE')?.bindings || []
      : Array.from(new Set(games.flatMap(g => g.bindings)));

  const activeLevels = games[0]?.levels || ['1-20', '21-40', '41-60', '61-80', '81-100', '100+'];

  return (
    <div className={styles.pageContainer}>
      {/* Marketplace Header */}
      <div className={styles.marketHeader}>
        <div className={styles.headerMain}>
          <div className={styles.headerTitleRow}>
            <h1 className={styles.headerTitle}>
              <Store size={32} color="#F59E0B" />
              <span>سوق الحسابات</span>
            </h1>
            <span className={styles.headerBadge}>KIRO MARKET</span>
          </div>
          <p className={styles.headerSubtitle}>
            سوق منظم وموثوق لعرض وشراء حسابات ببجي وفري فاير بأعلى درجات الخصوصية والأمان.
          </p>
        </div>

        <div className={styles.headerActions}>
          {isAuthenticated && (
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={handleMyListingsClick}
            >
              <Layers size={18} />
              <span>إعلاناتي</span>
            </button>
          )}

          <button
            type="button"
            className={styles.primaryBtn}
            onClick={handleCreateClick}
          >
            <PlusCircle size={20} />
            <span>عرض حساب للبيع</span>
          </button>
        </div>
      </div>

      {/* Game Tabs */}
      <div className={styles.categoryTabs}>
        <button
          type="button"
          className={`${styles.catTab} ${selectedGame === 'ALL' ? styles.catTabActive : ''}`}
          onClick={() => { setSelectedGame('ALL'); setCurrentPage(1); }}
        >
          <Store size={18} />
          <span>جميع الألعاب</span>
        </button>

        <button
          type="button"
          className={`${styles.catTab} ${selectedGame === 'PUBG_MOBILE' ? styles.catTabActive : ''}`}
          onClick={() => { setSelectedGame('PUBG_MOBILE'); setCurrentPage(1); }}
        >
          <Gamepad2 size={18} color="#F59E0B" />
          <span>ببجي موبايل (PUBG Mobile)</span>
        </button>

        <button
          type="button"
          className={`${styles.catTab} ${selectedGame === 'FREE_FIRE' ? styles.catTabActive : ''}`}
          onClick={() => { setSelectedGame('FREE_FIRE'); setCurrentPage(1); }}
        >
          <Flame size={18} color="#EF4444" />
          <span>فري فاير (Free Fire)</span>
        </button>

        <button
          type="button"
          className={styles.secondaryBtn}
          style={{ marginRight: 'auto', padding: '8px 14px' }}
          onClick={() => setShowFilters(!showFilters)}
        >
          <SlidersHorizontal size={16} />
          <span>{showFilters ? 'إخفاء الفلاتر' : 'تصفية وبحث'}</span>
        </button>
      </div>

      {/* Filter Bar */}
      {showFilters && (
        <div className={styles.filterBar}>
          <div className={styles.filterRow}>
            {/* Search Input */}
            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>بحث بالاسم أو الكود</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  placeholder="مثال: مثك كونكر، KPR-PUB..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
                  className={styles.filterInput}
                  style={{ width: '100%', paddingLeft: 32 }}
                />
                <Search size={16} style={{ position: 'absolute', left: 10, top: 12, color: '#6B7280' }} />
              </div>
            </div>

            {/* Level Filter */}
            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>مستوى الحساب</label>
              <select
                value={selectedLevel}
                onChange={(e) => { setSelectedLevel(e.target.value); setCurrentPage(1); }}
                className={styles.filterSelect}
              >
                <option value="">جميع المستويات</option>
                {activeLevels.map(lvl => (
                  <option key={lvl} value={lvl}>{lvl}</option>
                ))}
              </select>
            </div>

            {/* Binding Filter */}
            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>نوع الربط</label>
              <select
                value={selectedBinding}
                onChange={(e) => { setSelectedBinding(e.target.value); setCurrentPage(1); }}
                className={styles.filterSelect}
              >
                <option value="">جميع أنواع الربط</option>
                {activeBindings.map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>

            {/* Min Price */}
            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>السعر من (SDG)</label>
              <input
                type="number"
                placeholder="0"
                value={minPrice}
                onChange={(e) => { setMinPrice(e.target.value); setCurrentPage(1); }}
                className={styles.filterInput}
              />
            </div>

            {/* Max Price */}
            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>السعر إلى (SDG)</label>
              <input
                type="number"
                placeholder="أعلى سعر"
                value={maxPrice}
                onChange={(e) => { setMaxPrice(e.target.value); setCurrentPage(1); }}
                className={styles.filterInput}
              />
            </div>

            {/* Sorting */}
            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>الترتيب حسب</label>
              <select
                value={sort}
                onChange={(e) => { setSort(e.target.value as any); setCurrentPage(1); }}
                className={styles.filterSelect}
              >
                <option value="LATEST">الأحدث أولاً</option>
                <option value="PRICE_ASC">الأقل سعراً</option>
                <option value="PRICE_DESC">الأعلى سعراً</option>
                <option value="LEVEL_DESC">الأعلى مستوى</option>
              </select>
            </div>
          </div>

          <div className={styles.filterActions}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={negotiableOnly}
                onChange={(e) => { setNegotiableOnly(e.target.checked); setCurrentPage(1); }}
                style={{ accentColor: '#F59E0B' }}
              />
              <span>قابل للتفاوض فقط</span>
            </label>

            <button
              type="button"
              className={styles.secondaryBtn}
              style={{ padding: '6px 14px', fontSize: '0.85rem' }}
              onClick={handleResetFilters}
            >
              <RotateCcw size={14} />
              <span>إعادة ضبط الفلاتر</span>
            </button>
          </div>
        </div>
      )}

      {/* Results Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: '0.9rem', color: '#9CA3AF', fontWeight: 700 }}>
          <span>نتائج البحث: </span>
          <span style={{ color: '#F59E0B' }}>{totalCount} إعلان</span>
        </div>
      </div>

      {/* Listings Grid / Loader / Error */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9CA3AF' }}>
          <div className="spinner" style={{ margin: '0 auto 16px' }} />
          <p>جارٍ تحميل الإعلانات من السوق...</p>
        </div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#EF4444' }}>
          <p>{error}</p>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={() => handleResetFilters()}
            style={{ margin: '12px auto' }}
          >
            إعادة المحاولة
          </button>
        </div>
      ) : listings.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '80px 20px',
          background: '#111827',
          borderRadius: 16,
          border: '1px solid #1F2937'
        }}>
          <Store size={48} color="#6B7280" style={{ margin: '0 auto 16px' }} />
          <h3 style={{ color: '#F9FAFB', fontSize: '1.25rem', marginBottom: 8 }}>لا توجد حسابات معروضة حالياً</h3>
          <p style={{ color: '#9CA3AF', maxWidth: 460, margin: '0 auto 20px', fontSize: '0.95rem' }}>
            لم يتم العثور على إعلانات تطابق خيارات التصفية المحددة. كن أول من يعرض حسابه للبيع في السوق!
          </p>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={handleCreateClick}
          >
            <PlusCircle size={20} />
            <span>عرض حسابك للبيع الآن</span>
          </button>
        </div>
      ) : (
        <div className={styles.listingsGrid}>
          {listings.map(item => {
            const isPubg = item.game === 'PUBG_MOBILE';
            const gameName = isPubg ? 'ببجي موبايل' : 'فري فاير';
            const primaryImg = item.primary_image || (isPubg
              ? 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=800&q=80'
              : 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?auto=format&fit=crop&w=800&q=80'
            );

            return (
              <div
                key={item.id}
                className={styles.adCard}
                onClick={() => handleListingClick(item.public_code)}
              >
                {/* Image Cover */}
                <div className={styles.adImageContainer}>
                  <img
                    src={primaryImg}
                    alt={item.title}
                    className={styles.adImage}
                    loading="lazy"
                  />
                  <span className={styles.adCodeBadge}>{item.public_code}</span>
                  <span className={styles.adGameBadge}>{gameName}</span>
                  {item.total_images > 1 && (
                    <span className={styles.adPhotoCount}>
                      <Camera size={12} />
                      <span>{item.total_images}</span>
                    </span>
                  )}
                </div>

                {/* Card Body */}
                <div className={styles.adBody}>
                  <h3 className={styles.adTitle}>{item.title}</h3>

                  <div className={styles.adBadgesRow}>
                    <span className={`${styles.metaBadge} ${styles.levelBadge}`}>
                      المستوى: {item.account_level}
                    </span>
                    <span className={`${styles.metaBadge} ${styles.bindingBadge}`}>
                      ربط: {item.binding_type}
                    </span>
                  </div>

                  <div className={styles.adPriceRow}>
                    <div>
                      <span className={styles.adPrice}>{Number(item.price).toLocaleString()}</span>
                      <span className={styles.adCurrency}>SDG</span>
                    </div>

                    {item.is_negotiable && (
                      <span className={styles.negotiableTag}>قابل للتفاوض</span>
                    )}
                  </div>

                  <button
                    type="button"
                    className={styles.viewAdBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleListingClick(item.public_code);
                    }}
                  >
                    <Eye size={16} />
                    <span>عرض الحساب</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 36 }}>
          <button
            type="button"
            className={styles.secondaryBtn}
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            style={{ opacity: currentPage <= 1 ? 0.4 : 1, cursor: currentPage <= 1 ? 'not-allowed' : 'pointer' }}
          >
            <ChevronRight size={18} />
            <span>السابق</span>
          </button>

          <span style={{ color: '#9CA3AF', fontSize: '0.9rem', fontWeight: 800 }}>
            صفحة {currentPage} من {totalPages}
          </span>

          <button
            type="button"
            className={styles.secondaryBtn}
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            style={{ opacity: currentPage >= totalPages ? 0.4 : 1, cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer' }}
          >
            <span>التالي</span>
            <ChevronLeft size={18} />
          </button>
        </div>
      )}

      {/* Safety & Non-guarantee Disclaimer Box */}
      <div className={styles.disclaimerBox} style={{ marginTop: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#F59E0B', fontWeight: 800, marginBottom: 4 }}>
          <ShieldCheck size={18} />
          <span>تنبيه وإخلاء مسؤولية حول سوق الحسابات</span>
        </div>
        <p style={{ margin: 0 }}>
          رسوم النشر هي رسوم لإتاحة عرض الإعلان في السوق لفترة محددة (15 أو 30 يوماً)، ولا تعني ضمان بيع الحساب.
          يتم استقبال كافة استفسارات الشراء مباشرة عبر إدارة منصة KIROPRO الرسمية.
        </p>
      </div>
    </div>
  );
};
