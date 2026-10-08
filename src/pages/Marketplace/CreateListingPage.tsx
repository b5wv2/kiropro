import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useWallet } from '../../context/WalletContext';
import {
  marketplaceApi,
  MarketplaceSettings,
  GameCategoryInfo
} from '../../services/marketplaceApi';
import {
  Store,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Upload,
  X,
  CreditCard,
  Gamepad2,
  Flame,
  Star,
  Info,
  Layers,
  Lock,
  Wallet
} from 'lucide-react';
import styles from './Marketplace.module.css';

interface CreateListingPageProps {
  onSuccess?: (code: string) => void;
  onCancel?: () => void;
}

export const CreateListingPage: React.FC<CreateListingPageProps> = ({ onSuccess, onCancel }) => {
  const { user, isAuthenticated, navigateTo } = useAuth();
  const { balance, formattedBalance, refreshBalance } = useWallet();

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

  // STEP 5: Images
  const [localFiles, setLocalFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [primaryIndex, setPrimaryIndex] = useState<number>(0);
  const [imageError, setImageError] = useState<string | null>(null);
  const [isUploadingImages, setIsUploadingImages] = useState<boolean>(false);

  // STEP 6 & 7: Submission
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
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
  const hasEnoughBalance = (balance ?? 0) >= currentFee;

  // Handle Fee Payment (Deduction from Wallet)
  const handlePayFee = async () => {
    setIsPaying(true);
    setPaymentError(null);

    try {
      const res = await marketplaceApi.payFee(durationDays);
      setPaymentId(res.paymentId);
      await refreshBalance();
      setCurrentStep(4); // Unlock form after successful payment!
    } catch (err: any) {
      setPaymentError(err.message || 'فشل إتمام عملية الدفع.');
    } finally {
      setIsPaying(false);
    }
  };

  // Image Selection & Validation
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImageError(null);
    const files = Array.from(e.target.files || []);

    if (files.length === 0) return;

    if (localFiles.length + files.length > 10) {
      setImageError('الحد الأقصى للصور هو 10 صور فقط لكل إعلان.');
      return;
    }

    const MAX_MB = 10;
    const MAX_BYTES = MAX_MB * 1024 * 1024;

    for (const f of files) {
      if (f.size > MAX_BYTES) {
        setImageError(`حجم الصورة (${f.name}) يتجاوز 10 MB. حجم الصورة يجب ألا يتجاوز 10 MB.`);
        return;
      }
    }

    const updatedFiles = [...localFiles, ...files];
    setLocalFiles(updatedFiles);

    // Generate previews
    const newPreviews = files.map(f => URL.createObjectURL(f));
    setImagePreviews(prev => [...prev, ...newPreviews]);
  };

  const handleRemoveImage = (indexToRemove: number) => {
    setLocalFiles(prev => prev.filter((_, idx) => idx !== indexToRemove));
    setImagePreviews(prev => {
      const urlToRemove = prev[indexToRemove];
      if (urlToRemove) URL.revokeObjectURL(urlToRemove);
      return prev.filter((_, idx) => idx !== indexToRemove);
    });

    if (primaryIndex === indexToRemove) {
      setPrimaryIndex(0);
    } else if (primaryIndex > indexToRemove) {
      setPrimaryIndex(primaryIndex - 1);
    }
  };

  // Final Submission
  const handleSubmitListing = async () => {
    if (!paymentId) {
      setSubmitError('يجب دفع رسوم الإعلان أولاً.');
      return;
    }

    if (!title.trim() || title.trim().length < 3) {
      setSubmitError('عنوان الإعلان يجب أن يكون 3 أحرف على الأقل.');
      return;
    }

    const numericPrice = parseFloat(price);
    if (isNaN(numericPrice) || numericPrice <= 0) {
      setSubmitError('يرجى كتابة سعر صحيح وأكبر من الصفر.');
      return;
    }

    if (!description.trim() || description.trim().length < 10) {
      setSubmitError('يرجى كتابة وصف تفصيلي للحساب (10 أحرف على الأقل).');
      return;
    }

    if (!sellerWhatsapp.trim() || sellerWhatsapp.trim().replace(/\D/g, '').length < 8) {
      setSubmitError('يرجى إدخال رقم واتساب صحيح للبائع (للتواصل الداخلي من قبل الإدارة).');
      return;
    }

    if (localFiles.length === 0) {
      setSubmitError('يجب إرفاق صورة واحدة على الأقل للحساب.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // 1. Upload Images to server
      setIsUploadingImages(true);
      const uploadRes = await marketplaceApi.uploadImages(localFiles);
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
        price: numericPrice,
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
      setSubmitError(err.message || 'فشل إرسال الإعلان للمراجعة.');
    } finally {
      setIsSubmitting(false);
      setIsUploadingImages(false);
    }
  };

  const selectedGameInfo = games.find(g => g.id === game) || {
    bindings: ['Google', 'Facebook', 'Apple', 'Twitter/X', 'VK', 'أخرى'],
    levels: ['1-20', '21-40', '41-60', '61-80', '81-100', '100+']
  };

  // SUCCESS STEP 7
  if (currentStep === 7 && createdListing) {
    return (
      <div className={styles.pageContainer}>
        <div className={styles.wizardContainer} style={{ textAlign: 'center', padding: '60px 24px' }}>
          <CheckCircle2 size={64} color="#10B981" style={{ margin: '0 auto 16px' }} />
          <h2 style={{ color: '#F9FAFB', fontSize: '1.6rem', marginBottom: 10 }}>
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
            maxWidth: 360,
            margin: '0 auto 28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <span style={{ color: '#9CA3AF', fontSize: '0.9rem' }}>كود الإعلان الخاص بك:</span>
            <span style={{ color: '#F59E0B', fontFamily: 'monospace', fontWeight: 900, fontSize: '1.15rem' }}>
              {createdListing.publicCode}
            </span>
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => {
                window.history.pushState({}, '', '/marketplace/my-ads');
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

  return (
    <div className={styles.pageContainer}>
      {/* Top Back Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
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

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#9CA3AF', fontSize: '0.9rem' }}>
          <Wallet size={16} color="#F59E0B" />
          <span>رصيدك في المحفظة: </span>
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
              <h2 style={{ color: '#F9FAFB', fontSize: '1.3rem', margin: '0 0 6px' }}>الخطوة 1: اختر اللعبة</h2>
              <p style={{ color: '#9CA3AF', fontSize: '0.9rem', margin: 0 }}>
                حدد اللعبة التي ترغب في عرض حسابك فيها.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div
                className={`${styles.feeCard} ${game === 'PUBG_MOBILE' ? styles.feeCardSelected : ''}`}
                onClick={() => setGame('PUBG_MOBILE')}
              >
                <Gamepad2 size={40} color="#F59E0B" />
                <span style={{ fontSize: '1.2rem', fontWeight: 900, color: '#FFFFFF' }}>ببجي موبايل</span>
                <span style={{ fontSize: '0.8rem', color: '#9CA3AF' }}>PUBG Mobile</span>
              </div>

              <div
                className={`${styles.feeCard} ${game === 'FREE_FIRE' ? styles.feeCardSelected : ''}`}
                onClick={() => setGame('FREE_FIRE')}
              >
                <Flame size={40} color="#EF4444" />
                <span style={{ fontSize: '1.2rem', fontWeight: 900, color: '#FFFFFF' }}>فري فاير</span>
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
              <h2 style={{ color: '#F9FAFB', fontSize: '1.3rem', margin: '0 0 6px' }}>الخطوة 2: اختر مدة عرض الإعلان</h2>
              <p style={{ color: '#9CA3AF', fontSize: '0.9rem', margin: 0 }}>
                رسوم النشر رسمية وتمنح إعلانك ظهوراً فعالاً في السوق طوال المدة المحددة.
              </p>
            </div>

            <div className={styles.feeGrid}>
              <div
                className={`${styles.feeCard} ${durationDays === 15 ? styles.feeCardSelected : ''}`}
                onClick={() => setDurationDays(15)}
              >
                <span className={styles.feeDuration}>15 يوماً</span>
                <span className={styles.feeAmount}>{fee15.toLocaleString()} SDG</span>
                <span style={{ fontSize: '0.8rem', color: '#9CA3AF' }}>ظهور كامل لمدة أسبوعين</span>
              </div>

              <div
                className={`${styles.feeCard} ${durationDays === 30 ? styles.feeCardSelected : ''}`}
                onClick={() => setDurationDays(30)}
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
              <h2 style={{ color: '#F9FAFB', fontSize: '1.3rem', margin: '0 0 6px' }}>الخطوة 3: تأكيد دفع رسوم النشر</h2>
              <p style={{ color: '#9CA3AF', fontSize: '0.9rem', margin: 0 }}>
                يتم خصم الرسوم مباشرة من محفظتك الحالية داخل KIROPRO قبل فتح نموذج البيانات.
              </p>
            </div>

            <div style={{
              background: '#1F2937',
              border: '1px solid #374151',
              borderRadius: 14,
              padding: 20,
              display: 'flex',
              flexDirection: 'column',
              gap: 12
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem' }}>
                <span style={{ color: '#9CA3AF' }}>اللعبة:</span>
                <span style={{ color: '#F9FAFB', fontWeight: 800 }}>
                  {game === 'PUBG_MOBILE' ? 'ببجي موبايل' : 'فري فاير'}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem' }}>
                <span style={{ color: '#9CA3AF' }}>مدة الإعلان:</span>
                <span style={{ color: '#F9FAFB', fontWeight: 800 }}>{durationDays} يوماً</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.1rem', paddingTop: 10, borderTop: '1px solid #374151' }}>
                <span style={{ color: '#9CA3AF' }}>رسوم النشر المطلوبة:</span>
                <span style={{ color: '#F59E0B', fontWeight: 900 }}>{currentFee.toLocaleString()} SDG</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem', paddingTop: 6 }}>
                <span style={{ color: '#9CA3AF' }}>رصيد محفظتك المتاح:</span>
                <span style={{ color: hasEnoughBalance ? '#10B981' : '#EF4444', fontWeight: 800 }}>
                  {formattedBalance}
                </span>
              </div>
            </div>

            {!hasEnoughBalance && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: 10,
                padding: 14,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10
              }}>
                <AlertTriangle size={20} color="#EF4444" style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <div style={{ color: '#EF4444', fontWeight: 800, fontSize: '0.95rem', marginBottom: 2 }}>
                    رصيدك غير كافٍ لدفع رسوم الإعلان!
                  </div>
                  <div style={{ color: '#D1D5DB', fontSize: '0.85rem' }}>
                    تحتاج إلى شحن محفظتك بمبلغ {(currentFee - (balance ?? 0)).toLocaleString()} SDG إضافية للمتابعة.
                  </div>
                  <button
                    type="button"
                    className={styles.primaryBtn}
                    onClick={() => navigateTo('account')}
                    style={{ marginTop: 10, padding: '6px 14px', fontSize: '0.85rem' }}
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

            <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
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
                <span>{isPaying ? 'جارٍ تأكيد الدفع...' : `تأكيد ودفع ${currentFee.toLocaleString()} SDG`}</span>
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
                <span>تم تأكيد دفع الرسوم بنجاح!</span>
              </div>
              <h2 style={{ color: '#F9FAFB', fontSize: '1.3rem', margin: 0 }}>الخطوة 4: أدخل بيانات الحساب</h2>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Title */}
              <div className={styles.filterGroup}>
                <label className={styles.filterLabel}>عنوان الإعلان *</label>
                <input
                  type="text"
                  placeholder="مثال: حساب ببجي مميز، أسلحة مطورة ماكس، بدلة إكس..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className={styles.filterInput}
                  maxLength={120}
                />
              </div>

              {/* Price & Negotiable */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className={styles.filterGroup}>
                  <label className={styles.filterLabel}>السعر المطلوب (SDG) *</label>
                  <input
                    type="number"
                    placeholder="مثال: 350000"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className={styles.filterInput}
                    min={1}
                  />
                </div>

                <div className={styles.filterGroup} style={{ justifyContent: 'center' }}>
                  <label className={styles.checkboxLabel} style={{ marginTop: 22 }}>
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
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
                  onChange={(e) => setDescription(e.target.value)}
                  className={styles.filterInput}
                  style={{ resize: 'vertical' }}
                />
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
                  onChange={(e) => setSellerWhatsapp(e.target.value)}
                  className={styles.filterInput}
                  dir="ltr"
                  style={{ textAlign: 'right' }}
                />
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
                if (!title.trim() || !price || !description.trim() || !sellerWhatsapp.trim()) {
                  alert('يرجى تعبئة كافة الحقول الإلزامية المطلوبة.');
                  return;
                }
                setCurrentStep(5);
              }}
              style={{ alignSelf: 'flex-start', marginTop: 10 }}
            >
              <span>متابعة لرفع صور الحساب</span>
            </button>
          </div>
        )}

        {/* STEP 5: Images Upload */}
        {currentStep === 5 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <h2 style={{ color: '#F9FAFB', fontSize: '1.3rem', margin: '0 0 6px' }}>الخطوة 5: صور الحساب</h2>
              <p style={{ color: '#9CA3AF', fontSize: '0.9rem', margin: 0 }}>
                ارفع من 1 إلى 10 صور للحساب. الحد الأقصى لكل صورة هو 10 MB.
              </p>
            </div>

            {/* Dropzone */}
            <label className={styles.uploadDropzone}>
              <input
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
              <Upload size={36} color="#F59E0B" style={{ margin: '0 auto 10px' }} />
              <div style={{ color: '#F9FAFB', fontWeight: 800, fontSize: '1rem', marginBottom: 4 }}>
                اضغط لاختيار صور من جهازك
              </div>
              <div style={{ color: '#9CA3AF', fontSize: '0.8rem' }}>
                صيغ مدعومة: JPG, PNG, WEBP (حجم كل صورة أقصاه 10 MB)
              </div>
            </label>

            {imageError && (
              <div style={{ color: '#EF4444', fontSize: '0.9rem', fontWeight: 700 }}>
                {imageError}
              </div>
            )}

            {/* Previews Grid */}
            {imagePreviews.length > 0 && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#9CA3AF', fontSize: '0.85rem', marginBottom: 8 }}>
                  <span>الصور المرفوعة ({imagePreviews.length}/10):</span>
                  <span>اضغط على أي صورة لجعلها الصورة الرئيسية (الغلاف)</span>
                </div>

                <div className={styles.imagesGrid}>
                  {imagePreviews.map((url, idx) => {
                    const isPrimary = idx === primaryIndex;
                    return (
                      <div
                        key={idx}
                        className={`${styles.imagePreviewCard} ${isPrimary ? styles.primaryImageBorder : ''}`}
                        onClick={() => setPrimaryIndex(idx)}
                        style={{ cursor: 'pointer' }}
                      >
                        <img src={url} alt={`preview ${idx}`} className={styles.previewImg} />
                        <button
                          type="button"
                          className={styles.removeImgBtn}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveImage(idx);
                          }}
                        >
                          ✕
                        </button>
                        {isPrimary && (
                          <span className={styles.primaryBadge}>الغلاف</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => setCurrentStep(4)}
              >
                <span>الرجوع</span>
              </button>

              <button
                type="button"
                className={styles.primaryBtn}
                disabled={localFiles.length === 0}
                onClick={() => setCurrentStep(6)}
                style={{ opacity: localFiles.length === 0 ? 0.5 : 1 }}
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
              <h2 style={{ color: '#F9FAFB', fontSize: '1.3rem', margin: '0 0 6px' }}>الخطوة 6: مراجعة الإعلان وتأكيد النشر</h2>
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
                <span className={styles.specsLabel}>عدد الصور:</span>
                <span className={styles.specsVal}>{localFiles.length} صور</span>
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

            <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
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
                      ? 'جارٍ رفع الصور...'
                      : 'جارٍ إرسال الإعلان...'
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
