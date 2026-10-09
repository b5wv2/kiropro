import React, { useState, useEffect } from 'react';
import { marketplaceApi, AccountListingDetail } from '../../services/marketplaceApi';
import { getMarketplaceImageUrl, DEFAULT_MARKETPLACE_PLACEHOLDER } from '../../utils/imageUrl';
import {
  ChevronRight,
  Share2,
  Copy,
  Check,
  ShieldCheck,
  Gamepad2,
  Flame,
  MessageCircle,
  AlertCircle,
  Maximize2,
  X,
  Camera
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
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

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

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      window.history.pushState({}, '', '/marketplace');
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
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
          className={styles.backBtn}
          onClick={handleBack}
          style={{ margin: '0 auto' }}
        >
          <ChevronRight size={18} />
          <span>العودة إلى سوق الحسابات</span>
        </button>
      </div>
    );
  }

  const isPubg = listing.game === 'PUBG_MOBILE';
  const gameTitle = isPubg ? 'ببجي موبايل (PUBG Mobile)' : 'فري فاير (Free Fire)';
  const currentImage = listing.images?.[selectedImageIndex]?.image_url || listing.primary_image || '';

  // Admin WhatsApp Contact URL with fallback (Brokered & Private)
  const simpleGame = isPubg ? 'PUBG Mobile' : 'Free Fire';
  const prefilledText = `السلام عليكم، أرغب في شراء الحساب رقم ${listing.public_code}.\nاللعبة: ${simpleGame}\nالسعر: ${Number(listing.price).toLocaleString()} SDG\nالسعر قابل للتفاوض: ${listing.is_negotiable ? 'نعم' : 'لا'}`;
  const whatsappUrl = listing.whatsappContactUrl || `https://wa.me/249900000000?text=${encodeURIComponent(prefilledText)}`;

  return (
    <div className={styles.pageContainer}>
      {/* 1. TOP NAVIGATION & BREADCRUMBS (الرجوع وكود الإعلان والمشاركة) */}
      <div className={styles.detailTopBar}>
        <button
          type="button"
          className={styles.backBtn}
          onClick={handleBack}
          aria-label="الرجوع إلى سوق الحسابات"
        >
          <ChevronRight size={18} />
          <span>الرجوع إلى السوق</span>
        </button>

        <div className={styles.topBarActions}>
          <button
            type="button"
            className={`${styles.actionBtn} ${styles.codeBadgeBtn}`}
            onClick={handleCopyCode}
            title="انقر لنسخ كود الإعلان"
          >
            {copiedCode ? <Check size={14} color="#10B981" /> : <Copy size={14} />}
            <span>كود: {listing.public_code}</span>
          </button>

          <button
            type="button"
            className={styles.actionBtn}
            onClick={handleCopyLink}
            title="نسخ رابط الإعلان للمشاركة"
          >
            {copiedLink ? <Check size={14} color="#10B981" /> : <Share2 size={14} />}
            <span>{copiedLink ? 'تم النسخ!' : 'مشاركة'}</span>
          </button>
        </div>
      </div>

      {/* 2. MAIN DETAIL GRID */}
      <div className={styles.detailGrid}>
        {/* BLOCK 1: MAIN IMAGE & THUMBNAILS GALLERY */}
        <div className={styles.galleryBlock}>
          <div className={styles.mainImageWrapper}>
            <img
              src={getMarketplaceImageUrl(currentImage)}
              alt={listing.title}
              className={styles.mainGalleryImage}
              onError={(e) => { (e.currentTarget as HTMLImageElement).src = DEFAULT_MARKETPLACE_PLACEHOLDER; }}
              onClick={() => setLightboxUrl(getMarketplaceImageUrl(currentImage))}
              title="انقر لتكبير صورة الحساب"
            />

            {/* Top-Right Image Counter */}
            {listing.images && listing.images.length > 0 && (
              <div className={styles.imageCounterBadge}>
                <Camera size={13} />
                <span>{selectedImageIndex + 1} / {listing.images.length}</span>
              </div>
            )}

            {/* Top-Left Zoom CTA */}
            <button
              type="button"
              className={styles.zoomBtn}
              onClick={() => setLightboxUrl(getMarketplaceImageUrl(currentImage))}
              aria-label="تكبير صورة الحساب"
            >
              <Maximize2 size={13} />
              <span>تكبير</span>
            </button>
          </div>

          {/* Thumbnails Strip */}
          {listing.images && listing.images.length > 1 && (
            <div className={styles.thumbnailsRow}>
              {listing.images.map((img, idx) => (
                <button
                  key={img.id || idx}
                  type="button"
                  className={`${styles.thumbnailBtn} ${selectedImageIndex === idx ? styles.thumbnailActive : ''}`}
                  onClick={() => setSelectedImageIndex(idx)}
                  aria-label={`عرض الصورة ${idx + 1}`}
                >
                  <img
                    src={getMarketplaceImageUrl(img.image_url)}
                    alt={`صورة ${idx + 1}`}
                    className={styles.thumbnailImg}
                    onError={(e) => { (e.currentTarget as HTMLImageElement).src = DEFAULT_MARKETPLACE_PLACEHOLDER; }}
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* BLOCK 2: TITLE & GAME BADGES */}
        <div className={`${styles.detailCard} ${styles.titleBlock}`}>
          <div className={styles.titleBadgesRow}>
            <span className={styles.gameBadge}>
              {isPubg ? <Gamepad2 size={14} /> : <Flame size={14} />}
              <span>{gameTitle}</span>
            </span>

            <span className={styles.metaPill}>
              المستوى: <strong>{listing.account_level}</strong>
            </span>

            {listing.rank && (
              <span className={styles.metaPill}>
                الرانك: <strong>{listing.rank}</strong>
              </span>
            )}

            <span className={styles.codePill} dir="ltr">
              {listing.public_code}
            </span>
          </div>

          <h1 className={styles.listingHeading}>
            {listing.title}
          </h1>
        </div>

        {/* BLOCK 3: DESCRIPTION CARD */}
        <div className={`${styles.detailCard} ${styles.descBlock}`}>
          <h2 className={styles.cardHeading}>وصف الحساب والمميزات</h2>
          <div className={styles.descriptionBox} dir="auto">
            {listing.description}
          </div>

          {listing.notes && (
            <div className={styles.notesCard} dir="auto">
              <span className={styles.notesLabel}>ملاحظات إضافية من البائع:</span>
              <p className={styles.notesText}>{listing.notes}</p>
            </div>
          )}
        </div>

        {/* BLOCK 4: PRICING & WHATSAPP PURCHASE CTA */}
        <div className={`${styles.detailCard} ${styles.ctaBlock}`}>
          <div className={styles.detailPriceBox}>
            <div className={styles.priceHeaderRow}>
              <span className={styles.priceLabel}>السعر المطلوب:</span>
              <span className={listing.is_negotiable ? styles.negotiableBadge : styles.fixedPriceBadge}>
                {listing.is_negotiable ? 'قابل للتفاوض' : 'سعر نهائي'}
              </span>
            </div>

            <div className={styles.priceValueRow}>
              <span className={styles.priceNumber}>
                {Number(listing.price).toLocaleString()}
              </span>
              <span className={styles.priceCurrency}>SDG</span>
            </div>
          </div>

          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.whatsappBuyBtn}
          >
            <MessageCircle size={22} className={styles.whatsappIcon} />
            <span className={styles.whatsappText}>أرغب في شراء هذا الحساب</span>
          </a>
        </div>

        {/* BLOCK 5: ACCOUNT SPECIFICATIONS */}
        <div className={`${styles.detailCard} ${styles.specsBlock}`}>
          <h2 className={styles.cardHeading}>مواصفات وتفاصيل الحساب</h2>
          <div className={styles.specsGrid}>
            <div className={styles.specItem}>
              <span className={styles.specLabel}>كود الإعلان</span>
              <span className={`${styles.specValue} ${styles.specCode}`} dir="ltr">
                {listing.public_code}
              </span>
            </div>

            <div className={styles.specItem}>
              <span className={styles.specLabel}>اللعبة</span>
              <span className={styles.specValue}>
                {gameTitle}
              </span>
            </div>

            <div className={styles.specItem}>
              <span className={styles.specLabel}>مستوى الحساب</span>
              <span className={styles.specValue}>
                {listing.account_level}
              </span>
            </div>

            {listing.rank && (
              <div className={styles.specItem}>
                <span className={styles.specLabel}>الرانك / التصنيف</span>
                <span className={styles.specValue}>
                  {listing.rank}
                </span>
              </div>
            )}

            <div className={styles.specItem}>
              <span className={styles.specLabel}>نوع الربط</span>
              <span className={styles.specValue}>
                {listing.binding_type}
              </span>
            </div>

            <div className={styles.specItem}>
              <span className={styles.specLabel}>تاريخ النشر</span>
              <span className={styles.specValue} dir="ltr">
                {listing.published_at
                  ? new Date(listing.published_at).toLocaleDateString('ar-SD')
                  : (listing.created_at ? new Date(listing.created_at).toLocaleDateString('ar-SD') : '—')}
              </span>
            </div>

            <div className={styles.specItem}>
              <span className={styles.specLabel}>ينتهي العرض في</span>
              <span className={styles.specValue} dir="ltr">
                {listing.expires_at
                  ? new Date(listing.expires_at).toLocaleDateString('ar-SD')
                  : '—'}
              </span>
            </div>
          </div>
        </div>

        {/* BLOCK 6: BROKERAGE GUARANTEE DISCLAIMER */}
        <div className={`${styles.disclaimerBox} ${styles.guaranteeBlock}`}>
          <div className={styles.disclaimerTitle}>
            <ShieldCheck size={18} />
            <span>وساطة وضمان منصة KIROPRO</span>
          </div>
          <p className={styles.disclaimerText}>
            يتم التواصل حصرياً مع إدارة المنصة للوساطة والتسليم الآمن. يتم التحقق من بيانات الحساب قبل إتمام أي معاملة حرصاً على سلامتك، وبيانات البائعين محمية بالكامل داخل أنظمة المنصة.
          </p>
        </div>
      </div>

      {/* FULLSCREEN LIGHTBOX MODAL */}
      {lightboxUrl && (
        <div className={styles.lightboxModal} onClick={() => setLightboxUrl(null)}>
          <button
            type="button"
            className={styles.lightboxCloseBtn}
            onClick={(e) => {
              e.stopPropagation();
              setLightboxUrl(null);
            }}
            aria-label="إغلاق المعاينة"
          >
            <X size={24} />
          </button>
          <div className={styles.lightboxContent} onClick={(e) => e.stopPropagation()}>
            <img
              src={lightboxUrl}
              alt="صورة الحساب مكبرة"
              className={styles.lightboxImage}
              onError={(e) => { (e.currentTarget as HTMLImageElement).src = DEFAULT_MARKETPLACE_PLACEHOLDER; }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
