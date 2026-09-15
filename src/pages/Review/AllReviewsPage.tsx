import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import { Star, ArrowRight, ShieldCheck, User, ShoppingBag, ChevronLeft, ChevronRight, Filter } from 'lucide-react';

interface ReviewItem {
  id: string;
  rating: number;
  comment: string;
  customer_name: string;
  product_name: string;
  product_id?: string | null;
  created_at: string;
}

interface AllReviewsResponse {
  total: number;
  filteredTotal: number;
  averageRating: number;
  distribution: Record<number, { count: number; percent: number }>;
  page: number;
  limit: number;
  totalPages: number;
  hasMore: boolean;
  reviews: ReviewItem[];
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
      if (diffHours <= 0) return 'اليوم';
      return `منذ ${diffHours} ساعة`;
    }
    if (diffDays === 1) return 'أمس';
    if (diffDays === 2) return 'منذ يومين';
    if (diffDays <= 10) return `منذ ${diffDays} أيام`;
    if (diffDays <= 30) return `منذ ${Math.floor(diffDays / 7) || 1} أسبوع`;
    return d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return 'مؤخراً';
  }
}

export const AllReviewsPage: React.FC = () => {
  const { navigateTo } = useAuth();
  const [data, setData] = useState<AllReviewsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedRating, setSelectedRating] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const fetchReviews = (page: number, ratingFilter: number | null) => {
    setLoading(true);
    let url = `/api/reviews/all?page=${page}&limit=12`;
    if (ratingFilter) {
      url += `&rating=${ratingFilter}`;
    }

    api.get<AllReviewsResponse>(url)
      .then(res => {
        setData(res);
      })
      .catch(err => {
        console.error('Failed to load all reviews:', err);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchReviews(currentPage, selectedRating);
  }, [currentPage, selectedRating]);

  const handleRatingFilterChange = (star: number | null) => {
    setSelectedRating(star);
    setCurrentPage(1);
  };

  return (
    <div style={{
      minHeight: '80vh',
      backgroundColor: '#0B0F19',
      backgroundImage: 'radial-gradient(circle at 50% 0%, rgba(245, 158, 11, 0.05) 0%, transparent 60%)',
      padding: '40px 0 80px'
    }} dir="rtl">
      <div className="container">
        {/* Back Link */}
        <div style={{ marginBottom: '24px' }}>
          <button
            onClick={() => {
              navigateTo('home');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              color: '#94A3B8',
              fontSize: '14px',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              padding: '6px 0',
              transition: 'color 0.15s ease'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#F59E0B')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#94A3B8')}
          >
            <ArrowRight size={18} />
            <span>العودة للمتجر الرئيسي</span>
          </button>
        </div>

        {/* Page Header */}
        <div style={{ marginBottom: '36px' }}>
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
            <span>تقييمات المتجر</span>
          </div>

          <h1 style={{
            fontSize: 'clamp(2rem, 4vw, 2.8rem)',
            fontWeight: 900,
            color: '#FFFFFF',
            margin: '0 0 10px',
            letterSpacing: '-0.5px'
          }}>
            جميع تقييمات وآراء عملاء KIROPRO
          </h1>
          <p style={{ fontSize: '15px', color: '#94A3B8', margin: 0, maxWidth: '600px', lineHeight: 1.6 }}>
            نلتزم بالشفافية الكاملة — تجارب حقيقية موثقة لعملائنا بعد عمليات الشحن الفوري والتسليم الرقمي.
          </p>
        </div>

        {/* Overall Score & Distribution Card */}
        {data && (
          <div style={{
            backgroundColor: '#111827',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '20px',
            padding: '28px',
            marginBottom: '36px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '30px',
            alignItems: 'center',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.4)'
          }}>
            {/* Big Score Summary */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              borderLeft: '1px solid rgba(255, 255, 255, 0.08)',
              paddingLeft: '20px'
            }}>
              <div style={{
                fontSize: '54px',
                fontWeight: 900,
                color: '#FFFFFF',
                lineHeight: 1,
                marginBottom: '10px',
                fontFamily: 'monospace'
              }}>
                {data.averageRating.toFixed(1)}
              </div>

              <div style={{ display: 'inline-flex', gap: '4px', marginBottom: '10px', direction: 'ltr' }}>
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star
                    key={s}
                    size={22}
                    fill={s <= Math.round(data.averageRating) ? '#F59E0B' : 'rgba(245,158,11,0.2)'}
                    color="#F59E0B"
                  />
                ))}
              </div>

              <div style={{ fontSize: '14px', fontWeight: 700, color: '#FBBF24' }}>
                متوسط التقييم العام
              </div>
              <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                بناءً على {data.total} تقييماً معتمداً
              </div>
            </div>

            {/* Distribution Bars */}
            <div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#E2E8F0', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Filter size={14} color="#F59E0B" />
                <span>توزيع النجوم (اضغط للتصفية):</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {[5, 4, 3, 2, 1].map((star) => {
                  const dist = data.distribution?.[star] || { count: 0, percent: 0 };
                  const isSelected = selectedRating === star;

                  return (
                    <div
                      key={star}
                      onClick={() => handleRatingFilterChange(isSelected ? null : star)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        cursor: 'pointer',
                        padding: '4px 8px',
                        borderRadius: '8px',
                        backgroundColor: isSelected ? 'rgba(245, 158, 11, 0.15)' : 'transparent',
                        transition: 'background-color 0.15s ease'
                      }}
                    >
                      <span style={{ fontSize: '13px', fontWeight: 700, color: isSelected ? '#F59E0B' : '#CBD5E1', width: '45px' }}>
                        {star} نجوم
                      </span>

                      {/* Bar Track */}
                      <div style={{
                        flexGrow: 1,
                        height: '8px',
                        backgroundColor: 'rgba(255, 255, 255, 0.08)',
                        borderRadius: '9999px',
                        overflow: 'hidden'
                      }}>
                        <div style={{
                          height: '100%',
                          width: `${dist.percent}%`,
                          backgroundColor: isSelected ? '#F59E0B' : '#EAB308',
                          borderRadius: '9999px',
                          transition: 'width 0.4s ease'
                        }} />
                      </div>

                      <span style={{ fontSize: '12px', color: '#94A3B8', width: '38px', textAlign: 'left', direction: 'ltr' }}>
                        {dist.percent}%
                      </span>
                      <span style={{ fontSize: '11px', color: '#64748B', width: '28px', textAlign: 'left', direction: 'ltr' }}>
                        ({dist.count})
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Filter Pills */}
        <div style={{
          display: 'flex',
          gap: '8px',
          overflowX: 'auto',
          paddingBottom: '16px',
          marginBottom: '24px'
        }}>
          <button
            onClick={() => handleRatingFilterChange(null)}
            style={{
              backgroundColor: selectedRating === null ? '#F59E0B' : '#1E293B',
              color: selectedRating === null ? '#0B0F19' : '#CBD5E1',
              border: `1px solid ${selectedRating === null ? '#F59E0B' : 'rgba(255, 255, 255, 0.08)'}`,
              padding: '8px 18px',
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: 800,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              whiteSpace: 'nowrap'
            }}
          >
            جميع التقييمات ({data?.total || 0})
          </button>

          {[5, 4, 3, 2, 1].map((s) => (
            <button
              key={s}
              onClick={() => handleRatingFilterChange(s)}
              style={{
                backgroundColor: selectedRating === s ? '#F59E0B' : '#1E293B',
                color: selectedRating === s ? '#0B0F19' : '#CBD5E1',
                border: `1px solid ${selectedRating === s ? '#F59E0B' : 'rgba(255, 255, 255, 0.08)'}`,
                padding: '8px 16px',
                borderRadius: '10px',
                fontSize: '13px',
                fontWeight: 800,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                whiteSpace: 'nowrap'
              }}
            >
              <span>{s}</span>
              <Star size={14} fill={selectedRating === s ? '#0B0F19' : '#F59E0B'} color={selectedRating === s ? '#0B0F19' : '#F59E0B'} />
            </button>
          ))}
        </div>

        {/* Reviews Grid */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#94A3B8' }}>
            <div className="spinner" style={{ margin: '0 auto 12px', width: '36px', height: '36px', border: '3px solid rgba(245,158,11,0.2)', borderTopColor: '#F59E0B', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            <span>جارٍ تحميل التقييمات...</span>
          </div>
        ) : !data || data.reviews.length === 0 ? (
          <div style={{
            backgroundColor: '#111827',
            borderRadius: '16px',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            padding: '50px 20px',
            textAlign: 'center',
            color: '#94A3B8'
          }}>
            <Star size={44} color="#475569" style={{ margin: '0 auto 12px' }} />
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#FFFFFF', marginBottom: '8px' }}>
              لا توجد تقييمات مطابقة لهذا الاختيار
            </div>
            <p style={{ fontSize: '14px', margin: '0 0 16px' }}>
              يمكنك اختيار "جميع التقييمات" لعرض جميع الآراء المتاحة.
            </p>
            <button
              onClick={() => handleRatingFilterChange(null)}
              style={{
                backgroundColor: '#F59E0B',
                color: '#0B0F19',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '8px',
                fontWeight: 800,
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              عرض جميع التقييمات
            </button>
          </div>
        ) : (
          <>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: '20px',
              marginBottom: '40px'
            }}>
              {data.reviews.map((rev) => {
                const isGuest = rev.customer_name === 'مستخدم مجهول';
                return (
                  <div
                    key={rev.id}
                    style={{
                      backgroundColor: '#111827',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '16px',
                      padding: '22px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      boxShadow: '0 8px 20px rgba(0, 0, 0, 0.3)',
                      transition: 'transform 0.15s ease, border-color 0.15s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(245, 158, 11, 0.3)';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    <div>
                      {/* Top: Stars & Relative Date */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '14px'
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
                        fontSize: '14px',
                        lineHeight: 1.7,
                        margin: '0 0 18px',
                        fontWeight: 500,
                        minHeight: '50px'
                      }}>
                        "{rev.comment || 'خدمة سريعة وشحن فوري ممتاز، شكرًا لكم.'}"
                      </p>
                    </div>

                    {/* Bottom: Reviewer Identity & Product Tag */}
                    <div style={{
                      borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                      paddingTop: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '10px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                          width: '34px',
                          height: '34px',
                          borderRadius: '50%',
                          backgroundColor: isGuest ? '#1E293B' : 'rgba(34, 197, 94, 0.15)',
                          border: `1px solid ${isGuest ? 'rgba(255,255,255,0.1)' : 'rgba(34, 197, 94, 0.3)'}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: isGuest ? '#94A3B8' : '#4ADE80',
                          fontWeight: 800
                        }}>
                          {isGuest ? <User size={15} /> : <ShieldCheck size={17} />}
                        </div>

                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 800, color: '#FFFFFF' }}>
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
                          padding: '4px 9px',
                          fontSize: '11px',
                          fontWeight: 700,
                          color: '#FBBF24',
                          maxWidth: '140px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                        title={rev.product_name}
                      >
                        <ShoppingBag size={11} color="#F59E0B" style={{ flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {rev.product_name}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination Controls */}
            {data.totalPages > 1 && (
              <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '12px'
              }}>
                <button
                  disabled={currentPage <= 1}
                  onClick={() => {
                    setCurrentPage(p => Math.max(1, p - 1));
                    window.scrollTo({ top: 400, behavior: 'smooth' });
                  }}
                  style={{
                    backgroundColor: '#1E293B',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: currentPage <= 1 ? '#475569' : '#FFFFFF',
                    padding: '8px 16px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <ChevronRight size={16} />
                  <span>السابق</span>
                </button>

                <span style={{ color: '#94A3B8', fontSize: '13px', fontWeight: 600 }}>
                  صفحة {data.page} من {data.totalPages}
                </span>

                <button
                  disabled={currentPage >= data.totalPages}
                  onClick={() => {
                    setCurrentPage(p => Math.min(data.totalPages, p + 1));
                    window.scrollTo({ top: 400, behavior: 'smooth' });
                  }}
                  style={{
                    backgroundColor: '#1E293B',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: currentPage >= data.totalPages ? '#475569' : '#FFFFFF',
                    padding: '8px 16px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: currentPage >= data.totalPages ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <span>التالي</span>
                  <ChevronLeft size={16} />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default AllReviewsPage;
