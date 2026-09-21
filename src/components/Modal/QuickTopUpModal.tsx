import React, { useState, useEffect } from 'react';
import styles from './QuickTopUpModal.module.css';
import { Game, GamePackage } from '../../types';
import { useWallet } from '../../context/WalletContext';
import { verifyPlayerId, createOrder, validatePromoCode, PromoValidationResult, fetchProductServers } from '../../services/api';
import { formatCurrency } from '../../lib/formatters';
import { Tag, Sparkles, X, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
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

  const handleConfirmOrder = async () => {
    if (!playerId.trim()) {
      showToast('يرجى إدخال معرّف اللاعب للاستلام', 'warning');
      return;
    }

    const pkgRequiresServer = Boolean(
      selectedPackage?.requiresGameServerId ||
      selectedPackage?.isRequiredGameServerId
    );

    if (pkgRequiresServer && serverList.length > 0 && !selectedServer) {
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
      await createOrder({
        gameId: game.id,
        packageId: selectedPackage.id,
        packageName: `${game.name} - ${selectedPackage.name}`,
        playerId: playerId.trim(),
        serverId: pkgRequiresServer && selectedServer ? selectedServer : undefined,
        playerName: verifiedPlayerName || undefined,
        amount: finalPrice,
        promoCode: appliedPromo?.code
      });

      await refreshBalance();
      showToast('تم إنشاء وتنفيذ الطلب بنجاح! جاري معالجة الشحن فورياً.', 'success');
      onClose();
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

        {/* Step 2: Player ID & Server Selection */}
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
              <span>جاري خصم الرصيد وتنفيذ الطلب...</span>
            ) : (
              <span>تأكيد الطلب وشحنه فوراً ⚡</span>
            )}
          </button>
        )}

        <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 12 }}>
          🔒 يتم خصم المبلغ من رصيدك المسبق الدفع وإرسال الطلب تلقائياً لمزود الخدمة.
        </p>
      </div>
    </div>
  );
};
