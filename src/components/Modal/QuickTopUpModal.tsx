import React, { useState, useEffect } from 'react';
import styles from './QuickTopUpModal.module.css';
import { Game, GamePackage } from '../../types';
import { useWallet } from '../../context/WalletContext';
import { verifyPlayerId, createOrder, validatePromoCode, PromoValidationResult, fetchProductServers } from '../../services/api';
import { formatCurrency } from '../../lib/formatters';
import { Tag, Sparkles, X, CheckCircle2, AlertCircle, Loader2, Key, Copy, Check, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { getProductImageUrl } from '../../utils/imageUrl';

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
  const [deliveredCredentials, setDeliveredCredentials] = useState<{ email: string; password?: string } | null>(null);
  const [showDeliveredPassword, setShowDeliveredPassword] = useState(false);
  const [copiedField, setCopiedField] = useState<'email' | 'password' | 'all' | null>(null);

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
      setDeliveredCredentials(null);
      setShowDeliveredPassword(false);
      setCopiedField(null);
    }
  }, [game]);

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
  const rawOrderPrice = getPackagePrice(selectedPackage);
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

  const handleConfirmOrder = async () => {
    const isDigitalAccount = selectedPackage?.productType === 'DIGITAL_ACCOUNT' || game?.id === 'google-play-points';

    if (!isDigitalAccount && !playerId.trim()) {
      showToast('يرجى إدخال معرّف اللاعب للاستلام', 'warning');
      return;
    }

    const pkgRequiresServer = Boolean(
      selectedPackage?.requiresGameServerId ||
      selectedPackage?.isRequiredGameServerId
    );

    if (!isDigitalAccount && pkgRequiresServer && serverList.length > 0 && !selectedServer) {
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
        playerId: isDigitalAccount ? 'DIGITAL_ACCOUNT' : playerId.trim(),
        serverId: (!isDigitalAccount && pkgRequiresServer && selectedServer) ? selectedServer : undefined,
        playerName: (!isDigitalAccount && verifiedPlayerName) ? verifiedPlayerName : undefined,
        amount: finalPrice,
        promoCode: appliedPromo?.code
      });

      await refreshBalance();

      if (orderRes.credentials) {
        setDeliveredCredentials(orderRes.credentials);
        showToast('تم شراء الحساب وتخصيصه بنجاح! ⚡', 'success');
      } else {
        showToast('تم إنشاء وتنفيذ الطلب بنجاح! جاري معالجة الشحن فورياً.', 'success');
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

        {deliveredCredentials ? (
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
              تم استلام الحساب بنجاح! 🎉
            </h3>
            <p style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: 18 }}>
              تم تخصيص الحساب وتسليمه إليك فورياً. يرجى حفظ بيانات الدخول التالية:
            </p>

            {/* Credentials Card */}
            <div style={{
              background: '#0B0F19',
              borderRadius: '12px',
              border: '1.5px solid #facc15',
              padding: '16px 18px',
              textAlign: 'right',
              marginBottom: 16
            }}>
              {/* Email */}
              <div style={{ marginBottom: 14 }}>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                  البريد الإلكتروني (Email):
                </span>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, background: '#1e293b', padding: '8px 12px', borderRadius: 8 }}>
                  <code style={{ color: '#facc15', fontSize: '0.95rem', fontWeight: 800, fontFamily: 'monospace', direction: 'ltr' }}>
                    {deliveredCredentials.email}
                  </code>
                  <button
                    type="button"
                    onClick={() => handleCopyText(deliveredCredentials.email, 'email')}
                    style={{
                      background: copiedField === 'email' ? '#10b981' : 'rgba(250, 204, 21, 0.2)',
                      color: copiedField === 'email' ? '#ffffff' : '#facc15',
                      border: 'none',
                      borderRadius: 6,
                      padding: '4px 10px',
                      fontSize: '0.75rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    {copiedField === 'email' ? <Check size={13} /> : <Copy size={13} />}
                    <span>{copiedField === 'email' ? 'تم النسخ' : 'نسخ'}</span>
                  </button>
                </div>
              </div>

              {/* Password */}
              <div>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                  كلمة المرور (Password):
                </span>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, background: '#1e293b', padding: '8px 12px', borderRadius: 8 }}>
                  <code style={{ color: '#38bdf8', fontSize: '0.95rem', fontWeight: 800, fontFamily: 'monospace', direction: 'ltr' }}>
                    {showDeliveredPassword ? (deliveredCredentials.password || '••••••••') : '••••••••••••'}
                  </code>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => setShowDeliveredPassword(!showDeliveredPassword)}
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
                      title={showDeliveredPassword ? 'إخفاء' : 'إظهار'}
                    >
                      {showDeliveredPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleCopyText(deliveredCredentials.password || '', 'password')}
                      style={{
                        background: copiedField === 'password' ? '#10b981' : 'rgba(56, 189, 248, 0.2)',
                        color: copiedField === 'password' ? '#ffffff' : '#38bdf8',
                        border: 'none',
                        borderRadius: 6,
                        padding: '4px 10px',
                        fontSize: '0.75rem',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4
                      }}
                    >
                      {copiedField === 'password' ? <Check size={13} /> : <Copy size={13} />}
                      <span>{copiedField === 'password' ? 'تم النسخ' : 'نسخ'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick copy all button */}
            <button
              type="button"
              onClick={() => handleCopyText(`Email: ${deliveredCredentials.email}\nPassword: ${deliveredCredentials.password || ''}`, 'all')}
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
              <span>{copiedField === 'all' ? 'تم نسخ جميع البيانات بنجاح ✓' : 'نسخ الإيميل وكلمة المرور معاً'}</span>
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

        {/* Step 2: Player ID & Server Selection OR Digital Account Info */}
        {isDigitalAccount ? (
          <div style={{
            marginBottom: 16,
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
              لا يتطلب هذا المنتج إدخال معرّف لاعب أو سيرفر. سيتم تخصيص الحساب من المخزون المشفر وعرض البريد الإلكتروني وكلمة المرور فوراً بعد إتمام الشراء، وستظل البيانات محفوظة دائماً في صفحة <strong>طلباتي</strong>.
              <div style={{ marginTop: 6, fontWeight: 800, color: '#b45309' }}>
                ⚠️ تنبيه: مسموح بشراء حساب واحد فقط لكل عميل.
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

        {/* Wallet Summary */}
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
            <span>السعر الأساسي:</span>
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
        {isInsufficient ? (
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
  </div>
</div>
);
};

