import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import { Star, ChevronLeft, ChevronRight, Quote, ShieldCheck, User, ShoppingBag, ArrowLeft } from 'lucide-react';

interface FeaturedReview {
  id: string;
  rating: number;
  comment: string;
  customer_name: string;
  product_name: string;
  product_id?: string | null;
  created_at: string;
}

interface FeaturedReviewsResponse {
  total: number;
  averageRating: number;
  reviews: FeaturedReview[];
}

function formatRelativeTimeArabic(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays <= 0) {
      if (diffHours <= 0) {
        return 'اليوم';
      }
      return `منذ ${diffHours} ساعة`;
    }
    if (diffDays === 1) return 'أمس';
    if (diffDays === 2) return 'منذ يومين';
    if (diffDays <= 10) return `منذ ${diffDays} أيام`;
    if (diffDays <= 30) return `منذ ${Math.floor(diffDays / 7) || 1} أسبوع`;
    return d.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' });
  } catch {
    return 'مؤخراً';
  }
}

export const HomeReviewsSection: React.FC = () => {
  const { navigateTo } = useAuth();
  const [reviews, setReviews] = useState<FeaturedReview[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [avgRating, setAvgRating] = useState<number>(5.0);
  const [loading, setLoading] = useState<boolean>(true);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let isMounted = true;
    api.get<FeaturedReviewsResponse>('/api/reviews/featured?limit=9')
      .then(res => {
        if (!isMounted) return;
        if (res && res.reviews) {
          setReviews(res.reviews);
          setTotalCount(res.total || 0);
          setAvgRating(res.averageRating || 5.0);
        }
      })
      .catch(err => {
        console.error('Failed to load featured reviews:', err);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleScroll = (direction: 'left' | 'right') => {
    if (!scrollContainerRef.current) return;
    const container = scrollContainerRef.current;
    const cardWidth = 340;
    const scrollAmount = direction === 'left' ? -cardWidth * 1.5 : cardWidth * 1.5;
    container.scrollBy({ left: scrollAmount, behavior: 'smooth' });
  };

  // If loading or no approved reviews exist yet, show a clean, elegant placeholder state
  if (loading) {
    return (
      <section className="section" style={{ backgroundColor: '#0B0F19', borderTop: '1px solid rgba(255, 255, 255, 0.05)' }} dir="rtl">
        <div className="container" style={{ textAlign: 'center', padding: '60px 0', color: '#94A3B8' }}>
          <div className="spinner" style={{ margin: '0 auto 12px', width: '32px', height: '32px', border: '3px solid rgba(245,158,11,0.2)', borderTopColor: '#F59E0B', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <span>جارٍ تحميل آراء العملاء...</span>
        </div>
      </section>
    );
  }

  if (reviews.length === 0) {
    return null; // Don't show empty block if zero approved reviews
  }

  return (
    <section className="section" style={{
      backgroundColor: '#0B0F19',
      backgroundImage: 'radial-gradient(ellipse at 50% 0%, rgba(245, 158, 11, 0.04) 0%, transparent 70%)',
      borderTop: '1px solid rgba(255, 255, 255, 0.05)',
      borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
      position: 'relative',
      overflow: 'hidden'
    }} dir="rtl">
      <div className="container">
        {/* Section Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          flexWrap: 'wrap',
          gap: '20px',
          marginBottom: '36px'
        }}>
          <div>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.25)',
              padding: '4px 12px',
              borderRadius: '9999px',
              color: '#F59E0B',
              fontSize: '13px',
              fontWeight: 800,
              marginBottom: '10px'
            }}>
              <Star size={14} fill="#F59E0B" color="#F59E0B" />
              <span>آراء وتجارب العملاء</span>
            </div>

            <h2 style={{
              fontSize: 'clamp(1.75rem, 3vw, 2.4rem)',
              fontWeight: 900,
              color: '#FFFFFF',
              margin: '0 0 8px',
              letterSpacing: '-0.5px'
            }}>
              جرّبوا خدماتنا بأنفسهم — وهذه آراؤهم
            </h2>

            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', direction: 'ltr' }}>
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star
                    key={s}
                    size={18}
                    fill={s <= Math.round(avgRating) ? '#F59E0B' : 'rgba(245,158,11,0.2)'}
                    color="#F59E0B"
                  />
                ))}
              </div>

              <span style={{ fontSize: '18px', fontWeight: 900, color: '#FBBF24' }}>
                {avgRating.toFixed(1)} / 5
              </span>

              <span style={{ color: '#64748B' }}>•</span>

              <span style={{ color: '#94A3B8', fontSize: '14px', fontWeight: 600 }}>
                استناداً إلى {totalCount} تقييماً معتمداً
              </span>
            </div>
          </div>

          {/* Navigation Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={() => handleScroll('right')}
              aria-label="Previous reviews"
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '50%',
                backgroundColor: '#1E293B',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#F59E0B';
                e.currentTarget.style.color = '#0B0F19';
                e.currentTarget.style.borderColor = '#F59E0B';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#1E293B';
                e.currentTarget.style.color = '#FFFFFF';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
              }}
            >
              <ChevronRight size={20} />
            </button>

            <button
              onClick={() => handleScroll('left')}
              aria-label="Next reviews"
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '50%',
                backgroundColor: '#1E293B',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#F59E0B';
                e.currentTarget.style.color = '#0B0F19';
                e.currentTarget.style.borderColor = '#F59E0B';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#1E293B';
                e.currentTarget.style.color = '#FFFFFF';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
              }}
            >
              <ChevronLeft size={20} />
            </button>
          </div>
        </div>

        {/* Carousel Container */}
        <div
          ref={scrollContainerRef}
          style={{
            display: 'flex',
            gap: '20px',
            overflowX: 'auto',
            scrollSnapType: 'x mandatory',
            paddingBottom: '20px',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none'
          }}
        >
          {reviews.map((rev) => {
            const isGuest = rev.customer_name === 'مستخدم مجهول';
            return (
              <div
                key={rev.id}
                style={{
                  flex: '0 0 calc(33.333% - 14px)',
                  minWidth: '300px',
                  maxWidth: '380px',
                  scrollSnapAlign: 'start',
                  backgroundColor: '#111827',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '18px',
                  padding: '24px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: '0 10px 25px rgba(0, 0, 0, 0.4)',
                  position: 'relative',
                  transition: 'transform 0.2s ease, border-color 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(245, 158, 11, 0.4)';
                  e.currentTarget.style.transform = 'translateY(-4px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                {/* Quote Icon watermark */}
                <Quote
                  size={44}
                  color="rgba(245, 158, 11, 0.06)"
                  style={{ position: 'absolute', top: '20px', left: '20px', pointerEvents: 'none' }}
                />

                {/* Card Top: Stars & Date */}
                <div>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '16px'
                  }}>
                    <div style={{ display: 'inline-flex', gap: '3px', direction: 'ltr' }}>
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          size={16}
                          fill={s <= rev.rating ? '#F59E0B' : 'transparent'}
                          color={s <= rev.rating ? '#F59E0B' : '#475569'}
                        />
                      ))}
                    </div>

                    <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>
                      {formatRelativeTimeArabic(rev.created_at)}
                    </span>
                  </div>

                  {/* Comment */}
                  <p style={{
                    color: '#F1F5F9',
                    fontSize: '15px',
                    lineHeight: '1.7',
                    margin: '0 0 20px',
                    fontWeight: 500,
                    minHeight: '60px'
                  }}>
                    "{rev.comment || 'خدمة سريعة وشحن فوري ممتاز، شكرًا لكم.'}"
                  </p>
                </div>

                {/* Card Bottom: Reviewer Identity & Product Tag */}
                <div style={{
                  borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                  paddingTop: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px'
                }}>
                  {/* Reviewer Info */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
                      backgroundColor: isGuest ? '#1E293B' : 'rgba(34, 197, 94, 0.15)',
                      border: `1px solid ${isGuest ? 'rgba(255,255,255,0.1)' : 'rgba(34, 197, 94, 0.3)'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: isGuest ? '#94A3B8' : '#4ADE80',
                      fontWeight: 800,
                      fontSize: '14px'
                    }}>
                      {isGuest ? <User size={16} /> : <ShieldCheck size={18} />}
                    </div>

                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 800, color: '#FFFFFF' }}>
                        {rev.customer_name}
                      </div>
                      <div style={{ fontSize: '11px', color: isGuest ? '#64748B' : '#4ADE80', fontWeight: 600 }}>
                        {isGuest ? 'تقييم مؤكد كزائر' : 'عميل موثّق'}
                      </div>
                    </div>
                  </div>

                  {/* Product Tag */}
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      backgroundColor: '#1E293B',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '8px',
                      padding: '4px 10px',
                      fontSize: '12px',
                      fontWeight: 700,
                      color: '#FBBF24',
                      maxWidth: '150px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                    title={rev.product_name}
                  >
                    <ShoppingBag size={12} color="#F59E0B" style={{ flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {rev.product_name}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* View All Reviews Button */}
        <div style={{ textAlign: 'center', marginTop: '36px' }}>
          <button
            onClick={() => {
              navigateTo('reviews');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '10px',
              backgroundColor: '#1E293B',
              border: '1px solid rgba(245, 158, 11, 0.4)',
              color: '#F59E0B',
              padding: '14px 28px',
              borderRadius: '12px',
              fontWeight: 800,
              fontSize: '15px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: '0 4px 14px rgba(0, 0, 0, 0.3)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#F59E0B';
              e.currentTarget.style.color = '#0B0F19';
              e.currentTarget.style.borderColor = '#F59E0B';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#1E293B';
              e.currentTarget.style.color = '#F59E0B';
              e.currentTarget.style.borderColor = 'rgba(245, 158, 11, 0.4)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <span>مشاهدة جميع التقييمات ({totalCount})</span>
            <ArrowLeft size={18} />
          </button>
        </div>
      </div>
    </section>
  );
};

export default HomeReviewsSection;
