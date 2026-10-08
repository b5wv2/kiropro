import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useWallet } from '../../context/WalletContext';
import {
  marketplaceApi,
  MarketplaceSettings,
  GameCategoryInfo
} from '../../services/marketplaceApi';
import {
  compressImage,
  formatBytes
} from '../../utils/imageCompressor';
import {
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Upload,
  Gamepad2,
  Flame,
  Info,
  Layers,
  Lock,
  Wallet,
  UserCheck,
  Check
} from 'lucide-react';
import styles from './Marketplace.module.css';

interface CreateListingPageProps {
  onSuccess?: (code: string) => void;
  onCancel?: () => void;
}

interface ProcessedImageItem {
  id: string;
  file: File;
  previewUrl: string;
  originalName: string;
  originalSize: number;
  compressedSize: number;
  savingsPercent: number;
}

export const CreateListingPage: React.FC<CreateListingPageProps> = ({ onSuccess, onCancel }) => {
  const { isAuthenticated, navigateTo } = useAuth();
  const { balance, formattedBalance, refreshBalance, openDepositModal } = useWallet();

  const [settings, setSettings] = useState<MarketplaceSettings | null>(null);
  const [games, setGames] = useState<GameCategoryInfo[]>([]);
  const [currentStep, setCurrentStep] = useState<number>(1);

  // STEP 1: Game
  const [game, setGame] = useState<'PUBG_MOBILE' | 'FREE_FIRE'>('PUBG_MOBILE');

  // STEP 2: Duration
  const [durationDays, setDurationDays] = useState<15 | 30>(15);

  // STEP 3: Payment
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [isPaying, setIsPaying] = useState<boolean>(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // STEP 4: Account Info
  const [title, setTitle] = useState<string>('');
  const [price, setPrice] = useState<string>('');
  const [isNegotiable, setIsNegotiable] = useState<boolean>(false);
  const [accountLevel, setAccountLevel] = useState<string>('41-60');
  const [bindingType, setBindingType] = useState<string>('Google');
  const [customBinding, setCustomBinding] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [sellerWhatsapp, setSellerWhatsapp] = useState<string>('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // STEP 5: Images (Client-side compressed)
  const [imageItems, setImageItems] = useState<ProcessedImageItem[]>([]);
  const [primaryIndex, setPrimaryIndex] = useState<number>(0);
  const [isCompressing, setIsCompressing] = useState<boolean>(false);
  const [compressingStatusText, setCompressingStatusText] = useState<string>('');
  const [imageError, setImageError] = useState<string | null>(null);

  // STEP 6 & 7: Submission
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isUploadingImages, setIsUploadingImages] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdListing, setCreatedListing] = useState<any | null>(null);

  // Load marketplace settings
  useEffect(() => {
    marketplaceApi.getSettings()
      .then(res => {
        setSettings(res.settings);
        setGames(res.games);
      })
      .catch(e => console.warn('Failed to load settings:', e));
  }, []);

  const fee15 = settings?.fee_15_days || 1500;
  const fee30 = settings?.fee_30_days || 2500;
  const currentFee = durationDays === 15 ? fee15 : fee30;
  const currentBalanceNum = balance ?? 0;
  const hasEnoughBalance = currentBalanceNum >= currentFee;
  const remainingBalanceAfter = currentBalanceNum - currentFee;

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      imageItems.forEach(item => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
    };
  }, []);

  // Handle Fee Payment (Deduction from Wallet via POST /api/marketplace/pay-fee)
  const handlePayFee = async () => {
    if (!hasEnoughBalance || isPaying) return;

    setIsPaying(true);
    setPaymentError(null);

    try {
      const res = await marketplaceApi.payFee(durationDays);
      setPaymentId(res.paymentId);
      await refreshBalance();
      setCurrentStep(4); // Advance to Account Details Step
    } catch (err: any) {
      setPaymentError(err.message || 'تعذر إتمام عملية الدفع. يرجى التحقق من رصيد محفظتك والمحاولة مجدداً.');
    } finally {
      setIsPaying(false);
    }
  };

  // Image Selection & Client-Side Compression Flow
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setImageError(null);
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length === 0) return;

    if (imageItems.length + selectedFiles.length > 10) {
      setImageError(`الحد الأقصى هو 10 صور فقط لكل إعلان. يمكنك إضافة ${10 - imageItems.length} صور أخرى كحد أقصى.`);
      e.target.value = '';
      return;
    }

    setIsCompressing(true);
    const newItems: ProcessedImageItem[] = [];
    const errors: string[] = [];

    // Process files sequentially to maintain device memory stability on huge files
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      setCompressingStatusText(`جاري ضغط وتجهيز الصورة (${i + 1}/${selectedFiles.length}): "${file.name}"...`);

      try {
        const compressed = await compressImage(file, {
          maxDimension: 1920,
          initialQuality: 0.82,
          targetSizeBytes: 1.8 * 1024 * 1024,
          maxSizeBytes: 10 * 1024 * 1024
        });

        newItems.push({
          id: `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          file: compressed.file,
          previewUrl: compressed.previewUrl,
          originalName: compressed.originalName,
          originalSize: compressed.originalSize,
          compressedSize: compressed.compressedSize,
          savingsPercent: compressed.savingsPercent
        });
      } catch (err: any) {
        errors.push(`${file.name}: ${err.message}`);
      }
    }

    if (newItems.length > 0) {
      setImageItems(prev => [...prev, ...newItems]);
    }

    if (errors.length > 0) {
      setImageError(errors.join(' | '));
    }

    setIsCompressing(false);
    setCompressingStatusText('');
    e.target.value = '';
  };

  const handleRemoveImage = (indexToRemove: number) => {
    setImageItems(prev => {
      const item = prev[indexToRemove];
      if (item?.previewUrl) {
        URL.revokeObjectURL(item.previewUrl);
      }
      return prev.filter((_, idx) => idx !== indexToRemove);
    });

    if (primaryIndex === indexToRemove) {
      setPrimaryIndex(0);
    } else if (primaryIndex > indexToRemove) {
      setPrimaryIndex(primaryIndex - 1);
    }
  };

  // Step 4 Validation
  const validateStep4 = (): boolean => {
    const errors: Record<string, string> = {};

    if (!title.trim() || title.trim().length < 3) {
      errors.title = 'عنوان الإعلان يجب أن يتكون من 3 أحرف على الأقل.';
    }

    const numPrice = parseFloat(price);
    if (isNaN(numPrice) || numPrice <= 0) {
      errors.price = 'يرجى كتابة سعر صحيح وأكبر من الصفر.';
    }

    if (!description.trim() || description.trim().length < 10) {
      errors.description = 'يرجى كتابة وصف تفصيلي لمواصفات الحساب (10 أحرف على الأقل).';
    }

    const cleanPhone = sellerWhatsapp.trim().replace(/\D/g, '');
    if (!sellerWhatsapp.trim() || cleanPhone.length < 8) {
      errors.sellerWhatsapp = 'يرجى إدخال رقم واتساب صحيح للبائع للتواصل الإداري.';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Final Submission
  const handleSubmitListing = async () => {
    if (!paymentId) {
      setSubmitError('يجب دفع رسوم الإعلان أولاً للمتابعة.');
      return;
    }

    if (!validateStep4()) {
      setCurrentStep(4);
      return;
    }

    if (imageItems.length === 0) {
      setSubmitError('يجب إرفاق صورة واحدة على الأقل للحساب.');
      setCurrentStep(5);
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // 1. Upload Compressed Images to server
      setIsUploadingImages(true);
      const filesToUpload = imageItems.map(item => item.file);
      const uploadRes = await marketplaceApi.uploadImages(filesToUpload);
      setIsUploadingImages(false);

      const serverImages = uploadRes.images.map((img, idx) => ({
        storageKey: img.storageKey,
        imageUrl: img.imageUrl,
        isPrimary: idx === primaryIndex,
        sortOrder: idx,
        fileSize: img.fileSize,
        mimeType: img.mimeType
      }));

      // Effective binding
      const effectiveBinding = bindingType === 'أخرى' && customBinding.trim()
        ? customBinding.trim()
        : bindingType;

      // 2. Submit Listing
      const createRes = await marketplaceApi.createListing({
        paymentId,
        game,
        title: title.trim(),
        price: parseFloat(price),
        isNegotiable,
        accountLevel,
        bindingType: effectiveBinding,
        description: description.trim(),
        notes: notes.trim() || undefined,
        sellerWhatsapp: sellerWhatsapp.trim(),
        images: serverImages
      });

      setCreatedListing(createRes.listing);
      setCurrentStep(7);
      if (onSuccess) {
        onSuccess(createRes.listing.publicCode);
      }
    } catch (err: any) {
      console.error('Submit listing error:', err);
      setSubmitError(err.message || 'تعذر إرسال الإعلان للمراجعة. يرجى مراجعة البيانات والمحاولة مرة أخرى.');
    } finally {
      setIsSubmitting(false);
      setIsUploadingImages(false);
    }
  };

  const selectedGameInfo = games.find(g => g.id === game) || {
    bindings: ['Google', 'Facebook', 'Apple', 'Twitter/X', 'VK', 'أخرى'],
    levels: ['1-20', '21-40', '41-60', '61-80', '81-100', '100+']
  };

  // UNREGISTERED / GUEST GUARD
  if (!isAuthenticated) {
    return (
      <div className={styles.pageContainer}>
        <div className={styles.wizardContainer} style={{ textAlign: 'center', padding: '50px 24px' }}>
          <div className={styles.emptyIconCircle} style={{ margin: '0 auto 16px' }}>
            <UserCheck size={40} color="#F59E0B" />
          </div>
          <h2 style={{ color: '#F9FAFB', fontSize: '1.5rem', marginBottom: 10, fontWeight: 900 }}>
            تسجيل الدخول مطلوب لعرض حساب للبيع
          </h2>
          <p style={{ color: '#9CA3AF', maxWidth: 480, margin: '0 auto 24px', lineHeight: 1.6, fontSize: '0.95rem' }}>
            لعرض حسابك في سوق KIROPRO وتأكيد رسوم النشر من محفظتك، يرجى تسجيل الدخول إلى حسابك أو إنشاء حساب جديد.
          </p>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={() => navigateTo('login')}
            >
              <span>تسجيل الدخول</span>
            </button>

            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => navigateTo('register')}
            >
              <span>إنشاء حساب جديد</span>
            </button>

            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => {
                if (onCancel) onCancel();
                else navigateTo('marketplace');
              }}
            >
              <span>العودة إلى السوق</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // SUCCESS STEP 7
  if (currentStep === 7 && createdListing) {
    return (
      <div className={styles.pageContainer}>
        <div className={styles.wizardContainer} style={{ textAlign: 'center', padding: '50px 24px' }}>
          <CheckCircle2 size={64} color="#10B981" style={{ margin: '0 auto 16px' }} />
          <h2 style={{ color: '#F9FAFB', fontSize: '1.6rem', marginBottom: 10, fontWeight: 900 }}>
            تم إرسال إعلانك بنجاح للمراجعة!
          </h2>
          <p style={{ color: '#9CA3AF', maxWidth: 500, margin: '0 auto 24px', lineHeight: 1.6 }}>
            تم استلام تفاصيل حسابك ورسوم النشر بنجاح. سيقوم فريق الإدارة بمراجعة الإعلان واعتماده قريباً ليظهر في سوق الحسابات.
          </p>

          <div style={{
            background: '#1F2937',
            border: '1px solid #374151',
            borderRadius: 12,
            padding: '16px 24px',
            maxWidth: 380,
            margin: '0 auto 28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <span style={{ color: '#9CA3AF', fontSize: '0.9rem' }}>كود الإعلان الخاص بك:</span>
            <span style={{ color: '#F59E0B', fontFamily: 'monospace', fontWeight: 900, fontSize: '1.2rem' }}>
              {createdListing.publicCode}
            </span>
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => {
                window.history.pushState({}, '', '/marketplace/my-listings');
                window.dispatchEvent(new PopStateEvent('popstate'));
              }}
            >
              <Layers size={18} />
              <span>متابعة إعلاناتي</span>
            </button>

            <button
              type="button"
              className={styles.primaryBtn}
              onClick={() => {
                window.history.pushState({}, '', '/marketplace');
                window.dispatchEvent(new PopStateEvent('popstate'));
              }}
            >
              <span>الذهاب إلى السوق</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const totalOriginalBytes = imageItems.reduce((acc, item) => acc + item.originalSize, 0);
  const totalCompressedBytes = imageItems.reduce((acc, item) => acc + item.compressedSize, 0);
  const totalSavingsPct = totalOriginalBytes > 0
    ? Math.round(((totalOriginalBytes - totalCompressedBytes) / totalOriginalBytes) * 100)
    : 0;

  return (
    <div className={styles.pageContainer}>
      {/* Top Back Header */}
      <div className={styles.wizardTopBar}>
        <button
          type="button"
          className={styles.secondaryBtn}
          onClick={() => {
            if (onCancel) onCancel();
            else {
              window.history.pushState({}, '', '/marketplace');
              window.dispatchEvent(new PopStateEvent('popstate'));
            }
          }}
          style={{ padding: '6px 14px', fontSize: '0.85rem' }}
        >
          <ChevronRight size={16} />
          <span>إلغاء والعودة إلى السوق</span>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#9CA3AF', fontSize: '0.88rem' }}>
          <Wallet size={16} color="#F59E0B" />
          <span>رصيدك الحالي: </span>
          <span style={{ color: '#F59E0B', fontWeight: 900 }}>{formattedBalance}</span>
        </div>
      </div>

      <div className={styles.wizardContainer}>
        {/* Step Indicator */}
        <div className={styles.stepIndicator}>
          {[
            { step: 1, title: 'اللعبة' },
            { step: 2, title: 'المدة' },
            { step: 3, title: 'الدفع' },
            { step: 4, title: 'البيانات' },
            { step: 5, title: 'الصور' },
            { step: 6, title: 'المراجعة' }
          ].map(s => {
            const isDone = currentStep > s.step;
            const isActive = currentStep === s.step;
            return (
              <div key={s.step} className={styles.stepDot}>
                <div className={`${styles.stepCircle} ${isDone ? styles.stepCircleDone : isActive ? styles.stepCircleActive : ''}`}>
                  {isDone ? '✓' : s.step}
                </div>
                <span className={styles.stepTitle}>{s.title}</span>
              </div>
            );
          })}
        </div>

        {/* STEP 1: Select Game */}
        {currentStep === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <h2 style={{ color: '#F9FAFB', fontSize: '1.3rem', margin: '0 0 6px', fontWeight: 900 }}>الخطوة 1: اختر اللعبة</h2>
              <p style={{ color: '#9CA3AF', fontSize: '0.9rem', margin: 0 }}>
                حدد اللعبة التي ترغب في عرض حسابك فيها للبيع.
              </p>
            </div>

            <div className={styles.gamesSelectGrid}>
              <div
                className={`${styles.gameSelectCard} ${game === 'PUBG_MOBILE' ? styles.feeCardSelected : ''}`}
                onClick={() => setGame('PUBG_MOBILE')}
                role="button"
                tabIndex={0}
              >
                <Gamepad2 size={38} color="#F59E0B" />
                <span style={{ fontSize: '1.15rem', fontWeight: 900, color: '#FFFFFF' }}>ببجي موبايل</span>
                <span style={{ fontSize: '0.8rem', color: '#9CA3AF' }}>PUBG Mobile</span>
              </div>

              <div
                className={`${styles.gameSelectCard} ${game === 'FREE_FIRE' ? styles.feeCardSelected : ''}`}
                onClick={() => setGame('FREE_FIRE')}
                role="button"
                tabIndex={0}
              >
                <Flame size={38} color="#EF4444" />
                <span style={{ fontSize: '1.15rem', fontWeight: 900, color: '#FFFFFF' }}>فري فاير</span>
                <span style={{ fontSize: '0.8rem', color: '#9CA3AF' }}>Free Fire</span>
              </div>
            </div>

            <button
              type="button"
              className={styles.primaryBtn}
              onClick={() => setCurrentStep(2)}
              style={{ alignSelf: 'flex-start', marginTop: 10 }}
            >
              <span>متابعة لاختيار مدة النشر</span>
            </button>
          </div>
        )}

        {/* STEP 2: Select Duration */}
        {currentStep === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <h2 style={{ color: '#F9FAFB', fontSize: '1.3rem', margin: '0 0 6px', fontWeight: 900 }}>الخطوة 2: اختر مدة عرض الإعلان</h2>
              <p style={{ color: '#9CA3AF', fontSize: '0.9rem', margin: 0 }}>
                رسوم النشر رسمية وتمنح إعلانك ظهوراً فعالاً في السوق طوال المدة المحددة.
              </p>
            </div>

            <div className={styles.feeGrid}>
              <div
                className={`${styles.feeCard} ${durationDays === 15 ? styles.feeCardSelected : ''}`}
                onClick={() => setDurationDays(15)}
                role="button"
                tabIndex={0}
              >
                <span className={styles.feeDuration}>15 يوماً</span>
                <span className={styles.feeAmount}>{fee15.toLocaleString()} SDG</span>
                <span style={{ fontSize: '0.8rem', color: '#9CA3AF' }}>ظهور كامل لمدة أسبوعين</span>
              </div>

              <div
                className={`${styles.feeCard} ${durationDays === 30 ? styles.feeCardSelected : ''}`}
                onClick={() => setDurationDays(30)}
                role="button"
                tabIndex={0}
              >
                <span className={styles.feeDuration}>30 يوماً</span>
                <span className={styles.feeAmount}>{fee30.toLocaleString()} SDG</span>
                <span style={{ fontSize: '0.8rem', color: '#10B981', fontWeight: 800 }}>توفير أكبر (شهر كامل)</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => setCurrentStep(1)}
              >
                <span>الرجوع</span>
              </button>

              <button
                type="button"
                className={styles.primaryBtn}
                onClick={() => setCurrentStep(3)}
              >
                <span>متابعة للدفع والتأكيد</span>
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Strict Payment Verification Gating */}
        {currentStep === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <h2 style={{ color: '#F9FAFB', fontSize: '1.3rem', margin: '0 0 6px', fontWeight: 900 }}>الخطوة 3: تأكيد دفع رسوم النشر</h2>
              <p style={{ color: '#9CA3AF', fontSize: '0.9rem', margin: 0 }}>
                يتم خصم الرسوم مباشرة من محفظتك الحالية داخل KIROPRO قبل فتح نموذج البيانات.
              </p>
            </div>

            <div className={styles.paymentSummaryBox}>
              <div className={styles.paymentSummaryRow}>
                <span style={{ color: '#9CA3AF' }}>اللعبة المختارة:</span>
                <span style={{ color: '#F9FAFB', fontWeight: 800 }}>
                  {game === 'PUBG_MOBILE' ? 'ببجي موبايل' : 'فري فاير'}
                </span>
              </div>

              <div className={styles.paymentSummaryRow}>
                <span style={{ color: '#9CA3AF' }}>مدة الإعلان:</span>
                <span style={{ color: '#F9FAFB', fontWeight: 800 }}>{durationDays} يوماً</span>
              </div>

              <div className={styles.paymentSummaryRow} style={{ paddingTop: 10, borderTop: '1px solid #374151' }}>
                <span style={{ color: '#9CA3AF' }}>الرصيد الحالي في المحفظة:</span>
                <span style={{ color: hasEnoughBalance ? '#10B981' : '#EF4444', fontWeight: 900 }}>
                  {formattedBalance}
                </span>
              </div>

              <div className={styles.paymentSummaryRow}>
                <span style={{ color: '#9CA3AF', fontWeight: 700 }}>رسوم النشر المطلوبة:</span>
                <span style={{ color: '#F59E0B', fontWeight: 900, fontSize: '1.15rem' }}>
                  {currentFee.toLocaleString()} SDG
                </span>
              </div>

              <div className={styles.paymentSummaryRow} style={{ paddingTop: 8, borderTop: '1px solid #374151' }}>
                <span style={{ color: '#9CA3AF' }}>الرصيد المتبقي بعد الدفع:</span>
                <span style={{ color: hasEnoughBalance ? '#9CA3AF' : '#EF4444', fontWeight: 800 }}>
                  {hasEnoughBalance ? `${remainingBalanceAfter.toLocaleString()} SDG` : 'رصيد غير كافٍ'}
                </span>
              </div>
            </div>

            {!hasEnoughBalance && (
              <div className={styles.insufficientBalanceBox}>
                <AlertTriangle size={22} color="#EF4444" style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <div style={{ color: '#EF4444', fontWeight: 800, fontSize: '0.95rem', marginBottom: 3 }}>
                    رصيد المحفظة غير كافٍ!
                  </div>
                  <div style={{ color: '#D1D5DB', fontSize: '0.85rem', lineHeight: 1.5 }}>
                    المبلغ المتبقي في محفظتك أقل من الرسوم المطلوبة. تحتاج إلى إيداع {(currentFee - currentBalanceNum).toLocaleString()} SDG على الأقل للمتابعة.
                  </div>
                  <button
                    type="button"
                    className={styles.primaryBtn}
                    onClick={openDepositModal}
                    style={{ marginTop: 12, padding: '7px 16px', fontSize: '0.85rem' }}
                  >
                    <span>شحن المحفظة الآن</span>
                  </button>
                </div>
              </div>
            )}

            {paymentError && (
              <div style={{ color: '#EF4444', fontSize: '0.9rem', fontWeight: 700 }}>
                {paymentError}
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => setCurrentStep(2)}
                disabled={isPaying}
              >
                <span>الرجوع</span>
              </button>

              <button
                type="button"
                className={styles.primaryBtn}
                disabled={!hasEnoughBalance || isPaying}
                onClick={handlePayFee}
                style={{ opacity: !hasEnoughBalance || isPaying ? 0.6 : 1 }}
              >
                <Lock size={16} />
                <span>
                  {isPaying ? 'جارٍ خصم الرسوم وتأكيد الدفع...' : `تأكيد ودفع ${currentFee.toLocaleString()} SDG`}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: Account Details (Unlocked ONLY after Payment) */}
        {currentStep === 4 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#10B981', fontWeight: 800, fontSize: '0.85rem', marginBottom: 4 }}>
                <CheckCircle2 size={16} />
                <span>تم تأكيد دفع رسوم النشر بنجاح!</span>
              </div>
              <h2 style={{ color: '#F9FAFB', fontSize: '1.3rem', margin: 0, fontWeight: 900 }}>الخطوة 4: أدخل بيانات الحساب</h2>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Title */}
              <div className={styles.filterGroup}>
                <label className={styles.filterLabel}>عنوان الإعلان *</label>
                <input
                  type="text"
                  placeholder="مثال: حساب ببجي مميز، أسلحة مطورة ماكس، بدلة إكس..."
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    if (formErrors.title) setFormErrors(prev => ({ ...prev, title: '' }));
                  }}
                  className={styles.filterInput}
                  maxLength={120}
                />
                {formErrors.title && <span className={styles.fieldError}>{formErrors.title}</span>}
              </div>

              {/* Price & Negotiable */}
              <div className={styles.formTwoColumns}>
                <div className={styles.filterGroup}>
                  <label className={styles.filterLabel}>السعر المطلوب (SDG) *</label>
                  <input
                    type="number"
                    placeholder="مثال: 350000"
                    value={price}
                    onChange={(e) => {
                      setPrice(e.target.value);
                      if (formErrors.price) setFormErrors(prev => ({ ...prev, price: '' }));
                    }}
                    className={styles.filterInput}
                    min={1}
                  />
                  {formErrors.price && <span className={styles.fieldError}>{formErrors.price}</span>}
                </div>

                <div className={styles.filterGroup} style={{ justifyContent: 'center' }}>
                  <label className={styles.checkboxLabel} style={{ marginTop: 24 }}>
                    <input
                      type="checkbox"
                      checked={isNegotiable}
                      onChange={(e) => setIsNegotiable(e.target.checked)}
                      style={{ accentColor: '#F59E0B' }}
                    />
                    <span style={{ fontWeight: 700 }}>السعر قابل للتفاوض</span>
                  </label>
                </div>
              </div>

              {/* Level & Binding */}
              <div className={styles.formTwoColumns}>
                <div className={styles.filterGroup}>
                  <label className={styles.filterLabel}>مستوى الحساب *</label>
                  <select
                    value={accountLevel}
                    onChange={(e) => setAccountLevel(e.target.value)}
                    className={styles.filterSelect}
                  >
                    {selectedGameInfo.levels.map(lvl => (
                      <option key={lvl} value={lvl}>{lvl}</option>
                    ))}
                  </select>
                </div>

                <div className={styles.filterGroup}>
                  <label className={styles.filterLabel}>نوع الربط *</label>
                  <select
                    value={bindingType}
                    onChange={(e) => setBindingType(e.target.value)}
                    className={styles.filterSelect}
                  >
                    {selectedGameInfo.bindings.map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
              </div>

              {bindingType === 'أخرى' && (
                <div className={styles.filterGroup}>
                  <label className={styles.filterLabel}>حدد نوع الربط الآخر</label>
                  <input
                    type="text"
                    placeholder="اكتب نوع الربط..."
                    value={customBinding}
                    onChange={(e) => setCustomBinding(e.target.value)}
                    className={styles.filterInput}
                  />
                </div>
              )}

              {/* Description */}
              <div className={styles.filterGroup}>
                <label className={styles.filterLabel}>وصف تفاصيل الحساب ومميزاته *</label>
                <textarea
                  rows={4}
                  placeholder="اكتب تفاصيل الأسلحة، السكنات، الشدات، الشخصيات، الإنجازات..."
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value);
                    if (formErrors.description) setFormErrors(prev => ({ ...prev, description: '' }));
                  }}
                  className={styles.filterInput}
                  style={{ resize: 'vertical' }}
                />
                {formErrors.description && <span className={styles.fieldError}>{formErrors.description}</span>}
              </div>

              {/* Notes */}
              <div className={styles.filterGroup}>
                <label className={styles.filterLabel}>ملاحظات إضافية (اختياري)</label>
                <input
                  type="text"
                  placeholder="مثال: جاهز للتسليم الفوري عبر الإدارة"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className={styles.filterInput}
                />
              </div>

              {/* Private Seller WhatsApp */}
              <div className={styles.filterGroup}>
                <label className={styles.filterLabel}>رقم واتساب البائع (سري للإدارة فقط) *</label>
                <input
                  type="tel"
                  placeholder="مثال: +249912345678"
                  value={sellerWhatsapp}
                  onChange={(e) => {
                    setSellerWhatsapp(e.target.value);
                    if (formErrors.sellerWhatsapp) setFormErrors(prev => ({ ...prev, sellerWhatsapp: '' }));
                  }}
                  className={styles.filterInput}
                  dir="ltr"
                  style={{ textAlign: 'right' }}
                />
                {formErrors.sellerWhatsapp && <span className={styles.fieldError}>{formErrors.sellerWhatsapp}</span>}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#F59E0B', fontSize: '0.78rem', marginTop: 4 }}>
                  <Info size={14} />
                  <span>هذا الرقم مشفر ومحفوظ للاستخدام الإداري فقط ولن يظهر للعامة أبداً.</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              className={styles.primaryBtn}
              onClick={() => {
                if (validateStep4()) {
                  setCurrentStep(5);
                }
              }}
              style={{ alignSelf: 'flex-start', marginTop: 10 }}
            >
              <span>متابعة لرفع صور الحساب</span>
            </button>
          </div>
        )}

        {/* STEP 5: Images Upload with Client-Side Compression */}
        {currentStep === 5 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <h2 style={{ color: '#F9FAFB', fontSize: '1.3rem', margin: '0 0 6px', fontWeight: 900 }}>الخطوة 5: صور الحساب</h2>
              <p style={{ color: '#9CA3AF', fontSize: '0.9rem', margin: 0 }}>
                ارفع من 1 إلى 10 صور للحساب. يتم ضغط الصور تلقائياً في المتصفح لتسريع الرفع وتوفير البيانات مع الحفاظ على دقة التفاصيل.
              </p>
            </div>

            {/* Dropzone */}
            <label className={`${styles.uploadDropzone} ${isCompressing ? styles.uploadDropzoneDisabled : ''}`}>
              <input
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                style={{ display: 'none' }}
                disabled={isCompressing}
              />
              <Upload size={36} color="#F59E0B" style={{ margin: '0 auto 10px' }} />
              <div style={{ color: '#F9FAFB', fontWeight: 800, fontSize: '1rem', marginBottom: 4 }}>
                {isCompressing ? 'جارٍ معالجة وضغط الصور...' : 'اضغط لاختيار صور من جهازك (حتى 100 MB للصورة الأصلية)'}
              </div>
              <div style={{ color: '#9CA3AF', fontSize: '0.8rem' }}>
                يقوم النظام تلقائياً بضغط الصور وتحويلها لصيغة WebP خفيفة وعالية الجودة قبل الرفع
              </div>
            </label>

            {/* In-Progress Compression Box */}
            {isCompressing && (
              <div className={styles.compressionProgressBox}>
                <div className={styles.compressionSpinner} />
                <div style={{ flex: 1 }}>
                  <div style={{ color: '#F59E0B', fontWeight: 800, fontSize: '0.92rem' }}>
                    جاري فك وضغط الصور محلياً في المتصفح...
                  </div>
                  <div style={{ color: '#D1D5DB', fontSize: '0.82rem', marginTop: 3 }}>
                    {compressingStatusText}
                  </div>
                </div>
              </div>
            )}

            {imageError && (
              <div style={{ color: '#EF4444', fontSize: '0.9rem', fontWeight: 700 }}>
                {imageError}
              </div>
            )}

            {/* Total Savings Summary Banner */}
            {imageItems.length > 0 && (
              <div className={styles.totalSavingsBanner}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Check size={16} color="#10B981" />
                  <span>
                    تم ضغط {imageItems.length} صور: الحجم الأصلي {formatBytes(totalOriginalBytes)} ➔ بعد الضغط {formatBytes(totalCompressedBytes)}
                  </span>
                </div>
                <span className={styles.savingsTag}>
                  وفرت {totalSavingsPct}% من البيانات!
                </span>
              </div>
            )}

            {/* Previews Grid with Counter */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#9CA3AF', fontSize: '0.85rem', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                <span>الصور الجاهزة للرفع (<strong style={{ color: '#F59E0B' }}>{imageItems.length}/10</strong>):</span>
                <span>اضغط على أي صورة لاختيارها كغلاف الإعلان الرئيسي</span>
              </div>

              {imageItems.length > 0 && (
                <div className={styles.imagesGrid}>
                  {imageItems.map((item, idx) => {
                    const isPrimary = idx === primaryIndex;
                    return (
                      <div key={item.id} className={styles.imageCardWrapper}>
                        <div
                          className={`${styles.imagePreviewCard} ${isPrimary ? styles.primaryImageBorder : ''}`}
                          onClick={() => setPrimaryIndex(idx)}
                          style={{ cursor: 'pointer' }}
                        >
                          <img src={item.previewUrl} alt={`صورة ${idx + 1}`} className={styles.previewImg} />
                          <button
                            type="button"
                            className={styles.removeImgBtn}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveImage(idx);
                            }}
                            aria-label="حذف الصورة"
                          >
                            ✕
                          </button>
                          {isPrimary && (
                            <span className={styles.primaryBadge}>الغلاف</span>
                          )}
                        </div>
                        <div className={styles.imageCompressionStats}>
                          <span style={{ direction: 'ltr', fontSize: '0.7rem' }}>
                            {formatBytes(item.originalSize)} ➔ {formatBytes(item.compressedSize)}
                          </span>
                          <span className={styles.savingsTag}>وفرت {item.savingsPercent}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => setCurrentStep(4)}
                disabled={isCompressing}
              >
                <span>الرجوع</span>
              </button>

              <button
                type="button"
                className={styles.primaryBtn}
                disabled={imageItems.length === 0 || isCompressing}
                onClick={() => setCurrentStep(6)}
                style={{ opacity: imageItems.length === 0 || isCompressing ? 0.5 : 1 }}
              >
                <span>متابعة للمراجعة النهائية</span>
              </button>
            </div>
          </div>
        )}

        {/* STEP 6: Review & Final Submission */}
        {currentStep === 6 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <h2 style={{ color: '#F9FAFB', fontSize: '1.3rem', margin: '0 0 6px', fontWeight: 900 }}>الخطوة 6: مراجعة الإعلان وتأكيد النشر</h2>
              <p style={{ color: '#9CA3AF', fontSize: '0.9rem', margin: 0 }}>
                تأكد من صحة كافة البيانات المكتوبة قبل إرسال الحساب للمراجعة.
              </p>
            </div>

            <div className={styles.specsTable}>
              <div className={styles.specsRow}>
                <span className={styles.specsLabel}>اللعبة:</span>
                <span className={styles.specsVal}>{game === 'PUBG_MOBILE' ? 'ببجي موبايل' : 'فري فاير'}</span>
              </div>
              <div className={styles.specsRow}>
                <span className={styles.specsLabel}>عنوان الإعلان:</span>
                <span className={styles.specsVal}>{title}</span>
              </div>
              <div className={styles.specsRow}>
                <span className={styles.specsLabel}>السعر المطلوب:</span>
                <span className={styles.specsVal} style={{ color: '#F59E0B', fontWeight: 900 }}>
                  {Number(price).toLocaleString()} SDG ({isNegotiable ? 'قابل للتفاوض' : 'غير قابل للتفاوض'})
                </span>
              </div>
              <div className={styles.specsRow}>
                <span className={styles.specsLabel}>المستوى:</span>
                <span className={styles.specsVal}>{accountLevel}</span>
              </div>
              <div className={styles.specsRow}>
                <span className={styles.specsLabel}>نوع الربط:</span>
                <span className={styles.specsVal}>
                  {bindingType === 'أخرى' && customBinding ? customBinding : bindingType}
                </span>
              </div>
              <div className={styles.specsRow}>
                <span className={styles.specsLabel}>صور الحساب:</span>
                <span className={styles.specsVal}>
                  {imageItems.length} صور (مضغوطة بنجاح، الحجم الإجمالي المرفوع {formatBytes(totalCompressedBytes)})
                </span>
              </div>
              <div className={styles.specsRow}>
                <span className={styles.specsLabel}>مدة العرض المدفوعة:</span>
                <span className={styles.specsVal}>{durationDays} يوماً (مدفوعة ومؤكدة)</span>
              </div>
            </div>

            <div className={styles.disclaimerBox}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#F59E0B', fontWeight: 800, marginBottom: 4 }}>
                <ShieldCheck size={16} />
                <span>إقرار وشروط النشر</span>
              </div>
              <p style={{ margin: 0 }}>
                أقر بأن بيانات الحساب صحيحة وأنني المالك الفعلي للحساب.
                رسوم النشر هي رسوم لإتاحة العرض لفترة {durationDays} يوماً، وتخضع للمراجعة الإدارية قبل النشر العام.
              </p>
            </div>

            {submitError && (
              <div style={{ color: '#EF4444', fontSize: '0.9rem', fontWeight: 700 }}>
                {submitError}
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => setCurrentStep(5)}
                disabled={isSubmitting}
              >
                <span>تعديل الصور أو البيانات</span>
              </button>

              <button
                type="button"
                className={styles.primaryBtn}
                disabled={isSubmitting}
                onClick={handleSubmitListing}
              >
                <span>
                  {isSubmitting
                    ? isUploadingImages
                      ? 'جارٍ رفع الصور المضغوطة للسيرفر...'
                      : 'جارٍ إرسال الإعلان للمراجعة...'
                    : 'إرسال الإعلان للمراجعة الإدارية'}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
