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
  Clock,
  ChevronRight
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
  const { isAuthenticated } = useAuth();
  const { formattedBalance, refreshBalance } = useWallet();

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
        setError(err.message || 'تعذر جلب إعلاناتك حالياً.');
        setLoading(false);
      });
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchMyListings();
    }
  }, [isAuthenticated]);

  const handleCopyLink = (code: string, id: string) => {
    const fullUrl = `${window.location.origin}/marketplace/listing/${code}`;
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
      alert(err.message || 'تعذر تحديث حالة الإعلان.');
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
      setRenewError(err.message || 'تعذر تجديد الإعلان.');
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
      {/* Top Bar */}
      <div className={styles.wizardTopBar}>
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
          style={{ padding: '8px 16px', fontSize: '0.9rem' }}
        >
          <PlusCircle size={18} />
          <span>نشر إعلان جديد</span>
        </button>
      </div>

      {/* Header Banner */}
      <div className={styles.marketHeader}>
        <div className={styles.headerMain}>
          <div className={styles.headerTitleRow}>
            <div className={styles.heroIconBox}>
              <Layers size={24} color="#F59E0B" />
            </div>
            <div>
              <h1 className={styles.headerTitle}>إعلاناتي في سوق الحسابات</h1>
              <p className={styles.headerSubtitle}>
                إدارة كافة حساباتك المعروضة للبيع، تمديد وتجديد فترات الإعلانات، وتعليم الحسابات المباعة.
              </p>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className={styles.listingsGrid}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={styles.skeletonCard}>
              <div className={styles.skeletonImage} style={{ height: 120 }} />
              <div className={styles.skeletonBody}>
                <div className={styles.skeletonLine} style={{ width: '40%' }} />
                <div className={styles.skeletonLine} style={{ width: '75%' }} />
                <div className={styles.skeletonFooter} />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className={styles.emptyStateContainer} style={{ borderColor: 'rgba(239, 68, 68, 0.4)' }}>
          <p style={{ color: '#EF4444', fontWeight: 800 }}>{error}</p>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={fetchMyListings}
          >
            <span>إعادة المحاولة</span>
          </button>
        </div>
      ) : listings.length === 0 ? (
        <div className={styles.emptyStateContainer}>
          <div className={styles.emptyIconCircle}>
            <Layers size={44} color="#6B7280" />
          </div>
          <h3 className={styles.emptyTitle}>لا توجد لديك إعلانات بعد</h3>
          <p className={styles.emptyDesc}>
            يمكنك نشر أول إعلان لحسابك في ببجي أو فري فاير للوصول إلى آلاف المشترين عبر المنصة.
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
            <PlusCircle size={18} />
            <span>نشر إعلان الآن</span>
          </button>
        </div>
      ) : (
        <div className={styles.myListingsList}>
          {listings.map(item => {
            const isPubg = item.game === 'PUBG_MOBILE';
            const gameTitle = isPubg ? 'ببجي موبايل' : 'فري فاير';
            const defaultImg = isPubg
              ? 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=400&q=80'
              : 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?auto=format&fit=crop&w=400&q=80';
            const imgUrl = item.primary_image || defaultImg;

            return (
              <div key={item.id} className={styles.myListingCard}>
                {/* Thumbnail */}
                <div className={styles.myListingThumb}>
                  <img src={imgUrl} alt={item.title} className={styles.previewImg} loading="lazy" />
                  <span className={styles.adCodeBadge}>{item.public_code}</span>
                </div>

                {/* Details */}
                <div className={styles.myListingInfo}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {getStatusBadge(item.status)}
                    <span style={{ fontSize: '0.8rem', color: '#9CA3AF', fontWeight: 700 }}>{gameTitle}</span>
                  </div>

                  <h3 className={styles.myListingTitle}>
                    {item.title}
                  </h3>

                  <div className={styles.myListingMetaRow}>
                    <span>السعر: <strong style={{ color: '#F59E0B' }}>{Number(item.price).toLocaleString()} SDG</strong></span>
                    <span>المستوى: <strong>{item.account_level}</strong></span>
                    <span>الربط: <strong>{item.binding_type}</strong></span>
                    {item.status === 'PUBLISHED' && (
                      <span style={{ color: '#10B981', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Clock size={13} />
                        <span>متبقي {item.days_remaining} يوم</span>
                      </span>
                    )}
                  </div>

                  {item.rejection_reason && (
                    <div style={{ color: '#EF4444', fontSize: '0.82rem', marginTop: 4 }}>
                      سبب الرفض: {item.rejection_reason} {item.rejection_notes && `(${item.rejection_notes})`}
                    </div>
                  )}

                  {item.cancellation_reason && (
                    <div style={{ color: '#EF4444', fontSize: '0.82rem', marginTop: 4 }}>
                      سبب الإلغاء: {item.cancellation_reason}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className={styles.myListingActions}>
                  {item.status === 'PUBLISHED' && (
                    <>
                      <button
                        type="button"
                        className={styles.secondaryBtn}
                        onClick={() => handleCopyLink(item.public_code, item.id)}
                        style={{ padding: '8px 12px', fontSize: '0.82rem' }}
                      >
                        {copiedCodeId === item.id ? <Check size={14} color="#10B981" /> : <Copy size={14} />}
                        <span>{copiedCodeId === item.id ? 'تم النسخ!' : 'نسخ الرابط'}</span>
                      </button>

                      <button
                        type="button"
                        className={styles.secondaryBtn}
                        onClick={() => {
                          if (onNavigateDetail) onNavigateDetail(item.public_code);
                          else {
                            window.history.pushState({}, '', `/marketplace/listing/${item.public_code}`);
                            window.dispatchEvent(new PopStateEvent('popstate'));
                          }
                        }}
                        style={{ padding: '8px 12px', fontSize: '0.82rem' }}
                      >
                        <Eye size={14} />
                        <span>عرض</span>
                      </button>

                      <button
                        type="button"
                        className={styles.secondaryBtn}
                        disabled={markingSoldId === item.id}
                        onClick={() => handleMarkSold(item.id)}
                        style={{ padding: '8px 12px', fontSize: '0.82rem', color: '#A78BFA', borderColor: 'rgba(167, 139, 250, 0.3)' }}
                      >
                        <CheckCircle size={14} />
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
                      <RefreshCw size={14} />
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
        <div className={styles.filterSheetBackdrop} onClick={() => setRenewalListing(null)}>
          <div className={styles.filterSheetContainer} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <h3 style={{ color: '#F9FAFB', margin: 0, fontSize: '1.25rem', fontWeight: 900 }}>
              تجديد عرض الإعلان ({renewalListing.public_code})
            </h3>
            <p style={{ color: '#9CA3AF', margin: '6px 0 16px', fontSize: '0.9rem' }}>
              اختر مدة التجديد المناسبة. سيتم خصم الرسوم من محفظتك مباشرة.
            </p>

            <div className={styles.feeGrid} style={{ marginBottom: 16 }}>
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
              fontSize: '0.9rem',
              marginBottom: 16
            }}>
              <span style={{ color: '#9CA3AF' }}>رصيدك المتاح:</span>
              <span style={{ color: '#F59E0B', fontWeight: 800 }}>{formattedBalance}</span>
            </div>

            {renewError && (
              <div style={{ color: '#EF4444', fontSize: '0.85rem', marginBottom: 14 }}>
                {renewError}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
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
