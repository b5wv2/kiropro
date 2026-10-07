import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, KeyRound, Loader2, Sparkles, AlertCircle, CheckCircle2 } from 'lucide-react';
import { KiroProCard3D } from './KiroProCard3D';
import { KiroProCardDetails } from '../../types';
import { api } from '../../lib/api';

interface CardRedemptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onShowToast?: (message: string, type?: 'success' | 'warning' | 'info') => void;
}

export const CardRedemptionModal: React.FC<CardRedemptionModalProps> = ({
  isOpen,
  onClose,
  onShowToast,
}) => {
  const [voucherCode, setVoucherCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claimedCard, setClaimedCard] = useState<KiroProCardDetails | null>(null);
  const [validatedInfo, setValidatedInfo] = useState<{ value: number; message: string } | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  const handleValidateCode = async (codeToTest: string) => {
    const clean = codeToTest.trim().toUpperCase();
    if (clean.length < 8) {
      setValidatedInfo(null);
      return;
    }

    setIsValidating(true);
    try {
      const res: any = await api.post('/api/kiropro-cards/validate-code', { code: clean });
      if (res && res.valid) {
        setValidatedInfo({ value: res.value || 2.00, message: res.message });
        setError(null);
      } else {
        setValidatedInfo(null);
      }
    } catch (err: any) {
      setValidatedInfo(null);
      // Don't show hard error while typing unless submitted
    } finally {
      setIsValidating(false);
    }
  };

  const handleRedeem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voucherCode.trim() || loading) return;

    setLoading(true);
    setError(null);

    try {
      const res: any = await api.post('/api/kiropro-cards/redeem-issuance-code', {
        code: voucherCode.trim().toUpperCase(),
      });

      if (res.success && res.card) {
        setClaimedCard(res.card);
        if (onShowToast) {
          onShowToast('تم إصدار واستلام البطاقة بنجاح 🎉', 'success');
        }
      } else {
        setError(res.error || 'فشل استرداد كود الإصدار.');
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message || 'كود الإصدار غير صالح أو تم استخدامه مسبقاً.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setVoucherCode('');
    setError(null);
    setClaimedCard(null);
    setValidatedInfo(null);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto" dir="rtl">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/85 backdrop-blur-md"
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative w-full max-w-lg bg-[#0B0F19] border border-[#FBBF24]/30 rounded-3xl p-5 sm:p-7 shadow-2xl z-10 my-auto text-slate-100 overflow-hidden"
        >
          {/* Subtle Top Accent */}
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-transparent via-[#FBBF24] to-transparent"></div>

          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#FBBF24]/10 border border-[#FBBF24]/30 flex items-center justify-center text-[#FBBF24]">
                <KeyRound className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-black text-white">
                  استرداد كود إصدار KiroPro Card
                </h3>
                <p className="text-[11px] text-slate-400">
                  أدخل كود الإصدار المعتمد لاستلام بطاقتك الافتراضية فوراً
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer border border-white/10"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {!claimedCard ? (
            <form onSubmit={handleRedeem} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  كود الإصدار (Issuance Code):
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={voucherCode}
                    onChange={(e) => {
                      const val = e.target.value.toUpperCase();
                      setVoucherCode(val);
                      handleValidateCode(val);
                    }}
                    placeholder="KPC-XXXX-XXXX-XXXX"
                    required
                    dir="ltr"
                    className="w-full bg-[#131722] border border-[#FBBF24]/40 focus:border-[#FBBF24] rounded-xl px-4 py-3 text-white font-mono text-sm tracking-widest outline-none transition-colors placeholder:text-slate-600 placeholder:tracking-normal placeholder:font-sans"
                  />
                  {isValidating && (
                    <div className="absolute left-3 top-3.5 text-[#FBBF24]">
                      <Loader2 className="w-4 h-4 animate-spin" />
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  مثال: <span className="font-mono text-[#FBBF24]">KPC-A1B2-C3D4-E5F6</span> (يعادل عملية إصدار بقيمة $2.00)
                </p>
              </div>

              {/* Validation Success Feedback */}
              {validatedInfo && (
                <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-xs text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{validatedInfo.message}</span>
                </div>
              )}

              {/* Error Message */}
              {error && (
                <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/30 text-xs text-rose-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !voucherCode.trim()}
                className="w-full py-3 px-4 rounded-xl bg-[#FBBF24] hover:bg-[#eab308] disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-[#0B0F19] font-black text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>جاري تخصيص واسترداد البطاقة فوراً...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>استرداد الكود وإصدار البطاقة</span>
                  </>
                )}
              </button>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="text-center">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 font-bold mb-2">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  تم استرداد البطاقة بنجاح
                </span>
                <h4 className="text-sm font-bold text-white">
                  بطاقتك الافتراضية جاهزة للاستخدام الفوري:
                </h4>
              </div>

              <KiroProCard3D card={claimedCard} onShowToast={onShowToast} />

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleReset}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-xs font-bold transition-colors cursor-pointer border border-white/10"
                >
                  استرداد كود آخر
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-[#FBBF24] hover:bg-[#eab308] text-[#0B0F19] text-xs font-black transition-colors cursor-pointer"
                >
                  تم وحفظ البطاقة
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
