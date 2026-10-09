import React, { useState, useEffect } from 'react';
import {
  marketplaceApi,
  AccountListing,
  MarketplaceFilterParams,
  GameCategoryInfo
} from '../../services/marketplaceApi';
import { useAuth } from '../../context/AuthContext';
import {
  Store,
  PlusCircle,
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
  Layers,
  X
} from 'lucide-react';
import styles from './Marketplace.module.css';
import { getMarketplaceImageUrl } from '../../utils/imageUrl';

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

  // Filter drawer/sheet
  const [showFilters, setShowFilters] = useState(false);

  // Sync initialGame if changed by navigation
  useEffect(() => {
    if (initialGame) {
      setSelectedGame(initialGame);
      setCurrentPage(1);
    }
  }, [initialGame]);

  // Load Settings & Games once
  useEffect(() => {
    let mounted = true;
    marketplaceApi.getSettings()
      .then(res => {
        if (mounted) {
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
          setError(err.message || 'تعذر تحميل الإعلانات حالياً.');
          setLoading(false);
        }
      });

    return () => { mounted = false; };
  }, [selectedGame, selectedLevel, selectedBinding, minPrice, maxPrice, negotiableOnly, sort, search, currentPage]);

  const hasActiveFilters = Boolean(
    (selectedGame !== 'ALL' && !initialGame) ||
    selectedLevel ||
    selectedBinding ||
    minPrice ||
    maxPrice ||
    negotiableOnly ||
    search.trim() ||
    sort !== 'LATEST'
  );

  const handleResetFilters = () => {
    setSelectedGame(initialGame || 'ALL');
    setSelectedLevel('');
    setSelectedBinding('');
    setMinPrice('');
    setMaxPrice('');
    setNegotiableOnly(false);
    setSort('LATEST');
    setSearch('');
    setCurrentPage(1);
    setShowFilters(false);
  };

  const handleGameSelect = (gameId: string) => {
    setSelectedGame(gameId);
    setCurrentPage(1);
    const newPath = gameId === 'PUBG_MOBILE' ? '/marketplace/pubg' : gameId === 'FREE_FIRE' ? '/marketplace/freefire' : '/marketplace';
    window.history.replaceState(null, '', newPath);
  };

  const handleListingClick = (code: string) => {
    if (onNavigateDetail) {
      onNavigateDetail(code);
    } else {
      window.history.pushState({}, '', `/marketplace/listing/${code}`);
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
      window.history.pushState({}, '', '/marketplace/my-listings');
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
      {/* Hero Section */}
      <div className={styles.marketHeader}>
        <div className={styles.headerMain}>
          <div className={styles.headerTitleRow}>
            <div className={styles.heroIconBox}>
              <Store size={26} color="#F59E0B" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h1 className={styles.headerTitle}>سوق الحسابات</h1>
                <span className={styles.headerBadge}>KIRO MARKET</span>
              </div>
              <p className={styles.headerSubtitle}>
                سوق منظم وموثوق لعرض وشراء حسابات ببجي وفري فاير بأعلى درجات الخصوصية والأمان.
              </p>
            </div>
          </div>
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
            <PlusCircle size={18} />
            <span>عرض حساب للبيع</span>
          </button>
        </div>
      </div>

      {/* Game Tabs & Filters Control */}
      <div className={styles.categoryTabsContainer}>
        <div className={styles.categoryTabs}>
          <button
            type="button"
            className={`${styles.catTab} ${selectedGame === 'ALL' ? styles.catTabActive : ''}`}
            onClick={() => handleGameSelect('ALL')}
          >
            <Store size={18} />
            <span>جميع الألعاب</span>
          </button>

          <button
            type="button"
            className={`${styles.catTab} ${selectedGame === 'PUBG_MOBILE' ? styles.catTabActive : ''}`}
            onClick={() => handleGameSelect('PUBG_MOBILE')}
          >
            <Gamepad2 size={18} color="#F59E0B" />
            <span>ببجي موبايل</span>
          </button>

          <button
            type="button"
            className={`${styles.catTab} ${selectedGame === 'FREE_FIRE' ? styles.catTabActive : ''}`}
            onClick={() => handleGameSelect('FREE_FIRE')}
          >
            <Flame size={18} color="#EF4444" />
            <span>فري فاير</span>
          </button>
        </div>

        <button
          type="button"
          className={`${styles.filterToggleBtn} ${hasActiveFilters ? styles.filterToggleActive : ''}`}
          onClick={() => setShowFilters(prev => !prev)}
        >
          <SlidersHorizontal size={16} />
          <span>تصفية وبحث</span>
          {hasActiveFilters && <span className={styles.filterDot} />}
        </button>
      </div>

      {/* Filter Modal / Bottom Sheet for Mobile & Responsive Inline for Desktop */}
      {showFilters && (
        <div className={styles.filterSheetBackdrop} onClick={() => setShowFilters(false)}>
          <div className={styles.filterSheetContainer} onClick={(e) => e.stopPropagation()}>
            <div className={styles.filterSheetHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <SlidersHorizontal size={18} color="#F59E0B" />
                <h3 className={styles.filterSheetTitle}>تصفية وتخصيص البحث</h3>
              </div>
              <button
                type="button"
                className={styles.filterSheetClose}
                onClick={() => setShowFilters(false)}
                aria-label="إغلاق الفلاتر"
              >
                <X size={20} />
              </button>
            </div>

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

              <div style={{ display: 'flex', gap: 10, width: '100%', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={handleResetFilters}
                  style={{ flex: '1 1 140px' }}
                >
                  <RotateCcw size={16} />
                  <span>إعادة ضبط الفلاتر</span>
                </button>

                <button
                  type="button"
                  className={styles.primaryBtn}
                  onClick={() => setShowFilters(false)}
                  style={{ flex: '1 1 140px' }}
                >
                  <span>تطبيق الفلاتر</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Results Count Bar */}
      <div className={styles.resultsBar}>
        <div className={styles.resultsCountBox}>
          <span className={styles.resultsLabel}>نتائج البحث:</span>
          <span className={styles.resultsBadge}>{totalCount} إعلان</span>
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            className={styles.resetQuickBtn}
            onClick={handleResetFilters}
          >
            <RotateCcw size={14} />
            <span>إعادة ضبط الفلاتر</span>
          </button>
        )}
      </div>

      {/* Listings Grid / Loader / Error */}
      {loading ? (
        <div className={styles.listingsGrid}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={styles.skeletonCard}>
              <div className={styles.skeletonImage} />
              <div className={styles.skeletonBody}>
                <div className={styles.skeletonLine} style={{ width: '40%' }} />
                <div className={styles.skeletonLine} style={{ width: '85%' }} />
                <div className={styles.skeletonLine} style={{ width: '60%' }} />
                <div className={styles.skeletonFooter} />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className={styles.emptyStateContainer} style={{ borderColor: 'rgba(239, 68, 68, 0.4)' }}>
          <div className={styles.emptyIconCircle} style={{ background: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.3)' }}>
            <RotateCcw size={36} color="#EF4444" />
          </div>
          <h3 className={styles.emptyTitle} style={{ color: '#F87171' }}>{error}</h3>
          <p className={styles.emptyDesc}>
            حدث خطأ أثناء محاولة الاتصال بالخادم وجلب الإعلانات. يرجى المحاولة مرة أخرى.
          </p>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={() => handleResetFilters()}
          >
            <span>إعادة المحاولة</span>
          </button>
        </div>
      ) : listings.length === 0 ? (
        <div className={styles.emptyStateContainer}>
          <div className={styles.emptyIconCircle}>
            <Store size={44} color="#F59E0B" />
          </div>
          <h3 className={styles.emptyTitle}>لا توجد إعلانات متاحة حالياً</h3>
          <p className={styles.emptyDesc}>
            {hasActiveFilters
              ? 'لم نعثر على حسابات تطابق خيارات التصفية والبحث الحالية. يمكنك إعادة ضبط الفلاتر لعرض كافة الإعلانات المتوفرة.'
              : 'لا توجد حسابات معروضة للبيع في هذا القسم حالياً. كن أول من يعرض حسابه ويصل لآلاف المشترين!'}
          </p>
          <div className={styles.emptyActions}>
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={handleCreateClick}
            >
              <PlusCircle size={18} />
              <span>اعرض حسابك للبيع</span>
            </button>
            {hasActiveFilters && (
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={handleResetFilters}
              >
                <RotateCcw size={16} />
                <span>إعادة ضبط الفلاتر</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className={styles.listingsGrid}>
          {listings.map(item => {
            const isPubg = item.game === 'PUBG_MOBILE';
            const gameName = isPubg ? 'ببجي موبايل' : 'فري فاير';
            const defaultFallback = isPubg
              ? 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=800&q=80'
              : 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?auto=format&fit=crop&w=800&q=80';
            const primaryImg = item.primary_image ? getMarketplaceImageUrl(item.primary_image) : defaultFallback;

            return (
              <div
                key={item.id}
                className={styles.adCard}
                onClick={() => handleListingClick(item.public_code)}
                role="button"
                tabIndex={0}
              >
                {/* Image Cover */}
                <div className={styles.adImageContainer}>
                  <img
                    src={primaryImg}
                    alt={item.title}
                    className={styles.adImage}
                    loading="lazy"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).src = defaultFallback; }}
                  />
                  <span className={styles.adCodeBadge}>{item.public_code}</span>
                  <span className={styles.adGameBadge}>
                    {isPubg ? <Gamepad2 size={13} /> : <Flame size={13} />}
                    <span>{gameName}</span>
                  </span>
                  {item.total_images > 1 && (
                    <span className={styles.adPhotoCount}>
                      <Camera size={12} />
                      <span>{item.total_images}</span>
                    </span>
                  )}
                </div>

                {/* Card Body */}
                <div className={styles.adBody}>
                  <div className={styles.adBadgesRow}>
                    <span className={`${styles.metaBadge} ${styles.levelBadge}`}>
                      المستوى: {item.account_level}
                    </span>
                    <span className={`${styles.metaBadge} ${styles.bindingBadge}`}>
                      ربط: {item.binding_type}
                    </span>
                  </div>

                  <h3 className={styles.adTitle} title={item.title}>{item.title}</h3>

                  <div className={styles.adPriceRow}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
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
        <div className={styles.paginationRow}>
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

          <span className={styles.pageInfoText}>
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
