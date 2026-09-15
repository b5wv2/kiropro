import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import styles from './QuickTopUpModal.module.css';
import { useWallet } from '../../context/WalletContext';
import { useOverlay } from '../../context/OverlayContext';
import { api } from '../../lib/api';
import { 
  Building2, 
  CheckCircle2, 
  Clock, 
  Upload, 
  Copy, 
  ArrowRight, 
  ArrowLeft, 
  AlertCircle, 
  X,
  Check
} from 'lucide-react';

interface PaymentMethod {
  id: string;
  name: string;
  bank_name: string;
  account_name: string;
  account_number: string;
  currency: string;
  instructions: string | null;
}

interface RateConfig {
  rate: number;
  base_currency: string;
  quote_currency: string;
  min_topup: number;
  max_topup: number;
}

export const DepositModal: React.FC = () => {
  const { activeOverlay, closeOverlay } = useOverlay();
  const { submitTopupRequest, currency } = useWallet();
  const isOpen = activeOverlay === 'wallet';
  const isSdg = currency === 'SDG';

  // Wizard Steps: 1: Amount, 2: Select Method, 3: Bank Details & Upload, 4: Success/Pending
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Data states
  const [rateConfig, setRateConfig] = useState<RateConfig>({
    rate: 600,
    base_currency: 'USD',
    quote_currency: 'SDG',
    min_topup: 1,
    max_topup: 500
  });
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);

  // Form State
  const defaultAmount = isSdg ? 50000 : 10;
  const [selectedAmount, setSelectedAmount] = useState<number>(defaultAmount);
  const [customAmount, setCustomAmount] = useState<string>(String(defaultAmount));
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [userNote, setUserNote] = useState('');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedAccount, setCopiedAccount] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Fetch exchange rate & payment methods when modal opens
  useEffect(() => {
    if (!isOpen) return;

    const loadData = async () => {
      setErrorMessage(null);
      try {
        const [rateRes, methodsRes] = await Promise.all([
          api.get<RateConfig>('/api/settings/exchange-rate').catch(() => ({
            rate: 600,
            base_currency: 'USD',
            quote_currency: 'SDG',
            min_topup: 1,
            max_topup: 500
          })),
          api.get<PaymentMethod[]>(`/api/payment-methods?currency=${currency}`).catch(() => [])
        ]);

        if (rateRes && rateRes.rate) {
          setRateConfig(rateRes);
        }
        if (methodsRes && methodsRes.length > 0) {
          setPaymentMethods(methodsRes);
          setSelectedMethod(methodsRes[0]);
        }
      } catch (err) {
        console.error('Failed to load topup config', err);
      }
    };

    loadData();
    // Reset state on open
    const resetAmt = isSdg ? 50000 : 10;
    setStep(1);
    setSelectedAmount(resetAmt);
    setCustomAmount(String(resetAmt));
    setReceiptFile(null);
    setReceiptPreview(null);
    setUserNote('');
    setErrorMessage(null);
  }, [isOpen, currency]);

  if (!isOpen) return null;

  const currentRate = rateConfig.rate || 600;
  const activeAmount = parseFloat(customAmount) || selectedAmount || (isSdg ? 50000 : 10);
  const calculatedLocalAmount = isSdg ? activeAmount : Math.round(activeAmount * currentRate);
  const equivalentUsd = isSdg ? activeAmount / currentRate : activeAmount;

  const presets = isSdg ? [25000, 50000, 100000, 250000, 500000] : [5, 10, 20, 50, 100];

  const handlePresetSelect = (amt: number) => {
    setSelectedAmount(amt);
    setCustomAmount(String(amt));
    setErrorMessage(null);
  };

  const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCustomAmount(val);
    const parsed = parseFloat(val);
    if (parsed) {
      setSelectedAmount(parsed);
    }
    setErrorMessage(null);
  };

  const handleStep1Next = () => {
    if (isNaN(activeAmount) || activeAmount <= 0) {
      setErrorMessage('يرجى تحديد مبلغ شحن صحيح.');
      return;
    }
    const minVal = isSdg ? (rateConfig.min_topup || 1) * currentRate : (rateConfig.min_topup || 1);
    const maxVal = isSdg ? (rateConfig.max_topup || 500) * currentRate : (rateConfig.max_topup || 500);

    if (activeAmount < minVal) {
      setErrorMessage(isSdg ? `الحد الأدنى للشحن هو ${minVal.toLocaleString()} ج.س.` : `الحد الأدنى للشحن هو $${minVal} دولار.`);
      return;
    }
    if (activeAmount > maxVal) {
      setErrorMessage(isSdg ? `الحد الأقصى للشحن هو ${maxVal.toLocaleString()} ج.س.` : `الحد الأقصى للشحن هو $${maxVal} دولار.`);
      return;
    }
    setErrorMessage(null);
    setStep(2);
  };

  const handleStep2Next = () => {
    if (!selectedMethod) {
      setErrorMessage('يرجى اختيار طريقة دفع للمتابعة.');
      return;
    }
    setErrorMessage(null);
    setStep(3);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      setErrorMessage('صيغة الملف غير مقبولة. يرجى رفع صورة بصيغة JPG, PNG, WEBP أو ملف PDF.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage('حجم الملف كبير جداً! الحد الأقصى المسموح به هو 5 ميغابايت.');
      return;
    }

    setErrorMessage(null);
    setReceiptFile(file);

    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => {
        setReceiptPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setReceiptPreview(null);
    }
  };

  const handleCopyAccountNumber = () => {
    if (selectedMethod?.account_number) {
      navigator.clipboard.writeText(selectedMethod.account_number);
      setCopiedAccount(true);
      setTimeout(() => setCopiedAccount(false), 2500);
    }
  };

  const handleSubmitTopup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiptFile) {
      setErrorMessage('يرجى رفع إيصال أو إشعار التحويل البنكي للمتابعة.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const formData = new FormData();
    formData.append('requested_currency', currency);
    formData.append('requested_amount', String(activeAmount));
    formData.append('amount_usd', String(isSdg ? (activeAmount / currentRate).toFixed(2) : activeAmount));
    if (selectedMethod?.id) {
      formData.append('payment_method_id', selectedMethod.id);
    }
    if (userNote.trim()) {
      formData.append('user_note', userNote.trim());
    }
    formData.append('receipt', receiptFile);

    const result = await submitTopupRequest(formData);

    setIsSubmitting(false);
    if (result.success) {
      setStep(4);
    } else {
      setErrorMessage(result.message || 'فشل إرسال طلب الشحن.');
    }
  };

  return createPortal(
    <div
      className={styles.modal}
      onClick={(e) => e.stopPropagation()}
      style={{ 
        maxWidth: 520, 
        width: '95%',
        position: 'fixed', 
        top: '50%', 
        left: '50%', 
        transform: 'translate(-50%, -50%)', 
        zIndex: 10000, 
        margin: 0,
        maxHeight: '92vh',
        overflowY: 'auto'
      }}
      role="dialog"
      aria-modal="true"
      dir="rtl"
    >
      {/* Header */}
      <div className={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: '#0B0F19', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-yellow)' }}>
            <Building2 size={20} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0B0F19', margin: 0 }}>
              شحن المحفظة (تحويل بنكي)
            </h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              الخطوة {step} من 3 • رصيد بالدولار بأسعار الصرف الرسمية
            </span>
          </div>
        </div>

        <button className={styles.closeBtn} onClick={closeOverlay} aria-label="إغلاق">
          <X size={20} />
        </button>
      </div>

      {/* Progress Dots */}
      {step < 4 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', margin: '14px 0 18px' }}>
          <div style={{ 
            height: '6px', 
            width: step === 1 ? '32px' : '14px', 
            borderRadius: '4px', 
            background: step >= 1 ? '#0B0F19' : '#e2e8f0',
            transition: 'all 0.3s'
          }} />
          <div style={{ 
            height: '6px', 
            width: step === 2 ? '32px' : '14px', 
            borderRadius: '4px', 
            background: step >= 2 ? '#0B0F19' : '#e2e8f0',
            transition: 'all 0.3s'
          }} />
          <div style={{ 
            height: '6px', 
            width: step === 3 ? '32px' : '14px', 
            borderRadius: '4px', 
            background: step >= 3 ? '#0B0F19' : '#e2e8f0',
            transition: 'all 0.3s'
          }} />
        </div>
      )}

      {/* Error Banner */}
      {errorMessage && (
        <div style={{ 
          background: '#fef2f2', 
          border: '1px solid #ef4444', 
          color: '#991b1b', 
          borderRadius: '8px', 
          padding: '10px 14px', 
          fontSize: '0.85rem',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '14px'
        }}>
          <AlertCircle size={16} />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* ========================================================= */}
      {/* STEP 1: CHOOSE AMOUNT & EXCHANGE RATE CALCULATION */}
      {/* ========================================================= */}
      {step === 1 && (
        <div>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: 14, fontWeight: 600 }}>
            {isSdg
              ? 'كم تريد شحن محفظتك؟ اختر مبلغ الشحن بالجنيه السوداني (SDG):'
              : 'كم تريد شحن محفظتك؟ اختر مبلغ الشحن بالدولار ($ USD):'}
          </p>

          {/* Presets */}
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${presets.length}, 1fr)`, gap: 8, marginBottom: 16 }}>
            {presets.map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => handlePresetSelect(amt)}
                className={`btn ${selectedAmount === amt ? 'btn-primary' : 'btn-secondary'}`}
                style={{ 
                  padding: '10px 4px', 
                  fontSize: isSdg ? '0.8rem' : '0.95rem', 
                  fontWeight: 900, 
                  fontFamily: 'var(--font-latin)',
                  border: selectedAmount === amt ? '2px solid #0B0F19' : undefined
                }}
              >
                {isSdg ? `${(amt / 1000).toLocaleString()}k` : `$${amt}`}
              </button>
            ))}
          </div>

          {/* Custom Amount Input */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: '0.825rem', fontWeight: 700, display: 'block', marginBottom: 6, color: '#0B0F19' }}>
              {isSdg ? 'أو حدد مبلغاً مخصصاً بالجنيه السوداني (ج.س):' : 'أو حدد مبلغاً مخصصاً بالدولار ($):'}
            </label>
            <input
              type="number"
              min={isSdg ? (rateConfig.min_topup || 1) * currentRate : (rateConfig.min_topup || 1)}
              max={isSdg ? (rateConfig.max_topup || 500) * currentRate : (rateConfig.max_topup || 500)}
              step={isSdg ? '1000' : '1'}
              value={customAmount}
              onChange={handleCustomChange}
              placeholder={isSdg ? 'مثال: 50000' : 'مثال: 15'}
              className="admin-input"
              style={{
                width: '100%',
                background: 'var(--bg-primary)',
                padding: '10px 14px',
                fontSize: '1.05rem',
                fontWeight: 700,
                color: '#0B0F19',
                border: '1.5px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)'
              }}
            />
          </div>

          {/* Live Currency & Rate Breakdown Card */}
          <div style={{ 
            background: '#f8fafc', 
            border: '1.5px solid #e2e8f0', 
            borderRadius: '12px', 
            padding: '16px', 
            marginBottom: 20 
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, fontSize: '0.875rem' }}>
              <span style={{ color: '#64748b' }}>مبلغ الشحن المطلوب إضافته للمحفظة:</span>
              <strong style={{ fontSize: '1.1rem', color: '#0B0F19', fontFamily: 'var(--font-latin)' }}>
                {isSdg ? `${activeAmount.toLocaleString()} ج.س` : `$${activeAmount.toFixed(2)} USD`}
              </strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, fontSize: '0.825rem' }}>
              <span style={{ color: '#64748b' }}>سعر الصرف المعتمد:</span>
              <span style={{ color: '#0284c7', fontWeight: 700 }}>
                1 USD = {currentRate.toLocaleString()} SDG
              </span>
            </div>

            {isSdg && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, fontSize: '0.825rem' }}>
                <span style={{ color: '#64748b' }}>القيمة المكافئة بالدولار:</span>
                <span style={{ color: '#475569', fontWeight: 700 }}>
                  ~${equivalentUsd.toFixed(2)} USD
                </span>
              </div>
            )}

            <div style={{ 
              height: '1px', 
              background: '#e2e8f0', 
              margin: '10px 0' 
            }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 800, color: '#0B0F19', fontSize: '0.95rem' }}>
                المبلغ المطلوب تحويله:
              </span>
              <span style={{ 
                fontSize: '1.3rem', 
                fontWeight: 900, 
                color: '#059669',
                direction: 'ltr'
              }}>
                {calculatedLocalAmount.toLocaleString()} {isSdg ? 'ج.س' : 'USD'}
              </span>
            </div>
          </div>

          <p style={{ fontSize: '0.775rem', color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.5 }}>
            ℹ️ لا تتم إضافة أي رصيد إلى المحفظة في هذه المرحلة. سيتم إنشاء طلب شحن وتثبيت سعر الصرف الحالي للطلب.
          </p>

          <button 
            type="button" 
            onClick={handleStep1Next} 
            className="btn btn-primary"
            style={{ width: '100%', padding: '12px', fontSize: '1rem', fontWeight: 800, gap: '8px' }}
          >
            <span>متابعة واختيار طريقة الدفع</span>
            <ArrowLeft size={18} />
          </button>
        </div>
      )}

      {/* ========================================================= */}
      {/* STEP 2: CHOOSE PAYMENT METHOD */}
      {/* ========================================================= */}
      {step === 2 && (
        <div>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: 14, fontWeight: 600 }}>
            اختر الحساب البنكي أو طريقة التحويل المناسبة لك:
          </p>

          {paymentMethods.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: '10px' }}>
              <p style={{ margin: 0 }}>لا توجد طرق دفع بنكية مفعلة حالياً. يرجى التواصل مع الدعم الفني.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: 20 }}>
              {paymentMethods.map((pm) => (
                <div
                  key={pm.id}
                  onClick={() => {
                    setSelectedMethod(pm);
                    setErrorMessage(null);
                  }}
                  style={{
                    padding: '14px 16px',
                    borderRadius: '12px',
                    border: `2px solid ${selectedMethod?.id === pm.id ? '#0B0F19' : '#e2e8f0'}`,
                    background: selectedMethod?.id === pm.id ? '#f8fafc' : '#fff',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'all 0.2s'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ 
                      width: '40px', 
                      height: '40px', 
                      borderRadius: '8px', 
                      background: selectedMethod?.id === pm.id ? '#0B0F19' : '#f1f5f9',
                      color: selectedMethod?.id === pm.id ? '#facc15' : '#475569',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <Building2 size={20} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#0B0F19' }}>
                        {pm.name}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        {pm.bank_name} • {pm.currency}
                      </div>
                    </div>
                  </div>

                  <div style={{ 
                    width: '20px', 
                    height: '20px', 
                    borderRadius: '50%', 
                    border: `2px solid ${selectedMethod?.id === pm.id ? '#0B0F19' : '#cbd5e1'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    {selectedMethod?.id === pm.id && (
                      <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#0B0F19' }} />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Back & Next buttons */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button 
              type="button" 
              onClick={() => setStep(1)} 
              className="btn btn-secondary"
              style={{ flex: 1, padding: '12px' }}
            >
              <ArrowRight size={18} />
              <span>السابق</span>
            </button>
            <button 
              type="button" 
              onClick={handleStep2Next} 
              className="btn btn-primary"
              style={{ flex: 2, padding: '12px', fontWeight: 800 }}
              disabled={!selectedMethod}
            >
              <span>متابعة لبيانات التحويل</span>
              <ArrowLeft size={18} />
            </button>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* STEP 3: BANK DETAILS & RECEIPT UPLOAD */}
      {/* ========================================================= */}
      {step === 3 && selectedMethod && (
        <form onSubmit={handleSubmitTopup}>
          {/* Transfer Instructions Card */}
          <div style={{ 
            background: '#f8fafc', 
            border: '1.5px solid #cbd5e1', 
            borderRadius: '12px', 
            padding: '16px', 
            marginBottom: 16 
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0B0F19' }}>
                بيانات الحساب البنكي المستلم:
              </span>
              <span style={{ 
                background: '#e0f2fe', 
                color: '#0369a1', 
                fontSize: '0.75rem', 
                fontWeight: 800, 
                padding: '2px 8px', 
                borderRadius: '4px' 
              }}>
                {selectedMethod.bank_name}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.875rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>اسم الحساب:</span>
                <strong style={{ color: '#0B0F19' }}>{selectedMethod.account_name}</strong>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#64748b' }}>رقم الحساب / الآيبان:</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <code style={{ 
                    fontFamily: 'monospace', 
                    fontWeight: 800, 
                    fontSize: '1rem', 
                    background: '#fff', 
                    padding: '3px 8px', 
                    borderRadius: '6px', 
                    border: '1px solid #e2e8f0',
                    color: '#0B0F19' 
                  }}>
                    {selectedMethod.account_number}
                  </code>
                  <button 
                    type="button" 
                    onClick={handleCopyAccountNumber}
                    style={{ 
                      background: copiedAccount ? '#10b981' : '#0B0F19', 
                      color: '#fff', 
                      border: 'none', 
                      borderRadius: '6px', 
                      padding: '4px 8px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '0.75rem',
                      fontWeight: 700
                    }}
                  >
                    {copiedAccount ? <Check size={13} /> : <Copy size={13} />}
                    <span>{copiedAccount ? 'تم النسخ' : 'نسخ'}</span>
                  </button>
                </div>
              </div>

              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                marginTop: '6px',
                paddingTop: '8px',
                borderTop: '1px dashed #cbd5e1'
              }}>
                <span style={{ fontWeight: 800, color: '#0B0F19' }}>المبلغ المطلوب تحويله:</span>
                <span style={{ fontWeight: 900, color: '#059669', fontSize: '1.2rem', direction: 'ltr' }}>
                  {calculatedLocalAmount.toLocaleString()} {selectedMethod.currency}
                </span>
              </div>
            </div>

            {selectedMethod.instructions && (
              <div style={{ 
                marginTop: '12px', 
                padding: '10px', 
                background: '#eff6ff', 
                borderRadius: '6px', 
                fontSize: '0.775rem', 
                color: '#1e40af', 
                lineHeight: 1.5 
              }}>
                <strong>تعليمات خاصة: </strong>{selectedMethod.instructions}
              </div>
            )}
          </div>

          {/* Instructions List */}
          <div style={{ fontSize: '0.8rem', color: '#475569', marginBottom: 16, lineHeight: 1.6 }}>
            <div style={{ fontWeight: 700, color: '#0B0F19', marginBottom: 4 }}>خطوات الإيداع:</div>
            <div>1. قم بتحويل <strong>{calculatedLocalAmount.toLocaleString()} {selectedMethod.currency}</strong> إلى الحساب أعلاه.</div>
            <div>2. احتفظ بصورة إشعار التحويل البنكي أو ملف الـ PDF.</div>
            <div>3. ارفع الإشعار أدناه واضغط على "إرسال طلب الشحن".</div>
          </div>

          {/* Receipt Upload Drop Area */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 800, display: 'block', marginBottom: 6, color: '#0B0F19' }}>
              رفع إشعار / إيصال التحويل (Receipt)*
            </label>
            
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              accept=".jpg,.jpeg,.png,.webp,.pdf" 
              style={{ display: 'none' }} 
            />

            <div 
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: '2px dashed #cbd5e1',
                borderRadius: '12px',
                padding: '18px',
                textAlign: 'center',
                cursor: 'pointer',
                background: receiptFile ? '#f0fdf4' : '#f8fafc',
                borderColor: receiptFile ? '#10b981' : '#cbd5e1',
                transition: 'all 0.2s'
              }}
            >
              {receiptFile ? (
                <div>
                  <CheckCircle2 size={32} color="#10b981" style={{ margin: '0 auto 6px' }} />
                  <div style={{ fontWeight: 800, color: '#065f46', fontSize: '0.9rem' }}>
                    تم إرفاق الإيصال: {receiptFile.name}
                  </div>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    {(receiptFile.size / (1024 * 1024)).toFixed(2)} MB • انقر لتغيير الملف
                  </span>
                  {receiptPreview && (
                    <img 
                      src={receiptPreview} 
                      alt="Preview" 
                      style={{ 
                        maxHeight: '120px', 
                        margin: '10px auto 0', 
                        borderRadius: '6px', 
                        border: '1px solid #e2e8f0',
                        objectFit: 'contain'
                      }} 
                    />
                  )}
                </div>
              ) : (
                <div>
                  <Upload size={30} color="#64748b" style={{ margin: '0 auto 8px' }} />
                  <div style={{ fontWeight: 700, color: '#0B0F19', fontSize: '0.9rem' }}>
                    انقر هنا لاختيار صورة الإيصال أو ملف PDF
                  </div>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                    الصيغ المقبولة: JPG, PNG, WEBP, PDF (الحد الأقصى: 5 ميغابايت)
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Optional Note */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: 4, color: '#475569' }}>
              ملاحظة أو رقم العملية (اختياري):
            </label>
            <input
              type="text"
              placeholder="مثال: تم التحويل من حساب باسم أحمد..."
              value={userNote}
              onChange={(e) => setUserNote(e.target.value)}
              className="admin-input"
              style={{
                width: '100%',
                background: 'var(--bg-primary)',
                padding: '8px 12px',
                fontSize: '0.875rem',
                border: '1.5px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)'
              }}
            />
          </div>

          {/* Navigation Buttons */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button 
              type="button" 
              onClick={() => setStep(2)} 
              className="btn btn-secondary"
              style={{ flex: 1, padding: '12px' }}
              disabled={isSubmitting}
            >
              <ArrowRight size={18} />
              <span>السابق</span>
            </button>

            <button 
              type="submit" 
              className="btn btn-primary"
              style={{ flex: 2, padding: '12px', fontWeight: 900 }}
              disabled={isSubmitting || !receiptFile}
            >
              {isSubmitting ? (
                <span>جاري إرسال الطلب...</span>
              ) : (
                <span>إرسال طلب الشحن</span>
              )}
            </button>
          </div>
        </form>
      )}

      {/* ========================================================= */}
      {/* STEP 4: SUCCESS / SUBMITTED PENDING STATE */}
      {/* ========================================================= */}
      {step === 4 && (
        <div style={{ textAlign: 'center', padding: '16px 8px 10px' }}>
          <div style={{ 
            width: '64px', 
            height: '64px', 
            borderRadius: '50%', 
            background: '#fefce8', 
            border: '2px solid #eab308',
            color: '#ca8a04',
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            margin: '0 auto 16px'
          }}>
            <Clock size={34} />
          </div>

          <h3 style={{ fontSize: '1.25rem', fontWeight: 900, color: '#0B0F19', marginBottom: 8 }}>
            تم استلام طلب الشحن بنجاح!
          </h3>

          <div style={{ 
            display: 'inline-flex', 
            alignItems: 'center', 
            gap: '6px',
            background: '#fef9c3', 
            border: '1px solid #fde047',
            color: '#854d0e',
            borderRadius: '20px',
            padding: '4px 14px',
            fontSize: '0.8rem',
            fontWeight: 800,
            marginBottom: 16
          }}>
            <Clock size={14} />
            <span>حالة الطلب: قيد المراجعة والتدقيق (PENDING REVIEW)</span>
          </div>

          <div style={{ 
            background: '#f8fafc', 
            border: '1.5px solid #e2e8f0', 
            borderRadius: '12px', 
            padding: '16px', 
            textAlign: 'right',
            marginBottom: 20 
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ color: '#64748b', fontSize: '0.85rem' }}>المبلغ المطلوب إضافته:</span>
              <strong style={{ color: '#059669', fontSize: '1.1rem' }}>
                {isSdg ? `${activeAmount.toLocaleString()} ج.س (~$${equivalentUsd.toFixed(2)})` : `$${activeAmount.toFixed(2)} USD`}
              </strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ color: '#64748b', fontSize: '0.85rem' }}>المبلغ المحول:</span>
              <strong style={{ color: '#0B0F19' }}>{calculatedLocalAmount.toLocaleString()} {selectedMethod?.currency || (isSdg ? 'SDG' : 'USD')}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b', fontSize: '0.85rem' }}>طريقة الدفع:</span>
              <span style={{ color: '#0B0F19', fontWeight: 600 }}>{selectedMethod?.name}</span>
            </div>
          </div>

          <div style={{ 
            background: '#eff6ff', 
            border: '1px solid #bfdbfe', 
            borderRadius: '8px', 
            padding: '12px', 
            color: '#1e40af', 
            fontSize: '0.8rem', 
            lineHeight: 1.5,
            marginBottom: 20,
            textAlign: 'right'
          }}>
            ⚠️ <strong>تنبيه أمني:</strong> لا يُعتبر المبلغ مضافاً إلى رصيد محفظتك المتاح حالياً. سيتم التحقق من الإشعار وإيداع المبلغ فور مراجعة الإدارة له والموافقة عليه. يمكنك متابعة حالة طلبك من صفحة "حسابي".
          </div>

          <button 
            type="button" 
            onClick={closeOverlay} 
            className="btn btn-primary"
            style={{ width: '100%', padding: '12px', fontWeight: 800 }}
          >
            <span>فهمت ذلك، إغلاق النافذة</span>
          </button>
        </div>
      )}
    </div>,
    document.body
  );
};
