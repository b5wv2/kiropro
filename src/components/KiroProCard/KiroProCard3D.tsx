import React, { useState, useRef, useEffect } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Copy, Check, Eye, EyeOff, RotateCcw, Wifi, ShieldCheck, Printer } from 'lucide-react';
import { KiroProCardDetails } from '../../types';
import styles from './KiroProCard.module.css';

interface KiroProCard3DProps {
  card: KiroProCardDetails;
  onShowToast?: (message: string, type?: 'success' | 'warning' | 'info') => void;
}

export const KiroProCard3D: React.FC<KiroProCard3DProps> = ({
  card,
  onShowToast,
}) => {
  const [isFlipped, setIsFlipped] = useState(false);
  const [isNumberRevealed, setIsNumberRevealed] = useState(false);
  const [isCvvRevealed, setIsCvvRevealed] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isMobileDevice, setIsMobileDevice] = useState(false);

  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobileDevice(window.innerWidth < 768 || 'ontouchstart' in window);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Mouse tilt tracking physics
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  // Smooth springs for high-end physical weight feel
  const springConfig = { damping: 25, stiffness: 220, mass: 0.5 };
  const rotateX = useSpring(useTransform(mouseY, [-0.5, 0.5], [10, -10]), springConfig);
  const rotateY = useSpring(useTransform(mouseX, [-0.5, 0.5], [-12, 12]), springConfig);

  // Dynamic subtle sheen
  const sheenX = useTransform(mouseX, [-0.5, 0.5], ['0%', '100%']);
  const sheenY = useTransform(mouseY, [-0.5, 0.5], ['0%', '100%']);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isMobileDevice || !cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const xFromCenter = (e.clientX - rect.left - width / 2) / width;
    const yFromCenter = (e.clientY - rect.top - height / 2) / height;

    mouseX.set(xFromCenter);
    mouseY.set(yFromCenter);
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(label);
      if (onShowToast) {
        onShowToast(`تم نسخ ${label} بنجاح`, 'success');
      }
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      if (onShowToast) {
        onShowToast(`تعذر نسخ ${label}`, 'warning');
      }
    }
  };

  const formattedCardNumber = card.cardNumber || '5532 9841 2048 7619';
  const cleanNum = formattedCardNumber.replace(/\s/g, '');
  const last4 = card.last4 || cleanNum.slice(-4);
  const displayCardNumber = isNumberRevealed
    ? formattedCardNumber
    : `•••• •••• •••• ${last4}`;

  const rawCvv = card.cvv || '961';
  const displayCvv = isCvvRevealed ? rawCvv : '•••';

  const handleCopyAll = () => {
    const text = `بطاقة كيرو برو الافتراضية | KIROPRO CARD
رقم البطاقة: ${cleanNum}
تاريخ الانتهاء: ${card.expDate}
رمز الأمان (CVV): ${rawCvv}
الرصيد: $${Number(card.balance || 1.00).toFixed(2)}
النوع: Mastercard Virtual`;

    handleCopy(text, 'جميع بيانات البطاقة');
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="w-full flex flex-col items-center" dir="rtl">
      {/* 3D Viewport Container */}
      <div
        className={styles.perspectiveContainer}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <motion.div
          ref={cardRef}
          style={{
            rotateX: isMobileDevice ? 0 : rotateX,
            rotateY: isFlipped ? 180 : (isMobileDevice ? 0 : rotateY),
            transformStyle: 'preserve-3d',
          }}
          transition={{
            rotateY: { duration: 0.6, ease: [0.23, 1, 0.32, 1] },
          }}
          className={styles.cardWrapper}
        >
          {/* ============================================================== */}
          {/* FRONT FACE (KIROPRO Black + Yellow Official Theme)             */}
          {/* ============================================================== */}
          <div className={styles.cardFace}>
            {/* Subtle Specular Sheen */}
            <motion.div
              style={{
                backgroundPosition: `${sheenX} ${sheenY}`,
              }}
              className={styles.hologramSheen}
            />

            {/* Brushed Texture */}
            <div className={styles.metalTexture}></div>

            {/* Top Row: Official KIROPRO Brand & Status/Balance */}
            <div className="relative z-10 flex items-center justify-between">
              {/* KIROPRO Official Brand Logo (Strictly LTR) */}
              <div className={styles.brandLogo} dir="ltr">
                <div className={styles.logoMark}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                </div>
                <div className={styles.logoText}>
                  <span className={styles.brandName}>KIRO</span>
                  <span className={styles.brandBadge}>PRO</span>
                </div>
              </div>

              {/* Status Badge & Balance: نشطة • $1.00 */}
              <div className={styles.statusBadge}>
                <span className={styles.statusDot}></span>
                <span>نشطة • ${Number(card.balance || 1.00).toFixed(2)}</span>
              </div>
            </div>

            {/* Middle Section: Chip + Contactless + Card Number */}
            <div className="relative z-10 my-auto pt-2">
              <div className="flex items-center gap-3 mb-3">
                {/* Gold EMV Chip */}
                <div className={styles.emvChip}>
                  <div className={styles.chipDivider}></div>
                  <div className={styles.chipInner}>
                    <div className={styles.chipSquare}></div>
                    <div className={styles.chipSquare}></div>
                  </div>
                  <div className={styles.chipDivider}></div>
                </div>

                {/* Contactless Waves */}
                <div className="text-[#FBBF24]/80">
                  <Wifi className="w-5 h-5 rotate-90" />
                </div>
              </div>

              {/* Card Number Line (Masked by default, Reveal on Click) */}
              <div className="flex items-center justify-between">
                <span className={styles.cardNumberDisplay} dir="ltr">
                  {displayCardNumber}
                </span>

                <div className="flex items-center gap-1.5" dir="ltr">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsNumberRevealed(!isNumberRevealed);
                    }}
                    title={isNumberRevealed ? 'إخفاء رقم البطاقة' : 'إظهار رقم البطاقة'}
                    className={styles.cardControlBtn}
                  >
                    {isNumberRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopy(cleanNum, 'رقم البطاقة');
                    }}
                    title="نسخ رقم البطاقة"
                    className={styles.cardControlBtn}
                  >
                    {copiedField === 'رقم البطاقة' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Bottom Row: Expiry, Category & Mastercard Interlocking Circles */}
            <div className="relative z-10 flex items-end justify-between">
              {/* Expiry Date (Strictly LTR) */}
              <div dir="ltr" className="text-left">
                <span className="block text-[8.5px] uppercase tracking-wider text-slate-400 font-bold mb-0.5">
                  VALID THRU
                </span>
                <span className="font-mono text-sm sm:text-base font-bold text-white drop-shadow">
                  {card.expDate || '12/28'}
                </span>
              </div>

              {/* Sub-label */}
              <div className="text-center">
                <span className="text-[9.5px] font-mono font-bold text-[#FBBF24] tracking-widest uppercase">
                  VIRTUAL PREPAID
                </span>
              </div>

              {/* Mastercard Dual-Circle Logo */}
              <div className={styles.mastercardLogo} dir="ltr">
                <div className={styles.mcRed}></div>
                <div className={styles.mcYellow}></div>
              </div>
            </div>
          </div>

          {/* ============================================================== */}
          {/* BACK FACE (Rotated 180 deg)                                    */}
          {/* ============================================================== */}
          <div className={`${styles.cardFace} ${styles.cardFaceBack}`}>
            {/* Magnetic Stripe */}
            <div className={styles.magneticStripe}>
              <span className={styles.magneticText}>
                KIROPRO SECURE CARD CLEARING NETWORK • 256-BIT ENCRYPTED
              </span>
            </div>

            {/* Signature Strip & CVV Section */}
            <div className={styles.signatureSection}>
              <div className={styles.signatureStrip}>
                <span>Authorized KiroPro User</span>
              </div>

              {/* CVV Box (Strictly LTR, Masked by default) */}
              <div className={styles.cvvBox} dir="ltr">
                <div className="text-center">
                  <span className={styles.cvvLabel}>CVV</span>
                  <span className={styles.cvvValue}>{displayCvv}</span>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsCvvRevealed(!isCvvRevealed);
                  }}
                  title={isCvvRevealed ? 'إخفاء CVV' : 'إظهار CVV'}
                  className={styles.cardControlBtn}
                >
                  {isCvvRevealed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCopy(rawCvv, 'رمز CVV');
                  }}
                  title="نسخ CVV"
                  className={styles.cardControlBtn}
                >
                  {copiedField === 'رمز CVV' ? (
                    <Check className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </button>
              </div>
            </div>

            {/* Footer with Minimal Regulatory Notice */}
            <div className={styles.backFooter}>
              <div className={styles.legalText}>
                بطاقة ماستركارد افتراضية مسبقة الدفع صادرة للاستخدام في الخدمات والمدفوعات الإلكترونية المدعومة عبر منصة KIROPRO.
              </div>

              <div className={styles.hologramBadge}>
                MC
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Card Controls & Flip Button */}
      <div className="mt-4 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => setIsFlipped(!isFlipped)}
          className={styles.flipBtn}
        >
          <RotateCcw className="w-4 h-4 text-[#FBBF24]" />
          <span>{isFlipped ? 'تدوير للوجه الأمامي (رقم البطاقة)' : 'تدوير للوجه الخلفي (رمز CVV)'}</span>
        </button>
      </div>

      {/* Quick-Action Tray */}
      <div className="w-full max-w-md mt-4 p-3.5 rounded-2xl bg-[#0B0F19] border border-[#FBBF24]/20 shadow-lg flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="text-xs text-slate-300 font-semibold">
            رصيد البطاقة: ${Number(card.balance || 1.00).toFixed(2)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopyAll}
            className="px-3 py-1.5 rounded-xl bg-[#FBBF24]/10 hover:bg-[#FBBF24]/20 border border-[#FBBF24]/30 text-xs font-bold text-[#FBBF24] transition-all flex items-center gap-1.5 cursor-pointer"
          >
            {copiedField === 'جميع بيانات البطاقة' ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            <span>نسخ كافة البيانات</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            title="طباعة إيصال البطاقة"
            className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer border border-white/10"
          >
            <Printer className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
