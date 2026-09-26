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
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Layers,
  Server,
  HelpCircle,
  CheckCircle2,
  XCircle,
  Flame,
  Info
} from 'lucide-react';

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
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px', direction: 'rtl', minHeight: '80vh' }}>
      
      {/* 1. Header Banner */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.9) 100%)',
        borderRadius: 20,
        padding: '32px 24px',
        border: '1px solid rgba(245, 158, 11, 0.25)',
        boxShadow: '0 20px 40px -15px rgba(0,0,0,0.5)',
        marginBottom: 32,
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{
          position: 'absolute',
          top: -40,
          left: -40,
          width: 140,
          height: 140,
          background: 'radial-gradient(circle, rgba(245, 158, 11, 0.2) 0%, transparent 70%)',
          borderRadius: '50%',
          filter: 'blur(20px)'
        }} />

        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 20, position: 'relative', zIndex: 1 }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: 30, padding: '4px 14px', marginBottom: 12 }}>
              <Sparkles size={14} color="#F59E0B" />
              <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#F59E0B' }}>خدمة استلام رموز OTP الفورية</span>
            </div>
            <h1 style={{ fontSize: '1.9rem', fontWeight: 900, color: '#F8FAFC', margin: '0 0 8px 0', letterSpacing: '-0.5px' }}>
              الأرقام الافتراضية المعتمدة 📱
            </h1>
            <p style={{ color: '#94A3B8', fontSize: '0.95rem', margin: 0, maxWidth: 650, lineHeight: 1.6 }}>
              احصل على أرقام تفعيل حقيقية وموثوقة لتفعيل حساباتك. اختر الدولة وفئة الخدمة، ثم حدد مزود الرقم بنفسك بأعلى درجات الشفافية والأمان.
            </p>
          </div>

          {/* User Attempts Status Pill */}
          {isAuthenticated && attemptsInfo && (
            <div style={{
              background: 'rgba(15, 23, 42, 0.85)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: 16,
              padding: '16px 20px',
              minWidth: 240,
              boxShadow: '0 10px 25px rgba(0,0,0,0.3)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: '0.85rem', color: '#94A3B8', fontWeight: 700 }}>حالة العرض الترويجي:</span>
                <span style={{
                  fontSize: '0.75rem',
                  fontWeight: 900,
                  padding: '2px 8px',
                  borderRadius: 12,
                  background: attemptsInfo.isNextFree ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                  color: attemptsInfo.isNextFree ? '#10B981' : '#F59E0B'
                }}>
                  {attemptsInfo.isNextFree ? 'عرض مجاني نشط' : 'نظام مدفوع'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: '1.4rem', fontWeight: 900, color: '#F8FAFC' }}>
                  {attemptsInfo.freeRemaining}
                </span>
                <span style={{ fontSize: '0.85rem', color: '#64748B' }}>
                  من أصل {attemptsInfo.freeLimit} محاولات مجانية متبقية
                </span>
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94A3B8', marginTop: 4 }}>
                رصيد المحفظة المتاح: <strong style={{ color: '#F59E0B' }}>{formattedBalance}</strong>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 2. Active Order Screen (If an order is in progress or completed) */}
      {activeOrder && (
        <div style={{
          background: 'linear-gradient(180deg, #1E293B 0%, #0F172A 100%)',
          borderRadius: 20,
          border: '2px solid rgba(245, 158, 11, 0.4)',
          padding: 24,
          marginBottom: 36,
          boxShadow: '0 20px 50px rgba(0,0,0,0.6)'
        }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 16, borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 16, marginBottom: 20 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: '1.4rem' }}>
                  {catalog?.allowedCountries.find(c => c.code === activeOrder.countryCode)?.flag || '🌐'}
                </span>
                <h3 style={{ fontSize: '1.3rem', fontWeight: 900, color: '#F8FAFC', margin: 0 }}>
                  طلب رقم {activeOrder.serviceNameAr} ({activeOrder.countryNameAr})
                </h3>
              </div>
              <div style={{ display: 'flex', gap: 14, fontSize: '0.85rem', color: '#94A3B8', marginTop: 6 }}>
                <span>رقم الطلب: <strong style={{ color: '#F8FAFC' }}>#{activeOrder.id.slice(0, 8)}</strong></span>
                <span>المزود: <strong style={{ color: '#F59E0B' }}>{activeOrder.providerName || activeOrder.operator}</strong></span>
                <span>السعر: <strong style={{ color: '#10B981' }}>{activeOrder.chargedAmount > 0 ? `${activeOrder.chargedAmount} SDG` : 'مجاناً (مغطى بالعرض)'}</strong></span>
              </div>
            </div>

            {/* Status Indicator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {activeOrder.status === 'COMPLETED' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(16, 185, 129, 0.15)', border: '1px solid #10B981', color: '#10B981', padding: '6px 16px', borderRadius: 20, fontWeight: 900, fontSize: '0.9rem' }}>
                  <CheckCircle2 size={18} />
                  <span>تم استلام الرمز بنجاح</span>
                </div>
              ) : activeOrder.status === 'WAITING_FOR_CODE' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(245, 158, 11, 0.15)', border: '1px solid #F59E0B', color: '#F59E0B', padding: '6px 16px', borderRadius: 20, fontWeight: 900, fontSize: '0.9rem' }}>
                  <RefreshCw size={16} className="spin" />
                  <span>في انتظار رمز التحقق (SMS)...</span>
                </div>
              ) : activeOrder.status === 'CANCELED' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #EF4444', color: '#EF4444', padding: '6px 16px', borderRadius: 20, fontWeight: 900, fontSize: '0.9rem' }}>
                  <XCircle size={18} />
                  <span>تم إلغاء الطلب واستعادة الرصيد</span>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(148, 163, 184, 0.15)', color: '#CBD5E1', padding: '6px 16px', borderRadius: 20, fontWeight: 900, fontSize: '0.9rem' }}>
                  <span>الحالة: {activeOrder.status}</span>
                </div>
              )}
            </div>
          </div>

          {/* Phone Number Display Box */}
          <div style={{
            background: 'rgba(15, 23, 42, 0.6)',
            borderRadius: 16,
            padding: 20,
            border: '1px solid rgba(255, 255, 255, 0.08)',
            marginBottom: 20
          }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
              <div>
                <span style={{ fontSize: '0.85rem', color: '#94A3B8', display: 'block', marginBottom: 6 }}>
                  الرقم الافتراضي المخصص لك (استخدمه في الخدمة الآن):
                </span>
                <div style={{ fontSize: '1.6rem', fontWeight: 900, letterSpacing: '1px', color: '#F8FAFC', direction: 'ltr', display: 'inline-block' }}>
                  {activeOrder.phoneNumber || 'جاري تخصيص الرقم من المزود...'}
                </div>
              </div>

              {activeOrder.phoneNumber && (
                <button
                  type="button"
                  onClick={() => copyToClipboard(activeOrder.phoneNumber || '', 'phone')}
                  style={{
                    background: copiedPhone ? '#10B981' : '#F59E0B',
                    color: '#0B0F19',
                    border: 'none',
                    borderRadius: 10,
                    padding: '10px 18px',
                    fontWeight: 900,
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    transition: 'all 0.2s ease'
                  }}
                >
                  {copiedPhone ? <Check size={18} /> : <Copy size={18} />}
                  <span>{copiedPhone ? 'تم النسخ!' : 'نسخ الرقم'}</span>
                </button>
              )}
            </div>
          </div>

          {/* OTP Code Glowing Display when Code Arrives */}
          {activeOrder.smsCode ? (
            <div style={{
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(6, 78, 59, 0.3) 100%)',
              border: '2px solid #10B981',
              borderRadius: 16,
              padding: 24,
              textAlign: 'center',
              boxShadow: '0 0 35px rgba(16, 185, 129, 0.3)',
              marginBottom: 20
            }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#6EE7B7', display: 'block', marginBottom: 8 }}>
                وصل رمز التحقق (Verification Code / OTP):
              </span>
              <div style={{
                fontSize: '2.8rem',
                fontWeight: 900,
                color: '#FFFFFF',
                letterSpacing: '8px',
                margin: '12px 0',
                fontFamily: 'monospace',
                textShadow: '0 0 15px rgba(16,185,129,0.8)'
              }}>
                {activeOrder.smsCode}
              </div>

              {activeOrder.smsText && (
                <p style={{ color: '#CBD5E1', fontSize: '0.85rem', margin: '8px 0 16px', direction: 'ltr' }}>
                  "{activeOrder.smsText}"
                </p>
              )}

              <button
                type="button"
                onClick={() => copyToClipboard(activeOrder.smsCode || '', 'code')}
                style={{
                  background: copiedCode ? '#059669' : '#10B981',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: 12,
                  padding: '12px 32px',
                  fontWeight: 900,
                  fontSize: '1.05rem',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 10,
                  boxShadow: '0 8px 20px rgba(16,185,129,0.4)'
                }}
              >
                {copiedCode ? <Check size={20} /> : <Copy size={20} />}
                <span>{copiedCode ? 'تم نسخ الرمز!' : 'نسخ رمز التحقق'}</span>
              </button>
            </div>
          ) : (
            /* Timer & Status when Waiting for Code */
            activeOrder.status === 'WAITING_FOR_CODE' && (
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 16,
                background: 'rgba(245, 158, 11, 0.08)',
                border: '1px solid rgba(245, 158, 11, 0.2)',
                borderRadius: 14,
                padding: '14px 20px',
                marginBottom: 20
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Clock size={20} color="#F59E0B" />
                  <span style={{ fontSize: '0.9rem', color: '#F8FAFC' }}>
                    الوقت المتبقي لانتظار الرمز: <strong style={{ color: '#F59E0B', fontSize: '1.1rem' }}>{formatTimer(secondsRemaining)}</strong>
                  </span>
                </div>
                <span style={{ fontSize: '0.8rem', color: '#94A3B8' }}>
                  يتم فحص وصول الرسالة آلياً كل بضع ثوانٍ. في حال عدم وصول الرمز يمكنك إلغاء الطلب واسترداد الرصيد.
                </span>
              </div>
            )
          )}

          {/* Action Footer: Cancel or New Order */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            {['WAITING_FOR_NUMBER', 'WAITING_FOR_CODE'].includes(activeOrder.status) && !activeOrder.smsCode ? (
              <button
                type="button"
                onClick={() => setIsCancelConfirmOpen(true)}
                style={{
                  background: 'rgba(239, 68, 68, 0.15)',
                  color: '#F87171',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  borderRadius: 10,
                  padding: '10px 20px',
                  fontWeight: 800,
                  fontSize: '0.85rem',
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
                background: 'rgba(255, 255, 255, 0.08)',
                color: '#F8FAFC',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: 10,
                padding: '10px 20px',
                fontWeight: 800,
                fontSize: '0.85rem',
                cursor: 'pointer'
              }}
            >
              طلب رقم جديد
            </button>
          </div>
        </div>
      )}

      {/* 3. STEP 1: Country Selector (الدول المسموح بها - 8 دول فقط) */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <span style={{ width: 26, height: 26, borderRadius: '50%', background: '#F59E0B', color: '#0B0F19', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '0.85rem' }}>1</span>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 900, color: '#F8FAFC', margin: 0 }}>اختر الدولة</h2>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
          gap: 12
        }}>
          {catalog?.allowedCountries.map(country => {
            const isSelected = selectedCountry === country.code;
            return (
              <button
                key={country.code}
                type="button"
                onClick={() => setSelectedCountry(country.code)}
                style={{
                  background: isSelected ? 'rgba(245, 158, 11, 0.15)' : 'rgba(30, 41, 59, 0.5)',
                  border: isSelected ? '2px solid #F59E0B' : '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 14,
                  padding: '14px 10px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: isSelected ? '0 0 20px rgba(245, 158, 11, 0.25)' : 'none'
                }}
              >
                <span style={{ fontSize: '2rem' }}>{country.flag}</span>
                <span style={{ fontSize: '0.85rem', fontWeight: 800, color: isSelected ? '#F8FAFC' : '#CBD5E1', textAlign: 'center' }}>
                  {country.nameAr.split(' (')[0]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. STEP 2: Service Category Selector (SERVICE = CATEGORY) */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <span style={{ width: 26, height: 26, borderRadius: '50%', background: '#F59E0B', color: '#0B0F19', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '0.85rem' }}>2</span>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 900, color: '#F8FAFC', margin: 0 }}>اختر فئة الخدمة</h2>
        </div>

        {/* Category Tabs / Pill Style */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          background: 'rgba(15, 23, 42, 0.6)',
          padding: 8,
          borderRadius: 16,
          border: '1px solid rgba(255, 255, 255, 0.08)'
        }}>
          {catalog?.allowedServices.map(service => {
            const isSelected = selectedService === service.code;
            return (
              <button
                key={service.code}
                type="button"
                onClick={() => setSelectedService(service.code)}
                style={{
                  background: isSelected ? '#F59E0B' : 'transparent',
                  color: isSelected ? '#0B0F19' : '#CBD5E1',
                  border: 'none',
                  borderRadius: 10,
                  padding: '10px 20px',
                  fontWeight: 900,
                  fontSize: '0.95rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  transition: 'all 0.2s ease',
                  boxShadow: isSelected ? '0 4px 15px rgba(245, 158, 11, 0.3)' : 'none'
                }}
              >
                <Layers size={16} />
                <span>{service.nameAr}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 5. STEP 3: Provider Selection (قائمة المزودين والعروض المتاحة) */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 26, height: 26, borderRadius: '50%', background: '#F59E0B', color: '#0B0F19', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '0.85rem' }}>3</span>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 900, color: '#F8FAFC', margin: 0 }}>
              اختر مزود الرقم لـ {selectedServiceObj?.nameAr} ({selectedCountryObj?.nameAr.split(' (')[0]})
            </h2>
          </div>
          <span style={{ fontSize: '0.8rem', color: '#94A3B8' }}>
            * يجب اختيار المزود بنفسك لضمان الشفافية، وممنوع الاختيار العشوائي.
          </span>
        </div>

        {loadingProviders ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94A3B8' }}>
            <RefreshCw size={28} className="spin" style={{ marginBottom: 12, color: '#F59E0B' }} />
            <p style={{ margin: 0, fontSize: '0.95rem' }}>جاري جلب المزودين والعروض المتاحة حالياً...</p>
          </div>
        ) : providers.length === 0 ? (
          <div style={{
            background: 'rgba(30, 41, 59, 0.4)',
            border: '1px dashed rgba(255, 255, 255, 0.15)',
            borderRadius: 16,
            padding: '36px 20px',
            textAlign: 'center',
            color: '#94A3B8'
          }}>
            <AlertTriangle size={32} color="#F59E0B" style={{ marginBottom: 10 }} />
            <h4 style={{ color: '#F8FAFC', margin: '0 0 6px 0', fontSize: '1.1rem' }}>لا توجد أرقام متاحة لهذه الخدمة في الوقت الحالي</h4>
            <p style={{ margin: 0, fontSize: '0.85rem' }}>يرجى تجربة دولة أخرى أو اختيار خدمة مختلفة.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {providers.map(provider => {
              const isSelected = selectedProvider?.id === provider.id;
              const isFreeCovered = attemptsInfo?.isNextFree === true;

              return (
                <div
                  key={provider.id}
                  onClick={() => setSelectedProvider(provider)}
                  style={{
                    background: isSelected ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.12) 0%, rgba(30, 41, 59, 0.8) 100%)' : 'rgba(30, 41, 59, 0.45)',
                    border: isSelected ? '2px solid #F59E0B' : '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: 16,
                    padding: 20,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: isSelected ? '0 10px 25px rgba(245, 158, 11, 0.2)' : 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: 16
                  }}
                >
                  <div>
                    {/* Provider Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Server size={18} color={isSelected ? '#F59E0B' : '#94A3B8'} />
                        <span style={{ fontSize: '1rem', fontWeight: 900, color: '#F8FAFC' }}>
                          {provider.providerName}
                        </span>
                      </div>
                      <div style={{
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        border: isSelected ? '6px solid #F59E0B' : '2px solid rgba(255,255,255,0.2)',
                        background: '#0B0F19',
                        transition: 'all 0.2s ease'
                      }} />
                    </div>

                    {/* Quality & Metadata */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.8rem', color: '#94A3B8', marginTop: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>معرف المزود:</span>
                        <code style={{ color: '#CBD5E1', background: 'rgba(0,0,0,0.3)', padding: '1px 6px', borderRadius: 4 }}>
                          {provider.providerId}
                        </code>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>نسبة نجاح التسليم:</span>
                        <span style={{ color: '#10B981', fontWeight: 800 }}>
                          {provider.deliveryRate}%
                        </span>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>الأرقام المتوفرة:</span>
                        <span style={{ color: '#F8FAFC', fontWeight: 700 }}>
                          {provider.availableCount !== undefined ? `${provider.availableCount} رقم` : 'متوفر'}
                        </span>
                      </div>

                      <div style={{ marginTop: 4, background: 'rgba(15, 23, 42, 0.5)', padding: '6px 10px', borderRadius: 8, fontSize: '0.75rem', color: '#94A3B8' }}>
                        <span style={{ color: '#F59E0B' }}>⏱️ المدة: </span>
                        <span>{provider.etaText}</span>
                      </div>
                    </div>
                  </div>

                  {/* Price Section */}
                  <div style={{
                    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                    paddingTop: 14,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline'
                  }}>
                    <div>
                      <span style={{ fontSize: '0.75rem', color: '#94A3B8', display: 'block' }}>السعر النهائي:</span>
                      {isFreeCovered ? (
                        <div>
                          <span style={{ textDecoration: 'line-through', color: '#64748B', fontSize: '0.85rem', marginLeft: 6 }}>
                            {provider.customerPriceSdg.toLocaleString()} ج.س
                          </span>
                          <span style={{ color: '#10B981', fontWeight: 900, fontSize: '1.15rem' }}>
                            0 ج.س (مجاناً)
                          </span>
                        </div>
                      ) : (
                        <span style={{ color: '#F8FAFC', fontWeight: 900, fontSize: '1.25rem' }}>
                          {provider.customerPriceSdg.toLocaleString()} <span style={{ fontSize: '0.8rem', color: '#F59E0B' }}>SDG</span>
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      style={{
                        background: isSelected ? '#F59E0B' : 'rgba(255, 255, 255, 0.08)',
                        color: isSelected ? '#0B0F19' : '#CBD5E1',
                        border: 'none',
                        borderRadius: 8,
                        padding: '6px 14px',
                        fontSize: '0.8rem',
                        fontWeight: 900,
                        cursor: 'pointer'
                      }}
                    >
                      {isSelected ? 'محدد ✓' : 'اختيار'}
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
          background: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid #EF4444',
          borderRadius: 14,
          padding: '14px 20px',
          color: '#FCA5A5',
          fontSize: '0.9rem',
          fontWeight: 700,
          marginBottom: 24,
          display: 'flex',
          alignItems: 'center',
          gap: 10
        }}>
          <AlertTriangle size={20} color="#EF4444" />
          <span>{orderError}</span>
        </div>
      )}

      {/* 7. STEP 4: Start Order Action Button */}
      <div style={{
        background: 'rgba(15, 23, 42, 0.8)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: 20,
        padding: 24,
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 16
      }}>
        <div>
          <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#F8FAFC', marginBottom: 4 }}>
            {selectedProvider ? (
              <>
                المزود المختار: <span style={{ color: '#F59E0B' }}>{selectedProvider.providerName}</span>
              </>
            ) : (
              <span style={{ color: '#94A3B8' }}>لم يتم اختيار مزود بعد</span>
            )}
          </div>
          <div style={{ fontSize: '0.85rem', color: '#94A3B8' }}>
            {selectedProvider ? (
              attemptsInfo?.isNextFree ? (
                <span style={{ color: '#10B981', fontWeight: 800 }}>
                  تطبق محاولتك المجانية رقم ({attemptsInfo.usedAttempts + 1}) — المستحق للدفع: 0 ج.س
                </span>
              ) : (
                <span>
                  المستحق للخصم: <strong style={{ color: '#F8FAFC' }}>{selectedProvider.customerPriceSdg.toLocaleString()} SDG</strong> من رصيد المحفظة
                </span>
              )
            ) : (
              'اختر أحد المزودين المتاحين أعلاه للمتابعة'
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={handleStartOrderClick}
          disabled={!selectedProvider || submitting}
          style={{
            background: !selectedProvider ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
            color: !selectedProvider ? '#64748B' : '#0B0F19',
            border: 'none',
            borderRadius: 14,
            padding: '14px 36px',
            fontSize: '1.05rem',
            fontWeight: 900,
            cursor: !selectedProvider || submitting ? 'not-allowed' : 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            boxShadow: selectedProvider ? '0 10px 25px rgba(245, 158, 11, 0.35)' : 'none',
            transition: 'all 0.2s ease'
          }}
        >
          {submitting ? (
            <>
              <RefreshCw size={20} className="spin" />
              <span>جاري التواصل مع المزود...</span>
            </>
          ) : (
            <>
              <Zap size={20} />
              <span>{selectedProvider ? 'تأكيد وشراء الرقم الافتراضي' : 'اختر مزود الرقم أولاً'}</span>
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
          background: 'rgba(0,0,0,0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: 16
        }}>
          <div style={{
            background: '#1E293B',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: 20,
            padding: 28,
            maxWidth: 480,
            width: '100%',
            direction: 'rtl',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.7)'
          }}>
            <h3 style={{ fontSize: '1.3rem', fontWeight: 900, color: '#F8FAFC', margin: '0 0 16px 0' }}>
              تأكيد طلب الرقم الافتراضي
            </h3>

            <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: 16, borderRadius: 14, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.9rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94A3B8' }}>الدولة:</span>
                <strong style={{ color: '#F8FAFC' }}>{selectedCountryObj?.flag} {selectedCountryObj?.nameAr}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94A3B8' }}>الخدمة:</span>
                <strong style={{ color: '#F8FAFC' }}>{selectedServiceObj?.nameAr}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94A3B8' }}>المزود المختار:</span>
                <strong style={{ color: '#F59E0B' }}>{selectedProvider.providerName} ({selectedProvider.providerId})</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94A3B8' }}>المستحق للدفع:</span>
                <strong style={{ color: attemptsInfo?.isNextFree ? '#10B981' : '#F8FAFC', fontSize: '1.1rem' }}>
                  {attemptsInfo?.isNextFree ? '0 ج.س (عرض مجاني)' : `${selectedProvider.customerPriceSdg.toLocaleString()} SDG`}
                </strong>
              </div>
            </div>

            <p style={{ fontSize: '0.8rem', color: '#94A3B8', margin: '0 0 24px 0', lineHeight: 1.5 }}>
              * سيتم حجز الرقم والبدء في انتظار رمز التفعيل (مهلة 5 دقائق). إذا لم يصل الرمز يمكنك إلغاء الطلب واسترداد الرصيد كاملاً فوراً.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button
                type="button"
                onClick={() => setIsConfirmModalOpen(false)}
                style={{
                  background: 'transparent',
                  color: '#94A3B8',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 10,
                  padding: '10px 18px',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                تراجع
              </button>
              <button
                type="button"
                onClick={handleConfirmOrder}
                style={{
                  background: '#F59E0B',
                  color: '#0B0F19',
                  border: 'none',
                  borderRadius: 10,
                  padding: '10px 24px',
                  fontWeight: 900,
                  cursor: 'pointer'
                }}
              >
                تأكيد وبدء الطلب
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
          background: 'rgba(0,0,0,0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: 16
        }}>
          <div style={{
            background: '#1E293B',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            borderRadius: 20,
            padding: 28,
            maxWidth: 440,
            width: '100%',
            direction: 'rtl',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.7)'
          }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 900, color: '#F8FAFC', margin: '0 0 12px 0' }}>
              تأكيد إلغاء الطلب واستعادة الرصيد
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#94A3B8', margin: '0 0 20px 0', lineHeight: 1.6 }}>
              هل أنت متأكد من رغبتك في إلغاء هذا الطلب؟ سيتم فك حجز الرقم لدى المزود واستعادة المبلغ كاملاً لمحفظتك بشكل فوري.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button
                type="button"
                onClick={() => setIsCancelConfirmOpen(false)}
                disabled={cancelling}
                style={{
                  background: 'transparent',
                  color: '#94A3B8',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 10,
                  padding: '10px 18px',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                تراجع
              </button>
              <button
                type="button"
                onClick={handleCancelOrder}
                disabled={cancelling}
                style={{
                  background: '#EF4444',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: 10,
                  padding: '10px 20px',
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
