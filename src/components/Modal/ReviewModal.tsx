import React, { useState } from 'react';
import { api } from '../../lib/api';
import { Star, X, CheckCircle2, ShoppingBag } from 'lucide-react';

interface ReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  packageName: string;
  onSuccess?: () => void;
}

const RATING_LABELS: Record<number, string> = {
  1: 'سيء',
  2: 'مقبول',
  3: 'جيد',
  4: 'جيد جداً',
  5: 'ممتاز وخدمة استثنائية! ⚡'
};

export const ReviewModal: React.FC<ReviewModalProps> = ({
  isOpen,
  onClose,
  orderId,
  packageName,
  onSuccess
}) => {
  const [rating, setRating] = useState<number>(5);
  const [hoveredRating, setHoveredRating] = useState<number>(0);
  const [comment, setComment] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [success, setSuccess] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating < 1 || rating > 5) {
      setError('يرجى اختيار تقييم بالنجوم.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await api.post<{ message: string; review: any }>('/api/reviews', {
        orderId,
        rating,
        comment: comment.trim()
      });

      setSuccess(true);
      setSuccessMessage(res.message || 'شكرًا لمشاركتنا رأيك، تم تسجيل تقييمك بنجاح!');
      if (onSuccess) onSuccess();
    } catch (err: any) {
      const msg = err?.data?.error || err.message || 'فشل إرسال التقييم.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const activeStars = hoveredRating || rating;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(5px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '16px'
    }} dir="rtl">
      <div style={{
        width: '100%',
        maxWidth: '480px',
        backgroundColor: '#111827',
        border: '1px solid rgba(245, 158, 11, 0.3)',
        borderRadius: '18px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
        overflow: 'hidden',
        position: 'relative'
      }}>
        {/* Top Accent */}
        <div style={{
          height: '4px',
          background: 'linear-gradient(90deg, #F59E0B 0%, #FBBF24 50%, #D97706 100%)'
        }} />

        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '16px',
            left: '16px',
            background: 'none',
            border: 'none',
            color: '#94A3B8',
            cursor: 'pointer',
            padding: '4px'
          }}
          aria-label="إغلاق"
        >
          <X size={20} />
        </button>

        <div style={{ padding: '28px 24px' }}>
          {success ? (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <CheckCircle2 size={48} color="#22C55E" style={{ margin: '0 auto 14px' }} />
              <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#FFFFFF', margin: '0 0 8px' }}>
                {successMessage}
              </h3>
              <p style={{ fontSize: '13px', color: '#94A3B8', margin: '0 0 20px', lineHeight: 1.6 }}>
                نقدّر وقتك ومشاركتك معنا في مجتمع KIROPRO ⚡
              </p>
              <button
                onClick={onClose}
                style={{
                  width: '100%',
                  backgroundColor: '#F59E0B',
                  color: '#0B0F19',
                  border: 'none',
                  padding: '12px',
                  borderRadius: '10px',
                  fontWeight: 800,
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                إغلاق
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div style={{ textAlign: 'center', marginBottom: '18px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#FFFFFF', margin: '0 0 6px' }}>
                  قيّم تجربتك مع هذا الطلب
                </h3>
                <p style={{ fontSize: '13px', color: '#94A3B8', margin: 0 }}>
                  رأيك يهمنا ويساعدنا على تقديم خدمة أسرع دائماً
                </p>
              </div>

              {/* Product Badge */}
              <div style={{
                backgroundColor: '#1E293B',
                borderRadius: '10px',
                padding: '10px 14px',
                marginBottom: '18px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                <ShoppingBag size={18} color="#F59E0B" />
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#FFFFFF' }}>
                  {packageName}
                </div>
              </div>

              {/* Star Rating */}
              <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                <div style={{ display: 'inline-flex', gap: '8px', direction: 'ltr' }}>
                  {[1, 2, 3, 4, 5].map((s) => {
                    const active = s <= activeStars;
                    return (
                      <button
                        type="button"
                        key={s}
                        onClick={() => setRating(s)}
                        onMouseEnter={() => setHoveredRating(s)}
                        onMouseLeave={() => setHoveredRating(0)}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: '2px',
                          cursor: 'pointer',
                          transform: active ? 'scale(1.15)' : 'scale(1)',
                          transition: 'transform 0.15s ease'
                        }}
                      >
                        <Star
                          size={32}
                          fill={active ? '#F59E0B' : 'transparent'}
                          color={active ? '#F59E0B' : '#475569'}
                          strokeWidth={1.8}
                        />
                      </button>
                    );
                  })}
                </div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#FBBF24', marginTop: '6px' }}>
                  {RATING_LABELS[activeStars] || ''}
                </div>
              </div>

              {/* Comment */}
              <div style={{ marginBottom: '18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '12px' }}>
                  <span style={{ color: '#CBD5E1', fontWeight: 600 }}>ملاحظاتك أو رأيك (اختياري):</span>
                  <span style={{ color: '#64748B' }}>{comment.length} / 1000</span>
                </div>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value.slice(0, 1000))}
                  placeholder="اكتب تعليقك هنا..."
                  rows={3}
                  style={{
                    width: '100%',
                    backgroundColor: '#0F172A',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    padding: '10px',
                    color: '#FFFFFF',
                    fontSize: '13px',
                    fontFamily: 'inherit',
                    resize: 'vertical',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {error && (
                <div style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  marginBottom: '14px',
                  fontSize: '12px',
                  color: '#FCA5A5'
                }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                style={{
                  width: '100%',
                  backgroundColor: '#F59E0B',
                  color: '#0B0F19',
                  border: 'none',
                  padding: '12px',
                  borderRadius: '8px',
                  fontWeight: 900,
                  fontSize: '14px',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 12px rgba(245, 158, 11, 0.3)'
                }}
              >
                {submitting ? 'جارٍ الإرسال...' : '⭐ إرسال التقييم'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReviewModal;
