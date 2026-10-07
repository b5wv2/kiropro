import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, ShieldCheck, CheckCircle2 } from 'lucide-react';

interface CardComplianceModalProps {
  isOpen: boolean;
  onAccept: () => void;
  onClose?: () => void;
  customNotice?: string;
}

export const CardComplianceModal: React.FC<CardComplianceModalProps> = ({
  isOpen,
  onAccept,
  onClose,
  customNotice,
}) => {
  const [acknowledged, setAcknowledged] = useState(false);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto" dir="rtl">
          {/* Backdrop with subtle blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm"
          />

          {/* Modal Container in KIROPRO Luxury Dark Theme */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-full max-w-md bg-[#0B0F19] border border-[#FBBF24]/30 rounded-2xl p-6 sm:p-7 shadow-2xl overflow-hidden z-10 my-auto"
          >
            {/* Top Yellow Brand Accent Line */}
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-transparent via-[#FBBF24] to-transparent"></div>

            {/* Icon & Title */}
            <div className="text-center mb-5">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#FBBF24]/10 border border-[#FBBF24]/25 mb-3 shadow-inner">
                <ShieldAlert className="w-6 h-6 text-[#FBBF24]" />
              </div>

              <h2 className="text-lg sm:text-xl font-black text-white tracking-tight">
                تنبيه قبل عرض البطاقة
              </h2>
              <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">
                هذه البطاقة مخصصة للاستخدام وفق شروط KiroPro Card.
              </p>
            </div>

            {/* Terms & Guidance Box */}
            <div className="rounded-xl bg-[#131722] border border-white/10 p-4 mb-4 space-y-2.5 text-xs text-slate-300 leading-relaxed">
              <div className="flex items-center gap-2 text-[#FBBF24] font-bold pb-1.5 border-b border-white/5">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>إرشادات الاستخدام والأمان:</span>
              </div>

              <ul className="space-y-1.5 text-slate-300 pr-1 list-disc list-inside">
                <li>
                  بعد عرض بيانات البطاقة، ستتمكن من رؤية رقم البطاقة ورمز الأمان (CVV).
                </li>
                <li>
                  <strong className="text-amber-300">لا تشارك بيانات البطاقة السرية مع أي شخص</strong> لحماية رصيدك.
                </li>
                <li>
                  البطاقة مشحونة برصيد $1.00 ومخصصة للاستخدام المباشر في المتاجر والخدمات الإلكترونية المدعومة.
                </li>
                {customNotice && (
                  <li className="text-amber-200">
                    {customNotice}
                  </li>
                )}
              </ul>
            </div>

            {/* Mandatory Checkbox Agreement */}
            <label className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/10 cursor-pointer mb-5 hover:bg-white/[0.06] transition-colors">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                className="mt-0.5 w-4 h-4 text-[#FBBF24] rounded border-white/20 bg-black/40 focus:ring-0 cursor-pointer accent-[#FBBF24]"
              />
              <span className="text-xs font-bold text-slate-200 select-none leading-relaxed">
                أوافق على شروط الاستخدام وأؤكد حفظ بيانات البطاقة في مكان آمن
              </span>
            </label>

            {/* Action Buttons */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={!acknowledged}
                onClick={onAccept}
                className="flex-1 py-3 px-4 rounded-xl bg-[#FBBF24] hover:bg-[#eab308] disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-[#0B0F19] font-black text-sm flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer"
              >
                <span>متابعة وعرض البطاقة</span>
                <CheckCircle2 className="w-4 h-4" />
              </button>

              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="py-3 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white text-xs font-bold transition-colors cursor-pointer border border-white/10"
                >
                  إلغاء
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
