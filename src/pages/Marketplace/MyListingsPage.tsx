import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useWallet } from '../../context/WalletContext';
import {
  marketplaceApi,
  MyAccountListing
} from '../../services/marketplaceApi';
import {
  Layers,
  PlusCircle,
  Copy,
  Check,
  Eye,
  CheckCircle,
  RefreshCw,
  AlertCircle,
  Gamepad2,
  Flame,
  Clock,
  ChevronRight,
  ShieldAlert,
  Wallet
} from 'lucide-react';
import styles from './Marketplace.module.css';

interface MyListingsPageProps {
  onNavigateCreate?: () => void;
  onNavigateDetail?: (code: string) => void;
  onBack?: () => void;
}

export const MyListingsPage: React.FC<MyListingsPageProps> = ({
  onNavigateCreate,
  onNavigateDetail,
  onBack
}) => {
  const { user, isAuthenticated, navigateTo } = useAuth();
  const { balance, formattedBalance, refreshBalance } = useWallet();

  const [listings, setListings] = useState<MyAccountListing[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);

  // Renewal Modal State
  const [renewalListing, setRenewalListing] = useState<MyAccountListing | null>(null);
  const [renewDuration, setRenewDuration] = useState<15 | 30>(15);
  const [isRenewing, setIsRenewing] = useState<boolean>(false);
  const [renewError, setRenewError] = useState<string | null>(null);

  // Mark Sold state
  const [markingSoldId, setMarkingSoldId] = useState<string | null>(null);

  const fetchMyListings = () => {
    setLoading(true);
    marketplaceApi.getMyListings()
      .then(res => {
        setListings(res.listings);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message || 'فشل جلب إعلاناتك.');
        setLoading(false);
      });
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchMyListings();
    }
  }, [isAuthenticated]);

  const handleCopyLink = (code: string, id: string) => {
    const fullUrl = `${window.location.origin}/marketplace/${code}`;
    navigator.clipboard.writeText(fullUrl).then(() => {
      setCopiedCodeId(id);
      setTimeout(() => setCopiedCodeId(null), 2500);
    });
  };

  const handleMarkSold = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من تعليم هذا الحساب كمباع؟ سيختفي الإعلان من السوق العام فوراً.')) {
      return;
    }

    setMarkingSoldId(id);
    try {
      await marketplaceApi.markSold(id);
      fetchMyListings();
    } catch (err: any) {
      alert(err.message || 'فشل تحديث حالة الإعلان.');
    } finally {
      setMarkingSoldId(null);
    }
  };

  const handleRenew = async () => {
    if (!renewalListing) return;
    setIsRenewing(true);
    setRenewError(null);

    try {
      await marketplaceApi.renewListing(renewalListing.id, renewDuration);
      await refreshBalance();
      setRenewalListing(null);
      fetchMyListings();
      alert('تم تجديد الإعلان بنجاح!');
    } catch (err: any) {
      setRenewError(err.message || 'فشل تجديد الإعلان.');
    } finally {
      setIsRenewing(false);
    }
  };

  const getStatusBadge = (status: MyAccountListing['status']) => {
    switch (status) {
      case 'PUBLISHED':
        return <span className={`${styles.statusBadge} ${styles.statusPublished}`}>منشور في السوق</span>;
      case 'PENDING_REVIEW':
        return <span className={`${styles.statusBadge} ${styles.statusPending}`}>قيد المراجعة الإدارية</span>;
      case 'SOLD':
        return <span className={`${styles.statusBadge} ${styles.statusSold}`}>تم البيع</span>;
      case 'EXPIRED':
        return <span className={`${styles.statusBadge} ${styles.statusExpired}`}>منتهي الصلاحية</span>;
      case 'REJECTED':
        return <span className={`${styles.statusBadge} ${styles.statusRejected}`}>تم الرفض</span>;
      case 'CANCELLED':
        return <span className={`${styles.statusBadge} ${styles.statusCancelled}`}>ملغي ومسترد</span>;
      case 'SUSPENDED':
        return <span className={`${styles.statusBadge} ${styles.statusSuspended}`}>معلق مؤقتاً</span>;
      default:
        return <span className={styles.statusBadge}>{status}</span>;
    }
  };

  return (
    <div className={styles.pageContainer}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <button
          type="button"
          className={styles.secondaryBtn}
          onClick={() => {
            if (onBack) onBack();
            else {
              window.history.pushState({}, '', '/marketplace');
              window.dispatchEvent(new PopStateEvent('popstate'));
            }
          }}
          style={{ padding: '6px 14px', fontSize: '0.85rem' }}
        >
          <ChevronRight size={16} />
          <span>العودة إلى السوق</span>
        </button>

        <button
          type="button"
          className={styles.primaryBtn}
          onClick={() => {
            if (onNavigateCreate) onNavigateCreate();
            else {
              window.history.pushState({}, '', '/marketplace/create');
              window.dispatchEvent(new PopStateEvent('popstate'));
            }
          }}
        >
          <PlusCircle size={18} />
          <span>نشر إعلان جديد</span>
        </button>
      </div>

      <div className={styles.marketHeader}>
        <div className={styles.headerMain}>
          <div className={styles.headerTitleRow}>
            <h1 className={styles.headerTitle}>
              <Layers size={28} color="#F59E0B" />
              <span>إعلاناتي في سوق الحسابات</span>
            </h1>
          </div>
          <p className={styles.headerSubtitle}>
            إدارة كافة حساباتك المعروضة للبيع، تمديد وتجديد فترات الإعلانات، وتعليم الحسابات المباعة.
          </p>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9CA3AF' }}>
          <div className="spinner" style={{ margin: '0 auto 16px' }} />
          <p>جارٍ تحميل إعلاناتك...</p>
        </div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#EF4444' }}>
          <p>{error}</p>
        </div>
      ) : listings.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '80px 20px',
          background: '#111827',
          borderRadius: 16,
          border: '1px solid #1F2937'
        }}>
          <Layers size={48} color="#6B7280" style={{ margin: '0 auto 16px' }} />
          <h3 style={{ color: '#F9FAFB', fontSize: '1.25rem', marginBottom: 8 }}>لا توجد لديك إعلانات بعد</h3>
          <p style={{ color: '#9CA3AF', maxWidth: 440, margin: '0 auto 20px', fontSize: '0.95rem' }}>
            يمكنك نشر أول إعلان لحسابك في ببجي أو فري فاير للوصول إلى آلاف المشترين.
          </p>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={() => {
              if (onNavigateCreate) onNavigateCreate();
              else {
                window.history.pushState({}, '', '/marketplace/create');
                window.dispatchEvent(new PopStateEvent('popstate'));
              }
            }}
          >
            <PlusCircle size={20} />
            <span>نشر إعلان الآن</span>
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {listings.map(item => {
            const isPubg = item.game === 'PUBG_MOBILE';
            const gameTitle = isPubg ? 'ببجي موبايل' : 'فري فاير';
            const defaultImg = isPubg
              ? 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=400&q=80'
              : 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?auto=format&fit=crop&w=400&q=80';
            const imgUrl = item.primary_image || defaultImg;

            return (
              <div
                key={item.id}
                style={{
                  background: '#111827',
                  border: '1px solid #1F2937',
                  borderRadius: 14,
                  padding: 18,
                  display: 'flex',
                  flexDirection: 'row',
                  gap: 18,
                  flexWrap: 'wrap',
                  alignItems: 'center'
                }}
              >
                {/* Thumbnail */}
                <div style={{
                  width: 120,
                  height: 80,
                  borderRadius: 8,
                  overflow: 'hidden',
                  background: '#1F2937',
                  flexShrink: 0
                }}>
                  <img src={imgUrl} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>

                {/* Details */}
                <div style={{ flex: 1, minWidth: 240, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{
                      fontFamily: 'monospace',
                      fontWeight: 900,
                      color: '#F59E0B',
                      background: 'rgba(245, 158, 11, 0.1)',
                      padding: '2px 8px',
                      borderRadius: 6,
                      fontSize: '0.8rem'
                    }}>
                      {item.public_code}
                    </span>
                    {getStatusBadge(item.status)}
                    <span style={{ fontSize: '0.8rem', color: '#9CA3AF' }}>{gameTitle}</span>
                  </div>

                  <h3 style={{ color: '#F9FAFB', fontSize: '1.05rem', margin: 0, fontWeight: 800 }}>
                    {item.title}
                  </h3>

                  <div style={{ display: 'flex', gap: 14, color: '#9CA3AF', fontSize: '0.85rem', flexWrap: 'wrap' }}>
                    <span>السعر: <strong style={{ color: '#F59E0B' }}>{Number(item.price).toLocaleString()} SDG</strong></span>
                    <span>المستوى: {item.account_level}</span>
                    <span>الربط: {item.binding_type}</span>
                    {item.status === 'PUBLISHED' && (
                      <span style={{ color: '#10B981', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Clock size={14} />
                        <span>متبقي: {item.days_remaining} يوم</span>
                      </span>
                    )}
                  </div>

                  {item.rejection_reason && (
                    <div style={{ color: '#EF4444', fontSize: '0.85rem', marginTop: 4 }}>
                      سبب الرفض: {item.rejection_reason} {item.rejection_notes && `(${item.rejection_notes})`}
                    </div>
                  )}

                  {item.cancellation_reason && (
                    <div style={{ color: '#EF4444', fontSize: '0.85rem', marginTop: 4 }}>
                      سبب الإلغاء: {item.cancellation_reason}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {item.status === 'PUBLISHED' && (
                    <>
                      <button
                        type="button"
                        className={styles.secondaryBtn}
                        onClick={() => handleCopyLink(item.public_code, item.id)}
                        style={{ padding: '8px 12px', fontSize: '0.85rem' }}
                      >
                        {copiedCodeId === item.id ? <Check size={16} color="#10B981" /> : <Copy size={16} />}
                        <span>{copiedCodeId === item.id ? 'تم النسخ!' : 'نسخ الرابط'}</span>
                      </button>

                      <button
                        type="button"
                        className={styles.secondaryBtn}
                        onClick={() => {
                          if (onNavigateDetail) onNavigateDetail(item.public_code);
                          else {
                            window.history.pushState({}, '', `/marketplace/${item.public_code}`);
                            window.dispatchEvent(new PopStateEvent('popstate'));
                          }
                        }}
                        style={{ padding: '8px 12px', fontSize: '0.85rem' }}
                      >
                        <Eye size={16} />
                        <span>عرض</span>
                      </button>

                      <button
                        type="button"
                        className={styles.secondaryBtn}
                        disabled={markingSoldId === item.id}
                        onClick={() => handleMarkSold(item.id)}
                        style={{ padding: '8px 12px', fontSize: '0.85rem', color: '#A78BFA' }}
                      >
                        <CheckCircle size={16} />
                        <span>تعليم كمباع</span>
                      </button>
                    </>
                  )}

                  {item.status === 'EXPIRED' && (
                    <button
                      type="button"
                      className={styles.primaryBtn}
                      onClick={() => setRenewalListing(item)}
                      style={{ padding: '8px 14px', fontSize: '0.85rem' }}
                    >
                      <RefreshCw size={16} />
                      <span>تجديد الإعلان</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Renewal Modal */}
      {renewalListing && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: 16
        }}>
          <div style={{
            background: '#111827',
            border: '1px solid #374151',
            borderRadius: 16,
            maxWidth: 480,
            width: '100%',
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
            direction: 'rtl'
          }}>
            <h3 style={{ color: '#F9FAFB', margin: 0, fontSize: '1.25rem' }}>
              تجديد عرض الإعلان ({renewalListing.public_code})
            </h3>
            <p style={{ color: '#9CA3AF', margin: 0, fontSize: '0.9rem' }}>
              اختر مدة التجديد المناسبة. سيتم خصم الرسوم من محفظتك مباشرة.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div
                className={`${styles.feeCard} ${renewDuration === 15 ? styles.feeCardSelected : ''}`}
                onClick={() => setRenewDuration(15)}
              >
                <span className={styles.feeDuration}>15 يوماً</span>
                <span className={styles.feeAmount}>1,500 SDG</span>
              </div>

              <div
                className={`${styles.feeCard} ${renewDuration === 30 ? styles.feeCardSelected : ''}`}
                onClick={() => setRenewDuration(30)}
              >
                <span className={styles.feeDuration}>30 يوماً</span>
                <span className={styles.feeAmount}>2,500 SDG</span>
              </div>
            </div>

            <div style={{
              background: '#1F2937',
              borderRadius: 8,
              padding: 12,
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '0.9rem'
            }}>
              <span style={{ color: '#9CA3AF' }}>رصيدك المتاح:</span>
              <span style={{ color: '#F59E0B', fontWeight: 800 }}>{formattedBalance}</span>
            </div>

            {renewError && (
              <div style={{ color: '#EF4444', fontSize: '0.85rem' }}>
                {renewError}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => setRenewalListing(null)}
                disabled={isRenewing}
              >
                <span>إلغاء</span>
              </button>

              <button
                type="button"
                className={styles.primaryBtn}
                onClick={handleRenew}
                disabled={isRenewing}
              >
                <RefreshCw size={16} />
                <span>{isRenewing ? 'جارٍ التجديد...' : `تأكيد ودفع ${renewDuration === 15 ? '1,500' : '2,500'} SDG`}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
