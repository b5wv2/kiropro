import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import { Star, CheckCircle2, AlertCircle, ShoppingBag, ShieldCheck, User as UserIcon } from 'lucide-react';

interface ReviewPageProps {
  token?: string;
  onSuccess?: () => void;
}

interface TokenMetadata {
  id: string;
  type: 'ORDER_SPECIFIC' | 'GENERAL';
  orderId?: string | null;
  orderNumber?: string | null;
  productId?: string | null;
  productName?: string;
}

const RATING_LABELS: Record<number, string> = {
  1: 'سيء',
  2: 'مقبول',
  3: 'جيد',
  4: 'جيد جداً',
  5: 'ممتاز وخدمة استثنائية! ⚡'
};

export const ReviewPage: React.FC<ReviewPageProps> = ({ token: propToken, onSuccess }) => {
  const { user, navigateTo } = useAuth();

  // Extract token from prop, or URL path (/review/:token), or URL query (?token=...)
  const [token] = useState<string>(() => {
    if (propToken) return propToken;
    const pathParts = window.location.pathname.split('/review/');
    if (pathParts.length > 1 && pathParts[1]) {
      return pathParts[1].split('/')[0].split('?')[0];
    }
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('token') || '';
  });

  const [loadingToken, setLoadingToken] = useState(true);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [tokenData, setTokenData] = useState<TokenMetadata | null>(null);

  // Form State
  const [rating, setRating] = useState<number>(5);
  const [hoveredRating, setHoveredRating] = useState<number>(0);
  const [comment, setComment] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitSuccess, setSubmitSuccess] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Validate token on mount if provided
  useEffect(() => {
    if (!token) {
      setLoadingToken(false);
      // If user is authenticated, they can still view page or return home
      if (!user) {
        setTokenError('يرجى استخدام رابط تقييم صالح تم استلامه عبر البريد أو من إدارة المتجر.');
      }
      return;
    }

    setLoadingToken(true);
    setTokenError(null);

    api.get<{ isValid: boolean; data?: TokenMetadata; error?: string }>(`/api/reviews/token/${encodeURIComponent(token)}`)
      .then(res => {
        if (res.isValid && res.data) {
          setTokenData(res.data);
        } else {
          setTokenError(res.error || 'رابط التقييم غير صالح أو منتهي الصلاحية.');
        }
      })
      .catch(err => {
        const msg = err?.data?.error || err.message || 'تعذر التحقق من رابط التقييم.';
        setTokenError(msg);
      })
      .finally(() => setLoadingToken(false));
  }, [token, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating < 1 || rating > 5) {
      setSubmitError('يرجى تحديد تقييم من 1 إلى 5 نجوم.');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const payload: any = {
        rating,
        comment: comment.trim()
      };

      if (token) {
        payload.reviewToken = token;
      } else if (tokenData?.orderId) {
        payload.orderId = tokenData.orderId;
      }

      const res = await api.post<{ message: string; review: any }>('/api/reviews', payload);
      setSubmitSuccess(true);
      setSuccessMessage(res.message || 'شكرًا لمشاركتنا رأيك، تمت إضافة تقييمك بنجاح!');
      if (onSuccess) onSuccess();
    } catch (err: any) {
      console.error('Failed to submit review:', err);
      const msg = err?.data?.error || err.message || 'حدث خطأ أثناء إرسال التقييم. يرجى المحاولة لاحقاً.';
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const activeStarCount = hoveredRating || rating;
  const productName = tokenData?.productName || 'تجربة التسوق في KIROPRO';

  return (
    <div style={{
      minHeight: '75vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 16px',
      backgroundColor: '#0B0F19',
      backgroundImage: 'radial-gradient(circle at 50% 10%, #1E293B 0%, #0B0F19 80%)'
    }} dir="rtl">
      <div style={{
        width: '100%',
        maxWidth: '520px',
        backgroundColor: '#111827',
        border: '1px solid rgba(245, 158, 11, 0.2)',
        borderRadius: '20px',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05)',
        overflow: 'hidden'
      }}>
        {/* Top Gold Accent Bar */}
        <div style={{
          height: '4px',
          background: 'linear-gradient(90deg, #F59E0B 0%, #FBBF24 50%, #D97706 100%)'
        }} />

        <div style={{ padding: '32px 28px' }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginBottom: '14px' }}>
              <span style={{ fontSize: '24px', fontWeight: 900, color: '#FFFFFF', letterSpacing: '-0.5px' }}>
                KIRO
              </span>
              <span style={{
                backgroundColor: '#F59E0B',
                color: '#0B0F19',
                fontSize: '13px',
                fontWeight: 900,
                padding: '3px 8px',
                borderRadius: '6px',
                letterSpacing: '1px'
              }}>
                PRO
              </span>
            </div>
            <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#FFFFFF', margin: '0 0 6px' }}>
              قيّم تجربتك مع KIROPRO
            </h1>
            <p style={{ fontSize: '14px', color: '#94A3B8', margin: 0 }}>
              رأيك الحقيقي يصنع الفارق ويساعدنا على تطوير خدماتنا دائماً
            </p>
          </div>

          {/* Loading State */}
          {loadingToken && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#F59E0B' }}>
              <div className="spinner" style={{ margin: '0 auto 16px', width: '36px', height: '36px', border: '3px solid rgba(245,158,11,0.2)', borderTopColor: '#F59E0B', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              <p style={{ color: '#94A3B8', fontSize: '14px' }}>جارٍ التحقق من رابط التقييم...</p>
            </div>
          )}

          {/* Token Error State */}
          {!loadingToken && tokenError && (
            <div style={{
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '12px',
              padding: '20px',
              textAlign: 'center',
              marginBottom: '20px'
            }}>
              <AlertCircle size={36} color="#EF4444" style={{ margin: '0 auto 10px' }} />
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#FCA5A5', margin: '0 0 6px' }}>
                رابط التقييم غير متاح
              </h3>
              <p style={{ fontSize: '13px', color: '#CBD5E1', margin: '0 0 16px', lineHeight: 1.6 }}>
                {tokenError}
              </p>
              <button
                onClick={() => navigateTo('home')}
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
                العودة للمتجر الرئيسي
              </button>
            </div>
          )}

          {/* Success State */}
          {!loadingToken && submitSuccess && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{
                width: '64px',
                height: '64px',
                backgroundColor: 'rgba(34, 197, 94, 0.15)',
                border: '2px solid #22C55E',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px'
              }}>
                <CheckCircle2 size={36} color="#22C55E" />
              </div>

              <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#FFFFFF', margin: '0 0 10px' }}>
                {successMessage}
              </h2>
              <p style={{ fontSize: '14px', color: '#94A3B8', margin: '0 0 24px', lineHeight: 1.6 }}>
                نقدّر مشاركتك معنا في مجتمع KIROPRO. نسعد دائماً بخدمتك وتقديم أفضل تجربة رقمية لك ⚡
              </p>

              <button
                onClick={() => navigateTo('home')}
                style={{
                  width: '100%',
                  backgroundColor: '#F59E0B',
                  color: '#0B0F19',
                  border: 'none',
                  padding: '12px 24px',
                  borderRadius: '10px',
                  fontWeight: 800,
                  fontSize: '15px',
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(245, 158, 11, 0.3)'
                }}
              >
                تصفح المتجر واشحن ألعابك
              </button>
            </div>
          )}

          {/* Review Form */}
          {!loadingToken && !tokenError && !submitSuccess && (
            <form onSubmit={handleSubmit}>
              {/* Product Info Banner */}
              <div style={{
                backgroundColor: '#1E293B',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '12px',
                padding: '14px 16px',
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
              }}>
                <div style={{
                  width: '40px',
                  height: '40px',
                  backgroundColor: 'rgba(245, 158, 11, 0.15)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <ShoppingBag size={20} color="#F59E0B" />
                </div>
                <div style={{ flexGrow: 1 }}>
                  <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 600 }}>المنتج محل التقييم:</div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#FFFFFF' }}>{productName}</div>
                  {tokenData?.orderNumber && (
                    <div style={{ fontSize: '11px', color: '#FBBF24', marginTop: '2px', direction: 'ltr', textAlign: 'right' }}>
                      Order #{tokenData.orderNumber}
                    </div>
                  )}
                </div>
              </div>

              {/* Identity Banner: Authenticated vs Guest */}
              {(() => {
                const isCustomer = user && user.role !== 'ADMIN';
                return (
                  <div style={{
                    backgroundColor: isCustomer ? 'rgba(34, 197, 94, 0.08)' : 'rgba(148, 163, 184, 0.08)',
                    border: `1px solid ${isCustomer ? 'rgba(34, 197, 94, 0.25)' : 'rgba(148, 163, 184, 0.2)'}`,
                    borderRadius: '10px',
                    padding: '10px 14px',
                    marginBottom: '22px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '13px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: isCustomer ? '#86EFAC' : '#CBD5E1' }}>
                      {isCustomer ? <ShieldCheck size={18} color="#22C55E" /> : <UserIcon size={18} color="#94A3B8" />}
                      <span>
                        {isCustomer ? `تسجيل التقييم باسم: ${user.name || 'عميل مسجل'}` : 'تقييم كزائر (مستخدم مجهول)'}
                      </span>
                    </div>
                    <span style={{
                      fontSize: '11px',
                      padding: '2px 8px',
                      borderRadius: '6px',
                      backgroundColor: isCustomer ? '#166534' : '#334155',
                      color: '#FFFFFF',
                      fontWeight: 700
                    }}>
                      {isCustomer ? 'حساب موثّق' : 'مجهول الهوية للعامة'}
                    </span>
                  </div>
                );
              })()}

              {/* Star Rating Selector */}
              <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 700, color: '#E2E8F0', marginBottom: '12px' }}>
                  كم نجمة تعطي لتجربتك؟
                </label>

                <div style={{ display: 'inline-flex', gap: '8px', direction: 'ltr' }}>
                  {[1, 2, 3, 4, 5].map((starVal) => {
                    const isFilled = starVal <= activeStarCount;
                    return (
                      <button
                        type="button"
                        key={starVal}
                        onClick={() => setRating(starVal)}
                        onMouseEnter={() => setHoveredRating(starVal)}
                        onMouseLeave={() => setHoveredRating(0)}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: '4px',
                          cursor: 'pointer',
                          transition: 'transform 0.15s ease',
                          transform: isFilled ? 'scale(1.15)' : 'scale(1.0)'
                        }}
                        aria-label={`${starVal} نجوم`}
                      >
                        <Star
                          size={36}
                          fill={isFilled ? '#F59E0B' : 'transparent'}
                          color={isFilled ? '#F59E0B' : '#475569'}
                          strokeWidth={1.8}
                        />
                      </button>
                    );
                  })}
                </div>

                <div style={{
                  marginTop: '8px',
                  fontSize: '14px',
                  fontWeight: 800,
                  color: '#FBBF24',
                  minHeight: '20px'
                }}>
                  {RATING_LABELS[activeStarCount] || ''}
                </div>
              </div>

              {/* Comment Textarea */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label htmlFor="review-comment" style={{ fontSize: '13px', fontWeight: 700, color: '#CBD5E1' }}>
                    اكتب رأيك بالتفصيل (اختياري):
                  </label>
                  <span style={{ fontSize: '11px', color: '#64748B' }}>
                    {comment.length} / 1000
                  </span>
                </div>
                <textarea
                  id="review-comment"
                  value={comment}
                  onChange={(e) => setComment(e.target.value.slice(0, 1000))}
                  placeholder="كيف كانت سرعة التنفيذ والتجربة؟ شاركنا أي تفاصيل تساعدنا..."
                  rows={4}
                  style={{
                    width: '100%',
                    backgroundColor: '#0F172A',
                    border: '1px solid #334155',
                    borderRadius: '10px',
                    padding: '12px 14px',
                    color: '#FFFFFF',
                    fontSize: '14px',
                    fontFamily: 'inherit',
                    resize: 'vertical',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* Error Alert */}
              {submitError && (
                <div style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  marginBottom: '16px',
                  fontSize: '13px',
                  color: '#FCA5A5'
                }}>
                  {submitError}
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={submitting}
                style={{
                  width: '100%',
                  backgroundColor: '#F59E0B',
                  color: '#0B0F19',
                  border: 'none',
                  padding: '14px 20px',
                  borderRadius: '10px',
                  fontWeight: 900,
                  fontSize: '16px',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  opacity: submitting ? 0.7 : 1,
                  boxShadow: '0 4px 16px rgba(245, 158, 11, 0.35)',
                  transition: 'all 0.2s ease'
                }}
              >
                {submitting ? 'جارٍ إرسال التقييم...' : '⭐ إرسال التقييم'}
              </button>

              <div style={{ marginTop: '14px', textAlign: 'center' }}>
                <span style={{ fontSize: '11px', color: '#64748B' }}>
                  🔒 تقييمك محمي وآمن. لا يتم عرض أي معلومات شخصية مثل بريدك أو رقم هاتفك.
                </span>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReviewPage;
