import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useWallet } from '../../context/WalletContext';
import {
  fetchVirtualNumberCatalog,
  fetchUserAttempts,
  fetchProvidersForService,
  createVirtualNumberOrder,
  fetchVirtualNumberOrder,
  cancelVirtualNumberOrder,
  VirtualNumberCatalog,
  UserAttemptsInfo,
  VirtualNumberOrder,
  VirtualNumberProviderOffer
} from '../../services/virtualNumberApi';
import {
  Zap,
  Clock,
  Copy,
  Check,
  AlertTriangle,
  RefreshCw,
  Server,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  ChevronLeft
} from 'lucide-react';
import styles from './VirtualNumbers.module.css';

export const VirtualNumbersPage: React.FC = () => {
  const { isAuthenticated, navigateTo } = useAuth();
  const { formattedBalance, refreshBalance } = useWallet();

  const [catalog, setCatalog] = useState<VirtualNumberCatalog | null>(null);
  const [attemptsInfo, setAttemptsInfo] = useState<UserAttemptsInfo | null>(null);

  // Step 1: Selected Country
  const [selectedCountry, setSelectedCountry] = useState<string>('usa');

  // Step 2: Selected Service Category (Service = Category, NOT final offer)
  const [selectedService, setSelectedService] = useState<string>('whatsapp');

  // Step 3: Explicit Providers / Offers List
  const [providers, setProviders] = useState<VirtualNumberProviderOffer[]>([]);
  const [loadingProviders, setLoadingProviders] = useState<boolean>(false);
  const [selectedProvider, setSelectedProvider] = useState<VirtualNumberProviderOffer | null>(null);

  // Active Order State
  const [activeOrder, setActiveOrder] = useState<VirtualNumberOrder | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);

  // Order Interaction State
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [isCancelConfirmOpen, setIsCancelConfirmOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // Countdown timer for active order (5 minutes)
  const [secondsRemaining, setSecondsRemaining] = useState<number>(300);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 1. Load catalog on mount
  useEffect(() => {
    loadCatalog();
  }, []);

  // 2. Load attempts info when user is authenticated
  useEffect(() => {
    if (isAuthenticated) {
      loadAttempts();
    }
  }, [isAuthenticated]);

  // 3. Load Providers whenever selectedCountry or selectedService changes
  useEffect(() => {
    if (selectedCountry && selectedService) {
      loadProviders(selectedCountry, selectedService);
    }
  }, [selectedCountry, selectedService]);

  const loadCatalog = async () => {
    try {
      const data = await fetchVirtualNumberCatalog();
      setCatalog(data);
    } catch (err: any) {
      console.error('Failed to load virtual numbers catalog:', err);
    }
  };

  const loadAttempts = async () => {
    try {
      const data = await fetchUserAttempts();
      setAttemptsInfo(data);
    } catch (err) {
      console.warn('Failed to load user attempts:', err);
    }
  };

  const loadProviders = async (countryCode: string, serviceCode: string) => {
    setLoadingProviders(true);
    setSelectedProvider(null); // STRICT: Clear selection so user must explicitly choose
    setOrderError(null);
    try {
      const list = await fetchProvidersForService(countryCode, serviceCode);
      setProviders(list);
    } catch (err: any) {
      console.error('Failed to fetch providers:', err);
      setProviders([]);
    } finally {
      setLoadingProviders(false);
    }
  };

  // Active Order Poller & Countdown
  useEffect(() => {
    if (!activeOrder) return;

    const isWaiting = ['WAITING_FOR_NUMBER', 'NUMBER_RECEIVED', 'WAITING_FOR_CODE'].includes(activeOrder.status);
    if (!isWaiting) {
      if (pollingRef.current) clearInterval(pollingRef.current);
      return;
    }

    if (activeOrder.expiresAt) {
      const diffMs = new Date(activeOrder.expiresAt).getTime() - Date.now();
      setSecondsRemaining(Math.max(0, Math.floor(diffMs / 1000)));
    } else {
      setSecondsRemaining(300);
    }

    const timerInterval = setInterval(() => {
      setSecondsRemaining(prev => {
        if (prev <= 1) return 0;
        return prev - 1;
      });
    }, 1000);

    pollingRef.current = setInterval(async () => {
      try {
        const updated = await fetchVirtualNumberOrder(activeOrder.id);
        setActiveOrder(updated);

        if (['COMPLETED', 'CANCELED', 'REFUNDED', 'EXPIRED', 'FAILED'].includes(updated.status)) {
          if (pollingRef.current) clearInterval(pollingRef.current);
          loadAttempts();
          refreshBalance();
        }
      } catch (err) {
        console.warn('Polling error:', err);
      }
    }, 3500);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      clearInterval(timerInterval);
    };
  }, [activeOrder?.id, activeOrder?.status]);

  const handleStartOrderClick = () => {
    if (!isAuthenticated) {
      navigateTo('login');
      return;
    }

    if (!selectedProvider) {
      setOrderError('يرجى اختيار مزود الرقم أولاً من القائمة أدناه.');
      return;
    }

    setOrderError(null);
    setIsConfirmModalOpen(true);
  };

  const handleConfirmOrder = async () => {
    if (!selectedProvider) return;

    setIsConfirmModalOpen(false);
    setSubmitting(true);
    setOrderError(null);

    try {
      const order = await createVirtualNumberOrder({
        countryCode: selectedCountry,
        serviceCode: selectedService,
        providerId: selectedProvider.providerId,
        offerId: selectedProvider.id
      });
      setActiveOrder(order);
      loadAttempts();
      refreshBalance();
    } catch (err: any) {
      setOrderError(err.message || 'تعذر معالجة طلبك حالياً. يرجى المحاولة لاحقاً.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!activeOrder) return;
    setCancelling(true);
    try {
      const res = await cancelVirtualNumberOrder(activeOrder.id);
      setActiveOrder(res.order);
      setIsCancelConfirmOpen(false);
      loadAttempts();
      refreshBalance();
    } catch (err: any) {
      alert(err.message || 'فشل إلغاء الطلب.');
    } finally {
      setCancelling(false);
    }
  };

  const copyToClipboard = (text: string, type: 'phone' | 'code') => {
    navigator.clipboard.writeText(text);
    if (type === 'phone') {
      setCopiedPhone(true);
      setTimeout(() => setCopiedPhone(false), 2000);
    } else {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const selectedCountryObj = catalog?.allowedCountries.find(c => c.code === selectedCountry);
  const selectedServiceObj = catalog?.allowedServices.find(s => s.code === selectedService);

  return (
    <div className={styles.pageContainer}>
      
      {/* 1. Compact Header (Replaces Giant Hero) */}
      <div className={styles.compactHeader}>
        <div className={styles.headerMain}>
          <div className={styles.headerTitleRow}>
            <h1 className={styles.headerTitle}>📱 الأرقام الافتراضية</h1>
            <span className={styles.headerBadge}>OTP فوري ⚡</span>
          </div>
          <p className={styles.headerSubtitle}>
            أرقام مؤقتة لاستقبال رموز التحقق وتفعيل حساباتك بسرعة وأمان.
          </p>
        </div>

        <div className={styles.headerPills}>
          {isAuthenticated && attemptsInfo && attemptsInfo.freeRemaining > 0 && (
            <div className={styles.promoPill}>
              <span>🎁 لديك {attemptsInfo.freeRemaining} محاولات مجانية متبقية</span>
            </div>
          )}
          <div className={styles.balancePill}>
            <span>رصيد المحفظة:</span>
            <strong>{formattedBalance}</strong>
          </div>
        </div>
      </div>

      {/* 2. Active Order Screen (If an order is in progress or completed) */}
      {activeOrder && (
        <div className={styles.activeOrderCard}>
          <div className={styles.activeOrderHeader}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: '1.4rem' }}>
                  {catalog?.allowedCountries.find(c => c.code === activeOrder.countryCode)?.flag || '🌐'}
                </span>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--text-primary)', margin: 0 }}>
                  طلب رقم {activeOrder.serviceNameAr} ({activeOrder.countryNameAr})
                </h3>
              </div>
              <div className={styles.activeOrderMeta}>
                <span>رقم الطلب: <strong>#{activeOrder.id.slice(0, 8)}</strong></span>
                <span>المزود: <strong style={{ color: '#D97706' }}>{activeOrder.providerName || activeOrder.operator}</strong></span>
                <span>السعر: <strong style={{ color: '#059669' }}>{activeOrder.chargedAmount > 0 ? `${activeOrder.chargedAmount} SDG` : '0 ج.س (مغطى بالعرض المجاني)'}</strong></span>
              </div>
            </div>

            {/* Status Indicator */}
            <div>
              {activeOrder.status === 'COMPLETED' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#ECFDF5', border: '1px solid #10B981', color: '#059669', padding: '6px 16px', borderRadius: 20, fontWeight: 900, fontSize: '0.9rem' }}>
                  <CheckCircle2 size={18} />
                  <span>تم استلام الرمز بنجاح</span>
                </div>
              ) : activeOrder.status === 'WAITING_FOR_CODE' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#FEF3C7', border: '1px solid #F59E0B', color: '#B45309', padding: '6px 16px', borderRadius: 20, fontWeight: 900, fontSize: '0.9rem' }}>
                  <RefreshCw size={16} className="spin" />
                  <span>في انتظار رمز التحقق (SMS)...</span>
                </div>
              ) : activeOrder.status === 'CANCELED' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#FEE2E2', border: '1px solid #EF4444', color: '#DC2626', padding: '6px 16px', borderRadius: 20, fontWeight: 900, fontSize: '0.9rem' }}>
                  <XCircle size={18} />
                  <span>تم إلغاء الطلب واستعادة الرصيد</span>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', padding: '6px 16px', borderRadius: 20, fontWeight: 800, fontSize: '0.9rem' }}>
                  <span>الحالة: {activeOrder.status}</span>
                </div>
              )}
            </div>
          </div>

          {/* Huge Number Display Box */}
          <div className={styles.numberDisplayBox}>
            <div>
              <span className={styles.numberLabel}>
                الرقم المخصص لك (أدخله في التطبيق الآن لاستقبال الكود):
              </span>
              <div className={styles.numberText}>
                {activeOrder.phoneNumber || 'جاري تخصيص الرقم من المزود...'}
              </div>
            </div>

            {activeOrder.phoneNumber && (
              <button
                type="button"
                className={`${styles.copyBtn} ${copiedPhone ? styles.copyBtnCopied : ''}`}
                onClick={() => copyToClipboard(activeOrder.phoneNumber || '', 'phone')}
              >
                {copiedPhone ? <Check size={18} /> : <Copy size={18} />}
                <span>{copiedPhone ? 'تم النسخ!' : 'نسخ الرقم'}</span>
              </button>
            )}
          </div>

          {/* Glowing OTP Box when Code Arrives */}
          {activeOrder.smsCode ? (
            <div className={styles.otpArrivedBox}>
              <div className={styles.otpTitle}>
                وصل رمز التحقق (Verification Code):
              </div>
              <div className={styles.otpCodeValue}>
                {activeOrder.smsCode}
              </div>

              {activeOrder.smsText && (
                <p style={{ color: '#047857', fontSize: '0.9rem', margin: '8px 0 16px', direction: 'ltr' }}>
                  "{activeOrder.smsText}"
                </p>
              )}

              <button
                type="button"
                className={styles.copyOtpBtn}
                onClick={() => copyToClipboard(activeOrder.smsCode || '', 'code')}
              >
                {copiedCode ? <Check size={20} /> : <Copy size={20} />}
                <span>{copiedCode ? 'تم نسخ الرمز!' : 'نسخ رمز التحقق'}</span>
              </button>
            </div>
          ) : (
            /* Waiting State Timer */
            activeOrder.status === 'WAITING_FOR_CODE' && (
              <div className={styles.waitingTimerBox}>
                <div className={styles.timerLabel}>
                  <Clock size={20} color="#B45309" />
                  <span>الوقت المتبقي لانتظار الرمز:</span>
                  <span className={styles.timerDigits}>{formatTimer(secondsRemaining)}</span>
                </div>
                <span className={styles.timerNote}>
                  * يتم فحص وصول الكود آلياً. إذا لم يصل خلال المهلة يمكنك إلغاء الطلب واسترداد الرصيد كاملاً فوراً.
                </span>
              </div>
            )
          )}

          {/* Actions: Cancel or Start New */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            {['WAITING_FOR_NUMBER', 'WAITING_FOR_CODE'].includes(activeOrder.status) && !activeOrder.smsCode ? (
              <button
                type="button"
                onClick={() => setIsCancelConfirmOpen(true)}
                style={{
                  background: '#FEE2E2',
                  color: '#DC2626',
                  border: '1px solid #FCA5A5',
                  borderRadius: 10,
                  padding: '10px 20px',
                  fontWeight: 800,
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8
                }}
              >
                <AlertTriangle size={16} />
                <span>إلغاء واستعادة المبلغ</span>
              </button>
            ) : (
              <div />
            )}

            <button
              type="button"
              onClick={() => {
                setActiveOrder(null);
                setSelectedProvider(null);
              }}
              style={{
                background: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 10,
                padding: '10px 20px',
                fontWeight: 800,
                fontSize: '0.9rem',
                cursor: 'pointer'
              }}
            >
              طلب رقم جديد
            </button>
          </div>
        </div>
      )}

      {/* 3. STEP 1: Country Selector (الدول المسموح بها - 8 دول فقط) */}
      <div className={styles.stepSection}>
        <div className={styles.stepHeader}>
          <div className={styles.stepTitleBox}>
            <span className={styles.stepNumber}>1</span>
            <h2 className={styles.stepTitle}>اختر الدولة</h2>
          </div>
          <span className={styles.stepHint}>
            الدولة المختارة: <strong>{selectedCountryObj?.nameAr}</strong>
          </span>
        </div>

        <div className={styles.countriesGrid}>
          {catalog?.allowedCountries.map(country => {
            const isSelected = selectedCountry === country.code;
            return (
              <button
                key={country.code}
                type="button"
                onClick={() => setSelectedCountry(country.code)}
                className={`${styles.countryCard} ${isSelected ? styles.countryCardActive : ''}`}
              >
                <span className={styles.countryFlag}>{country.flag}</span>
                <span className={styles.countryName}>
                  {country.nameAr.split(' (')[0]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. STEP 2: Service Category Selector (SERVICE = CATEGORY) */}
      <div className={styles.stepSection}>
        <div className={styles.stepHeader}>
          <div className={styles.stepTitleBox}>
            <span className={styles.stepNumber}>2</span>
            <h2 className={styles.stepTitle}>اختر فئة الخدمة</h2>
          </div>
          <span className={styles.stepHint}>
            الخدمة المحددة: <strong>{selectedServiceObj?.nameAr}</strong>
          </span>
        </div>

        <div className={styles.servicesWrapper}>
          {catalog?.allowedServices.map(service => {
            const isSelected = selectedService === service.code;
            return (
              <button
                key={service.code}
                type="button"
                onClick={() => setSelectedService(service.code)}
                className={`${styles.servicePill} ${isSelected ? styles.servicePillActive : ''}`}
              >
                <span>{service.nameAr}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 5. STEP 3: Provider Selection (قائمة المزودين والعروض المتاحة) */}
      <div className={styles.stepSection}>
        <div className={styles.stepHeader}>
          <div className={styles.stepTitleBox}>
            <span className={styles.stepNumber}>3</span>
            <h2 className={styles.stepTitle}>
              اختر مزود الرقم لـ {selectedServiceObj?.nameAr} ({selectedCountryObj?.nameAr.split(' (')[0]})
            </h2>
          </div>
          <span className={styles.stepHint}>
            * اختر المزود بنفسك لضمان الشفافية، وممنوع الاختيار العشوائي.
          </span>
        </div>

        {loadingProviders ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-secondary)' }}>
            <RefreshCw size={28} className="spin" style={{ marginBottom: 12, color: '#D97706' }} />
            <p style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>جاري جلب المزودين والعروض المتاحة حالياً...</p>
          </div>
        ) : providers.length === 0 ? (
          <div style={{
            background: 'var(--bg-secondary)',
            border: '2px dashed var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            padding: '40px 20px',
            textAlign: 'center',
            color: 'var(--text-secondary)'
          }}>
            <AlertTriangle size={36} color="#D97706" style={{ marginBottom: 10 }} />
            <h4 style={{ color: 'var(--text-primary)', margin: '0 0 6px 0', fontSize: '1.2rem', fontWeight: 900 }}>
              لا توجد أرقام متاحة لهذه الخدمة في الوقت الحالي
            </h4>
            <p style={{ margin: 0, fontSize: '0.9rem' }}>يرجى تجربة دولة أخرى أو اختيار خدمة مختلفة.</p>
          </div>
        ) : (
          <div className={styles.providersGrid}>
            {providers.map(provider => {
              const isSelected = selectedProvider?.id === provider.id;
              const isFreeCovered = attemptsInfo?.isNextFree === true;

              return (
                <div
                  key={provider.id}
                  onClick={() => setSelectedProvider(provider)}
                  className={`${styles.providerCard} ${isSelected ? styles.providerCardActive : ''}`}
                >
                  <div>
                    {/* Provider Header */}
                    <div className={styles.providerHeader}>
                      <div className={styles.providerTitleBox}>
                        <div className={styles.providerIconBox}>
                          <Server size={20} />
                        </div>
                        <div>
                          <h3 className={styles.providerName}>{provider.providerName}</h3>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                            معرف المزود: <code>{provider.providerId}</code>
                          </div>
                        </div>
                      </div>

                      <div className={styles.radioIndicator}>
                        {isSelected && <div className={styles.radioDot} />}
                      </div>
                    </div>

                    {/* Metadata & Quality Box */}
                    <div className={styles.providerDetails}>
                      <div className={styles.providerMetaRow}>
                        <span className={styles.metaLabel}>نسبة نجاح الكود:</span>
                        <span className={styles.metaValueSuccess}>
                          <ShieldCheck size={16} />
                          <span>{provider.deliveryRate}%</span>
                        </span>
                      </div>

                      <div className={styles.providerMetaRow}>
                        <span className={styles.metaLabel}>الأرقام المتوفرة:</span>
                        <span className={styles.metaValueStock}>
                          {provider.availableCount !== undefined ? `${provider.availableCount} رقم جاهز` : 'متوفر'}
                        </span>
                      </div>

                      <div className={styles.etaBox}>
                        <Clock size={16} color="#D97706" />
                        <span>{provider.etaText}</span>
                      </div>
                    </div>
                  </div>

                  {/* Price Section */}
                  <div className={styles.providerFooter}>
                    <div className={styles.priceCol}>
                      <span className={styles.priceLabel}>السعر النهائي:</span>
                      {isFreeCovered ? (
                        <div>
                          <span className={styles.priceOriginalStriked}>
                            {provider.customerPriceSdg.toLocaleString()} ج.س
                          </span>
                          <div className={styles.freeTag}>
                            0 ج.س <span style={{ fontSize: '0.8rem', color: '#059669' }}>(مجاناً)</span>
                          </div>
                        </div>
                      ) : (
                        <div className={styles.priceValueMain}>
                          {provider.customerPriceSdg.toLocaleString()}
                          <span className={styles.currencyUnit}>ج.س</span>
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      className={`${styles.selectBtn} ${isSelected ? styles.selectBtnSelected : ''}`}
                    >
                      {isSelected ? 'محدد ✓' : 'اختيار المزود'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 6. Order Error Alert */}
      {orderError && (
        <div style={{
          background: '#FEE2E2',
          border: '1px solid #EF4444',
          borderRadius: 14,
          padding: '14px 20px',
          color: '#B91C1C',
          fontSize: '0.95rem',
          fontWeight: 700,
          marginBottom: 24,
          display: 'flex',
          alignItems: 'center',
          gap: 10
        }}>
          <AlertTriangle size={20} color="#DC2626" />
          <span>{orderError}</span>
        </div>
      )}

      {/* 7. Sticky Bottom Action Bar */}
      <div className={styles.bottomActionCard}>
        <div className={styles.actionSelectionSummary}>
          <div>
            <div style={{ fontSize: '1.05rem', fontWeight: 900, color: 'var(--text-primary)' }}>
              {selectedProvider ? (
                <>المزود المختار: <span style={{ color: '#D97706' }}>{selectedProvider.providerName}</span></>
              ) : (
                <span style={{ color: 'var(--text-muted)' }}>لم يتم اختيار مزود بعد</span>
              )}
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 2 }}>
              {selectedProvider ? (
                attemptsInfo?.isNextFree ? (
                  <span style={{ color: '#059669', fontWeight: 800 }}>
                    مشمول بالمحاولة المجانية #{attemptsInfo.usedAttempts + 1} — المستحق: 0 ج.س
                  </span>
                ) : (
                  <span>
                    الخصم المطلوب: <strong style={{ color: 'var(--text-primary)' }}>{selectedProvider.customerPriceSdg.toLocaleString()} ج.س</strong>
                  </span>
                )
              ) : (
                'حدد المزود المناسب من البطاقات أعلاه للمتابعة'
              )}
            </div>
          </div>
        </div>

        <button
          type="button"
          className={styles.orderSubmitBtn}
          onClick={handleStartOrderClick}
          disabled={!selectedProvider || submitting}
        >
          {submitting ? (
            <>
              <RefreshCw size={20} className="spin" />
              <span>جاري الاتصال بالمزود...</span>
            </>
          ) : (
            <>
              <Zap size={20} />
              <span>{selectedProvider ? 'تأكيد واستلام الرقم' : 'اختر مزود الرقم أولاً'}</span>
              <ChevronLeft size={18} />
            </>
          )}
        </button>
      </div>

      {/* Confirmation Modal */}
      {isConfirmModalOpen && selectedProvider && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(11, 15, 25, 0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: 16
        }}>
          <div style={{
            background: 'var(--bg-secondary)',
            border: '2px solid var(--accent-yellow)',
            borderRadius: 'var(--radius-lg)',
            padding: 28,
            maxWidth: 480,
            width: '100%',
            direction: 'rtl',
            boxShadow: 'var(--shadow-lg)'
          }}>
            <h3 style={{ fontSize: '1.35rem', fontWeight: 900, color: 'var(--text-primary)', margin: '0 0 16px 0' }}>
              تأكيد طلب الرقم الافتراضي
            </h3>

            <div style={{
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-subtle)',
              padding: 16,
              borderRadius: 'var(--radius-md)',
              marginBottom: 20,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              fontSize: '0.95rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>الدولة:</span>
                <strong style={{ color: 'var(--text-primary)' }}>{selectedCountryObj?.flag} {selectedCountryObj?.nameAr}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>الخدمة:</span>
                <strong style={{ color: 'var(--text-primary)' }}>{selectedServiceObj?.nameAr}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>المزود المختار:</span>
                <strong style={{ color: '#D97706' }}>{selectedProvider.providerName} ({selectedProvider.providerId})</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-subtle)', paddingTop: 10 }}>
                <span style={{ color: 'var(--text-secondary)' }}>المستحق للدفع:</span>
                <strong style={{ color: attemptsInfo?.isNextFree ? '#059669' : 'var(--text-primary)', fontSize: '1.2rem' }}>
                  {attemptsInfo?.isNextFree ? '0 ج.س (عرض مجاني)' : `${selectedProvider.customerPriceSdg.toLocaleString()} ج.س`}
                </strong>
              </div>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 24px 0', lineHeight: 1.6 }}>
              * سيتم حجز الرقم والبدء في انتظار رمز التفعيل (مهلة 5 دقائق). إذا لم يصل الرمز يمكنك إلغاء الطلب واسترداد الرصيد كاملاً فوراً.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button
                type="button"
                onClick={() => setIsConfirmModalOpen(false)}
                className="btn btn-secondary"
                style={{ padding: '10px 20px', fontWeight: 800 }}
              >
                تراجع
              </button>
              <button
                type="button"
                onClick={handleConfirmOrder}
                className="btn btn-primary"
                style={{ padding: '10px 26px', fontWeight: 900 }}
              >
                تأكيد واستلام الرقم
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Confirmation Modal */}
      {isCancelConfirmOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(11, 15, 25, 0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: 16
        }}>
          <div style={{
            background: 'var(--bg-secondary)',
            border: '2px solid #EF4444',
            borderRadius: 'var(--radius-lg)',
            padding: 28,
            maxWidth: 440,
            width: '100%',
            direction: 'rtl',
            boxShadow: 'var(--shadow-lg)'
          }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 900, color: '#DC2626', margin: '0 0 12px 0' }}>
              تأكيد إلغاء الطلب واستعادة الرصيد
            </h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: '0 0 20px 0', lineHeight: 1.6 }}>
              هل أنت متأكد من رغبتك في إلغاء هذا الطلب؟ سيتم فك حجز الرقم لدى المزود واستعادة المبلغ كاملاً لمحفظتك بشكل فوري.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button
                type="button"
                onClick={() => setIsCancelConfirmOpen(false)}
                disabled={cancelling}
                className="btn btn-secondary"
                style={{ padding: '10px 18px', fontWeight: 800 }}
              >
                تراجع
              </button>
              <button
                type="button"
                onClick={handleCancelOrder}
                disabled={cancelling}
                style={{
                  background: '#DC2626',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  padding: '10px 22px',
                  fontWeight: 900,
                  cursor: 'pointer'
                }}
              >
                {cancelling ? 'جاري الإلغاء...' : 'نعم، إلغاء واسترداد'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
