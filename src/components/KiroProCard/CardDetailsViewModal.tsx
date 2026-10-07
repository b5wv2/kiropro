import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, ShieldCheck, AlertCircle } from 'lucide-react';
import { KiroProCard3D } from './KiroProCard3D';
import { CardComplianceModal } from './CardComplianceModal';
import { KiroProCardDetails } from '../../types';
import { api } from '../../lib/api';

interface CardDetailsViewModalProps {
  orderId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onShowToast?: (message: string, type?: 'success' | 'warning' | 'info') => void;
}

export const CardDetailsViewModal: React.FC<CardDetailsViewModalProps> = ({
  orderId,
  isOpen,
  onClose,
  onShowToast,
}) => {
  const [card, setCard] = useState<KiroProCardDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compliancePassed, setCompliancePassed] = useState(false);

  useEffect(() => {
    if (isOpen && orderId) {
      setCompliancePassed(false);
      setLoading(true);
      setError(null);

      api.get(`/api/kiropro-cards/order/${orderId}`)
        .then((res: any) => {
          if (res.success && res.card) {
            setCard(res.card);
          } else {
            setError(res.error || 'تعذر تحميل بيانات البطاقة.');
          }
        })
        .catch((err: any) => {
          setError(err?.response?.data?.error || err.message || 'فشل جلب بيانات البطاقة.');
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setCard(null);
      setCompliancePassed(false);
      setError(null);
    }
  }, [isOpen, orderId]);

  if (!isOpen) return null;

  return (
    <>
      {/* 1. Mandatory Compliance Pre-Check Modal */}
      <CardComplianceModal
        isOpen={isOpen && !compliancePassed && !loading && !error && Boolean(card)}
        onAccept={() => setCompliancePassed(true)}
        onClose={onClose}
      />

      {/* 2. Main 3D Card Reveal Modal (KIROPRO Luxury Dark Theme) */}
      <AnimatePresence>
        {isOpen && (compliancePassed || loading || error) && (
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
              {/* Subtle Brand Accent Light on Top */}
              <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-transparent via-[#FBBF24] to-transparent"></div>

              {/* 1. Header with Close Button */}
              <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-[#FBBF24]/10 border border-[#FBBF24]/30 flex items-center justify-center text-[#FBBF24]">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-black text-white">
                      بطاقة كيرو برو الافتراضية
                    </h3>
                    <p className="text-[11px] text-[#FBBF24] font-medium">
                      رصيد $1.00 • تسليم فوري وتخصيص آمن
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer border border-white/10"
                  aria-label="إغلاق"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Content Body */}
              {loading ? (
                <div className="py-14 flex flex-col items-center justify-center gap-3 text-center">
                  <Loader2 className="w-8 h-8 text-[#FBBF24] animate-spin" />
                  <p className="text-xs text-slate-300 font-bold">
                    جاري فك تشفير وتجهيز بيانات بطاقتك بأمان...
                  </p>
                </div>
              ) : error ? (
                <div className="py-10 px-4 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto mb-3">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-bold text-white mb-1">تعذر استعراض البطاقة</h4>
                  <p className="text-xs text-rose-300 mb-5">{error}</p>
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold text-white transition-colors cursor-pointer"
                  >
                    إغلاق النافذة
                  </button>
                </div>
              ) : card ? (
                <div className="flex flex-col items-center">
                  {/* Short Description */}
                  <p className="text-xs text-slate-400 mb-4 text-center max-w-sm">
                    Mastercard افتراضية مسبقة الدفع للاستخدام في المدفوعات والخدمات المدعومة.
                  </p>

                  {/* 3D Interactive Card Component */}
                  <div className="w-full">
                    <KiroProCard3D card={card} onShowToast={onShowToast} />
                  </div>

                  {/* Security Notice */}
                  <div className="w-full mt-4 p-3 rounded-xl bg-[#131722] border border-white/5 text-[11px] text-slate-400 text-center leading-relaxed">
                    🔒 بيانات البطاقة مشفرة بأمان. يرجى عدم مشاركة رقم البطاقة أو رمز CVV مع أي شخص.
                  </div>

                  {/* Bottom Close Action */}
                  <div className="w-full mt-3">
                    <button
                      type="button"
                      onClick={onClose}
                      className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white font-bold text-xs transition-colors cursor-pointer border border-white/10"
                    >
                      إغلاق النافذة
                    </button>
                  </div>
                </div>
              ) : null}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
