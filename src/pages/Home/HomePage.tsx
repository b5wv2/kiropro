import React, { useState, useEffect } from 'react';
import { Hero } from '../../components/Hero/Hero';
import { GameCard } from '../../components/GameCard/GameCard';
import { UsdtCard, UsdtCardConfig } from '../../components/GameCard/UsdtCard';
import { VirtualNumberCard } from '../../components/GameCard/VirtualNumberCard';
import { DealsBanner } from '../../components/Deals/DealsBanner';
import { ReferralPromoBanner } from '../../components/Referral/ReferralPromoBanner';
import { HowItWorks } from '../../components/HowItWorks/HowItWorks';
import { WhyUs } from '../../components/Features/WhyUs';
import { HomeReviewsSection } from '../../components/Reviews/HomeReviewsSection';
import { QuickTopUpModal } from '../../components/Modal/QuickTopUpModal';
import { Game } from '../../types';
import { fetchGames } from '../../services/api';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

const CATEGORIES = [
  { id: 'all', name: 'الكل ✨' },
  { id: 'games', name: '🎮 الألعاب الإلكترونية' },
  { id: 'apps', name: '📱 تطبيقات البث والدردشة' },
  { id: 'numbers', name: '📱 الأرقام الافتراضية' },
  { id: 'digital', name: '⭐ نجوم تيليجرام' },
  { id: 'subscriptions', name: '👑 الاشتراكات الرقمية' },
  { id: 'transfers', name: '⚡ تحويلات USDT' }
];

export const HomePage: React.FC = () => {
  const { navigateTo } = useAuth();
  const [games, setGames] = useState<Game[]>([]);
  const [usdtConfig, setUsdtConfig] = useState<UsdtCardConfig | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedGameForModal, setSelectedGameForModal] = useState<Game | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    
    // Fetch games catalog
    fetchGames()
      .then(data => {
        if (isMounted) {
          setGames(data);
          setLoading(false);
        }
      })
      .catch(err => {
        if (isMounted) {
          console.error('[HomePage] Failed to fetch games:', err);
          setError(err?.message || 'تعذر تحميل المنتجات');
          setLoading(false);
        }
      });

    // Fetch USDT public config (for card appearance, image, and dynamic starting price)
    api.get('/api/crypto/usdt/config')
      .then((cfg: UsdtCardConfig) => {
        if (isMounted && cfg) {
          setUsdtConfig(cfg);
        }
      })
      .catch((err) => {
        console.warn('[HomePage] Failed to fetch USDT config for card:', err);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const featuredGame = games[0] || null;

  // Filter games based on activeCategory and search
  const filteredGames = games.filter(game => {
    let matchesCat = activeCategory === 'all';
    if (activeCategory === 'transfers' || activeCategory === 'numbers') {
      matchesCat = false;
    } else if (activeCategory === 'games') {
      // Strictly real gaming products! Exclude Likee and Telegram
      matchesCat = (game.category === 'games' || game.category === 'mobile') &&
        !game.id.includes('likee') &&
        !game.id.includes('telegram');
    } else if (activeCategory === 'apps') {
      matchesCat = game.category === 'apps' || game.id.includes('likee');
    } else if (activeCategory === 'digital') {
      matchesCat = game.category === 'digital' || game.id.includes('stars');
    } else if (activeCategory === 'subscriptions') {
      matchesCat = game.category === 'subscriptions' || game.id.includes('premium');
    } else {
      matchesCat = game.category === activeCategory;
    }

    const matchesSearch = searchQuery === '' ||
      game.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      game.type.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  // Separate games vs digital/apps for the 'all' view
  const onlyGamesList = games.filter(g => 
    (g.category === 'games' || g.category === 'mobile') &&
    !g.id.includes('likee') &&
    !g.id.includes('telegram')
  );

  const onlyDigitalAndAppsList = games.filter(g => 
    g.category === 'apps' || 
    g.category === 'digital' || 
    g.category === 'subscriptions' ||
    g.id.includes('likee') ||
    g.id.includes('telegram')
  );

  // Determine whether USDT card should be displayed based on filters
  const matchesUsdtCategory = activeCategory === 'all' || activeCategory === 'transfers';
  const matchesUsdtSearch = searchQuery === '' ||
    'usdt'.includes(searchQuery.toLowerCase()) ||
    'تحويل'.includes(searchQuery) ||
    'كريبتو'.includes(searchQuery) ||
    'دولار'.includes(searchQuery) ||
    'polygon'.includes(searchQuery.toLowerCase());

  const showUsdtCard = matchesUsdtCategory && matchesUsdtSearch;

  // Determine whether Virtual Numbers card should be displayed based on filters
  const matchesNumbersCategory = activeCategory === 'all' || activeCategory === 'numbers' || activeCategory === 'apps';
  const matchesNumbersSearch = searchQuery === '' ||
    'أرقام'.includes(searchQuery) ||
    'رقم'.includes(searchQuery) ||
    'افتراضية'.includes(searchQuery) ||
    'virtual'.includes(searchQuery.toLowerCase()) ||
    'whatsapp'.includes(searchQuery.toLowerCase()) ||
    'واتساب'.includes(searchQuery) ||
    'otp'.includes(searchQuery.toLowerCase());

  const showNumbersCard = matchesNumbersCategory && matchesNumbersSearch;
  const isDefaultOverview = activeCategory === 'all' && searchQuery.trim() === '';

  return (
    <>
      {/* Hero Section */}
      {featuredGame && (
        <Hero
          featuredGame={featuredGame}
          onQuickTopUp={(game) => setSelectedGameForModal(game)}
        />
      )}

      {/* Popular Games Section */}
      <section className="section" id="games" style={{ background: 'var(--bg-secondary)', borderTop: '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="container">
          <div className="section-header-row">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 8, flexWrap: 'wrap' }}>
                <span className="badge-tag badge-brand">🎮 الألعاب والخدمات الرقمية</span>
                <span style={{ fontSize: '0.75rem', background: 'rgba(16, 185, 129, 0.12)', color: '#059669', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '3px 10px', borderRadius: '12px', fontWeight: 800 }}>
                  ⚡ تسليم فوري وتلقائي
                </span>
                <span style={{ fontSize: '0.75rem', background: 'rgba(59, 130, 246, 0.12)', color: '#2563eb', border: '1px solid rgba(59, 130, 246, 0.3)', padding: '3px 10px', borderRadius: '12px', fontWeight: 800 }}>
                  🔒 أسعار آمنة بالجنيه (SDG)
                </span>
              </div>
              <h2 className="heading-section">المنتجات الأكثر طلباً</h2>
              <p className="subheading">حدد لعبتك أو خدمتك المفضلة، واشحن حسابك فوراً برصيد محفظتك مع تنفيذ تلقائي بدون انتظار.</p>
            </div>

            {/* Live Search & Filter Tabs */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 440 }}>
              <div className="search-input-wrapper" style={{ width: '100%' }}>
                <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  className="search-input"
                  placeholder="ابحث عن لعبة أو خدمة..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="filter-tabs" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {CATEGORIES.map(cat => (
                  <button
                    key={cat.id}
                    className={`tab-btn ${activeCategory === cat.id ? 'active' : ''}`}
                    onClick={() => setActiveCategory(cat.id)}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Loading and Error States */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px 16px', color: 'var(--text-secondary)' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', fontWeight: 700 }}>
                <span>جاري تحميل الألعاب والمنتجات...</span>
              </div>
            </div>
          ) : error ? (
            <div style={{ textAlign: 'center', padding: '48px 16px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)' }}>
              <p style={{ fontSize: '1.15rem', fontWeight: 800, color: '#ef4444', marginBottom: 10 }}>{error}</p>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setLoading(true);
                  setError(null);
                  fetchGames(true)
                    .then(data => { setGames(data); setLoading(false); })
                    .catch(err => { setError(err?.message || 'تعذر تحميل المنتجات'); setLoading(false); });
                }}
              >
                إعادة المحاولة
              </button>
            </div>
          ) : isDefaultOverview ? (
            /* PROFESSIONAL DUAL-SECTION OVERVIEW (When "All" is active without search) */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '48px' }}>
              {/* SECTION 1: Video & Mobile Games */}
              {onlyGamesList.length > 0 && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px', flexWrap: 'wrap', gap: '10px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '1.25rem' }}>🎮</span>
                        <h3 style={{ fontSize: '1.35rem', fontWeight: 900, color: 'var(--text-primary)', margin: 0 }}>
                          الألعاب الإلكترونية الأكثر طلباً
                        </h3>
                        <span style={{ fontSize: '0.72rem', background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0', padding: '2px 8px', borderRadius: '10px', fontWeight: 800 }}>
                          تسليم فوري بالـ ID
                        </span>
                      </div>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                        شحن فوري ومباشر لشدات ببجي، جواهر فري فاير، وذهب بلود سترايك
                      </p>
                    </div>
                  </div>

                  <div className="games-grid">
                    {onlyGamesList.map(game => (
                      <GameCard
                        key={game.id}
                        game={game}
                        onSelect={(g) => setSelectedGameForModal(g)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* SECTION 2: Digital Apps & Subscriptions */}
              {(onlyDigitalAndAppsList.length > 0 || showUsdtCard || showNumbersCard) && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px', flexWrap: 'wrap', gap: '10px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '1.25rem' }}>📱</span>
                        <h3 style={{ fontSize: '1.35rem', fontWeight: 900, color: 'var(--text-primary)', margin: 0 }}>
                          التطبيقات والخدمات الرقمية والاشتراكات
                        </h3>
                        <span style={{ fontSize: '0.72rem', background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', padding: '2px 8px', borderRadius: '10px', fontWeight: 800 }}>
                          تفعيل رسمي معتمد
                        </span>
                      </div>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                        شحن ماسات Likee، نجوم تيليجرام Telegram Stars، واشتراكات بريميوم والأرقام الافتراضية
                      </p>
                    </div>
                  </div>

                  <div className="games-grid">
                    {/* USDT Instant Transfer Card */}
                    {showUsdtCard && (
                      <UsdtCard
                        config={usdtConfig}
                        onSelect={() => navigateTo('usdt')}
                      />
                    )}

                    {/* Virtual Numbers Instant OTP Card */}
                    {showNumbersCard && (
                      <VirtualNumberCard
                        onSelect={() => navigateTo('virtual-numbers')}
                      />
                    )}

                    {onlyDigitalAndAppsList.map(game => (
                      <GameCard
                        key={game.id}
                        game={game}
                        onSelect={(g) => setSelectedGameForModal(g)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (filteredGames.length > 0 || showUsdtCard || showNumbersCard) ? (
            /* FILTERED / SEARCH VIEW */
            <div className="games-grid">
              {/* USDT Instant Transfer Card */}
              {showUsdtCard && (
                <UsdtCard
                  config={usdtConfig}
                  onSelect={() => navigateTo('usdt')}
                />
              )}

              {/* Virtual Numbers Instant OTP Card */}
              {showNumbersCard && (
                <VirtualNumberCard
                  onSelect={() => navigateTo('virtual-numbers')}
                />
              )}

              {/* Standard Game and Product Cards */}
              {filteredGames.map(game => (
                <GameCard
                  key={game.id}
                  game={game}
                  onSelect={(g) => setSelectedGameForModal(g)}
                />
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '48px 16px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)' }}>
              <p style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: 6 }}>لم نجد نتائج مطابقة لبحثك</p>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>جرب البحث عن لعبة أو خدمة أخرى أو اختر قسماً آخر من القائمة أعلاه.</p>
            </div>
          )}
        </div>
      </section>

      {/* How It Works Section */}
      <HowItWorks />

      {/* Featured Deals Section */}
      <DealsBanner />

      {/* Referral & Invite Friends Dynamic Promo Banner */}
      <ReferralPromoBanner />

      {/* Why KIROPRO Section */}
      <WhyUs />

      {/* Verified Customer Reviews Section */}
      <HomeReviewsSection />

      {/* Final Call to Action */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="cta-banner-card">
            <div className="cta-content">
              <span className="badge-tag" style={{ background: 'rgba(255, 230, 0, 0.2)', color: 'var(--accent-yellow)', border: '1px solid var(--accent-yellow)' }}>
                ابدأ تجربتك الرقمية
              </span>
              <h2 style={{ fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 900, lineHeight: 1.2, color: '#FFFFFF' }}>
                جاهز لتجربة شحن أسرع وأبسط؟
              </h2>
              <p style={{ color: '#CBD5E1', fontSize: '1.1rem', lineHeight: 1.7, maxWidth: 580 }}>
                استخدم رصيد محفظة KIROPRO واشحن ألعابك بضغطة زر واحدة مع تنفيذ مؤتمت عبر مزودي الخدمة.
              </p>
              <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
                <a href="#games" className="btn btn-primary">
                  <span>تصفح جميع الألعاب والبطاقات</span>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Quick Top-Up Modal */}
      <QuickTopUpModal
        game={selectedGameForModal}
        isOpen={Boolean(selectedGameForModal)}
        onClose={() => setSelectedGameForModal(null)}
      />
    </>
  );
};
