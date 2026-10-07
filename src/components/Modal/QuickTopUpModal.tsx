import React, { useState, useEffect } from 'react';
import styles from './QuickTopUpModal.module.css';
import { Game, GamePackage } from '../../types';
import { useWallet } from '../../context/WalletContext';
import { verifyPlayerId, createOrder, validatePromoCode, PromoValidationResult, fetchProductServers } from '../../services/api';
import { formatCurrency } from '../../lib/formatters';
import { Tag, Sparkles, X, CheckCircle2, AlertCircle, Loader2, Key, Copy, Check, Eye, EyeOff, ShieldCheck, CreditCard } from 'lucide-react';
import { CardDetailsViewModal } from '../KiroProCard/CardDetailsViewModal';
import { getProductImageUrl } from '../../utils/imageUrl';
import { api } from '../../lib/api';

interface QuickTopUpModalProps {
  game: Game | null;
  isOpen: boolean;
  onClose: () => void;
}

export const QuickTopUpModal: React.FC<QuickTopUpModalProps> = ({ game, isOpen, onClose }) => {
  const { balance, currency, exchangeRate, refreshBalance, openDepositModal, showToast } = useWallet();
  const [selectedPackage, setSelectedPackage] = useState<GamePackage | null>(null);
  const [playerId, setPlayerId] = useState('');
  const [verifyStatus, setVerifyStatus] = useState<{ loading: boolean; message: string; success?: boolean } | null>(null);
  const [verifiedPlayerName, setVerifiedPlayerName] = useState<string | null>(null);
  const [selectedServer, setSelectedServer] = useState<string>('');
  const [serverList, setServerList] = useState<Array<{ id: string; name: string }>>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [deliveredAccounts, setDeliveredAccounts] = useState<Array<{ id?: string; email: string; password?: string }>>([]);
  const [showDeliveredPasswords, setShowDeliveredPasswords] = useState<{ [key: number]: boolean }>({});
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [deliveredCardOrder, setDeliveredCardOrder] = useState<{ orderId: string; last4?: string } | null>(null);
  const [showCardDetailsModal, setShowCardDetailsModal] = useState(false);

  // KiroPro Card Dual Payment Method State
  const [cardPaymentMethod, setCardPaymentMethod] = useState<'wallet' | 'issuance_code'>('wallet');
  const [issuanceCodeInput, setIssuanceCodeInput] = useState('');
  const [issuanceCodeLoading, setIssuanceCodeLoading] = useState(false);
  const [issuanceCodeError, setIssuanceCodeError] = useState<string | null>(null);
  const [issuanceCodeValidInfo, setIssuanceCodeValidInfo] = useState<{ value: number; message: string } | null>(null);

  // Promo Code State
  const [promoCodeInput, setPromoCodeInput] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<PromoValidationResult | null>(null);
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);

  const [activeSubCategory, setActiveSubCategory] = useState<string>('ALL');

  const getPackagePrice = (pkg: GamePackage): number => {
    return pkg.priceSdg || (currency === 'SDG' ? Math.round(pkg.price * (exchangeRate || 7600)) : pkg.price);
  };

  useEffect(() => {
    if (game && game.packages.length > 0) {
      setSelectedPackage(game.packages[0]);
      setActiveSubCategory('ALL');
      setPlayerId('');
      setVerifyStatus(null);
      setAppliedPromo(null);
      setPromoCodeInput('');
      setPromoError(null);
      setDeliveredAccounts([]);
      setShowDeliveredPasswords({});
      setCopiedField(null);
      setQuantity(1);
      setDeliveredCardOrder(null);
      setShowCardDetailsModal(false);
      setCardPaymentMethod('wallet');
      setIssuanceCodeInput('');
      setIssuanceCodeError(null);
      setIssuanceCodeValidInfo(null);
    }
  }, [game]);

  useEffect(() => {
    setQuantity(1);
  }, [selectedPackage?.id]);

  const availableSubCategories = React.useMemo(() => {
    if (!game) return [];
    const set = new Set<string>();
    game.packages.forEach(p => {
      if (p.subCategory) set.add(p.subCategory);
    });
    return Array.from(set);
  }, [game]);

  const filteredPackages = React.useMemo(() => {
    if (!game) return [];
    if (activeSubCategory === 'ALL') return game.packages;
    return game.packages.filter(p => p.subCategory === activeSubCategory);
  }, [game, activeSubCategory]);

  // Recalculate discount if package changes while promo is active
  useEffect(() => {
    if (appliedPromo && selectedPackage) {
      const orderPrice = getPackagePrice(selectedPackage);
      validatePromoCode(appliedPromo.code, orderPrice, currency, 'CHECKOUT_DISCOUNT')
        .then(res => {
          if (res.valid && res.type === 'DISCOUNT') {
            setAppliedPromo(res);
          } else {
            setAppliedPromo(null);
          }
        })
        .catch(() => {
          setAppliedPromo(null);
        });
    }
  }, [selectedPackage, currency]);

  // Fetch game servers whenever package changes (STRICTLY ONLY if package requires server)
  useEffect(() => {
    const pkgRequiresServer = Boolean(
      selectedPackage?.requiresGameServerId ||
      selectedPackage?.isRequiredGameServerId
    );

    setVerifiedPlayerName(null);
    setVerifyStatus(null);

    if (selectedPackage?.id && pkgRequiresServer) {
      fetchProductServers(selectedPackage.id)
        .then(servers => {
          setServerList(servers);
          if (servers.length > 0) {
            setSelectedServer(servers[0].id);
          } else {
            setSelectedServer('');
          }
        })
        .catch(() => {
          setServerList([]);
          setSelectedServer('');
        });
    } else {
      setServerList([]);
      setSelectedServer('');
    }
  }, [selectedPackage?.id, selectedPackage?.requiresGameServerId, selectedPackage?.isRequiredGameServerId]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen || !game || !selectedPackage) return null;

  const isDigitalAccount = selectedPackage?.productType === 'DIGITAL_ACCOUNT' || game?.id === 'google-play-points';
  const isVirtualCard = selectedPackage?.productType === 'VIRTUAL_CARD' || game?.id === 'kiropro-card';
  const isOutOfStock = selectedPackage?.inStock === false || (selectedPackage?.availableStock !== undefined && selectedPackage?.availableStock <= 0);
  const unitPrice = getPackagePrice(selectedPackage);
  const rawOrderPrice = isDigitalAccount ? (unitPrice * quantity) : unitPrice;
  const discountAmount = (appliedPromo && appliedPromo.type === 'DISCOUNT')
    ? (appliedPromo.discountAmount ? Number(appliedPromo.discountAmount) : (appliedPromo.discount ? Number(appliedPromo.discount) : 0))
    : 0;
  const finalPrice = Math.max(0, rawOrderPrice - discountAmount);

  const isInsufficient = balance < finalPrice;
  const balanceAfter = balance - finalPrice;

  const handleApplyPromo = async () => {
    const clean = promoCodeInput.trim().toUpperCase();
    if (!clean) {
      setPromoError('يرجى إدخال رمز الكود أولاً');
      return;
    }

    setPromoLoading(true);
    setPromoError(null);
    try {
      const orderPrice = getPackagePrice(selectedPackage);
      const res = await validatePromoCode(clean, orderPrice, currency, 'CHECKOUT_DISCOUNT');
      if (res.valid && res.type === 'DISCOUNT') {
        setAppliedPromo(res);
        showToast('تم تفعيل كود الخصم بنجاح!', 'success');
      } else {
        setAppliedPromo(null);
        setPromoError(res.error || res.message || 'كود الخصم غير صالح');
      }
    } catch (err: any) {
      setAppliedPromo(null);
      const errMsg = err?.response?.data?.error || err?.message || 'فشل التحقق من كود الخصم';
      setPromoError(errMsg);
    } finally {
      setPromoLoading(false);
    }
  };

  const handleRemovePromo = () => {
    setAppliedPromo(null);
    setPromoCodeInput('');
    setPromoError(null);
  };

  const handleVerify = async () => {
    if (!playerId.trim()) {
      setVerifyStatus({ loading: false, message: 'يرجى إدخال معرّف اللاعب أولاً', success: false });
      return;
    }

    if (!selectedPackage) return;

    const pkgRequiresServer = Boolean(
      selectedPackage.requiresGameServerId ||
      selectedPackage.isRequiredGameServerId
    );

    if (pkgRequiresServer && serverList.length > 0 && !selectedServer) {
      setVerifyStatus({ loading: false, message: 'يرجى اختيار خادم اللعبة (Server) أولاً', success: false });
      return;
    }

    setVerifyStatus({ loading: true, message: 'جارٍ التحقق من الحساب...' });
    try {
      const result = await verifyPlayerId(
        selectedPackage.id,
        playerId,
        pkgRequiresServer && selectedServer ? selectedServer : undefined
      );
      if (result.valid) {
        setVerifiedPlayerName(result.playerName || playerId.trim());
        setVerifyStatus({
          loading: false,
          message: result.playerName ? `اسم اللاعب: ${result.playerName}` : 'تم التحقق من الحساب بنجاح',
          success: true
        });
      } else {
        setVerifiedPlayerName(null);
        setVerifyStatus({
          loading: false,
          message: result.message || 'تعذر التحقق من معرّف اللاعب. تأكد من الرقم وحاول مرة أخرى.',
          success: false
        });
      }
    } catch (e: any) {
      setVerifiedPlayerName(null);
      setVerifyStatus({
        loading: false,
        message: 'تعذر التحقق من معرّف اللاعب. تأكد من الرقم وحاول مرة أخرى.',
        success: false
      });
    }
  };

  const handleCopyText = (text: string, field: 'email' | 'password' | 'all') => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2500);
  };

  const handleValidateIssuanceCode = async (codeVal: string) => {
    const clean = codeVal.trim().toUpperCase();
    if (clean.length < 6) {
      setIssuanceCodeValidInfo(null);
      return;
    }
    try {
      const res: any = await api.post('/api/kiropro-cards/validate-code', { code: clean });
      if (res && res.valid) {
        setIssuanceCodeValidInfo({ value: res.value || 2.00, message: res.message });
        setIssuanceCodeError(null);
      } else {
        setIssuanceCodeValidInfo(null);
      }
    } catch {
      setIssuanceCodeValidInfo(null);
    }
  };

  const handleRedeemIssuanceCode = async () => {
    if (!issuanceCodeInput.trim() || issuanceCodeLoading) return;
    setIssuanceCodeLoading(true);
    setIssuanceCodeError(null);
    try {
      const res: any = await api.post('/api/kiropro-cards/redeem-issuance-code', {
        code: issuanceCodeInput.trim().toUpperCase()
      });
      if (res.success && res.card) {
        setDeliveredCardOrder({
          orderId: res.orderId,
          last4: res.card.last4
        });
        showToast('تم إصدار وتخصيص بطاقة كيرو برو بنجاح! 💳', 'success');
      } else {
        setIssuanceCodeError(res.error || 'فشل استرداد كود الإصدار.');
      }
    } catch (err: any) {
      setIssuanceCodeError(err?.response?.data?.error || err.message || 'كود الإصدار غير صالح أو تم استخدامه مسبقاً.');
    } finally {
      setIssuanceCodeLoading(false);
    }
  };

  const handleConfirmOrder = async () => {
    const isDigitalAccount = selectedPackage?.productType === 'DIGITAL_ACCOUNT' || game?.id === 'google-play-points';

    if (!isDigitalAccount && !isVirtualCard && !playerId.trim()) {
      showToast('يرجى إدخال معرّف اللاعب للاستلام', 'warning');
      return;
    }

    const pkgRequiresServer = Boolean(
      selectedPackage?.requiresGameServerId ||
      selectedPackage?.isRequiredGameServerId
    );

    if (!isDigitalAccount && !isVirtualCard && pkgRequiresServer && serverList.length > 0 && !selectedServer) {
      showToast('يرجى اختيار خادم اللعبة قبل تأكيد الشراء', 'warning');
      return;
    }

    if (isInsufficient) {
      showToast('رصيد المحفظة غير كافٍ. يرجى شحن الرصيد أولاً.', 'warning');
      openDepositModal();
      return;
    }

    if (!selectedPackage) return;

    setIsProcessing(true);
    try {
      const orderRes = await createOrder({
        gameId: game.id,
        packageId: selectedPackage.id,
        packageName: `${game.name} - ${selectedPackage.name}`,
        playerId: isVirtualCard ? 'KIROPRO_CARD' : (isDigitalAccount ? 'DIGITAL_ACCOUNT' : playerId.trim()),
        serverId: (!isDigitalAccount && !isVirtualCard && pkgRequiresServer && selectedServer) ? selectedServer : undefined,
        playerName: (!isDigitalAccount && !isVirtualCard && verifiedPlayerName) ? verifiedPlayerName : undefined,
        amount: finalPrice,
        promoCode: appliedPromo?.code,
        quantity: isDigitalAccount ? quantity : 1
      });

      await refreshBalance();

      // Normalize delivered credentials into an array
      let deliveredList: Array<{ id?: string; email: string; password?: string }> = [];
      if (Array.isArray(orderRes.accounts) && orderRes.accounts.length > 0) {
        deliveredList = orderRes.accounts;
      } else if (Array.isArray(orderRes.credentials) && orderRes.credentials.length > 0) {
        deliveredList = orderRes.credentials as any;
      } else if (orderRes.credentials && typeof orderRes.credentials === 'object' && (orderRes.credentials as any).email) {
        deliveredList = [orderRes.credentials as any];
      }

      const spinNotice = (orderRes as any).bonusSpinGranted ? ' • 🎉 ربحت +1 محاولة لعجلة الحظ!' : '';

      if ((orderRes as any).isVirtualCard || isVirtualCard) {
        setDeliveredCardOrder({
          orderId: (orderRes as any).orderId || orderRes.id,
          last4: (orderRes as any).cardLast4
        });
        showToast('تم شراء وتخصيص بطاقة كيرو برو بنجاح! 💳' + spinNotice, 'success');
      } else if (deliveredList.length > 0) {
        setDeliveredAccounts(deliveredList);
        showToast((quantity > 1 ? `تم شراء وتخصيص ${quantity} حسابات بنجاح! ⚡` : 'تم شراء الحساب وتخصيصه بنجاح! ⚡') + spinNotice, 'success');
      } else {
        showToast('تم إنشاء وتنفيذ الطلب بنجاح! جاري معالجة الشحن فورياً.' + spinNotice, 'success');
        onClose();
      }
    } catch (err: any) {
      showToast(err.message || 'تعذر تنفيذ الطلب حاليًا. حاول مرة أخرى.', 'warning');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div
      className={`${styles.backdrop} ${isOpen ? styles.active : ''}`}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={styles.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img src={getProductImageUrl(game.image)} alt={game.name} className={styles.thumb} />
            <div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>{game.name}</h3>
              <span style={{ fontSize: '0.775rem', color: 'var(--text-muted)', fontWeight: 600 }}>{game.type}</span>
            </div>
          </div>

          <button className={styles.closeBtn} onClick={onClose} aria-label="إغلاق" type="button">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {deliveredCardOrder ? (
          <div style={{ padding: '20px 10px', textAlign: 'center' }}>
            <div style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, rgba(250, 204, 21, 0.2) 0%, rgba(202, 138, 4, 0.15) 100%)',
              color: '#facc15',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              border: '2px solid #facc15',
              boxShadow: '0 0 24px rgba(250, 204, 21, 0.25)'
            }}>
              <CreditCard size={32} />
            </div>

            <h3 style={{ fontSize: '1.35rem', fontWeight: 900, color: 'var(--text-primary)', marginBottom: 6 }}>
              تم إصدار وتخصيص بطاقتك بنجاح! 💳
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 22, lineHeight: 1.6 }}>
              تم حجز وتشفير البطاقة في خزنتك بأمان.<br />
              رقم البطاقة ينتهي بـ: <strong style={{ color: '#facc15', fontFamily: 'monospace', direction: 'ltr', fontSize: '1rem', letterSpacing: '2px' }}>•••• {deliveredCardOrder.last4 || '****'}</strong>
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 360, margin: '0 auto 20px' }}>
              <button
                type="button"
                onClick={() => setShowCardDetailsModal(true)}
                style={{
                  width: '100%',
                  padding: '14px 20px',
                  borderRadius: 12,
                  background: 'linear-gradient(135deg, #facc15 0%, #eab308 100%)',
                  color: '#0B0F19',
                  fontWeight: 900,
                  fontSize: '0.98rem',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  boxShadow: '0 4px 18px rgba(250, 204, 21, 0.4)'
                }}
              >
                <span>عرض تفاصيل البطاقة</span>
                <Key size={18} />
              </button>

              <button
                type="button"
                onClick={onClose}
                style={{
                  width: '100%',
                  padding: '10px 16px',
                  borderRadius: 10,
                  background: 'transparent',
                  color: 'var(--text-muted)',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                  border: '1px solid var(--border-subtle)',
                  cursor: 'pointer'
                }}
              >
                إغلاق (يمكنك دائماً استعراض البطاقة في صفحة طلباتي)
              </button>
            </div>
          </div>
        ) : deliveredAccounts.length > 0 ? (
          <div style={{ padding: '10px 0', textAlign: 'center' }}>
            <div style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: '#ecfdf5',
              color: '#059669',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 12px',
              border: '2px solid #a7f3d0'
            }}>
              <CheckCircle2 size={32} />
            </div>

            <h3 style={{ fontSize: '1.25rem', fontWeight: 900, color: '#0f172a', marginBottom: 4 }}>
              {deliveredAccounts.length > 1 ? `تم استلام ${deliveredAccounts.length} حسابات بنجاح! 🎉` : 'تم استلام الحساب بنجاح! 🎉'}
            </h3>
            <p style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: 18 }}>
              {deliveredAccounts.length > 1
                ? `تم تخصيص وتسليم ${deliveredAccounts.length} حسابات مستقلة فورياً. يرجى حفظ بيانات الدخول التالية:`
                : 'تم تخصيص الحساب وتسليمه إليك فورياً. يرجى حفظ بيانات الدخول التالية:'}
            </p>

            {/* List of Delivered Credentials Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 16, maxHeight: '360px', overflowY: 'auto', paddingRight: 4 }}>
              {deliveredAccounts.map((acc, index) => {
                const isPwdShown = Boolean(showDeliveredPasswords[index]);
                return (
                  <div key={acc.id || index} style={{
                    background: '#0B0F19',
                    borderRadius: '12px',
                    border: '1.5px solid #facc15',
                    padding: '14px 16px',
                    textAlign: 'right'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, borderBottom: '1px solid #1e293b', paddingBottom: 6 }}>
                      <span style={{ color: '#facc15', fontWeight: 900, fontSize: '0.85rem' }}>
                        الحساب {deliveredAccounts.length > 1 ? `#${index + 1}` : ''}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyText(`Email: ${acc.email}\nPassword: ${acc.password || ''}`, `card_${index}` as any)}
                        style={{
                          background: copiedField === `card_${index}` ? '#10b981' : 'rgba(250, 204, 21, 0.15)',
                          color: copiedField === `card_${index}` ? '#ffffff' : '#facc15',
                          border: 'none',
                          borderRadius: 6,
                          padding: '3px 8px',
                          fontSize: '0.72rem',
                          fontWeight: 800,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4
                        }}
                      >
                        {copiedField === `card_${index}` ? <Check size={12} /> : <Copy size={12} />}
                        <span>{copiedField === `card_${index}` ? 'تم النسخ' : 'نسخ هذا الحساب'}</span>
                      </button>
                    </div>

                    {/* Email */}
                    <div style={{ marginBottom: 10 }}>
                      <span style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                        البريد الإلكتروني (Email):
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, background: '#1e293b', padding: '6px 10px', borderRadius: 8 }}>
                        <code style={{ color: '#facc15', fontSize: '0.9rem', fontWeight: 800, fontFamily: 'monospace', direction: 'ltr' }}>
                          {acc.email}
                        </code>
                        <button
                          type="button"
                          onClick={() => handleCopyText(acc.email, `email_${index}` as any)}
                          style={{
                            background: copiedField === `email_${index}` ? '#10b981' : 'rgba(250, 204, 21, 0.2)',
                            color: copiedField === `email_${index}` ? '#ffffff' : '#facc15',
                            border: 'none',
                            borderRadius: 6,
                            padding: '3px 8px',
                            fontSize: '0.72rem',
                            fontWeight: 800,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4
                          }}
                        >
                          {copiedField === `email_${index}` ? <Check size={12} /> : <Copy size={12} />}
                          <span>{copiedField === `email_${index}` ? 'تم النسخ' : 'نسخ'}</span>
                        </button>
                      </div>
                    </div>

                    {/* Password */}
                    <div>
                      <span style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                        كلمة المرور (Password):
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, background: '#1e293b', padding: '6px 10px', borderRadius: 8 }}>
                        <code style={{ color: '#38bdf8', fontSize: '0.9rem', fontWeight: 800, fontFamily: 'monospace', direction: 'ltr' }}>
                          {isPwdShown ? (acc.password || '••••••••') : '••••••••••••'}
                        </code>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            type="button"
                            onClick={() => setShowDeliveredPasswords(prev => ({ ...prev, [index]: !prev[index] }))}
                            style={{
                              background: 'rgba(255, 255, 255, 0.1)',
                              color: '#cbd5e1',
                              border: 'none',
                              borderRadius: 6,
                              padding: '4px 8px',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center'
                            }}
                            title={isPwdShown ? 'إخفاء' : 'إظهار'}
                          >
                            {isPwdShown ? <EyeOff size={13} /> : <Eye size={13} />}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleCopyText(acc.password || '', `pwd_${index}` as any)}
                            style={{
                              background: copiedField === `pwd_${index}` ? '#10b981' : 'rgba(56, 189, 248, 0.2)',
                              color: copiedField === `pwd_${index}` ? '#ffffff' : '#38bdf8',
                              border: 'none',
                              borderRadius: 6,
                              padding: '3px 8px',
                              fontSize: '0.72rem',
                              fontWeight: 800,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4
                            }}
                          >
                            {copiedField === `pwd_${index}` ? <Check size={12} /> : <Copy size={12} />}
                            <span>{copiedField === `pwd_${index}` ? 'تم النسخ' : 'نسخ'}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Quick copy all button */}
            <button
              type="button"
              onClick={() => {
                const allText = deliveredAccounts.map((a, i) => `حساب ${i + 1}:\nEmail: ${a.email}\nPassword: ${a.password || ''}`).join('\n\n-----------------\n\n');
                handleCopyText(allText, 'all');
              }}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '8px',
                background: '#f1f5f9',
                border: '1px solid #cbd5e1',
                fontSize: '0.82rem',
                fontWeight: 800,
                color: '#334155',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                marginBottom: 16
              }}
            >
              {copiedField === 'all' ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
              <span>{copiedField === 'all' ? 'تم نسخ جميع الحسابات بنجاح ✓' : (deliveredAccounts.length > 1 ? 'نسخ جميع الحسابات المستلمة دفعة واحدة' : 'نسخ الإيميل وكلمة المرور معاً')}</span>
            </button>

            {/* Security Warning */}
            <div style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              padding: '10px 14px',
              textAlign: 'right',
              fontSize: '0.78rem',
              color: '#991b1b',
              lineHeight: 1.5,
              marginBottom: 18,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8
            }}>
              <ShieldCheck size={18} color="#dc2626" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <strong>تنبيه أمان هام:</strong>
                <div>يرجى تسجيل الدخول إلى الحساب فوراً وتغيير كلمة المرور وإضافة رقم هاتفك للتحقق لحماية ملكية الحساب. يمكنك مراجعة هذه البيانات دائماً في صفحة <strong>طلباتي</strong>.</div>
              </div>
            </div>

            {/* Close Button */}
            <button
              type="button"
              className="btn btn-primary"
              onClick={onClose}
              style={{ width: '100%', fontSize: '0.95rem' }}
            >
              تم الحفظ، إغلاق النافذة
            </button>
          </div>
        ) : (
          <>
            {/* Step 1: Package Selection */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 700 }}>1. حدد الباقة المطلوبة:</label>
              </div>

              {availableSubCategories.length > 1 && (
                <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8, marginBottom: 8 }}>
                  <button
                    type="button"
                    onClick={() => setActiveSubCategory('ALL')}
                    style={{
                      padding: '5px 12px',
                      borderRadius: 20,
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: '1px solid',
                      borderColor: activeSubCategory === 'ALL' ? '#0f172a' : '#e2e8f0',
                      background: activeSubCategory === 'ALL' ? '#0f172a' : '#ffffff',
                      color: activeSubCategory === 'ALL' ? '#ffffff' : '#475569',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    الكل ({game.packages.length})
                  </button>
                  {availableSubCategories.map(cat => {
                    const label =
                      cat === 'UC' ? 'شدات UC' :
                        cat === 'PRIME' ? 'اشتراك Prime' :
                          cat === 'PRIME_PLUS' ? 'اشتراك Prime Plus' :
                            cat === 'ROYALE_PASS' ? 'رويال باس' :
                              cat === 'PACKS' ? 'حزم وعروض' :
                                cat === 'WOW_COINS' ? 'عملات WOW' :
                                  cat === 'DIAMONDS' ? 'جواهر' :
                                    cat === 'BOOYAH_PASS' ? 'بويا باس' :
                                      cat === 'MEMBERSHIP' ? 'عضويات' :
                                        cat === 'LEVEL_UP' ? 'حزم الترقية' : cat;

                    const count = game.packages.filter(p => p.subCategory === cat).length;
                    const isCurrent = activeSubCategory === cat;

                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => {
                          setActiveSubCategory(cat);
                          const firstInCat = game.packages.find(p => p.subCategory === cat);
                          if (firstInCat) setSelectedPackage(firstInCat);
                        }}
                        style={{
                          padding: '5px 12px',
                          borderRadius: 20,
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          border: '1px solid',
                          borderColor: isCurrent ? '#0f172a' : '#e2e8f0',
                          background: isCurrent ? '#0f172a' : '#ffffff',
                          color: isCurrent ? '#ffffff' : '#475569',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {label} ({count})
                      </button>
                    );
                  })}
                </div>
              )}

              <div className={styles.packageGrid}>
                {filteredPackages.map((pkg) => (
                  <div
                    key={pkg.id}
                    className={`${styles.packageOption} ${selectedPackage.id === pkg.id ? styles.selected : ''}`}
                    onClick={() => setSelectedPackage(pkg)}
                  >
                    <span className={styles.packageAmount}>{pkg.name}</span>
                    <span className={styles.packagePrice}>{formatCurrency(getPackagePrice(pkg), 'SDG')}</span>
                    {pkg.bestValue && (
                      <span style={{ fontSize: '0.65rem', color: '#16A34A', background: '#DCFCE7', borderRadius: 4, padding: '1px 4px', fontWeight: 800 }}>
                        أفضل قيمة
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {selectedPackage.description && (
                <div style={{
                  marginTop: 10,
                  padding: '10px 12px',
                  background: '#f8fafc',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  fontSize: '0.78rem',
                  color: '#475569',
                  lineHeight: 1.5,
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8
                }}>
                  <Sparkles size={16} color="#f59e0b" style={{ flexShrink: 0, marginTop: 2 }} />
                  <span>{selectedPackage.description}</span>
                </div>
              )}
            </div>

            {/* Step 2: Virtual Card Info OR Digital Account Info OR Player ID & Server Selection */}
            {isVirtualCard ? (
              <div style={{ marginBottom: 16 }}>
                <div style={{
                  padding: '16px',
                  background: 'linear-gradient(135deg, #0b0e17 0%, #1e1b4b 100%)',
                  border: '1.5px solid rgba(250, 204, 21, 0.4)',
                  borderRadius: '12px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  boxShadow: '0 4px 16px rgba(0,0,0,0.15)'
                }}>
                  <div style={{
                    width: 42,
                    height: 42,
                    borderRadius: 10,
                    background: 'linear-gradient(135deg, #facc15 0%, #ca8a04 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#000',
                    fontWeight: 900,
                    flexShrink: 0
                  }}>
                    <CreditCard size={22} />
                  </div>
                  <div style={{ fontSize: '0.82rem', color: '#e2e8f0', lineHeight: 1.6 }}>
                    <strong style={{ display: 'block', fontSize: '0.92rem', marginBottom: 2, color: '#facc15' }}>
                      بطاقة ماستركارد افتراضية مسبقة الدفع ($1.00 USD) ⚡
                    </strong>
                    لا يتطلب هذا المنتج أي معرّف لاعب أو سيرفر. سيتم فوراً حجز بطاقة مشفرة من الخزنة الآمنة وربطها بحسابك بدون أي تداخل أو ازدواجية.
                    <div style={{ marginTop: 6, color: '#94a3b8', fontSize: '0.78rem' }}>
                      • صالحة للاستخدام الرقمي الدولي والتفعيل عبر الإنترنت<br />
                      • تظهر تفاصيل البطاقة الكاملة (الرقم، تاريخ الانتهاء، رمز الأمان CVV) فور تأكيد الشراء وفي صفحة طلباتي.
                    </div>
                  </div>
                </div>
              </div>
            ) : isDigitalAccount ? (
              <div>
                <div style={{
                  marginBottom: 14,
                  padding: '14px 16px',
                  background: '#ecfdf5',
                  border: '1.5px solid #10b981',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12
                }}>
                  <Key size={22} color="#059669" style={{ flexShrink: 0, marginTop: 2 }} />
                  <div style={{ fontSize: '0.82rem', color: '#065f46', lineHeight: 1.6 }}>
                    <strong style={{ display: 'block', fontSize: '0.9rem', marginBottom: 2, color: '#047857' }}>
                      تسليم فوري ومباشر للحساب ⚡
                    </strong>
                    لا يتطلب هذا المنتج إدخال معرّف لاعب أو سيرفر. سيتم تخصيص الحسابات من المخزون المشفر وعرض البريد الإلكتروني وكلمة المرور فوراً بعد إتمام الشراء، وستظل البيانات محفوظة دائماً في صفحة <strong>طلباتي</strong>.
                    <div style={{ marginTop: 6, fontWeight: 800, color: '#047857' }}>
                      ✓ اختر الكمية التي تحتاجها. كل وحدة تحصل على حساب مستقل.
                    </div>
                  </div>
                </div>

                {/* Quantity Selector Card */}
                <div style={{
                  background: '#f8fafc',
                  border: '1.5px solid #cbd5e1',
                  borderRadius: '10px',
                  padding: '14px 16px',
                  marginBottom: 16
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div>
                      <label style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0f172a', display: 'block' }}>
                        الكمية المطلوبة (Quantity):
                      </label>
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        {selectedPackage.availableStock !== undefined
                          ? `المخزون المتاح: ${selectedPackage.availableStock} حساب`
                          : 'متوفر في المخزون'}
                      </span>
                    </div>

                    {/* Counter [-] [1] [+] */}
                    <div style={{ display: 'inline-flex', alignItems: 'center', background: '#ffffff', border: '1.5px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden' }}>
                      <button
                        type="button"
                        onClick={() => setQuantity(q => Math.max(1, q - 1))}
                        disabled={quantity <= 1}
                        style={{
                          width: 38,
                          height: 38,
                          background: quantity <= 1 ? '#f1f5f9' : '#ffffff',
                          border: 'none',
                          borderLeft: '1px solid #e2e8f0',
                          cursor: quantity <= 1 ? 'not-allowed' : 'pointer',
                          fontSize: '1.2rem',
                          fontWeight: 800,
                          color: quantity <= 1 ? '#94a3b8' : '#0f172a',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                        title="تقليل الكمية"
                      >
                        -
                      </button>

                      <input
                        type="number"
                        min={1}
                        max={selectedPackage.availableStock || 100}
                        value={quantity}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          if (isNaN(val)) {
                            setQuantity(1);
                          } else {
                            const maxStock = selectedPackage.availableStock || 100;
                            setQuantity(Math.min(maxStock, Math.max(1, val)));
                          }
                        }}
                        style={{
                          width: 50,
                          height: 38,
                          textAlign: 'center',
                          border: 'none',
                          fontSize: '1rem',
                          fontWeight: 900,
                          color: '#0f172a',
                          outline: 'none',
                          direction: 'ltr'
                        }}
                      />

                      <button
                        type="button"
                        onClick={() => {
                          const maxStock = selectedPackage.availableStock || 100;
                          setQuantity(q => Math.min(maxStock, q + 1));
                        }}
                        disabled={selectedPackage.availableStock !== undefined && quantity >= selectedPackage.availableStock}
                        style={{
                          width: 38,
                          height: 38,
                          background: (selectedPackage.availableStock !== undefined && quantity >= selectedPackage.availableStock) ? '#f1f5f9' : '#ffffff',
                          border: 'none',
                          borderRight: '1px solid #e2e8f0',
                          cursor: (selectedPackage.availableStock !== undefined && quantity >= selectedPackage.availableStock) ? 'not-allowed' : 'pointer',
                          fontSize: '1.2rem',
                          fontWeight: 800,
                          color: (selectedPackage.availableStock !== undefined && quantity >= selectedPackage.availableStock) ? '#94a3b8' : '#0f172a',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                        title="زيادة الكمية"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* Price Breakdown Calculation */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingTop: 8,
                    borderTop: '1px solid #e2e8f0',
                    fontSize: '0.82rem'
                  }}>
                    <span style={{ color: '#64748b' }}>
                      السعر للحساب: <strong>{formatCurrency(unitPrice, currency)}</strong>
                    </span>
                    <span style={{ color: '#0f172a', fontWeight: 800 }}>
                      الإجمالي ({quantity} {quantity > 1 ? 'حسابات' : 'حساب'}): {formatCurrency(unitPrice * quantity, currency)}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ marginBottom: 16 }}>
                {Boolean(selectedPackage?.requiresGameServerId || selectedPackage?.isRequiredGameServerId) && serverList.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <label htmlFor="modal-server-select" style={{ fontSize: '0.85rem', fontWeight: 700, display: 'block', marginBottom: 6 }}>
                      اختر خادم اللعبة (Game Server):
                    </label>
                    <select
                      id="modal-server-select"
                      value={selectedServer}
                      onChange={(e) => {
                        setSelectedServer(e.target.value);
                        setVerifiedPlayerName(null);
                        setVerifyStatus(null);
                      }}
                      style={{
                        width: '100%',
                        background: 'var(--bg-primary)',
                        border: '1.5px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-md)',
                        padding: '10px 14px',
                        fontSize: '0.9rem',
                        fontWeight: 600,
                        color: 'var(--text-primary)'
                      }}
                    >
                      {serverList.map((srv) => (
                        <option key={srv.id} value={srv.id}>
                          {srv.name} ({srv.id})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <label htmlFor="modal-player-id" style={{ fontSize: '0.85rem', fontWeight: 700, display: 'block', marginBottom: 6 }}>
                  {serverList.length > 0 ? 'معرّف الحساب في اللعبة' : `2. ${game.idFieldLabel}`}:
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    id="modal-player-id"
                    type="text"
                    value={playerId}
                    onChange={(e) => {
                      setPlayerId(e.target.value);
                      if (verifiedPlayerName) {
                        setVerifiedPlayerName(null);
                        setVerifyStatus(null);
                      }
                    }}
                    placeholder={game.idPlaceholder}
                    style={{
                      flexGrow: 1,
                      background: 'var(--bg-primary)',
                      border: '1.5px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      padding: '10px 14px',
                      fontSize: '0.9rem',
                      fontWeight: 600,
                      color: 'var(--text-primary)'
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={handleVerify}
                    disabled={verifyStatus?.loading}
                    style={{ paddingInline: 16, display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}
                  >
                    {verifyStatus?.loading ? (
                      <>
                        <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
                        <span>جارٍ التحقق...</span>
                      </>
                    ) : (
                      <span>تحقق من ID</span>
                    )}
                  </button>
                </div>

                {verifiedPlayerName && (
                  <div style={{
                    marginTop: 10,
                    padding: '10px 14px',
                    background: '#ecfdf5',
                    border: '1px solid #10b981',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10
                  }}>
                    <CheckCircle2 size={20} color="#059669" style={{ flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#065f46' }}>
                        ✓ تم التحقق من الحساب
                      </div>
                      <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#047857', marginTop: 2 }}>
                        اسم اللاعب: <span style={{ fontFamily: 'monospace', fontWeight: 900, color: '#065f46' }}>{verifiedPlayerName}</span>
                      </div>
                    </div>
                  </div>
                )}

                {verifyStatus && !verifyStatus.success && !verifyStatus.loading && (
                  <div style={{
                    marginTop: 10,
                    padding: '10px 14px',
                    background: '#fef2f2',
                    border: '1px solid #ef4444',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10
                  }}>
                    <AlertCircle size={18} color="#dc2626" style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#991b1b' }}>
                      ✕ {verifyStatus.message}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Promo Code Input Section */}
            <div style={{
              marginBottom: 16,
              background: '#F8FAFC',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
              padding: '12px 14px'
            }}>
              {!appliedPromo ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: '0.8rem', fontWeight: 700, color: '#475569' }}>
                    <Tag size={14} color="#D97706" />
                    <span>هل لديك كود خصم؟</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="text"
                      value={promoCodeInput}
                      onChange={(e) => {
                        setPromoCodeInput(e.target.value.toUpperCase());
                        if (promoError) setPromoError(null);
                      }}
                      placeholder="أدخل كود الخصم (مثل: WELCOME10)"
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        borderRadius: 'var(--radius-md)',
                        border: promoError ? '1px solid #EF4444' : '1px solid var(--border-subtle)',
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        fontFamily: 'var(--font-latin), inherit',
                        letterSpacing: '0.5px',
                        background: '#FFFFFF',
                        outline: 'none'
                      }}
                    />
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={handleApplyPromo}
                      disabled={promoLoading || !promoCodeInput.trim()}
                      style={{ padding: '8px 16px', fontWeight: 800, fontSize: '0.8rem' }}
                    >
                      {promoLoading ? 'جاري الفحص...' : 'تطبيق'}
                    </button>
                  </div>
                  {promoError && (
                    <div style={{
                      marginTop: 8,
                      padding: '8px 12px',
                      background: '#FEF2F2',
                      border: '1px solid #FCA5A5',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '0.8rem',
                      color: '#B91C1C',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      lineHeight: 1.4
                    }}>
                      <AlertCircle size={15} color="#DC2626" style={{ flexShrink: 0 }} />
                      <span>{promoError}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: '#ECFDF5',
                  border: '1px solid #10B981',
                  borderRadius: 'var(--radius-md)',
                  padding: '10px 14px'
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', color: '#065F46', fontWeight: 800 }}>
                      <Sparkles size={16} color="#059669" />
                      <span>تم تفعيل كود الخصم بنجاح: <strong>{appliedPromo.code}</strong></span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#047857', fontWeight: 700, paddingInlineStart: 22 }}>
                      خصم {formatCurrency(discountAmount, currency)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemovePromo}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#065F46',
                      cursor: 'pointer',
                      padding: 4,
                      display: 'flex',
                      alignItems: 'center'
                    }}
                    title="إزالة الكود"
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
            </div>

            {isVirtualCard ? (
              <div style={{ marginBottom: 16 }}>
                {/* KiroPro Card Official Summary Card */}
                <div style={{
                  background: 'linear-gradient(135deg, #0B0F19 0%, #151923 100%)',
                  border: '1px solid rgba(250, 204, 21, 0.35)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '16px',
                  color: '#FFFFFF',
                  marginBottom: 16,
                  boxShadow: '0 4px 18px rgba(0, 0, 0, 0.4)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        background: '#000000',
                        border: '1px solid #FBBF24',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#FBBF24',
                        boxShadow: '0 2px 8px rgba(250, 204, 21, 0.2)'
                      }}>
                        <CreditCard size={20} />
                      </div>
                      <div>
                        <h4 style={{ fontSize: '0.95rem', fontWeight: 900, color: '#FFFFFF', margin: 0 }}>
                          بطاقة كيرو برو الافتراضية
                        </h4>
                        <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>
                          KiroPro Virtual Mastercard
                        </span>
                      </div>
                    </div>

                    <div style={{ textAlign: 'left', direction: 'ltr' }}>
                      <span style={{ fontSize: '0.7rem', color: '#94A3B8', display: 'block', textTransform: 'uppercase', fontWeight: 800 }}>
                        Card Balance
                      </span>
                      <span style={{ fontSize: '1rem', fontWeight: 900, color: '#10B981' }}>
                        $1.00 USD
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 10, fontSize: '0.85rem' }}>
                    <span style={{ color: '#CBD5E1', fontWeight: 700 }}>سعر إصدار البطاقة:</span>
                    <strong style={{ color: '#FBBF24', fontSize: '1.1rem', fontWeight: 900 }}>
                      {formatCurrency(finalPrice, currency)} ($2.00)
                    </strong>
                  </div>
                </div>

                {/* Payment Method Selector Tabs */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  <button
                    type="button"
                    onClick={() => setCardPaymentMethod('wallet')}
                    style={{
                      flex: 1,
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-md)',
                      border: cardPaymentMethod === 'wallet' ? '2px solid #FBBF24' : '1px solid var(--border-subtle)',
                      background: cardPaymentMethod === 'wallet' ? '#0B0F19' : '#F8FAFC',
                      color: cardPaymentMethod === 'wallet' ? '#FBBF24' : 'var(--text-primary)',
                      fontWeight: 900,
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      transition: 'all 0.2s ease',
                      boxShadow: cardPaymentMethod === 'wallet' ? '0 2px 10px rgba(250, 204, 21, 0.2)' : 'none'
                    }}
                  >
                    <CreditCard size={16} />
                    <span>رصيد المتجر ($2.00)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCardPaymentMethod('issuance_code')}
                    style={{
                      flex: 1,
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-md)',
                      border: cardPaymentMethod === 'issuance_code' ? '2px solid #FBBF24' : '1px solid var(--border-subtle)',
                      background: cardPaymentMethod === 'issuance_code' ? '#0B0F19' : '#F8FAFC',
                      color: cardPaymentMethod === 'issuance_code' ? '#FBBF24' : 'var(--text-primary)',
                      fontWeight: 900,
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      transition: 'all 0.2s ease',
                      boxShadow: cardPaymentMethod === 'issuance_code' ? '0 2px 10px rgba(250, 204, 21, 0.2)' : 'none'
                    }}
                  >
                    <Key size={16} />
                    <span>كود إصدار ($2.00)</span>
                  </button>
                </div>

                {/* Method 1: Store Wallet */}
                {cardPaymentMethod === 'wallet' ? (
                  <div>
                    <div className={styles.walletCard}>
                      <div className={styles.walletHeader}>
                        <div className={styles.walletTitle}>
                          <CreditCard size={16} />
                          <span>رصيد محفظة KIROPRO</span>
                        </div>
                        <span style={{ fontSize: '0.75rem', color: '#16A34A', background: '#DCFCE7', padding: '2px 6px', borderRadius: 4, fontWeight: 800 }}>
                          رصيد مسبق الدفع
                        </span>
                      </div>

                      <div className={styles.walletRow}>
                        <span>رصيدك الحالي:</span>
                        <span className={styles.numVal}>{formatCurrency(balance, currency)}</span>
                      </div>

                      <div className={styles.walletRow} style={{ fontWeight: 800 }}>
                        <span>المبلغ المطلوب للإصدار:</span>
                        <span className={styles.numVal} style={{ color: '#0B0F19', fontSize: '1.05rem', fontWeight: 900 }}>
                          {formatCurrency(finalPrice, currency)} ($2.00)
                        </span>
                      </div>

                      <div className={styles.walletRowFinal}>
                        <span>الرصيد بعد الشراء:</span>
                        <span
                          className={styles.numVal}
                          style={{ color: isInsufficient ? '#EF4444' : '#10B981' }}
                        >
                          {isInsufficient ? `عجز: ${formatCurrency(Math.abs(balanceAfter), currency)}` : formatCurrency(balanceAfter, currency)}
                        </span>
                      </div>
                    </div>

                    {isOutOfStock ? (
                      <div className={styles.insufficientBox} style={{ background: '#fef2f2', borderColor: '#fecaca' }}>
                        <div className={styles.insufficientTitle} style={{ color: '#b91c1c' }}>
                          <AlertCircle size={18} color="#dc2626" />
                          <span>المخزون غير متوفر حالياً</span>
                        </div>
                        <p style={{ fontSize: '0.8rem', color: '#7f1d1d' }}>
                          نعتذر، نفدت بطاقات كيرو برو المتاحة مؤقتاً. جاري إضافة دفعات جديدة قريباً من الإدارة.
                        </p>
                        <button
                          type="button"
                          disabled
                          className="btn btn-secondary btn-sm"
                          style={{ width: '100%', opacity: 0.6, cursor: 'not-allowed', marginTop: 8 }}
                        >
                          نفد المخزون مؤقتاً
                        </button>
                      </div>
                    ) : isInsufficient ? (
                      <div className={styles.insufficientBox}>
                        <div className={styles.insufficientTitle}>
                          <AlertCircle size={18} color="#dc2626" />
                          <span>الرصيد غير كافٍ</span>
                        </div>
                        <p style={{ fontSize: '0.8rem', color: '#7F1D1D' }}>
                          يلزم توفر $2.00 ({formatCurrency(finalPrice, currency)}) في رصيد محفظتك لإصدار البطاقة.
                        </p>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={openDepositModal}
                          style={{ width: '100%' }}
                        >
                          <span>شحن الرصيد</span>
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={handleConfirmOrder}
                        disabled={isProcessing}
                        style={{ width: '100%', fontSize: '1rem', marginTop: 8 }}
                      >
                        {isProcessing ? (
                          <span>جاري حجز وتشفير البطاقة وتنفيذ الطلب...</span>
                        ) : (
                          <span>شراء KiroPro Card من الرصيد ($2.00) 💳</span>
                        )}
                      </button>
                    )}
                  </div>
                ) : (
                  /* Method 2: Issuance Code */
                  <div style={{
                    background: '#0B0F19',
                    border: '1px solid rgba(250, 204, 21, 0.35)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '16px',
                    color: '#FFFFFF'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: '0.85rem', fontWeight: 800, color: '#FBBF24' }}>
                      <Key size={16} />
                      <span>أدخل كود إصدار KiroPro Card:</span>
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <input
                        type="text"
                        value={issuanceCodeInput}
                        onChange={(e) => {
                          const val = e.target.value.toUpperCase();
                          setIssuanceCodeInput(val);
                          handleValidateIssuanceCode(val);
                          if (issuanceCodeError) setIssuanceCodeError(null);
                        }}
                        placeholder="KPC-XXXX-XXXX-XXXX"
                        dir="ltr"
                        style={{
                          width: '100%',
                          padding: '10px 14px',
                          borderRadius: 'var(--radius-md)',
                          border: issuanceCodeError ? '1px solid #EF4444' : '1px solid rgba(250, 204, 21, 0.4)',
                          background: '#131722',
                          color: '#FFFFFF',
                          fontFamily: 'monospace',
                          fontSize: '0.95rem',
                          letterSpacing: '1.5px',
                          outline: 'none'
                        }}
                      />
                      <span style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: 4, display: 'block' }}>
                        كود الإصدار يعادل قيمة إصدار البطاقة ($2.00) بالكامل دون أي خصم من محفظتك.
                      </span>
                    </div>

                    {issuanceCodeValidInfo && (
                      <div style={{
                        padding: '8px 12px',
                        borderRadius: 8,
                        background: 'rgba(16, 185, 129, 0.15)',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        color: '#34D399',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        marginBottom: 12,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6
                      }}>
                        <CheckCircle2 size={16} />
                        <span>{issuanceCodeValidInfo.message}</span>
                      </div>
                    )}

                    {issuanceCodeError && (
                      <div style={{
                        padding: '8px 12px',
                        borderRadius: 8,
                        background: 'rgba(239, 68, 68, 0.15)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        color: '#F87171',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        marginBottom: 12,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6
                      }}>
                        <AlertCircle size={16} />
                        <span>{issuanceCodeError}</span>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={handleRedeemIssuanceCode}
                      disabled={issuanceCodeLoading || !issuanceCodeInput.trim()}
                      style={{
                        width: '100%',
                        padding: '12px 16px',
                        borderRadius: 10,
                        background: 'linear-gradient(135deg, #FBBF24 0%, #EAB308 100%)',
                        color: '#0B0F19',
                        fontWeight: 900,
                        fontSize: '0.95rem',
                        border: 'none',
                        cursor: issuanceCodeLoading || !issuanceCodeInput.trim() ? 'not-allowed' : 'pointer',
                        opacity: issuanceCodeLoading || !issuanceCodeInput.trim() ? 0.6 : 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        boxShadow: '0 4px 14px rgba(250, 204, 21, 0.3)'
                      }}
                    >
                      {issuanceCodeLoading ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          <span>جاري التحقق وإصدار البطاقة...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles size={16} />
                          <span>استرداد الكود وإصدار البطاقة ($2.00)</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* Normal Products (Games / Digital Accounts) Flow */
              <>
                <div className={styles.walletCard}>
                  <div className={styles.walletHeader}>
                    <div className={styles.walletTitle}>
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <rect x="2" y="4" width="20" height="16" rx="2" />
                        <path d="M7 15h0M2 9.5h20" />
                      </svg>
                      <span>رصيد KIROPRO</span>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: '#16A34A', background: '#DCFCE7', padding: '2px 6px', borderRadius: 4, fontWeight: 800 }}>
                      رصيد مسبق الدفع
                    </span>
                  </div>

                  <div className={styles.walletRow}>
                    <span>رصيدك الحالي:</span>
                    <span className={styles.numVal}>{formatCurrency(balance, 'SDG')}</span>
                  </div>

                  <div className={styles.walletRow}>
                    <span>{isDigitalAccount && quantity > 1 ? `السعر الأساسي (${quantity} حسابات):` : 'السعر الأساسي:'}</span>
                    <span className={styles.numVal} style={{ textDecoration: discountAmount > 0 ? 'line-through' : 'none', color: discountAmount > 0 ? '#94A3B8' : undefined }}>
                      {formatCurrency(rawOrderPrice, 'SDG')}
                    </span>
                  </div>

                  {discountAmount > 0 && (
                    <div className={styles.walletRow} style={{ color: '#059669' }}>
                      <span>الخصم ({appliedPromo?.code}):</span>
                      <span className={styles.numVal} style={{ color: '#059669', fontWeight: 900 }}>
                        -{formatCurrency(discountAmount, 'SDG')}
                      </span>
                    </div>
                  )}

                  <div className={styles.walletRow} style={{ fontWeight: 800 }}>
                    <span>المبلغ المطلوب دفعه:</span>
                    <span className={styles.numVal} style={{ color: '#0B0F19', fontSize: '1.05rem', fontWeight: 900 }}>
                      {formatCurrency(finalPrice, 'SDG')}
                    </span>
                  </div>

                  <div className={styles.walletRowFinal}>
                    <span>الرصيد بعد الشراء:</span>
                    <span
                      className={styles.numVal}
                      style={{ color: isInsufficient ? '#EF4444' : '#10B981' }}
                    >
                      {isInsufficient ? `عجز: ${formatCurrency(Math.abs(balanceAfter), 'SDG')}` : formatCurrency(balanceAfter, 'SDG')}
                    </span>
                  </div>
                </div>

                {/* Insufficient Balance State */}
                {isOutOfStock ? (
                  <div className={styles.insufficientBox} style={{ background: '#fef2f2', borderColor: '#fecaca' }}>
                    <div className={styles.insufficientTitle} style={{ color: '#b91c1c' }}>
                      <AlertCircle size={18} color="#dc2626" />
                      <span>المخزون غير متوفر حالياً</span>
                    </div>
                    <p style={{ fontSize: '0.8rem', color: '#7f1d1d' }}>
                      نعتذر، هذا المنتج غير متوفر حالياً في المخزون. يرجى مراجعة الموقع لاحقاً عند إضافة كميات جديدة.
                    </p>
                    <button
                      type="button"
                      disabled
                      className="btn btn-secondary btn-sm"
                      style={{ width: '100%', opacity: 0.6, cursor: 'not-allowed', marginTop: 8 }}
                    >
                      نفد المخزون مؤقتاً
                    </button>
                  </div>
                ) : isInsufficient ? (
                  <div className={styles.insufficientBox}>
                    <div className={styles.insufficientTitle}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      <span>الرصيد غير كافٍ</span>
                    </div>
                    <p style={{ fontSize: '0.8rem', color: '#7F1D1D' }}>
                      يرجى إضافة رصيد إلى محفظة KIROPRO لمتابعة الشحن الفوري.
                    </p>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={openDepositModal}
                      style={{ width: '100%' }}
                    >
                      <span>إضافة رصيد</span>
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleConfirmOrder}
                    disabled={isProcessing}
                    style={{ width: '100%', fontSize: '1rem', marginTop: 8 }}
                  >
                    {isProcessing ? (
                      <span>{isDigitalAccount ? 'جاري تخصيص الحساب وتنفيذ الطلب...' : 'جاري خصم الرصيد وتنفيذ الطلب...'}</span>
                    ) : (
                      <span>{isDigitalAccount ? 'شراء الحساب واستلام البيانات فوراً ⚡' : 'تأكيد الطلب وشحنه فوراً ⚡'}</span>
                    )}
                  </button>
                )}

                <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 12 }}>
                  {isDigitalAccount
                    ? '🔒 يتم خصم المبلغ من رصيدك المسبق الدفع وتسليم بيانات الحساب فورياً.'
                    : '🔒 يتم خصم المبلغ من رصيدك المسبق الدفع وإرسال الطلب تلقائياً لمزود الخدمة.'}
                </p>
              </>
            )}
          </>
        )}

        {/* Virtual Card 3D Viewer Modal */}
        <CardDetailsViewModal
          orderId={deliveredCardOrder?.orderId || null}
          isOpen={showCardDetailsModal}
          onClose={() => {
            setShowCardDetailsModal(false);
            onClose();
          }}
          onShowToast={(msg, type) => showToast(msg, type)}
        />
      </div>
    </div>
  );
};

