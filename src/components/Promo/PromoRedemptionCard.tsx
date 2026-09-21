import React, { useState } from 'react';
import { Tag, Gift, CheckCircle2, AlertCircle, RefreshCw, Sparkles } from 'lucide-react';
import { validatePromoCode, redeemWalletCreditCode, PromoValidationResult } from '../../services/api';
import { useWallet } from '../../context/WalletContext';
import { formatCurrency } from '../../lib/formatters';

interface PromoRedemptionCardProps {
  onSuccessCredit?: (amount: number) => void;
  onSuccessDiscount?: (promo: PromoValidationResult) => void;
  compact?: boolean;
}

export const PromoRedemptionCard: React.FC<PromoRedemptionCardProps> = ({
  onSuccessCredit,
  onSuccessDiscount,
  compact = false
}) => {
  const { refreshBalance, showToast } = useWallet();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creditSuccess, setCreditSuccess] = useState<{ amount: number; message: string } | null>(null);
  const [discountSuccess, setDiscountSuccess] = useState<PromoValidationResult | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) {
      setError('يرجى إدخال رمز الكود أولاً');
      return;
    }

    setLoading(true);
    setError(null);
    setCreditSuccess(null);
    setDiscountSuccess(null);

    try {
      // 1. First validate the code to determine its type
      const validation = await validatePromoCode(cleanCode);

      if (!validation.valid) {
        setError(validation.message || 'الكود غير صالح');
        setLoading(false);
        return;
      }

      if (validation.type === 'WALLET_CREDIT') {
        // Automatically redeem wallet credit code atomically
        const redeemRes = await redeemWalletCreditCode(cleanCode);
        await refreshBalance();
        setCreditSuccess({
          amount: redeemRes.creditAmount,
          message: redeemRes.message
        });
        showToast(redeemRes.message, 'success');
        setCode('');
        if (onSuccessCredit) {
          onSuccessCredit(redeemRes.creditAmount);
        }
      } else {
        // DISCOUNT CODE: Show clear discount breakdown (Not added to wallet balance)
        setDiscountSuccess(validation);
        showToast(`تم تفعيل كود الخصم ${validation.code}!`, 'success');
        if (onSuccessDiscount) {
          onSuccessDiscount(validation);
        }
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'حدث خطأ أثناء فحص الكود';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      background: '#FFFFFF',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-xl)',
      padding: compact ? '18px' : '24px 28px',
      boxShadow: 'var(--shadow-sm)',
      position: 'relative',
      overflow: 'hidden'
    }} dir="rtl">
      {/* Decorative Brand Accent */}
      <div style={{
        position: 'absolute',
        top: 0,
        right: 0,
        left: 0,
        height: '3px',
        background: 'linear-gradient(90deg, #F59E0B 0%, #FBBF24 100%)'
      }} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <div style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          background: '#FEF9C3',
          color: '#B45309',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <Gift size={20} />
        </div>
        <div>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 900, color: '#0B0F19', margin: 0 }}>
            لديك كود خصم أو كود هدية؟
          </h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
            أدخل كود الهدية لإضافته لرصيدك، أو كود الخصم لتفعيله لمشترياتك
          </p>
        </div>
      </div>

      {/* Input Form */}
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 200px', position: 'relative' }}>
          <input
            type="text"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              if (error) setError(null);
            }}
            placeholder="مثال: WELCOME10 أو GIFT10"
            disabled={loading}
            style={{
              width: '100%',
              padding: '11px 16px',
              paddingLeft: '38px',
              border: error ? '1.5px solid #EF4444' : '1.5px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.95rem',
              fontWeight: 800,
              fontFamily: 'var(--font-latin), inherit',
              letterSpacing: '1px',
              color: '#0B0F19',
              background: 'var(--bg-tertiary)',
              outline: 'none',
              transition: 'border-color 0.2s'
            }}
          />
          <Tag size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
        </div>

        <button
          type="submit"
          className="btn btn-primary"
          disabled={loading || !code.trim()}
          style={{
            padding: '11px 24px',
            fontWeight: 800,
            fontSize: '0.9rem',
            minWidth: 105,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8
          }}
        >
          {loading ? (
            <>
              <RefreshCw size={15} className="animate-spin" />
              <span>جاري الفحص...</span>
            </>
          ) : (
            <span>استبدال / تطبيق</span>
          )}
        </button>
      </form>

      {/* Error Message */}
      {error && (
        <div style={{
          marginTop: 12,
          padding: '10px 14px',
          background: '#FEF2F2',
          border: '1px solid #FCA5A5',
          borderRadius: 'var(--radius-md)',
          color: '#991B1B',
          fontSize: '0.85rem',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}>
          <AlertCircle size={16} style={{ flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}

      {/* Wallet Credit Success Result */}
      {creditSuccess && (
        <div style={{
          marginTop: 14,
          padding: '14px 18px',
          background: '#ECFDF5',
          border: '1.5px solid #10B981',
          borderRadius: 'var(--radius-lg)',
          color: '#065F46',
          fontSize: '0.875rem',
          lineHeight: 1.6
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: '0.95rem', color: '#047857' }}>
            <CheckCircle2 size={18} />
            <span>✓ تم استبدال كود الهدية بنجاح!</span>
          </div>
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <span>المبلغ المضاف إلى رصيدك:</span>
            <span style={{ fontSize: '1.25rem', fontWeight: 900, color: '#047857', direction: 'ltr' }}>
              +{formatCurrency(creditSuccess.amount, 'SDG')}
            </span>
          </div>
        </div>
      )}

      {/* Discount Code Success Result */}
      {discountSuccess && (
        <div style={{
          marginTop: 14,
          padding: '14px 18px',
          background: '#FFFBEB',
          border: '1.5px solid #F59E0B',
          borderRadius: 'var(--radius-lg)',
          color: '#92400E',
          fontSize: '0.875rem',
          lineHeight: 1.6
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: '0.95rem', color: '#B45309' }}>
            <Sparkles size={18} />
            <span>✓ تم تفعيل كود الخصم {discountSuccess.code}</span>
          </div>

          <div style={{ 
            marginTop: 8, 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', 
            gap: 10,
            background: '#FFFFFF',
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid #FDE68A'
          }}>
            <div>
              <span style={{ fontSize: '0.75rem', color: '#78350F', display: 'block', fontWeight: 600 }}>نسبة الخصم:</span>
              <strong style={{ fontSize: '1.05rem', color: '#B45309' }}>
                {discountSuccess.discountType === 'PERCENTAGE' ? `${discountSuccess.discountValue}%` : formatCurrency(discountSuccess.discountValue || 0, 'SDG')}
              </strong>
            </div>

            {discountSuccess.maxDiscount && (
              <div>
                <span style={{ fontSize: '0.75rem', color: '#78350F', display: 'block', fontWeight: 600 }}>الحد الأقصى للخصم:</span>
                <strong style={{ fontSize: '1.05rem', color: '#B45309', direction: 'ltr', display: 'inline-block' }}>
                  {formatCurrency(discountSuccess.maxDiscount, 'SDG')}
                </strong>
              </div>
            )}
          </div>

          <p style={{ margin: '8px 0 0 0', fontSize: '0.8rem', color: '#78350F', fontWeight: 600 }}>
            💡 سيتم تطبيق هذا الخصم تلقائياً عند شراء أي باقة من المتجر قبل تأكيد الدفع.
          </p>
        </div>
      )}
    </div>
  );
};
