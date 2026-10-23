import React, { useState, useEffect, useMemo } from 'react';
import styles from './CategoryPage.module.css';
import { Game } from '../../types';
import { fetchGames } from '../../services/api';
import { GameCard } from '../../components/GameCard/GameCard';
import { QuickTopUpModal } from '../../components/Modal/QuickTopUpModal';
import { Search, X, ArrowRight, ShieldCheck } from 'lucide-react';

export interface CategoryPageProps {
  categoryId?: string;
  onNavigateHome?: () => void;
}

export interface CategoryMeta {
  id: string;
  name: string;
  icon: string;
  badge: string;
  description: string;
}

export const CATEGORY_DEFINITIONS: Record<string, CategoryMeta> = {
  'game-topup': {
    id: 'game-topup',
    name: 'شحن الألعاب عبر ID',
    icon: '🎮',
    badge: 'تسليم فوري بالـ ID',
    description: 'شحن فوري ومباشر لشدات ببجي موبايل، جواهر فري فاير، وذهب بلود سترايك عبر معرّف اللاعب بسرعة وأمان.'
  },
  'vouchers': {
    id: 'vouchers',
    name: 'قسائم الشحن وبطاقات الهدايا',
    icon: '🎟️',
    badge: 'أكواد رقمية فورية',
    description: 'بطاقات وقسائم رقمية رسمية تشمل بطاقات شدات ببجي وقسائم فري فاير وبطاقات الهدايا مع استلام الكود فوراً.'
  },
  'payment-cards': {
    id: 'payment-cards',
    name: 'بطاقات الدفع الإلكتروني',
    icon: '💳',
    badge: 'Mastercard دولية موثوقة',
    description: 'بطاقات KIROPRO ماستركارد الافتراضية للتسوق والاشتراكات الدولية بأمان وبأرصدة متنوعة تناسب احتياجاتك.'
  },
  'social-media': {
    id: 'social-media',
    name: 'منصات التواصل الاجتماعي',
    icon: '📱',
    badge: 'خدمات معتمدة ومباشرة',
    description: 'شحن ماسات لايكي الفورية، نجوم تيليجرام، والخدمات الرقمية لمنصات التواصل بأعلى معايير السرعة والموثوقية.'
  },
  'subscriptions': {
    id: 'subscriptions',
    name: 'الاشتراكات والخدمات الرقمية',
    icon: '⚡',
    badge: 'تفعيل رسمي مباشر',
    description: 'اشتراكات تيليجرام بريميوم الرسمية، حسابات نقاط Google المعتمدة، والخدمات الرقمية الآمنة.'
  }
};

export const CategoryPage: React.FC<CategoryPageProps> = ({ categoryId: propCategoryId, onNavigateHome }) => {
  // Extract categoryId from prop or window location
  const categoryId = useMemo(() => {
    if (propCategoryId) return propCategoryId;
    if (typeof window !== 'undefined') {
      const match = window.location.pathname.match(/\/category\/([^/?#]+)/);
      if (match && match[1]) return match[1];
    }
    return 'game-topup';
  }, [propCategoryId]);

  const categoryMeta: CategoryMeta = useMemo(() => {
    return (
      CATEGORY_DEFINITIONS[categoryId] || {
        id: categoryId,
        name: 'منتجات وخدمات الفئة',
        icon: '✨',
        badge: 'خدمات فورية',
        description: 'تصفح جميع المنتجات والباقات المتوفرة ضمن هذه الفئة مع تنفيذ فوري من رصيد محفظتك.'
      }
    );
  }, [categoryId]);

  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedGameForModal, setSelectedGameForModal] = useState<Game | null>(null);

  // Fetch games catalog on mount with deduplication and caching
  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    fetchGames()
      .then((data) => {
        if (isMounted) {
          if (Array.isArray(data)) {
            setGames(data);
            setError(null);
          } else {
            setGames([]);
            setError('تعذر قراءة قائمة المنتجات من الخادم.');
          }
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error('[CategoryPage] Failed to fetch games:', err);
          setGames([]);
          setError(err?.message || 'تعذر تحميل المنتجات');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Filter products by selected category
  const categoryProducts = useMemo(() => {
    const list = Array.isArray(games) ? games : [];
    switch (categoryId) {
      case 'game-topup':
        return list.filter(
          (g) =>
            (g.id === 'pubg-mobile' ||
              g.id === 'freefire-me' ||
              g.id.startsWith('blood-strike') ||
              g.category === 'games') &&
            !g.id.includes('voucher') &&
            g.id !== 'kiropro-card'
        );

      case 'vouchers':
        return list.filter(
          (g) =>
            g.id === 'freefire-vouchers' ||
            g.id === 'pubg-vouchers' ||
            g.id.includes('voucher') ||
            g.id.includes('gift') ||
            (g.category as string) === 'vouchers'
        );

      case 'payment-cards':
        return list.filter(
          (g) =>
            g.id === 'kiropro-card' ||
            g.type.toLowerCase().includes('card') ||
            (g.category as string) === 'cards' ||
            (g.packages && g.packages.some((p) => p.cardNetwork || p.productType === 'VIRTUAL_CARD'))
        );

      case 'social-media':
        return list.filter(
          (g) =>
            g.id === 'likee' ||
            g.id === 'telegram-stars' ||
            g.category === 'apps' ||
            (g.category as string) === 'social'
        );

      case 'subscriptions':
        return list.filter(
          (g) =>
            g.id === 'telegram-premium' ||
            g.id === 'google-play-points' ||
            g.category === 'subscriptions' ||
            g.category === 'digital'
        );

      default:
        return list.filter((g) => (g.category as string) === categoryId || g.id === categoryId);
    }
  }, [games, categoryId]);

  // Filter products by search query
  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return categoryProducts;
    const q = searchQuery.toLowerCase().trim();
    return categoryProducts.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        (g.type && g.type.toLowerCase().includes(q)) ||
        g.id.toLowerCase().includes(q)
    );
  }, [categoryProducts, searchQuery]);

  const handleNavigateHome = () => {
    if (onNavigateHome) {
      onNavigateHome();
    } else if (typeof window !== 'undefined') {
      window.history.pushState(null, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <div className={styles.categoryPage}>
      <div className="container">
        {/* Navigation / Breadcrumbs */}
        <div className={styles.topNavigation}>
          <nav className={styles.breadcrumbs} aria-label="مسار التنقل">
            <button
              type="button"
              onClick={handleNavigateHome}
              className={styles.breadcrumbLink}
            >
              الرئيسية
            </button>
            <span className={styles.breadcrumbSep}>/</span>
            <span className={styles.breadcrumbCurrent}>{categoryMeta.name}</span>
          </nav>

          <button
            type="button"
            onClick={handleNavigateHome}
            className={styles.backBtn}
          >
            <ArrowRight size={16} />
            <span>العودة لجميع الفئات</span>
          </button>
        </div>

        {/* Category Header Card */}
        <div className={styles.headerCard}>
          <div className={styles.headerGlow} />
          <div className={styles.headerContent}>
            <div className={styles.headerInfo}>
              <div className={styles.categoryBadge}>
                <ShieldCheck size={14} />
                <span>{categoryMeta.badge}</span>
              </div>
              <h1 className={styles.categoryTitle}>
                <span className={styles.categoryIcon}>{categoryMeta.icon}</span>
                <span>{categoryMeta.name}</span>
              </h1>
              <p className={styles.categoryDesc}>{categoryMeta.description}</p>
            </div>

            <div className={styles.itemsCountBadge}>
              {loading
                ? 'جاري التحميل...'
                : `${categoryProducts.length} ${categoryProducts.length === 1 ? 'خدمة متوفرة' : 'خدمات متوفرة'}`}
            </div>
          </div>
        </div>

        {/* Search & Actions Bar */}
        <div className={styles.searchWrap}>
          <div className={styles.searchBox}>
            <Search size={18} className={styles.searchIcon} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`ابحث داخل ${categoryMeta.name}...`}
              className={styles.searchInput}
              aria-label="البحث في منتجات الفئة"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className={styles.clearSearch}
                title="مسح البحث"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Products Grid */}
        {loading ? (
          <div className={styles.productsGrid}>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className={styles.skeletonCard} />
            ))}
          </div>
        ) : error ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>⚠️</div>
            <h3 className={styles.emptyTitle}>تعذر تحميل خدمات الفئة</h3>
            <p className={styles.emptyText}>{error}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="btn btn-secondary btn-sm"
            >
              إعادة المحاولة
            </button>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>🔍</div>
            <h3 className={styles.emptyTitle}>
              {searchQuery ? 'لم يتم العثور على نتائج مطابقة' : 'لا توجد منتجات متوفرة حالياً'}
            </h3>
            <p className={styles.emptyText}>
              {searchQuery
                ? `لم نجد أي خدمة تطابق «${searchQuery}» في هذه الفئة.`
                : 'يتم تحديث قائمة الخدمات حالياً، يرجى المحاولة لاحقاً.'}
            </p>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="btn btn-secondary btn-sm"
              >
                مسح كلمة البحث
              </button>
            )}
          </div>
        ) : (
          <div className={styles.productsGrid}>
            {filteredProducts.map((game) => (
              <GameCard
                key={game.id}
                game={game}
                onSelect={(selected) => setSelectedGameForModal(selected)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Quick TopUp Modal */}
      {selectedGameForModal && (
        <QuickTopUpModal
          game={selectedGameForModal}
          isOpen={Boolean(selectedGameForModal)}
          onClose={() => setSelectedGameForModal(null)}
        />
      )}
    </div>
  );
};

export default CategoryPage;
