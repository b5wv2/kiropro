import React, { useState, useEffect } from 'react';
import { 
  ArrowRight, 
  Zap, 
  AlertTriangle, 
  CheckCircle2, 
  Copy, 
  Check, 
  Loader2, 
  Wallet,
  Clock,
  XCircle
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useWallet } from '../../context/WalletContext';
import { api } from '../../lib/api';
import { isAddress } from 'ethers';

interface CryptoConfig {
  available: number;
  minOrderAmount: number;
  exchangeRate: number;
  networks: Array<{
    identifier: string;
    name: string;
    currency: string;
    validatorType: string;
    minAmount: number;
  }>;
}

interface PlacedOrderState {
  orderId: string;
  usdtAmount: number;
  network: string;
  walletAddress: string;
  chargedAmount: number;
  chargedCurrency: string;
  status: 'AWAITING_TRANSFER' | 'COMPLETED' | 'CANCELED';
  txHash?: string | null;
  createdAt: string;
}

export const UsdtTransferPage: React.FC = () => {
  const { isAuthenticated, navigateTo } = useAuth();
  const { balance, currency, refreshBalance, openDepositModal } = useWallet();

  const [config, setConfig] = useState<CryptoConfig | null>(null);

  // Form State
  const [amount, setAmount] = useState<number | string>(10);
  const [selectedNetwork, setSelectedNetwork] = useState<string>('POLYGON');
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Active Order Live Tracking State
  const [activeOrder, setActiveOrder] = useState<PlacedOrderState | null>(null);
  const [copiedTx, setCopiedTx] = useState(false);

  // Load public crypto config on mount
  useEffect(() => {
    let isMounted = true;
    api.get('/api/crypto/usdt/config')
      .then((data: CryptoConfig) => {
        if (isMounted) {
          setConfig(data);
          if (data.networks?.length > 0) {
            setSelectedNetwork(data.networks[0].identifier);
          }
        }
      })
      .catch((err) => {
        console.error('Failed to load crypto config:', err);
      });

    return () => { isMounted = false; };
  }, []);

  // Live polling for placed order state until COMPLETED or CANCELED
  useEffect(() => {
    if (!activeOrder || activeOrder.status === 'COMPLETED' || activeOrder.status === 'CANCELED') {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const orderData = await api.get(`/api/crypto/usdt/orders/${activeOrder.orderId}`);
        if (orderData && orderData.status) {
          setActiveOrder(prev => prev ? {
            ...prev,
            status: orderData.status,
            txHash: orderData.txHash || null
          } : null);

          if (orderData.status === 'COMPLETED' || orderData.status === 'CANCELED') {
            refreshBalance();
          }
        }
      } catch (err) {
        console.warn('Polling order status error:', err);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [activeOrder?.orderId, activeOrder?.status]);

  const numAmount = Number(amount) || 0;
  const exchangeRate = config?.exchangeRate || 5000;
  const minRequired = config?.minOrderAmount || 3;

  // Calculate price based on user currency
  const calculatedPrice = currency === 'SDG' 
    ? Math.round(numAmount * exchangeRate)
    : numAmount;

  const hasEnoughBalance = (balance || 0) >= calculatedPrice;

  // Real-time EVM Address Validation
  const isValidEvmAddress = React.useMemo(() => {
    if (!walletAddress.trim()) return null;
    return isAddress(walletAddress.trim());
  }, [walletAddress]);

  const handlePresetClick = (val: number) => {
    setAmount(val);
    setFormError(null);
  };

  const handlePasteAddress = async () => {
    try {
      const clipText = await navigator.clipboard.readText();
      if (clipText) {
        setWalletAddress(clipText.trim());
        setFormError(null);
      }
    } catch {
      // Ignore if clipboard access is denied
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!isAuthenticated) {
      navigateTo('login');
      return;
    }

    if (numAmount < minRequired) {
      setFormError(`الحد الأدنى لشراء USDT هو ${minRequired} دولار.`);
      return;
    }

    if (config && numAmount > config.available) {
      setFormError(`الكمية المطلوبة أكبر من المخزون المتاح حالياً (${config.available} USDT).`);
      return;
    }

    if (!walletAddress.trim() || !isValidEvmAddress) {
      setFormError('يرجى إدخال عنوان محفظة Polygon صالح يبدأ بـ 0x.');
      return;
    }

    if (!hasEnoughBalance) {
      openDepositModal();
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await api.post('/api/crypto/usdt/order', {
        amount: numAmount,
        network: selectedNetwork,
        walletAddress: walletAddress.trim()
      });

      setActiveOrder({
        orderId: res.orderId,
        usdtAmount: res.usdtAmount,
        network: res.network,
        walletAddress: res.walletAddress,
        chargedAmount: res.chargedAmount,
        chargedCurrency: res.chargedCurrency,
        status: 'AWAITING_TRANSFER',
        createdAt: new Date().toISOString()
      });

      refreshBalance();
    } catch (err: any) {
      console.error('Order creation failed:', err);
      setFormError(err?.data?.error || err.message || 'فشل إرسال الطلب. يرجى المحاولة لاحقاً.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ minHeight: '80vh', padding: '40px 16px', background: 'radial-gradient(circle at 50% 0%, #1E293B 0%, #0B0F19 70%)' }} dir="rtl">
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        
        {/* Breadcrumb / Back button */}
        <button
          type="button"
          onClick={() => navigateTo('home')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            background: 'transparent',
            border: 'none',
            color: '#94A3B8',
            fontSize: 14,
            fontWeight: 700,
            cursor: 'pointer',
            marginBottom: 20
          }}
        >
          <ArrowRight size={16} />
          <span>العودة للمتجر</span>
        </button>

        {/* ACTIVE ORDER LIVE SCREEN */}
        {activeOrder ? (
          <div style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 20, padding: 32, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', textAlign: 'center' }}>
            {activeOrder.status === 'AWAITING_TRANSFER' && (
              <>
                <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(245, 158, 11, 0.15)', border: '2px solid #F59E0B', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', position: 'relative' }}>
                  <Clock size={36} color="#F59E0B" />
                  <span style={{ position: 'absolute', top: -4, right: -4, width: 16, height: 16, borderRadius: '50%', background: '#F59E0B', animation: 'ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite' }} />
                </div>

                <h1 style={{ fontSize: 24, fontWeight: 900, color: '#F8FAFC', margin: '0 0 10px 0' }}>
                  جاري إرسال المبلغ...
                </h1>
                <p style={{ color: '#94A3B8', fontSize: 15, lineHeight: 1.6, margin: '0 auto 24px', maxWidth: 440 }}>
                  تم استلام طلبك بنجاح وسيتم تنفيذ التحويل الفوري إلى محفظتك عبر فريق الدعم الآن.
                </p>

                <div style={{ background: '#1E293B', border: '1px solid #334155', borderRadius: 14, padding: 20, textAlign: 'right', marginBottom: 24 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: 14 }}>
                    <span style={{ color: '#94A3B8' }}>رقم الطلب:</span>
                    <span style={{ fontWeight: 800, color: '#F8FAFC', fontFamily: 'monospace' }}>#{activeOrder.orderId.slice(0, 8).toUpperCase()}</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: 14 }}>
                    <span style={{ color: '#94A3B8' }}>المبلغ المطلوب:</span>
                    <span style={{ fontWeight: 900, color: '#10B981', fontSize: 16 }}>{activeOrder.usdtAmount} USDT</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: 14 }}>
                    <span style={{ color: '#94A3B8' }}>الشبكة:</span>
                    <span style={{ fontWeight: 700, color: '#F8FAFC' }}>{activeOrder.network}</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: 14 }}>
                    <span style={{ color: '#94A3B8' }}>عنوان المحفظة:</span>
                    <span style={{ fontWeight: 700, color: '#38BDF8', fontFamily: 'monospace', direction: 'ltr' }}>
                      {activeOrder.walletAddress.slice(0, 8)}...{activeOrder.walletAddress.slice(-6)}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, paddingTop: 12, borderTop: '1px dashed #334155' }}>
                    <span style={{ color: '#94A3B8' }}>المبلغ المخصوم من محفظتك:</span>
                    <span style={{ fontWeight: 800, color: '#F8FAFC' }}>{Number(activeOrder.chargedAmount).toLocaleString()} {activeOrder.chargedCurrency}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#64748B', fontSize: 13 }}>
                  <Loader2 size={16} className="animate-spin" />
                  <span>تحديث تلقائي لحالة الطلب كل 3 ثوانٍ...</span>
                </div>
              </>
            )}

            {activeOrder.status === 'COMPLETED' && (
              <>
                <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(16, 185, 129, 0.15)', border: '2px solid #10B981', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                  <CheckCircle2 size={40} color="#10B981" />
                </div>

                <h1 style={{ fontSize: 24, fontWeight: 900, color: '#10B981', margin: '0 0 10px 0' }}>
                  تم إكمال طلبك بنجاح! ✅
                </h1>
                <p style={{ color: '#94A3B8', fontSize: 15, margin: '0 auto 24px' }}>
                  تم تحويل {activeOrder.usdtAmount} USDT بنجاح إلى محفظتك.
                </p>

                {/* Details Box */}
                <div style={{ background: '#1E293B', border: '1px solid #10B981', borderRadius: 14, padding: 20, textAlign: 'right', marginBottom: 24 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: 14 }}>
                    <span style={{ color: '#94A3B8' }}>المبلغ المحول:</span>
                    <span style={{ fontWeight: 900, color: '#10B981', fontSize: 18 }}>{activeOrder.usdtAmount} USDT</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: 14 }}>
                    <span style={{ color: '#94A3B8' }}>الشبكة:</span>
                    <span style={{ fontWeight: 700, color: '#F8FAFC' }}>{activeOrder.network}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: 14 }}>
                    <span style={{ color: '#94A3B8' }}>رقم الطلب:</span>
                    <span style={{ fontWeight: 800, color: '#F8FAFC', fontFamily: 'monospace' }}>#{activeOrder.orderId.slice(0, 8).toUpperCase()}</span>
                  </div>

                  {activeOrder.txHash && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #334155' }}>
                      <div style={{ color: '#94A3B8', fontSize: 13, marginBottom: 4 }}>معرف المعاملة (TxID):</div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0B0F19', padding: '8px 12px', borderRadius: 8, direction: 'ltr' }}>
                        <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#38BDF8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {activeOrder.txHash}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(activeOrder.txHash || '');
                            setCopiedTx(true);
                            setTimeout(() => setCopiedTx(false), 2000);
                          }}
                          style={{ background: 'transparent', border: 'none', color: copiedTx ? '#10B981' : '#94A3B8', cursor: 'pointer', padding: 4 }}
                        >
                          {copiedTx ? <Check size={14} /> : <Copy size={14} />}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveOrder(null);
                      setWalletAddress('');
                      setAmount(10);
                    }}
                    style={{
                      background: '#F59E0B',
                      color: '#0B0F19',
                      border: 'none',
                      borderRadius: 10,
                      padding: '12px 28px',
                      fontSize: 15,
                      fontWeight: 800,
                      cursor: 'pointer'
                    }}
                  >
                    طلب تحويل جديد
                  </button>

                  <button
                    type="button"
                    onClick={() => navigateTo('account')}
                    style={{
                      background: '#1E293B',
                      color: '#F8FAFC',
                      border: '1px solid #334155',
                      borderRadius: 10,
                      padding: '12px 20px',
                      fontSize: 15,
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    عرض سجل الطلبات
                  </button>
                </div>
              </>
            )}

            {activeOrder.status === 'CANCELED' && (
              <>
                <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(239, 68, 68, 0.15)', border: '2px solid #EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                  <XCircle size={40} color="#EF4444" />
                </div>

                <h1 style={{ fontSize: 24, fontWeight: 900, color: '#EF4444', margin: '0 0 10px 0' }}>
                  تم إلغاء الطلب ورد الرصيد
                </h1>
                <p style={{ color: '#94A3B8', fontSize: 15, margin: '0 auto 24px' }}>
                  تمت إعادة كامل المبلغ ({Number(activeOrder.chargedAmount).toLocaleString()} {activeOrder.chargedCurrency}) إلى رصيد محفظتك.
                </p>

                <button
                  type="button"
                  onClick={() => setActiveOrder(null)}
                  style={{
                    background: '#1E293B',
                    color: '#F8FAFC',
                    border: '1px solid #334155',
                    borderRadius: 10,
                    padding: '12px 28px',
                    fontSize: 15,
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  إعادة المحاولة
                </button>
              </>
            )}
          </div>
        ) : (
          /* ORDER CREATION FORM */
          <div style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 20, padding: 32, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>
            
            {/* Form Header */}
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.3)', padding: '6px 14px', borderRadius: 20, color: '#F59E0B', fontSize: 13, fontWeight: 800, marginBottom: 12 }}>
                <Zap size={15} />
                <span>تحويل سريع وفوري</span>
              </div>
              <h1 style={{ fontSize: 28, fontWeight: 900, color: '#F8FAFC', margin: '0 0 8px 0' }}>
                USDT Instant Transfer
              </h1>
              <p style={{ color: '#94A3B8', fontSize: 14, margin: 0 }}>
                اشترِ رصيد USDT مباشرة برصيد محفظتك مع تنفيذ وإرسال فوري إلى محفظتك الشخصية.
              </p>
            </div>

            {/* Inventory & Minimum Banner */}
            {config && (
              <div style={{ background: '#1E293B', border: '1px solid #334155', borderRadius: 12, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, fontSize: 13 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#94A3B8' }}>
                  <span>المخزون المتاح حالياً:</span>
                  <strong style={{ color: '#10B981', fontWeight: 800 }}>{config.available} USDT</strong>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#94A3B8' }}>
                  <span>الحد الأدنى:</span>
                  <strong style={{ color: '#F8FAFC', fontWeight: 800 }}>{config.minOrderAmount} USDT</strong>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit}>
              {/* Field 1: Amount */}
              <div style={{ marginBottom: 22 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label style={{ fontSize: 14, fontWeight: 800, color: '#F8FAFC' }}>
                    كمية USDT المطلوبة:
                  </label>
                  <span style={{ fontSize: 12, color: '#94A3B8' }}>
                    الحد الأدنى: {minRequired} USDT
                  </span>
                </div>

                <div style={{ position: 'relative' }}>
                  <input
                    type="number"
                    min={minRequired}
                    step="any"
                    value={amount}
                    onChange={(e) => {
                      setAmount(e.target.value);
                      setFormError(null);
                    }}
                    placeholder="20"
                    style={{
                      width: '100%',
                      background: '#0B0F19',
                      border: '1px solid #334155',
                      borderRadius: 12,
                      padding: '14px 16px 14px 70px',
                      fontSize: 18,
                      fontWeight: 800,
                      color: '#F8FAFC',
                      direction: 'ltr',
                      textAlign: 'right'
                    }}
                  />
                  <div style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', fontWeight: 800, color: '#10B981', fontSize: 15 }}>
                    USDT
                  </div>
                </div>

                {/* Quick Presets */}
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  {[5, 10, 20, 50, 100].map(val => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => handlePresetClick(val)}
                      style={{
                        flex: 1,
                        background: numAmount === val ? 'rgba(245, 158, 11, 0.2)' : '#1E293B',
                        border: numAmount === val ? '1px solid #F59E0B' : '1px solid #334155',
                        color: numAmount === val ? '#F59E0B' : '#94A3B8',
                        padding: '6px 0',
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      {val}$
                    </button>
                  ))}
                </div>
              </div>

              {/* Field 2: Network Selection */}
              <div style={{ marginBottom: 22 }}>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 800, color: '#F8FAFC', marginBottom: 8 }}>
                  شبكة التحويل (Network):
                </label>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
                  {config?.networks?.map(net => (
                    <div
                      key={net.identifier}
                      onClick={() => setSelectedNetwork(net.identifier)}
                      style={{
                        background: selectedNetwork === net.identifier ? 'rgba(16, 185, 129, 0.15)' : '#0B0F19',
                        border: selectedNetwork === net.identifier ? '2px solid #10B981' : '1px solid #334155',
                        borderRadius: 12,
                        padding: 14,
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 800, color: '#F8FAFC', fontSize: 14 }}>{net.name}</span>
                        {selectedNetwork === net.identifier && <CheckCircle2 size={16} color="#10B981" />}
                      </div>
                      <span style={{ fontSize: 11, color: '#94A3B8' }}>رسوم منخفضة وتأكيد فوري</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Field 3: Wallet Address */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label style={{ fontSize: 14, fontWeight: 800, color: '#F8FAFC' }}>
                    عنوان محفظتك (Wallet Address):
                  </label>
                  <button
                    type="button"
                    onClick={handlePasteAddress}
                    style={{ background: 'transparent', border: 'none', color: '#38BDF8', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                  >
                    لصق من الحافظة
                  </button>
                </div>

                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    placeholder="0x..."
                    value={walletAddress}
                    onChange={(e) => {
                      setWalletAddress(e.target.value);
                      setFormError(null);
                    }}
                    style={{
                      width: '100%',
                      background: '#0B0F19',
                      border: isValidEvmAddress === false ? '1px solid #EF4444' : isValidEvmAddress === true ? '1px solid #10B981' : '1px solid #334155',
                      borderRadius: 12,
                      padding: '14px 16px',
                      fontSize: 14,
                      fontFamily: 'monospace',
                      color: '#F8FAFC',
                      direction: 'ltr'
                    }}
                  />
                </div>

                {isValidEvmAddress === true && (
                  <div style={{ color: '#10B981', fontSize: 12, marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <CheckCircle2 size={14} />
                    <span>عنوان EVM صالح ومتوافق مع شبكة Polygon.</span>
                  </div>
                )}
                {isValidEvmAddress === false && (
                  <div style={{ color: '#EF4444', fontSize: 12, marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <AlertTriangle size={14} />
                    <span>عنوان محفظة غير صالح لشبكة Polygon (يجب أن يبدأ بـ 0x ويكون 42 حرفاً).</span>
                  </div>
                )}
              </div>

              {/* Security Warning Notice */}
              <div style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)', borderRadius: 12, padding: 14, marginBottom: 24, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <AlertTriangle size={18} color="#F59E0B" style={{ flexShrink: 0, marginTop: 2 }} />
                <p style={{ margin: 0, fontSize: 13, color: '#D97706', lineHeight: 1.5 }}>
                  <strong>تنبيه هام:</strong> تأكد من صحة العنوان والشبكة المحددة. التحويلات على شبكات البلوكشين نهائية وغير قابلة للعكس إطلاقاً.
                </p>
              </div>

              {/* Calculation Summary Card */}
              <div style={{ background: '#1E293B', borderRadius: 14, padding: 18, marginBottom: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, fontSize: 14 }}>
                  <span style={{ color: '#94A3B8' }}>سعر الصرف المعتمد:</span>
                  <span style={{ color: '#F8FAFC', fontWeight: 700 }}>1 USD = {exchangeRate.toLocaleString()} SDG</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, fontSize: 14 }}>
                  <span style={{ color: '#94A3B8' }}>رصيدك المتاح في المتجر:</span>
                  <span style={{ color: hasEnoughBalance ? '#10B981' : '#EF4444', fontWeight: 800 }}>
                    {(balance || 0).toLocaleString()} {currency}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 12, borderTop: '1px dashed #334155', fontSize: 16 }}>
                  <span style={{ fontWeight: 800, color: '#F8FAFC' }}>إجمالي الخصم المطلوب:</span>
                  <span style={{ fontWeight: 900, color: '#F59E0B', fontSize: 20 }}>
                    {calculatedPrice.toLocaleString()} {currency}
                  </span>
                </div>
              </div>

              {/* Error Box */}
              {formError && (
                <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 10, padding: 12, color: '#EF4444', fontSize: 13, fontWeight: 700, marginBottom: 20, textAlign: 'center' }}>
                  {formError}
                </div>
              )}

              {/* Action Button */}
              {!isAuthenticated ? (
                <button
                  type="button"
                  onClick={() => navigateTo('login')}
                  style={{
                    width: '100%',
                    background: '#F59E0B',
                    color: '#0B0F19',
                    border: 'none',
                    borderRadius: 12,
                    padding: 16,
                    fontSize: 16,
                    fontWeight: 900,
                    cursor: 'pointer'
                  }}
                >
                  تسجيل الدخول لإتمام الشراء
                </button>
              ) : !hasEnoughBalance ? (
                <button
                  type="button"
                  onClick={openDepositModal}
                  style={{
                    width: '100%',
                    background: '#3B82F6',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: 12,
                    padding: 16,
                    fontSize: 16,
                    fontWeight: 900,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8
                  }}
                >
                  <Wallet size={18} />
                  <span>رصيدك غير كافٍ — اضغط هنا لشحن محفظتك</span>
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{
                    width: '100%',
                    background: isSubmitting ? '#94A3B8' : '#F59E0B',
                    color: '#0B0F19',
                    border: 'none',
                    borderRadius: 12,
                    padding: 16,
                    fontSize: 16,
                    fontWeight: 900,
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    boxShadow: '0 10px 25px rgba(245, 158, 11, 0.35)'
                  }}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      <span>جاري معالجة الطلب...</span>
                    </>
                  ) : (
                    <span>تأكيد شراء {numAmount} USDT</span>
                  )}
                </button>
              )}
            </form>
          </div>
        )}
      </div>
    </div>
  );
};

export default UsdtTransferPage;
