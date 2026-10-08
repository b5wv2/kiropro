import React, { useState, useEffect } from 'react';
import { marketplaceApi, AccountListingDetail } from '../../services/marketplaceApi';
import {
  ChevronRight,
  Share2,
  Copy,
  Check,
  ShieldCheck,
  Gamepad2,
  Flame,
  MessageCircle,
  AlertCircle
} from 'lucide-react';
import styles from './Marketplace.module.css';

interface ListingDetailPageProps {
  code: string;
  onBack?: () => void;
}

export const ListingDetailPage: React.FC<ListingDetailPageProps> = ({ code, onBack }) => {
  const [listing, setListing] = useState<AccountListingDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number>(0);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);

    marketplaceApi.getListing(code)
      .then(res => {
        if (mounted) {
          setListing(res.listing);
          setLoading(false);
        }
      })
      .catch(err => {
        if (mounted) {
          setError(err.message || 'الإعلان غير موجود أو غير متاح حالياً.');
          setLoading(false);
        }
      });

    return () => { mounted = false; };
  }, [code]);

  const handleCopyLink = () => {
    const fullUrl = window.location.href;
    navigator.clipboard.writeText(fullUrl).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    });
  };

  const handleCopyCode = () => {
    if (!listing) return;
    navigator.clipboard.writeText(listing.public_code).then(() => {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2500);
    });
  };

  if (loading) {
    return (
      <div className={styles.pageContainer} style={{ textAlign: 'center', padding: '100px 20px' }}>
        <div className="spinner" style={{ margin: '0 auto 16px' }} />
        <p style={{ color: '#9CA3AF' }}>جارٍ تحميل تفاصيل الحساب...</p>
      </div>
    );
  }

  if (error || !listing) {
    return (
      <div className={styles.pageContainer} style={{ textAlign: 'center', padding: '80px 20px' }}>
        <AlertCircle size={48} color="#EF4444" style={{ margin: '0 auto 16px' }} />
        <h2 style={{ color: '#F9FAFB', marginBottom: 12 }}>{error || 'الإعلان غير متاح'}</h2>
        <p style={{ color: '#9CA3AF', marginBottom: 24, maxWidth: 450, margin: '0 auto 24px' }}>
          قد يكون الإعلان قد انتهت صلاحيته أو تم بيعه، أو أن الرابط غير صحيح.
        </p>
        <button
          type="button"
          className={styles.primaryBtn}
          onClick={() => {
            if (onBack) onBack();
            else {
              window.history.pushState({}, '', '/marketplace');
              window.dispatchEvent(new PopStateEvent('popstate'));
            }
          }}
          style={{ margin: '0 auto' }}
        >
          العودة إلى سوق الحسابات
        </button>
      </div>
    );
  }

  const isPubg = listing.game === 'PUBG_MOBILE';
  const gameTitle = isPubg ? 'ببجي موبايل (PUBG Mobile)' : 'فري فاير (Free Fire)';
  const currentImage = listing.images[selectedImageIndex]?.image_url || listing.primary_image || '';

  // Admin WhatsApp Contact URL with fallback
  const simpleGame = isPubg ? 'PUBG Mobile' : 'Free Fire';
  const prefilledText = `السلام عليكم، أرغب في شراء الحساب رقم ${listing.public_code}.\nاللعبة: ${simpleGame}\nالسعر: ${Number(listing.price).toLocaleString()} SDG\nالسعر قابل للتفاوض: ${listing.is_negotiable ? 'نعم' : 'لا'}`;
  const whatsappUrl = listing.whatsappContactUrl || `https://wa.me/249900000000?text=${encodeURIComponent(prefilledText)}`;

  return (
    <div className={styles.pageContainer}>
      {/* Top Navigation & Breadcrumbs */}
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
          <span>الرجوع إلى السوق</span>
        </button>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={handleCopyCode}
            style={{ padding: '6px 12px', fontSize: '0.82rem' }}
          >
            {copiedCode ? <Check size={14} color="#10B981" /> : <Copy size={14} />}
            <span>كود: {listing.public_code}</span>
          </button>

          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={handleCopyLink}
            style={{ padding: '6px 12px', fontSize: '0.82rem' }}
          >
            {copiedLink ? <Check size={14} color="#10B981" /> : <Share2 size={14} />}
            <span>{copiedLink ? 'تم النسخ!' : 'مشاركة'}</span>
          </button>
        </div>
      </div>

      {/* Main Detail Grid */}
      <div className={styles.detailContainer}>
        {/* Left Column: Media Gallery & Full Description */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Gallery Section */}
          <div className={styles.gallerySection}>
            <div className={styles.mainImageWrapper}>
              <img
                src={currentImage}
                alt={listing.title}
                className={styles.mainGalleryImage}
              />
              <span className={styles.adCodeBadge}>{listing.public_code}</span>
              <span className={styles.adGameBadge}>
                {isPubg ? <Gamepad2 size={13} style={{ display: 'inline', marginLeft: 4 }} /> : <Flame size={13} style={{ display: 'inline', marginLeft: 4 }} />}
                {gameTitle}
              </span>
            </div>

            {/* Thumbnails Row */}
            {listing.images.length > 1 && (
              <div className={styles.thumbnailsRow}>
                {listing.images.map((img, idx) => (
                  <button
                    key={img.id || idx}
                    type="button"
                    className={`${styles.thumbnailBtn} ${selectedImageIndex === idx ? styles.thumbnailActive : ''}`}
                    onClick={() => setSelectedImageIndex(idx)}
                    aria-label={`عرض الصورة ${idx + 1}`}
                  >
                    <img src={img.image_url} alt={`صورة ${idx + 1}`} className={styles.thumbnailImg} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Description Box */}
          <div className={styles.detailCard}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#F9FAFB', margin: 0 }}>
              وصف الحساب والمميزات
            </h2>
            <div style={{
              color: '#D1D5DB',
              lineHeight: 1.8,
              fontSize: '0.95rem',
              whiteSpace: 'pre-wrap'
            }}>
              {listing.description}
            </div>

            {listing.notes && (
              <div style={{
                background: '#1F2937',
                border: '1px solid #374151',
                borderRadius: 10,
                padding: 14,
                marginTop: 8
              }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#F59E0B', display: 'block', marginBottom: 4 }}>
                  ملاحظات إضافية من البائع:
                </span>
                <p style={{ margin: 0, color: '#9CA3AF', fontSize: '0.9rem' }}>
                  {listing.notes}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Pricing, Specs & Purchase CTA */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Main Summary Box */}
          <div className={styles.detailCard}>
            <h1 style={{ fontSize: '1.45rem', fontWeight: 900, color: '#FFFFFF', margin: 0, lineHeight: 1.35 }}>
              {listing.title}
            </h1>

            {/* Price Box */}
            <div className={styles.detailPriceBox}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#9CA3AF' }}>السعر المطلوب:</span>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <div>
                  <span style={{ fontSize: '2rem', fontWeight: 900, color: '#F59E0B' }}>
                    {Number(listing.price).toLocaleString()}
                  </span>
                  <span style={{ fontSize: '1rem', fontWeight: 700, color: '#9CA3AF', marginRight: 6 }}>
                    SDG
                  </span>
                </div>

                <span className={listing.is_negotiable ? styles.negotiableTag : styles.metaBadge}>
                  {listing.is_negotiable ? 'قابل للتفاوض' : 'غير قابل للتفاوض'}
                </span>
              </div>
            </div>

            {/* Official Admin WhatsApp Purchase CTA */}
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.whatsappBuyBtn}
            >
              <MessageCircle size={22} />
              <span>أرغب في شراء هذا الحساب</span>
            </a>

            {/* Specs Table */}
            <div className={styles.specsTable}>
              <div className={styles.specsRow}>
                <span className={styles.specsLabel}>كود الإعلان:</span>
                <span className={styles.specsVal} style={{ fontFamily: 'monospace', color: '#F59E0B' }}>
                  {listing.public_code}
                </span>
              </div>

              <div className={styles.specsRow}>
                <span className={styles.specsLabel}>اللعبة:</span>
                <span className={styles.specsVal}>{gameTitle}</span>
              </div>

              <div className={styles.specsRow}>
                <span className={styles.specsLabel}>مستوى الحساب:</span>
                <span className={styles.specsVal}>{listing.account_level}</span>
              </div>

              <div className={styles.specsRow}>
                <span className={styles.specsLabel}>نوع الربط:</span>
                <span className={styles.specsVal}>{listing.binding_type}</span>
              </div>

              {listing.published_at && (
                <div className={styles.specsRow}>
                  <span className={styles.specsLabel}>تاريخ النشر:</span>
                  <span className={styles.specsVal}>
                    {new Date(listing.published_at).toLocaleDateString('ar-SD')}
                  </span>
                </div>
              )}

              {listing.expires_at && (
                <div className={styles.specsRow}>
                  <span className={styles.specsLabel}>ينتهي العرض في:</span>
                  <span className={styles.specsVal}>
                    {new Date(listing.expires_at).toLocaleDateString('ar-SD')}
                  </span>
                </div>
              )}
            </div>

            {/* Privacy & Brokerage Guarantee Notice */}
            <div className={styles.disclaimerBox}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#10B981', fontWeight: 800, marginBottom: 4 }}>
                <ShieldCheck size={16} />
                <span>وساطة وضمان المنصة</span>
              </div>
              <p style={{ margin: 0 }}>
                يتم التواصل حصرياً مع إدارة المنصة، ويتم التحقق من بيانات الحساب قبل إتمام أي معاملة حرصاً على سلامتك.
                بيانات البائعين محمية بالكامل داخل أنظمة KIROPRO.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
