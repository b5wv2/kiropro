import React, { useState, useEffect } from 'react';
import { Hero } from '../../components/Hero/Hero';
import { GameCard } from '../../components/GameCard/GameCard';
import { UsdtCard, UsdtCardConfig } from '../../components/GameCard/UsdtCard';
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
  { id: 'all', name: 'الكل' },
  { id: 'transfers', name: 'التحويلات الرقمية ⚡' },
  { id: 'mobile', name: 'ألعاب الجوال' },
  { id: 'pc', name: 'ألعاب البي سي' },
  { id: 'cards', name: 'بطاقات الهدايا' },
  { id: 'subscriptions', name: 'الاشتراكات الرقمية' }
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
    const matchesCat = activeCategory === 'all' || game.category === activeCategory;
    const matchesSearch = searchQuery === '' ||
      game.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      game.type.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  // Determine whether USDT card should be displayed based on filters
  const matchesUsdtCategory = activeCategory === 'all' || activeCategory === 'transfers';
  const matchesUsdtSearch = searchQuery === '' ||
    'usdt'.includes(searchQuery.toLowerCase()) ||
    'تحويل'.includes(searchQuery) ||
    'كريبتو'.includes(searchQuery) ||
    'دولار'.includes(searchQuery) ||
    'polygon'.includes(searchQuery.toLowerCase());

  const showUsdtCard = matchesUsdtCategory && matchesUsdtSearch;

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
              <span className="badge-tag badge-brand" style={{ marginBottom: 8 }}>الألعاب والبطاقات</span>
              <h2 className="heading-section">الألعاب الأكثر طلباً</h2>
              <p className="subheading">حدد لعبتك المفضلة، واشحن حسابك فوراً برصيد محفظتك مع تنفيذ تلقائي بدون انتظار.</p>
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
                  placeholder="ابحث عن لعبة أو بطاقة..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="filter-tabs">
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

          {/* Games Fluid Grid */}
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
          ) : (filteredGames.length > 0 || showUsdtCard) ? (
            <div className="games-grid">
              {/* USDT Instant Transfer Card */}
              {showUsdtCard && (
                <UsdtCard
                  config={usdtConfig}
                  onSelect={() => navigateTo('usdt')}
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
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>جرب البحث عن لعبة أخرى مثل "ببجي" أو "فري فاير" أو اختر قسماً آخر.</p>
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
