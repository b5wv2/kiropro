import React, { useState, useEffect, useMemo } from 'react';
import { 
  ArrowRight, 
  Zap, 
  CheckCircle2, 
  Copy, 
  Check, 
  Loader2, 
  Wallet, 
  Clock, 
  XCircle,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useWallet } from '../../context/WalletContext';
import { api } from '../../lib/api';
import { isAddress } from 'ethers';

interface CryptoNetworkItem {
  identifier: string;
  name: string;
  currency: string;
  validatorType: string;
  minAmount: number;
}

interface CryptoConfig {
  available: number;
  minOrderAmount: number;
  exchangeRate: number;
  imageUrl?: string | null;
  networks: CryptoNetworkItem[];
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

// Network badge labels
const NETWORK_BADGES: Record<string, string> = {
  TRON: 'TRC20',
  POLYGON: 'Polygon Bor',
  BSC: 'BEP20',
  ETHEREUM: 'ERC20',
  ARBITRUM: 'Layer 2',
  AVAX: 'C-Chain'
};

export const UsdtTransferPage: React.FC = () => {
  const { isAuthenticated, navigateTo } = useAuth();
  const { balance, currency, refreshBalance, openDepositModal } = useWallet();

  const [config, setConfig] = useState<CryptoConfig | null>(null);

  // Form State
  const [amount, setAmount] = useState<number | string>(20);
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
        if (isMounted && data) {
          setConfig(data);
          if (data.networks && data.networks.length > 0) {
            // Keep polygon or fallback to first active network
            const hasPolygon = data.networks.some(n => n.identifier === 'POLYGON');
            setSelectedNetwork(hasPolygon ? 'POLYGON' : data.networks[0].identifier);
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

  // Selected Network Object
  const currentNetworkObj = useMemo(() => {
    return config?.networks.find(n => n.identifier === selectedNetwork);
  }, [config?.networks, selectedNetwork]);

  // Network-specific Address Validation
  const addressValidation = useMemo(() => {
    const raw = walletAddress.trim();
    if (!raw) return { valid: null, message: '' };

    const net = selectedNetwork.toUpperCase();

    // TRON (TRC20) validation
    if (net === 'TRON' || net === 'TRC20') {
      if (raw.startsWith('0x')) {
        return { valid: false, message: 'عنوان TRON لا يمكن أن يبدأ بـ 0x. عنوان TRON يبدأ دائماً بحرف T.' };
      }
      const tronRegex = /^T[a-km-zA-HJ-NP-Z1-9]{33}$/;
      if (!tronRegex.test(raw)) {
        return { valid: false, message: 'عنوان محفظة TRON (TRC20) غير صالح (يجب أن يبدأ بحرف T ويتكون من 34 حرفاً).' };
      }
      return { valid: true, message: 'عنوان TRON (TRC20) صالح ومعتمد.' };
    }

    // EVM networks (Polygon, BSC, Ethereum, Arbitrum, Avalanche)
    if (['POLYGON', 'BSC', 'ETHEREUM', 'ETH', 'ARBITRUM', 'AVAX'].includes(net)) {
      if (!raw.startsWith('0x')) {
        return { valid: false, message: 'عنوان شبكة EVM يجب أن يبدأ بـ 0x.' };
      }
      if (raw.length !== 42) {
        return { valid: false, message: 'طول عنوان المحفظة لشبكة EVM يجب أن يكون 42 حرفاً بالتحديد.' };
      }
      if (!isAddress(raw.toLowerCase())) {
        return { valid: false, message: 'عنوان محفظة EVM غير صالح.' };
      }
      return { valid: true, message: `عنوان ${currentNetworkObj?.name || 'EVM'} صالح ومعتمد.` };
    }

    // Generic fallback
    if (raw.length < 20 || raw.length > 100) {
      return { valid: false, message: 'طول عنوان المحفظة غير صالح.' };
    }

    return { valid: true, message: 'عنوان المحفظة مكتمل.' };
  }, [walletAddress, selectedNetwork, currentNetworkObj]);

  // Calculate price strictly for display preview
  const calculatedPrice = currency === 'SDG' 
    ? Math.round(numAmount * exchangeRate)
    : numAmount;

  const hasEnoughBalance = (balance || 0) >= calculatedPrice;

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
      // Ignore if clipboard permission denied
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
      setFormError('الكمية المطلوبة غير متوفرة حالياً في المخزون.');
      return;
    }

    if (!walletAddress.trim() || addressValidation.valid === false) {
      setFormError(addressValidation.message || 'يرجى إدخال عنوان محفظة صالح للشبكة المحددة.');
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
    <div style={{ minHeight: '80vh', padding: '36px 16px', background: 'var(--bg-primary)' }} dir="rtl">
      <div style={{ maxWidth: 620, margin: '0 auto' }}>
        
        {/* Top Breadcrumb & Return Button */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <button
            type="button"
            onClick={() => navigateTo('home')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: '#FFFFFF',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
              fontSize: 14,
              fontWeight: 700,
              padding: '8px 16px',
              borderRadius: 'var(--radius-pill)',
              cursor: 'pointer',
              boxShadow: 'var(--shadow-xs)'
            }}
          >
            <ArrowRight size={16} />
            <span>العودة للمتجر</span>
          </button>

          {config && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#ECFDF5', border: '1px solid #A7F3D0', padding: '6px 14px', borderRadius: 'var(--radius-pill)', color: '#047857', fontSize: 12, fontWeight: 800 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10B981' }} />
              <span>الخدمة متوفرة ⚡</span>
            </div>
          )}
        </div>

        {/* ACTIVE ORDER LIVE SCREEN */}
        {activeOrder ? (
          <div style={{ background: '#FFFFFF', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: 32, boxShadow: 'var(--shadow-md)', textAlign: 'center' }}>
            {activeOrder.status === 'AWAITING_TRANSFER' && (
              <>
                <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--accent-yellow-light)', border: '2px solid var(--accent-yellow)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', position: 'relative' }}>
                  <Clock size={36} color="#0B0F19" />
                  <span style={{ position: 'absolute', top: -3, right: -3, width: 14, height: 14, borderRadius: '50%', background: '#F59E0B' }} />
                </div>

                <h1 style={{ fontSize: 24, fontWeight: 900, color: 'var(--text-primary)', margin: '0 0 10px 0' }}>
                  ⏳ جاري إرسال المبلغ...
                </h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: 15, lineHeight: 1.6, margin: '0 auto 24px', maxWidth: 440 }}>
                  تم استلام طلبك وسيتم تحويل USDT إلى محفظتك الشخصية فوراً عبر فريق العمليات.
                </p>

                <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: 20, textAlign: 'right', marginBottom: 24 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: 14 }}>
                    <span style={{ color: 'var(--text-muted)' }}>رقم الطلب:</span>
                    <span style={{ fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'monospace' }}>#{activeOrder.orderId.slice(0, 8).toUpperCase()}</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: 14 }}>
                    <span style={{ color: 'var(--text-muted)' }}>المبلغ المطلوب:</span>
                    <span style={{ fontWeight: 900, color: '#047857', fontSize: 16 }}>{activeOrder.usdtAmount} USDT</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: 14 }}>
                    <span style={{ color: 'var(--text-muted)' }}>الشبكة المحددة:</span>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{activeOrder.network}</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: 14 }}>
                    <span style={{ color: 'var(--text-muted)' }}>عنوان المحفظة:</span>
                    <span style={{ fontWeight: 700, color: '#0284C7', fontFamily: 'monospace', direction: 'ltr' }}>
                      {activeOrder.walletAddress.slice(0, 10)}...{activeOrder.walletAddress.slice(-6)}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, paddingTop: 12, borderTop: '1px dashed var(--border-subtle)' }}>
                    <span style={{ color: 'var(--text-muted)' }}>المبلغ المخصوم من محفظتك:</span>
                    <span style={{ fontWeight: 900, color: 'var(--text-primary)' }}>{Number(activeOrder.chargedAmount).toLocaleString()} {activeOrder.chargedCurrency}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 13 }}>
                  <Loader2 size={16} className="animate-spin" />
                  <span>تحديث مباشر لحالة الطلب كل 3 ثوانٍ...</span>
                </div>
              </>
            )}

            {activeOrder.status === 'COMPLETED' && (
              <>
                <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#ECFDF5', border: '2px solid #10B981', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                  <CheckCircle2 size={40} color="#10B981" />
                </div>

                <h1 style={{ fontSize: 24, fontWeight: 900, color: '#047857', margin: '0 0 10px 0' }}>
                  ✅ تم إكمال طلبك بنجاح!
                </h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: 15, margin: '0 auto 24px' }}>
                  تم تحويل {activeOrder.usdtAmount} USDT بنجاح إلى محفظتك.
                </p>

                <div style={{ background: 'var(--bg-primary)', border: '1px solid #A7F3D0', borderRadius: 'var(--radius-md)', padding: 20, textAlign: 'right', marginBottom: 24 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: 14 }}>
                    <span style={{ color: 'var(--text-muted)' }}>المبلغ المحول:</span>
                    <span style={{ fontWeight: 900, color: '#047857', fontSize: 18 }}>{activeOrder.usdtAmount} USDT</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: 14 }}>
                    <span style={{ color: 'var(--text-muted)' }}>الشبكة:</span>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{activeOrder.network}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: 14 }}>
                    <span style={{ color: 'var(--text-muted)' }}>رقم الطلب:</span>
                    <span style={{ fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'monospace' }}>#{activeOrder.orderId.slice(0, 8).toUpperCase()}</span>
                  </div>

                  {activeOrder.txHash && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
                      <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 4 }}>معرف المعاملة (TxID):</div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#FFFFFF', border: '1px solid var(--border-subtle)', padding: '8px 12px', borderRadius: 8, direction: 'ltr' }}>
                        <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#0284C7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {activeOrder.txHash}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(activeOrder.txHash || '');
                            setCopiedTx(true);
                            setTimeout(() => setCopiedTx(false), 2000);
                          }}
                          style={{ background: 'transparent', border: 'none', color: copiedTx ? '#10B981' : 'var(--text-muted)', cursor: 'pointer', padding: 4 }}
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
                      setAmount(20);
                    }}
                    className="btn btn-primary"
                  >
                    طلب تحويل جديد
                  </button>

                  <button
                    type="button"
                    onClick={() => navigateTo('account')}
                    className="btn btn-secondary"
                  >
                    عرض سجل الطلبات
                  </button>
                </div>
              </>
            )}

            {activeOrder.status === 'CANCELED' && (
              <>
                <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#FEF2F2', border: '2px solid #EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                  <XCircle size={40} color="#EF4444" />
                </div>

                <h1 style={{ fontSize: 24, fontWeight: 900, color: '#EF4444', margin: '0 0 10px 0' }}>
                  تم إلغاء الطلب ورد الرصيد
                </h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: 15, margin: '0 auto 24px' }}>
                  تمت إعادة كامل المبلغ ({Number(activeOrder.chargedAmount).toLocaleString()} {activeOrder.chargedCurrency}) إلى رصيد محفظتك في المتجر.
                </p>

                <button
                  type="button"
                  onClick={() => setActiveOrder(null)}
                  className="btn btn-secondary"
                >
                  إعادة المحاولة
                </button>
              </>
            )}
          </div>
        ) : (
          /* ORDER CREATION FORM */
          <div style={{ background: '#FFFFFF', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: '28px 24px', boxShadow: 'var(--shadow-sm)' }}>
            
            {/* Header / Intro */}
            <div style={{ textAlign: 'center', marginBottom: 24, borderBottom: '1px solid var(--border-subtle)', paddingBottom: 20 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--accent-yellow-light)', border: '1px solid var(--accent-yellow)', padding: '4px 14px', borderRadius: 'var(--radius-pill)', color: '#0B0F19', fontSize: 13, fontWeight: 800, marginBottom: 8 }}>
                <Zap size={14} />
                <span>تحويل USDT فوري ⚡</span>
              </div>
              <h1 style={{ fontSize: 24, fontWeight: 900, color: 'var(--text-primary)', margin: '0 0 6px 0' }}>
                شراء USDT
              </h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: 0 }}>
                أرسل USDT إلى محفظتك بسرعة وسهولة.
              </p>
            </div>

            <form onSubmit={handleSubmit}>
              {/* Field 1: Amount */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>
                    المبلغ (USDT):
                  </label>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
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
                      background: 'var(--bg-primary)',
                      border: '1.5px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      padding: '12px 16px 12px 75px',
                      fontSize: 18,
                      fontWeight: 800,
                      color: 'var(--text-primary)',
                      direction: 'ltr',
                      textAlign: 'right',
                      boxSizing: 'border-box'
                    }}
                  />
                  <div style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', fontWeight: 900, color: '#047857', fontSize: 14 }}>
                    USDT
                  </div>
                </div>

                {/* Quick Presets */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6, marginTop: 10 }}>
                  {[3, 5, 10, 20, 50, 100].map(val => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => handlePresetClick(val)}
                      style={{
                        background: numAmount === val ? 'var(--accent-yellow)' : 'var(--bg-primary)',
                        border: numAmount === val ? '1.5px solid #0B0F19' : '1px solid var(--border-subtle)',
                        color: numAmount === val ? '#0B0F19' : 'var(--text-primary)',
                        padding: '6px 0',
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: 800,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {val}$
                    </button>
                  ))}
                </div>
              </div>

              {/* Field 2: 6 Networks Selection Cards */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>
                  الشبكة (Network):
                </label>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
                  {config?.networks?.map(net => {
                    const isSelected = selectedNetwork === net.identifier;
                    const badge = NETWORK_BADGES[net.identifier] || net.validatorType;

                    return (
                      <div
                        key={net.identifier}
                        onClick={() => {
                          setSelectedNetwork(net.identifier);
                          setFormError(null);
                        }}
                        style={{
                          background: isSelected ? '#FFFBEB' : 'var(--bg-primary)',
                          border: isSelected ? '2px solid var(--accent-yellow)' : '1px solid var(--border-subtle)',
                          borderRadius: 'var(--radius-md)',
                          padding: '12px 14px',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 4,
                          boxShadow: isSelected ? '0 4px 12px rgba(255, 230, 0, 0.25)' : 'none'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: 14 }}>
                            {net.name}
                          </span>
                          {isSelected ? (
                            <CheckCircle2 size={16} color="#0B0F19" />
                          ) : (
                            <span style={{ width: 14, height: 14, borderRadius: '50%', border: '1.5px solid var(--border-strong)' }} />
                          )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
                          <span style={{ fontSize: 11, color: isSelected ? '#0B0F19' : 'var(--text-muted)', fontWeight: 700 }}>
                            {badge}
                          </span>
                          <span style={{ fontSize: 10, color: '#047857', fontWeight: 800, background: '#ECFDF5', padding: '1px 6px', borderRadius: 4 }}>
                            نشطة
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Field 3: Wallet Address */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>
                    عنوان المحفظة ({selectedNetwork}):
                  </label>
                  <button
                    type="button"
                    onClick={handlePasteAddress}
                    style={{ background: 'transparent', border: 'none', color: '#0284C7', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                  >
                    لصق من الحافظة
                  </button>
                </div>

                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    placeholder={selectedNetwork === 'TRON' ? 'T...' : '0x...'}
                    value={walletAddress}
                    onChange={(e) => {
                      setWalletAddress(e.target.value);
                      setFormError(null);
                    }}
                    style={{
                      width: '100%',
                      background: 'var(--bg-primary)',
                      border: addressValidation.valid === false 
                        ? '1.5px solid #EF4444' 
                        : addressValidation.valid === true 
                        ? '1.5px solid #10B981' 
                        : '1.5px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      padding: '12px 14px',
                      fontSize: 14,
                      fontFamily: 'monospace',
                      color: 'var(--text-primary)',
                      direction: 'ltr',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                {addressValidation.valid === true && (
                  <div style={{ color: '#047857', fontSize: 12, marginTop: 6, display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700 }}>
                    <CheckCircle2 size={14} />
                    <span>{addressValidation.message}</span>
                  </div>
                )}
                {addressValidation.valid === false && (
                  <div style={{ color: '#EF4444', fontSize: 12, marginTop: 6, display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700 }}>
                    <AlertCircle size={14} />
                    <span>{addressValidation.message}</span>
                  </div>
                )}
              </div>

              {/* Security Badge */}
              <div style={{ background: '#F8FAFC', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '10px 14px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
                <ShieldCheck size={18} color="#047857" style={{ flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  تحويل آمن ومباشر. يرجى مراجعة العنوان والشبكة بدقة قبل تأكيد الطلب.
                </span>
              </div>

              {/* Price Calculation Box */}
              <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: 16, marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                  <span style={{ color: 'var(--text-muted)' }}>سعر الصرف الحالي:</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>1 USD = {exchangeRate.toLocaleString()} SDG</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                  <span style={{ color: 'var(--text-muted)' }}>رصيدك المتاح:</span>
                  <span style={{ color: hasEnoughBalance ? '#047857' : '#EF4444', fontWeight: 800 }}>
                    {(balance || 0).toLocaleString()} {currency}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, borderTop: '1px dashed var(--border-subtle)', alignItems: 'center' }}>
                  <span style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: 15 }}>السعر الإجمالي:</span>
                  <span style={{ fontWeight: 900, color: '#0B0F19', fontSize: 18 }}>
                    {calculatedPrice.toLocaleString()} {currency}
                  </span>
                </div>
              </div>

              {/* Form Error Notice */}
              {formError && (
                <div style={{ background: '#FEF2F2', border: '1px solid #F87171', borderRadius: 8, padding: 12, color: '#B91C1C', fontSize: 13, fontWeight: 700, marginBottom: 16, textAlign: 'center' }}>
                  {formError}
                </div>
              )}

              {/* Main Call to Action Button */}
              {!isAuthenticated ? (
                <button
                  type="button"
                  onClick={() => navigateTo('login')}
                  className="btn btn-primary"
                  style={{ width: '100%', padding: '14px 20px' }}
                >
                  تسجيل الدخول لإتمام الشراء
                </button>
              ) : !hasEnoughBalance ? (
                <button
                  type="button"
                  onClick={openDepositModal}
                  className="btn btn-secondary"
                  style={{ width: '100%', padding: '14px 20px', borderColor: '#EF4444', color: '#EF4444' }}
                >
                  <Wallet size={16} />
                  <span>رصيدك غير كافٍ — اضغط هنا لشحن محفظتك</span>
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn btn-primary"
                  style={{
                    width: '100%',
                    padding: '14px 20px',
                    fontWeight: 900,
                    fontSize: 16
                  }}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      <span>جاري معالجة الطلب...</span>
                    </>
                  ) : (
                    <span>شراء USDT الآن</span>
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
