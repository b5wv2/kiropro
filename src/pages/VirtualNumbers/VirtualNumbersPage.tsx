import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useWallet } from '../../context/WalletContext';
import {
  fetchVirtualNumberCatalog,
  fetchUserAttempts,
  createVirtualNumberOrder,
  fetchVirtualNumberOrder,
  cancelVirtualNumberOrder,
  VirtualNumberCatalog,
  UserAttemptsInfo,
  VirtualNumberOrder
} from '../../services/virtualNumberApi';
import {
  Zap,
  Clock,
  Copy,
  Check,
  AlertTriangle,
  RefreshCw,
  Sparkles,
  ArrowRight
} from 'lucide-react';

export const VirtualNumbersPage: React.FC = () => {
  const { isAuthenticated, navigateTo } = useAuth();
  const { refreshBalance } = useWallet();

  const [catalog, setCatalog] = useState<VirtualNumberCatalog | null>(null);

  const [attemptsInfo, setAttemptsInfo] = useState<UserAttemptsInfo | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<string>('usa');
  const [selectedService, setSelectedService] = useState<string>('whatsapp');

  const [activeOrder, setActiveOrder] = useState<VirtualNumberOrder | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);

  const [copiedPhone, setCopiedPhone] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [isCancelConfirmOpen, setIsCancelConfirmOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // Countdown timer for active order
  const [secondsRemaining, setSecondsRemaining] = useState<number>(300);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load catalog on mount
  useEffect(() => {
    loadCatalog();
  }, []);

  // Load attempts info when user is authenticated
  useEffect(() => {
    if (isAuthenticated) {
      loadAttempts();
    }
  }, [isAuthenticated]);

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

  // Polling for active order
  useEffect(() => {
    if (!activeOrder) return;

    const isWaiting = ['WAITING_FOR_NUMBER', 'NUMBER_RECEIVED', 'WAITING_FOR_CODE'].includes(activeOrder.status);
    if (!isWaiting) {
      if (pollingRef.current) clearInterval(pollingRef.current);
      return;
    }

    // Set countdown timer
    if (activeOrder.expiresAt) {
      const diffMs = new Date(activeOrder.expiresAt).getTime() - Date.now();
      setSecondsRemaining(Math.max(0, Math.floor(diffMs / 1000)));
    } else {
      setSecondsRemaining(300);
    }

    const timerInterval = setInterval(() => {
      setSecondsRemaining(prev => {
        if (prev <= 1) {
          // expired
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Poll server every 3.5 seconds
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

  const handleStartOrder = async () => {
    if (!isAuthenticated) {
      navigateTo('login');
      return;
    }

    setSubmitting(true);
    setOrderError(null);

    try {
      const order = await createVirtualNumberOrder(selectedCountry, selectedService);
      setActiveOrder(order);
      loadAttempts();
      refreshBalance();
    } catch (err: any) {
      setOrderError(err.message || 'فشل إنشاء طلب الرقم الافتراضي.');
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
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // Resolve current selected product price
  const selectedProduct = catalog?.products.find(
    p => p.countryCode === selectedCountry && p.serviceCode === selectedService
  );
  const basePrice = selectedProduct?.priceSdg ?? catalog?.settings.defaultPaidPriceSdg ?? 800;
  const isFree = attemptsInfo ? attemptsInfo.isNextFree : true;
  const displayPrice = isFree ? 'مجاناً (0 ج.س)' : `${basePrice} ج.س`;

  return (
    <div style={{
      minHeight: '85vh',
      background: 'linear-gradient(180deg, #0B0F19 0%, #111827 50%, #0B0F19 100%)',
      color: '#F8FAFC',
      padding: 'clamp(24px, 5vw, 60px) 16px',
      direction: 'rtl'
    }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        
        {/* Header Hero Banner */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 16px',
            background: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: 9999,
            color: '#F59E0B',
            fontSize: '0.85rem',
            fontWeight: 800,
            marginBottom: 16
          }}>
            <Sparkles size={16} />
            <span>خدمة التفعيل الفوري للأرقام الافتراضية 📱</span>
          </div>

          <h1 style={{
            fontSize: 'clamp(1.75rem, 4vw, 2.5rem)',
            fontWeight: 900,
            color: '#FFFFFF',
            lineHeight: 1.25,
            marginBottom: 12
          }}>
            أرقام افتراضية حصرية لتفعيل حساباتك
          </h1>
          <p style={{
            fontSize: 'clamp(0.95rem, 2vw, 1.1rem)',
            color: '#94A3B8',
            maxWidth: 640,
            margin: '0 auto'
          }}>
            احصل على رقم هاتف فوري لاستقبال رمز التحقق (OTP) من التطبيقات العالمية بضمان وصول الرمز أو استرجاع رصيدك فوراً.
          </p>
        </div>

        {/* Free Attempts Status Banner */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(15, 23, 42, 0.9) 100%)',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          borderRadius: 16,
          padding: '16px 24px',
          marginBottom: 32,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 16,
          boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: 'rgba(245, 158, 11, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#F59E0B'
            }}>
              <Zap size={22} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1rem', color: '#F1F5F9' }}>
                نظام المحاولات المجانية
              </div>
              <div style={{ fontSize: '0.85rem', color: '#94A3B8', marginTop: 2 }}>
                {isAuthenticated ? (
                  attemptsInfo && attemptsInfo.freeRemaining > 0 ? (
                    <span>
                      لديك <strong style={{ color: '#F59E0B' }}>{attemptsInfo.freeRemaining} محاولات مجانية</strong> متبقية من أصل {attemptsInfo.freeLimit}.
                    </span>
                  ) : (
                    <span>
                      استهلكت المحاولات المجانية الـ 5. تكلفة المحاولة الحالية: <strong style={{ color: '#F59E0B' }}>{basePrice} ج.س</strong>.
                    </span>
                  )
                ) : (
                  <span>سجل دخولك الآن واستفد من 5 محاولات مجانية بالكامل!</span>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              padding: '6px 14px',
              borderRadius: 8,
              background: isFree ? 'rgba(34, 197, 94, 0.15)' : 'rgba(245, 158, 11, 0.15)',
              color: isFree ? '#4ADE80' : '#F59E0B',
              fontWeight: 800,
              fontSize: '0.85rem'
            }}>
              {isFree ? 'محاولة مجانية 🎁' : `${basePrice} ج.س`}
            </div>
          </div>
        </div>

        {/* If Active Order exists, show Active Order Dashboard */}
        {activeOrder && (
          <div style={{
            background: '#1E293B',
            border: '2px solid #F59E0B',
            borderRadius: 20,
            padding: 'clamp(20px, 4vw, 32px)',
            marginBottom: 36,
            boxShadow: '0 8px 32px rgba(245, 158, 11, 0.15)'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid #334155',
              paddingBottom: 16,
              marginBottom: 20,
              flexWrap: 'wrap',
              gap: 12
            }}>
              <div>
                <span style={{ fontSize: '0.85rem', color: '#94A3B8' }}>طلب رقم: #{activeOrder.id.slice(0, 8)}</span>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 900, color: '#F8FAFC', marginTop: 2 }}>
                  {activeOrder.serviceNameAr} — {activeOrder.countryNameAr}
                </h3>
              </div>

              {/* Status Badge */}
              <div style={{
                padding: '6px 16px',
                borderRadius: 9999,
                fontWeight: 800,
                fontSize: '0.85rem',
                background:
                  activeOrder.status === 'COMPLETED' ? 'rgba(34, 197, 94, 0.2)' :
                  activeOrder.status === 'CANCELED' || activeOrder.status === 'REFUNDED' ? 'rgba(239, 68, 68, 0.2)' :
                  activeOrder.status === 'EXPIRED' ? 'rgba(148, 163, 184, 0.2)' :
                  'rgba(245, 158, 11, 0.2)',
                color:
                  activeOrder.status === 'COMPLETED' ? '#4ADE80' :
                  activeOrder.status === 'CANCELED' || activeOrder.status === 'REFUNDED' ? '#F87171' :
                  activeOrder.status === 'EXPIRED' ? '#94A3B8' :
                  '#F59E0B',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}>
                {activeOrder.status === 'COMPLETED' ? 'تم استلام الرمز بنجاح ✅' :
                 activeOrder.status === 'WAITING_FOR_CODE' ? 'في انتظار وصول الرمز...' :
                 activeOrder.status === 'WAITING_FOR_NUMBER' ? 'جاري حجز الرقم...' :
                 activeOrder.status === 'CANCELED' ? 'تم الإلغاء واستعادة الرصيد' :
                 activeOrder.status === 'EXPIRED' ? 'انتهت المهلة وتم استعادة الرصيد' :
                 activeOrder.status}
              </div>
            </div>

            {/* Phone Number Display */}
            {activeOrder.phoneNumber && (
              <div style={{
                background: '#0B0F19',
                borderRadius: 14,
                padding: '20px',
                marginBottom: 20,
                border: '1px solid #334155',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 16
              }}>
                <div>
                  <div style={{ fontSize: '0.85rem', color: '#94A3B8', marginBottom: 4 }}>
                    الرقم الافتراضي المخصص لك:
                  </div>
                  <div style={{
                    fontSize: 'clamp(1.3rem, 3vw, 1.8rem)',
                    fontWeight: 900,
                    letterSpacing: 2,
                    color: '#F59E0B',
                    direction: 'ltr',
                    fontFamily: 'monospace'
                  }}>
                    {activeOrder.phoneNumber}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => copyToClipboard(activeOrder.phoneNumber!, 'phone')}
                  style={{
                    background: copiedPhone ? '#22C55E' : '#334155',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: 10,
                    padding: '10px 18px',
                    fontWeight: 800,
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
              </div>
            )}

            {/* Waiting for SMS or SMS Code Display */}
            {activeOrder.status === 'WAITING_FOR_CODE' && (
              <div style={{
                textAlign: 'center',
                padding: '30px 20px',
                background: 'rgba(245, 158, 11, 0.05)',
                border: '1px dashed rgba(245, 158, 11, 0.3)',
                borderRadius: 14,
                marginBottom: 20
              }}>
                <div style={{
                  width: 50,
                  height: 50,
                  borderRadius: '50%',
                  background: 'rgba(245, 158, 11, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px',
                  color: '#F59E0B',
                  animation: 'pulse 2s infinite'
                }}>
                  <RefreshCw size={24} style={{ animation: 'spin 3s linear infinite' }} />
                </div>
                <h4 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#F1F5F9', marginBottom: 6 }}>
                  أدخل هذا الرقم في {activeOrder.serviceNameAr} واطلب رمز التحقق
                </h4>
                <p style={{ fontSize: '0.9rem', color: '#94A3B8', marginBottom: 16 }}>
                  سيظهر رمز التحقق هنا تلقائياً فور وصوله من المزود...
                </p>

                {/* Countdown Timer */}
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  background: '#0B0F19',
                  padding: '8px 20px',
                  borderRadius: 9999,
                  border: '1px solid #334155',
                  color: '#F59E0B',
                  fontWeight: 800,
                  fontSize: '0.95rem'
                }}>
                  <Clock size={16} />
                  <span>الوقت المتبقي: {formatTimer(secondsRemaining)}</span>
                </div>
              </div>
            )}

            {/* CODE RECEIVED DISPLAY */}
            {activeOrder.smsCode && (
              <div style={{
                background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.1) 0%, rgba(15, 23, 42, 0.8) 100%)',
                border: '2px solid #22C55E',
                borderRadius: 16,
                padding: '28px',
                textAlign: 'center',
                marginBottom: 20
              }}>
                <div style={{ fontSize: '0.95rem', color: '#86EFAC', fontWeight: 800, marginBottom: 8 }}>
                  رمز التحقق المستلم (OTP):
                </div>
                <div style={{
                  fontSize: 'clamp(2rem, 5vw, 3rem)',
                  fontWeight: 900,
                  color: '#22C55E',
                  letterSpacing: 6,
                  fontFamily: 'monospace',
                  marginBottom: 16,
                  direction: 'ltr'
                }}>
                  {activeOrder.smsCode}
                </div>

                <button
                  type="button"
                  onClick={() => copyToClipboard(activeOrder.smsCode!, 'code')}
                  style={{
                    background: copiedCode ? '#16A34A' : '#22C55E',
                    color: '#0B0F19',
                    border: 'none',
                    borderRadius: 10,
                    padding: '12px 28px',
                    fontWeight: 900,
                    fontSize: '1rem',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    boxShadow: '0 4px 14px rgba(34, 197, 94, 0.3)'
                  }}
                >
                  {copiedCode ? <Check size={20} /> : <Copy size={20} />}
                  <span>{copiedCode ? 'تم نسخ الرمز!' : 'نسخ رمز التحقق'}</span>
                </button>
              </div>
            )}

            {/* Actions Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              {/* Cancel Button (Visible while cancellable and no SMS yet) */}
              {['WAITING_FOR_NUMBER', 'NUMBER_RECEIVED', 'WAITING_FOR_CODE'].includes(activeOrder.status) && !activeOrder.smsCode && (
                <button
                  type="button"
                  onClick={() => setIsCancelConfirmOpen(true)}
                  style={{
                    background: 'transparent',
                    border: '1px solid #EF4444',
                    color: '#EF4444',
                    borderRadius: 8,
                    padding: '8px 16px',
                    fontWeight: 800,
                    fontSize: '0.85rem',
                    cursor: 'pointer'
                  }}
                >
                  إلغاء واستعادة المبلغ
                </button>
              )}

              {/* Start New Order */}
              {['COMPLETED', 'CANCELED', 'REFUNDED', 'EXPIRED', 'FAILED'].includes(activeOrder.status) && (
                <button
                  type="button"
                  onClick={() => setActiveOrder(null)}
                  style={{
                    background: '#F59E0B',
                    color: '#0B0F19',
                    border: 'none',
                    borderRadius: 8,
                    padding: '10px 20px',
                    fontWeight: 900,
                    fontSize: '0.9rem',
                    cursor: 'pointer'
                  }}
                >
                  طلب رقم جديد 🚀
                </button>
              )}

              <button
                type="button"
                onClick={() => navigateTo('account')}
                style={{
                  background: '#334155',
                  color: '#F8FAFC',
                  border: 'none',
                  borderRadius: 8,
                  padding: '8px 16px',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                عرض في طلباتي 📋
              </button>
            </div>
          </div>
        )}

        {/* Cancel Confirmation Modal */}
        {isCancelConfirmOpen && (
          <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: 16
          }}>
            <div style={{
              background: '#1E293B',
              border: '1px solid #475569',
              borderRadius: 16,
              maxWidth: 440,
              width: '100%',
              padding: 24,
              textAlign: 'center'
            }}>
              <AlertTriangle size={40} color="#EF4444" style={{ margin: '0 auto 12px' }} />
              <h3 style={{ fontSize: '1.2rem', fontWeight: 900, color: '#F8FAFC', marginBottom: 8 }}>
                هل تريد إلغاء الطلب واستعادة المبلغ؟
              </h3>
              <p style={{ fontSize: '0.9rem', color: '#94A3B8', marginBottom: 20 }}>
                سيتم إلغاء الرقم لدى المزود وتحرير أي مبلغ محجوز فوراً إلى محفظتك في KiroPro.
              </p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button
                  type="button"
                  disabled={cancelling}
                  onClick={handleCancelOrder}
                  style={{
                    background: '#EF4444',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: 8,
                    padding: '10px 20px',
                    fontWeight: 800,
                    fontSize: '0.9rem',
                    cursor: 'pointer'
                  }}
                >
                  {cancelling ? 'جاري الإلغاء...' : 'تأكيد الإلغاء والاسترداد'}
                </button>
                <button
                  type="button"
                  disabled={cancelling}
                  onClick={() => setIsCancelConfirmOpen(false)}
                  style={{
                    background: '#334155',
                    color: '#F8FAFC',
                    border: 'none',
                    borderRadius: 8,
                    padding: '10px 20px',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    cursor: 'pointer'
                  }}
                >
                  تراجع
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 1 & 2: Selection Form (Only if no active order in progress) */}
        {(!activeOrder || ['COMPLETED', 'CANCELED', 'REFUNDED', 'EXPIRED', 'FAILED'].includes(activeOrder.status)) && (
          <div style={{
            background: 'rgba(30, 41, 59, 0.7)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(51, 65, 85, 0.8)',
            borderRadius: 20,
            padding: 'clamp(20px, 4vw, 36px)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
          }}>

            {/* Error Banner */}
            {orderError && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid #EF4444',
                color: '#FCA5A5',
                borderRadius: 10,
                padding: '12px 16px',
                marginBottom: 24,
                fontSize: '0.9rem',
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}>
                <AlertTriangle size={18} color="#EF4444" />
                <span>{orderError}</span>
              </div>
            )}

            {/* Step 1: Country Selection */}
            <div style={{ marginBottom: 32 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <div style={{
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  background: '#F59E0B',
                  color: '#0B0F19',
                  fontWeight: 900,
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  1
                </div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#F1F5F9', margin: 0 }}>
                  اختر الدولة المسموحة (8 دول معتمدة)
                </h3>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                gap: 12
              }}>
                {catalog?.allowedCountries.map(c => {
                  const isSelected = selectedCountry === c.code;
                  return (
                    <button
                      key={c.code}
                      type="button"
                      onClick={() => setSelectedCountry(c.code)}
                      style={{
                        background: isSelected ? 'rgba(245, 158, 11, 0.15)' : '#0F172A',
                        border: isSelected ? '2px solid #F59E0B' : '1px solid #334155',
                        borderRadius: 12,
                        padding: '14px 16px',
                        cursor: 'pointer',
                        textAlign: 'right',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <span style={{ fontSize: '1.6rem' }}>{c.flag}</span>
                      <div>
                        <div style={{
                          fontWeight: 800,
                          fontSize: '0.9rem',
                          color: isSelected ? '#F59E0B' : '#F8FAFC'
                        }}>
                          {c.nameAr}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                          {c.nameEn}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Step 2: Service Selection */}
            <div style={{ marginBottom: 32 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <div style={{
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  background: '#F59E0B',
                  color: '#0B0F19',
                  fontWeight: 900,
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  2
                </div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#F1F5F9', margin: 0 }}>
                  اختر الخدمة أو التطبيق المطلوب (6 خدمات معتمدة)
                </h3>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                gap: 12
              }}>
                {catalog?.allowedServices.map(s => {
                  const isSelected = selectedService === s.code;
                  return (
                    <button
                      key={s.code}
                      type="button"
                      onClick={() => setSelectedService(s.code)}
                      style={{
                        background: isSelected ? 'rgba(245, 158, 11, 0.15)' : '#0F172A',
                        border: isSelected ? '2px solid #F59E0B' : '1px solid #334155',
                        borderRadius: 12,
                        padding: '16px 14px',
                        cursor: 'pointer',
                        textAlign: 'center',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 8,
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <div style={{
                        width: 36,
                        height: 36,
                        borderRadius: 8,
                        background: isSelected ? '#F59E0B' : '#334155',
                        color: isSelected ? '#0B0F19' : '#F8FAFC',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 900,
                        fontSize: '1rem'
                      }}>
                        {s.nameAr[0]}
                      </div>
                      <div style={{
                        fontWeight: 800,
                        fontSize: '0.9rem',
                        color: isSelected ? '#F59E0B' : '#F8FAFC'
                      }}>
                        {s.nameAr}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Price & Checkout Footer */}
            <div style={{
              background: '#0F172A',
              border: '1px solid #334155',
              borderRadius: 14,
              padding: '20px 24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 16
            }}>
              <div>
                <div style={{ fontSize: '0.85rem', color: '#94A3B8' }}>سعر التفعيل النهائي:</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 900, color: isFree ? '#4ADE80' : '#F59E0B' }}>
                  {displayPrice}
                </div>
                {isFree ? (
                  <div style={{ fontSize: '0.75rem', color: '#4ADE80', marginTop: 2 }}>
                    محاولة مجانية رقم {attemptsInfo ? attemptsInfo.usedAttempts + 1 : 1} من أصل 5
                  </div>
                ) : (
                  <div style={{ fontSize: '0.75rem', color: '#94A3B8', marginTop: 2 }}>
                    يتم الحجز والخصم فقط عند استلام الرمز بنجاح
                  </div>
                )}
              </div>

              <button
                type="button"
                disabled={submitting}
                onClick={handleStartOrder}
                style={{
                  background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
                  color: '#0B0F19',
                  border: 'none',
                  borderRadius: 12,
                  padding: '14px 32px',
                  fontWeight: 900,
                  fontSize: '1rem',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  boxShadow: '0 4px 18px rgba(245, 158, 11, 0.4)',
                  opacity: submitting ? 0.7 : 1
                }}
              >
                {submitting ? (
                  <>
                    <RefreshCw size={18} style={{ animation: 'spin 1s linear infinite' }} />
                    <span>جاري طلب الرقم من المزود...</span>
                  </>
                ) : (
                  <>
                    <span>طلب الرقم الآن 🚀</span>
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </div>

          </div>
        )}

      </div>
    </div>
  );
};

export default VirtualNumbersPage;
