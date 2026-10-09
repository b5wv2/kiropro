import React, { useState, useEffect } from 'react';
import { marketplaceApi } from '../../services/marketplaceApi';
import { getMarketplaceImageUrl, DEFAULT_MARKETPLACE_PLACEHOLDER } from '../../utils/imageUrl';
import {
  Store,
  XCircle,
  Search,
  Eye,
  Settings,
  ShieldAlert,
  Check,
  Maximize2,
  X,
  ExternalLink,
  User,
  Wallet,
  Gamepad2,
  Flame
} from 'lucide-react';

export const AdminMarketplace: React.FC = () => {
  const [stats, setStats] = useState<any>(null);
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [currentTab, setCurrentTab] = useState<string>('PENDING_REVIEW');
  const [search, setSearch] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [_totalPages, setTotalPages] = useState<number>(1);

  // Detail Modal
  const [selectedListing, setSelectedListing] = useState<any | null>(null);
  const [activeModalImageIndex, setActiveModalImageIndex] = useState<number>(0);
  const [adminLightboxUrl, setAdminLightboxUrl] = useState<string | null>(null);

  // Reject Modal
  const [rejectingListing, setRejectingListing] = useState<any | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('بيانات غير صحيحة');
  const [rejectNotes, setRejectNotes] = useState<string>('');
  const [isRejecting, setIsRejecting] = useState<boolean>(false);

  // Cancel & Refund Modal
  const [refundingListing, setRefundingListing] = useState<any | null>(null);
  const [refundReason, setRefundReason] = useState<string>('إلغاء بطلب من الإدارة');
  const [refundNotes, setRefundNotes] = useState<string>('');
  const [isRefunding, setIsRefunding] = useState<boolean>(false);

  // Settings Edit State
  const [fee15, setFee15] = useState<number>(1500);
  const [fee30, setFee30] = useState<number>(2500);
  const [marketEnabled, setMarketEnabled] = useState<boolean>(true);
  const [savingSettings, setSavingSettings] = useState<boolean>(false);

  const fetchStats = () => {
    marketplaceApi.adminGetStats()
      .then(res => {
        setStats(res.stats);
        setFee15(res.settings.fee_15_days);
        setFee30(res.settings.fee_30_days);
        setMarketEnabled(res.settings.enabled);
      })
      .catch(e => console.warn('Failed to load admin marketplace stats:', e));
  };

  const fetchListings = () => {
    setLoading(true);
    marketplaceApi.adminGetListings({
      status: currentTab,
      search: search.trim() || undefined,
      page,
      limit: 20
    })
      .then(res => {
        setListings(res.listings);
        setTotalPages(res.pagination.totalPages || 1);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load listings:', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    if (currentTab !== 'SETTINGS') {
      fetchListings();
    }
  }, [currentTab, search, page]);

  const handleApprove = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من قبول ونشر هذا الإعلان في السوق؟')) return;

    try {
      await marketplaceApi.adminApprove(id);
      alert('تم قبول ونشر الإعلان بنجاح!');
      fetchStats();
      fetchListings();
      if (selectedListing?.id === id) setSelectedListing(null);
    } catch (err: any) {
      alert(err.message || 'فشل قبول الإعلان.');
    }
  };

  const handleRejectConfirm = async () => {
    if (!rejectingListing) return;
    setIsRejecting(true);

    try {
      await marketplaceApi.adminReject(rejectingListing.id, rejectReason, rejectNotes);
      alert('تم رفض الإعلان بنجاح.');
      setRejectingListing(null);
      fetchStats();
      fetchListings();
      if (selectedListing?.id === rejectingListing.id) setSelectedListing(null);
    } catch (err: any) {
      alert(err.message || 'فشل رفض الإعلان.');
    } finally {
      setIsRejecting(false);
    }
  };

  const handleCancelRefundConfirm = async () => {
    if (!refundingListing) return;
    setIsRefunding(true);

    try {
      const res = await marketplaceApi.adminCancelRefund(
        refundingListing.id,
        refundReason,
        refundNotes
      );
      alert(res.message || 'تم إلغاء الإعلان واسترداد الرسوم بنجاح.');
      setRefundingListing(null);
      fetchStats();
      fetchListings();
      if (selectedListing?.id === refundingListing.id) setSelectedListing(null);
    } catch (err: any) {
      alert(err.message || 'فشل إلغاء واسترداد رسوم الإعلان.');
    } finally {
      setIsRefunding(false);
    }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      await marketplaceApi.adminUpdateSettings({
        fee15Days: Number(fee15),
        fee30Days: Number(fee30),
        enabled: marketEnabled
      });
      alert('تم تحديث إعدادات سوق الحسابات بنجاح!');
      fetchStats();
    } catch (err: any) {
      alert(err.message || 'فشل تحديث الإعدادات.');
    } finally {
      setSavingSettings(false);
    }
  };

  const openDetail = async (id: string) => {
    try {
      const res = await marketplaceApi.adminGetListing(id);
      setSelectedListing(res.listing);
      setActiveModalImageIndex(0);
    } catch (err: any) {
      alert('فشل جلب تفاصيل الإعلان.');
    }
  };

  const structuredRejectReasons = [
    'بيانات غير صحيحة',
    'صور غير واضحة',
    'إعلان مخالف',
    'معلومات ناقصة',
    'حساب غير مناسب للقسم',
    'طلب من البائع',
    'سبب آخر'
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, direction: 'rtl' }}>
      {/* Page Title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 900, color: '#F9FAFB', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Store size={28} color="#F59E0B" />
            <span>إدارة سوق الحسابات (Account Marketplace)</span>
          </h1>
          <p style={{ color: '#9CA3AF', margin: 0, fontSize: '0.9rem' }}>
            مراجعة واعتماد إعلانات حسابات ببجي وفري فاير، إدارة الرسوم، واسترداد المدفوعات.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setCurrentTab('SETTINGS')}
          style={{
            background: currentTab === 'SETTINGS' ? '#F59E0B' : '#1F2937',
            color: currentTab === 'SETTINGS' ? '#0B0F19' : '#E5E7EB',
            border: '1px solid #374151',
            borderRadius: 10,
            padding: '8px 16px',
            fontWeight: 800,
            fontSize: '0.9rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          <Settings size={18} />
          <span>إعدادات الرسوم والأسعار</span>
        </button>
      </div>

      {/* Stats Cards Grid */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
          <div style={{ background: '#111827', border: '1px solid #1F2937', borderRadius: 12, padding: 16 }}>
            <span style={{ color: '#9CA3AF', fontSize: '0.8rem', display: 'block', marginBottom: 4 }}>إجمالي الإعلانات</span>
            <span style={{ color: '#F9FAFB', fontSize: '1.5rem', fontWeight: 900 }}>{stats.totalListings}</span>
          </div>

          <div style={{ background: '#111827', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: 12, padding: 16 }}>
            <span style={{ color: '#F59E0B', fontSize: '0.8rem', display: 'block', marginBottom: 4 }}>قيد المراجعة</span>
            <span style={{ color: '#F59E0B', fontSize: '1.5rem', fontWeight: 900 }}>{stats.pendingReview}</span>
          </div>

          <div style={{ background: '#111827', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: 12, padding: 16 }}>
            <span style={{ color: '#10B981', fontSize: '0.8rem', display: 'block', marginBottom: 4 }}>منشور حالياً</span>
            <span style={{ color: '#10B981', fontSize: '1.5rem', fontWeight: 900 }}>{stats.publishedActive}</span>
          </div>

          <div style={{ background: '#111827', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: 12, padding: 16 }}>
            <span style={{ color: '#A78BFA', fontSize: '0.8rem', display: 'block', marginBottom: 4 }}>حسابات مباعة</span>
            <span style={{ color: '#A78BFA', fontSize: '1.5rem', fontWeight: 900 }}>{stats.sold}</span>
          </div>

          <div style={{ background: '#111827', border: '1px solid #1F2937', borderRadius: 12, padding: 16 }}>
            <span style={{ color: '#9CA3AF', fontSize: '0.8rem', display: 'block', marginBottom: 4 }}>منتهية الصلاحية</span>
            <span style={{ color: '#9CA3AF', fontSize: '1.5rem', fontWeight: 900 }}>{stats.expired}</span>
          </div>

          <div style={{ background: '#111827', border: '1px solid rgba(245, 158, 11, 0.2)', borderRadius: 12, padding: 16 }}>
            <span style={{ color: '#F59E0B', fontSize: '0.8rem', display: 'block', marginBottom: 4 }}>إجمالي رسوم النشر</span>
            <span style={{ color: '#F59E0B', fontSize: '1.25rem', fontWeight: 900 }}>
              {Number(stats.totalFeesCollected).toLocaleString()} SDG
            </span>
          </div>

          <div style={{ background: '#111827', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 12, padding: 16 }}>
            <span style={{ color: '#EF4444', fontSize: '0.8rem', display: 'block', marginBottom: 4 }}>إجمالي المستردات</span>
            <span style={{ color: '#EF4444', fontSize: '1.25rem', fontWeight: 900 }}>
              {Number(stats.totalRefunded).toLocaleString()} SDG
            </span>
          </div>
        </div>
      )}

      {/* Tabs Row */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6 }}>
        {[
          { id: 'PENDING_REVIEW', label: `قيد المراجعة (${stats?.pendingReview || 0})` },
          { id: 'PUBLISHED', label: 'المنشورة' },
          { id: 'ALL', label: 'كافة الإعلانات' },
          { id: 'SUSPENDED', label: 'المعلقة' },
          { id: 'EXPIRED', label: 'المنتهية' },
          { id: 'SOLD', label: 'المباعة' },
          { id: 'CANCELLED', label: 'الملغاة / المستردة' },
          { id: 'REJECTED', label: 'المرفوضة' }
        ].map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => { setCurrentTab(tab.id); setPage(1); }}
            style={{
              padding: '10px 18px',
              borderRadius: 8,
              background: currentTab === tab.id ? '#F59E0B' : '#111827',
              color: currentTab === tab.id ? '#0B0F19' : '#9CA3AF',
              border: '1px solid',
              borderColor: currentTab === tab.id ? '#F59E0B' : '#1F2937',
              fontWeight: 800,
              fontSize: '0.88rem',
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* SETTINGS VIEW */}
      {currentTab === 'SETTINGS' && (
        <div style={{
          background: '#111827',
          border: '1px solid #1F2937',
          borderRadius: 14,
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
          maxWidth: 600
        }}>
          <h2 style={{ color: '#F9FAFB', fontSize: '1.2rem', margin: 0 }}>إعدادات رسوم وتفعيل سوق الحسابات</h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ color: '#9CA3AF', fontSize: '0.85rem', fontWeight: 700 }}>
              رسوم نشر إعلان 15 يوماً (SDG)
            </label>
            <input
              type="number"
              value={fee15}
              onChange={(e) => setFee15(parseFloat(e.target.value) || 0)}
              style={{
                background: '#1F2937',
                border: '1px solid #374151',
                color: '#F9FAFB',
                padding: '10px 14px',
                borderRadius: 8,
                fontSize: '1rem'
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ color: '#9CA3AF', fontSize: '0.85rem', fontWeight: 700 }}>
              رسوم نشر إعلان 30 يوماً (SDG)
            </label>
            <input
              type="number"
              value={fee30}
              onChange={(e) => setFee30(parseFloat(e.target.value) || 0)}
              style={{
                background: '#1F2937',
                border: '1px solid #374151',
                color: '#F9FAFB',
                padding: '10px 14px',
                borderRadius: 8,
                fontSize: '1rem'
              }}
            />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', color: '#E5E7EB' }}>
            <input
              type="checkbox"
              checked={marketEnabled}
              onChange={(e) => setMarketEnabled(e.target.checked)}
              style={{ width: 18, height: 18, accentColor: '#F59E0B' }}
            />
            <span style={{ fontWeight: 800 }}>تفعيل استقبال الإعلانات وسوق الحسابات</span>
          </label>

          <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
            <button
              type="button"
              onClick={handleSaveSettings}
              disabled={savingSettings}
              style={{
                background: '#F59E0B',
                color: '#0B0F19',
                border: 'none',
                borderRadius: 8,
                padding: '10px 20px',
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              {savingSettings ? 'جارٍ الحفظ...' : 'حفظ الإعدادات'}
            </button>

            <button
              type="button"
              onClick={() => setCurrentTab('PENDING_REVIEW')}
              style={{
                background: '#1F2937',
                color: '#9CA3AF',
                border: '1px solid #374151',
                borderRadius: 8,
                padding: '10px 16px',
                cursor: 'pointer'
              }}
            >
              إلغاء
            </button>
          </div>
        </div>
      )}

      {/* LISTINGS TABLE */}
      {currentTab !== 'SETTINGS' && (
        <div style={{ background: '#111827', border: '1px solid #1F2937', borderRadius: 14, overflow: 'hidden' }}>
          {/* Search bar */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #1F2937', display: 'flex', gap: 12 }}>
            <div style={{ position: 'relative', flex: 1, maxWidth: 400 }}>
              <input
                type="text"
                placeholder="بحث بكود الإعلان، العنوان، رقم واتساب البائع، أو الإيميل..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  width: '100%',
                  background: '#1F2937',
                  border: '1px solid #374151',
                  color: '#F9FAFB',
                  padding: '9px 14px 9px 36px',
                  borderRadius: 8,
                  fontSize: '0.9rem'
                }}
              />
              <Search size={16} style={{ position: 'absolute', left: 12, top: 12, color: '#6B7280' }} />
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9CA3AF' }}>
              <p>جارٍ تحميل الإعلانات...</p>
            </div>
          ) : listings.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9CA3AF' }}>
              <p>لا توجد إعلانات مطابقة في هذا القسم.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ background: '#1F2937', color: '#9CA3AF', fontSize: '0.8rem', borderBottom: '1px solid #374151' }}>
                    <th style={{ padding: '12px 16px' }}>الكود</th>
                    <th style={{ padding: '12px 16px' }}>الصورة</th>
                    <th style={{ padding: '12px 16px' }}>عنوان الإعلان</th>
                    <th style={{ padding: '12px 16px' }}>اللعبة</th>
                    <th style={{ padding: '12px 16px' }}>السعر المطلوب</th>
                    <th style={{ padding: '12px 16px' }}>واتساب البائع (سري)</th>
                    <th style={{ padding: '12px 16px' }}>حساب البائع</th>
                    <th style={{ padding: '12px 16px' }}>المدة / الرسوم</th>
                    <th style={{ padding: '12px 16px' }}>الحالة</th>
                    <th style={{ padding: '12px 16px', textAlign: 'center' }}>الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {listings.map(item => (
                    <tr key={item.id} style={{ borderBottom: '1px solid #1F2937' }}>
                      <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: '#F59E0B', fontWeight: 800 }}>
                        {item.public_code}
                      </td>

                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ width: 48, height: 36, borderRadius: 6, overflow: 'hidden', background: '#1F2937' }}>
                          <img
                            src={getMarketplaceImageUrl(item.primary_image)}
                            alt=""
                            onError={(e) => { (e.currentTarget as HTMLImageElement).src = DEFAULT_MARKETPLACE_PLACEHOLDER; }}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        </div>
                      </td>

                      <td style={{ padding: '12px 16px', color: '#F9FAFB', fontWeight: 700, maxWidth: 220 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.title}
                        </div>
                      </td>

                      <td style={{ padding: '12px 16px', color: '#9CA3AF' }}>
                        {item.game === 'PUBG_MOBILE' ? 'ببجي' : 'فري فاير'}
                      </td>

                      <td style={{ padding: '12px 16px', color: '#F59E0B', fontWeight: 800 }}>
                        {Number(item.price).toLocaleString()} SDG
                      </td>

                      {/* PRIVATE SELLER WHATSAPP - STRICTLY ADMIN ONLY */}
                      <td style={{ padding: '12px 16px', color: '#10B981', fontFamily: 'monospace', fontWeight: 800 }} dir="ltr">
                        {item.seller_whatsapp}
                      </td>

                      <td style={{ padding: '12px 16px', color: '#9CA3AF', fontSize: '0.8rem' }}>
                        <div>{item.seller_name}</div>
                        <div style={{ color: '#6B7280' }}>{item.seller_email}</div>
                      </td>

                      <td style={{ padding: '12px 16px', color: '#9CA3AF' }}>
                        <div>{item.duration_days} يوم</div>
                        <div style={{ color: '#F59E0B', fontSize: '0.75rem' }}>{Number(item.fee_amount || item.listing_fee).toLocaleString()} SDG</div>
                      </td>

                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          fontSize: '0.75rem',
                          fontWeight: 800,
                          padding: '3px 8px',
                          borderRadius: 6,
                          background: item.status === 'PUBLISHED' ? 'rgba(16,185,129,0.15)' : item.status === 'PENDING_REVIEW' ? 'rgba(245,158,11,0.15)' : 'rgba(107,114,128,0.2)',
                          color: item.status === 'PUBLISHED' ? '#34D399' : item.status === 'PENDING_REVIEW' ? '#FBBF24' : '#9CA3AF'
                        }}>
                          {item.status}
                        </span>
                      </td>

                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                          <button
                            type="button"
                            onClick={() => openDetail(item.id)}
                            title="عرض التفاصيل والصور"
                            style={{
                              background: '#1F2937',
                              border: '1px solid #374151',
                              color: '#E5E7EB',
                              borderRadius: 6,
                              padding: '5px 10px',
                              cursor: 'pointer'
                            }}
                          >
                            <Eye size={15} />
                          </button>

                          {item.status === 'PENDING_REVIEW' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleApprove(item.id)}
                                title="قبول ونشر الإعلان"
                                style={{
                                  background: 'rgba(16, 185, 129, 0.2)',
                                  border: '1px solid #10B981',
                                  color: '#34D399',
                                  borderRadius: 6,
                                  padding: '5px 10px',
                                  cursor: 'pointer'
                                }}
                              >
                                <Check size={15} />
                              </button>

                              <button
                                type="button"
                                onClick={() => setRejectingListing(item)}
                                title="رفض الإعلان"
                                style={{
                                  background: 'rgba(239, 68, 68, 0.2)',
                                  border: '1px solid #EF4444',
                                  color: '#F87171',
                                  borderRadius: 6,
                                  padding: '5px 10px',
                                  cursor: 'pointer'
                                }}
                              >
                                <XCircle size={15} />
                              </button>
                            </>
                          )}

                          {item.status !== 'CANCELLED' && item.payment_status === 'PAID' && (
                            <button
                              type="button"
                              onClick={() => setRefundingListing(item)}
                              title="إلغاء واسترداد الرسوم"
                              style={{
                                background: 'rgba(245, 158, 11, 0.15)',
                                border: '1px solid #F59E0B',
                                color: '#F59E0B',
                                borderRadius: 6,
                                padding: '5px 10px',
                                cursor: 'pointer',
                                fontSize: '0.75rem',
                                fontWeight: 800
                              }}
                            >
                              إلغاء+استرداد
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* FULL DETAIL REVIEW MODAL */}
      {selectedListing && (() => {
        const modalImages: Array<{ url: string; isPrimary: boolean; key: any }> = (
          selectedListing.images && selectedListing.images.length > 0
            ? selectedListing.images.map((img: any, idx: number) => ({
                url: getMarketplaceImageUrl(img.image_url),
                isPrimary: Boolean(img.is_primary),
                key: img.id || idx
              }))
            : selectedListing.primary_image
              ? [{ url: getMarketplaceImageUrl(selectedListing.primary_image), isPrimary: true, key: 'primary' }]
              : [{ url: DEFAULT_MARKETPLACE_PLACEHOLDER, isPrimary: true, key: 'fallback' }]
        );
        const activeImg = modalImages[activeModalImageIndex] || modalImages[0];
        const isPubg = selectedListing.game === 'PUBG_MOBILE';
        const cleanWhatsapp = (selectedListing.seller_whatsapp || '').replace(/[^0-9]/g, '');

        return (
          <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.88)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 16
          }}>
            <div style={{
              background: '#0F172A',
              border: '1px solid #1E293B',
              borderRadius: 18,
              maxWidth: 880,
              width: '100%',
              maxHeight: '92vh',
              overflowY: 'auto',
              padding: 24,
              display: 'flex',
              flexDirection: 'column',
              gap: 20,
              direction: 'rtl',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)'
            }}>
              {/* Modal Header */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingBottom: 16,
                borderBottom: '1px solid #1E293B',
                flexWrap: 'wrap',
                gap: 12
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{
                    background: '#1E293B',
                    color: '#F59E0B',
                    fontFamily: 'monospace',
                    fontWeight: 900,
                    padding: '4px 12px',
                    borderRadius: 8,
                    fontSize: '1rem',
                    border: '1px solid #334155'
                  }}>
                    {selectedListing.public_code}
                  </span>

                  <span style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 10px',
                    borderRadius: 8,
                    fontSize: '0.82rem',
                    fontWeight: 800,
                    background: isPubg ? 'rgba(245, 158, 11, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                    color: isPubg ? '#FBBF24' : '#F87171'
                  }}>
                    {isPubg ? <Gamepad2 size={15} /> : <Flame size={15} />}
                    {isPubg ? 'ببجي موبايل' : 'فري فاير'}
                  </span>

                  <span style={{
                    fontSize: '0.8rem',
                    fontWeight: 800,
                    padding: '4px 10px',
                    borderRadius: 8,
                    background: selectedListing.status === 'PUBLISHED' ? 'rgba(16, 185, 129, 0.15)' : selectedListing.status === 'PENDING_REVIEW' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(107, 114, 128, 0.2)',
                    color: selectedListing.status === 'PUBLISHED' ? '#34D399' : selectedListing.status === 'PENDING_REVIEW' ? '#FBBF24' : '#9CA3AF'
                  }}>
                    {selectedListing.status}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedListing(null)}
                  style={{
                    background: '#1E293B',
                    border: '1px solid #334155',
                    color: '#9CA3AF',
                    cursor: 'pointer',
                    borderRadius: 8,
                    padding: 6,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  aria-label="إغلاق"
                >
                  <X size={18} />
                </button>
              </div>

              {/* HERO IMAGE & THUMBNAILS GALLERY */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Hero Box */}
                <div style={{
                  position: 'relative',
                  width: '100%',
                  height: 360,
                  borderRadius: 14,
                  overflow: 'hidden',
                  background: 'radial-gradient(circle at center, #1E293B, #0B0F19)',
                  border: '1px solid #334155',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <img
                    src={activeImg.url}
                    alt={selectedListing.title}
                    onError={(e) => { (e.currentTarget as HTMLImageElement).src = DEFAULT_MARKETPLACE_PLACEHOLDER; }}
                    onClick={() => setAdminLightboxUrl(activeImg.url)}
                    style={{
                      maxWidth: '100%',
                      maxHeight: '100%',
                      objectFit: 'contain',
                      cursor: 'zoom-in',
                      transition: 'transform 0.2s ease'
                    }}
                  />

                  {/* Badges on Hero */}
                  <div style={{
                    position: 'absolute',
                    top: 12,
                    right: 12,
                    display: 'flex',
                    gap: 8,
                    zIndex: 2
                  }}>
                    <span style={{
                      background: 'rgba(15, 23, 42, 0.85)',
                      backdropFilter: 'blur(6px)',
                      color: '#F9FAFB',
                      padding: '4px 10px',
                      borderRadius: 6,
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      border: '1px solid rgba(255, 255, 255, 0.1)'
                    }}>
                      صورة {activeModalImageIndex + 1} من {modalImages.length}
                    </span>
                    {activeImg.isPrimary && (
                      <span style={{
                        background: 'rgba(245, 158, 11, 0.9)',
                        color: '#0B0F19',
                        padding: '4px 10px',
                        borderRadius: 6,
                        fontSize: '0.8rem',
                        fontWeight: 900
                      }}>
                        الرئيسية
                      </span>
                    )}
                  </div>

                  {/* Zoom button on Hero */}
                  <div style={{
                    position: 'absolute',
                    top: 12,
                    left: 12,
                    display: 'flex',
                    gap: 8,
                    zIndex: 2
                  }}>
                    <button
                      type="button"
                      onClick={() => setAdminLightboxUrl(activeImg.url)}
                      style={{
                        background: 'rgba(15, 23, 42, 0.85)',
                        backdropFilter: 'blur(6px)',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        color: '#F9FAFB',
                        borderRadius: 8,
                        padding: '6px 12px',
                        fontSize: '0.8rem',
                        fontWeight: 800,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        cursor: 'pointer'
                      }}
                    >
                      <Maximize2 size={14} />
                      <span>تكبير</span>
                    </button>

                    <a
                      href={activeImg.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        background: 'rgba(15, 23, 42, 0.85)',
                        backdropFilter: 'blur(6px)',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        color: '#9CA3AF',
                        borderRadius: 8,
                        padding: '6px 10px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textDecoration: 'none'
                      }}
                      title="فتح في تبويب جديد"
                    >
                      <ExternalLink size={14} />
                    </a>
                  </div>
                </div>

                {/* Thumbnails Row */}
                {modalImages.length > 1 && (
                  <div style={{
                    display: 'flex',
                    gap: 10,
                    overflowX: 'auto',
                    padding: '4px 2px 8px',
                    scrollbarWidth: 'thin'
                  }}>
                    {modalImages.map((img, idx) => (
                      <button
                        key={img.key}
                        type="button"
                        onClick={() => setActiveModalImageIndex(idx)}
                        style={{
                          width: 88,
                          height: 64,
                          borderRadius: 8,
                          overflow: 'hidden',
                          flexShrink: 0,
                          border: activeModalImageIndex === idx ? '2px solid #F59E0B' : '1px solid #334155',
                          opacity: activeModalImageIndex === idx ? 1 : 0.65,
                          transform: activeModalImageIndex === idx ? 'scale(1.03)' : 'scale(1)',
                          transition: 'all 0.15s ease',
                          cursor: 'pointer',
                          padding: 0,
                          background: '#1E293B'
                        }}
                      >
                        <img
                          src={img.url}
                          alt=""
                          onError={(e) => { (e.currentTarget as HTMLImageElement).src = DEFAULT_MARKETPLACE_PLACEHOLDER; }}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* LISTING TITLE & DESCRIPTION */}
              <div style={{
                background: '#1E293B',
                border: '1px solid #334155',
                borderRadius: 12,
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 10
              }}>
                <h3 style={{ color: '#F9FAFB', fontWeight: 900, fontSize: '1.2rem', margin: 0 }}>
                  {selectedListing.title}
                </h3>
                <div style={{ color: '#D1D5DB', fontSize: '0.92rem', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                  {selectedListing.description}
                </div>
                {selectedListing.notes && (
                  <div style={{
                    background: 'rgba(245, 158, 11, 0.08)',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                    borderRadius: 8,
                    padding: '10px 14px',
                    color: '#FBBF24',
                    fontSize: '0.85rem'
                  }}>
                    <strong>ملاحظات البائع الإضافية:</strong> {selectedListing.notes}
                  </div>
                )}
              </div>

              {/* TWO INFORMATION CARDS: SELLER + SPECS */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
                {/* CARD 1: AUTHENTIC SELLER INFORMATION */}
                <div style={{
                  background: '#1E293B',
                  border: '1px solid #334155',
                  borderRadius: 12,
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#38BDF8', fontWeight: 800, fontSize: '0.95rem' }}>
                    <User size={18} />
                    <span>بيانات البائع الحقيقية والمالية</span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.88rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #293548', paddingBottom: 6 }}>
                      <span style={{ color: '#9CA3AF' }}>اسم المستخدم:</span>
                      <strong style={{ color: '#F9FAFB' }}>{selectedListing.seller_name || 'غير معروف'}</strong>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #293548', paddingBottom: 6 }}>
                      <span style={{ color: '#9CA3AF' }}>البريد الإلكتروني:</span>
                      <span style={{ color: '#9CA3AF', fontFamily: 'monospace', fontSize: '0.82rem' }}>{selectedListing.seller_email || 'غير متوفر'}</span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #293548', paddingBottom: 6 }}>
                      <span style={{ color: '#9CA3AF' }}>واتساب البائع:</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: '#10B981', fontFamily: 'monospace', fontWeight: 900 }} dir="ltr">
                          {selectedListing.seller_whatsapp}
                        </span>
                        {cleanWhatsapp && (
                          <a
                            href={`https://wa.me/${cleanWhatsapp}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              background: 'rgba(16, 185, 129, 0.2)',
                              color: '#34D399',
                              border: '1px solid #10B981',
                              borderRadius: 6,
                              padding: '2px 8px',
                              fontSize: '0.75rem',
                              fontWeight: 800,
                              textDecoration: 'none'
                            }}
                          >
                            مراسلة
                          </a>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #293548', paddingBottom: 6 }}>
                      <span style={{ color: '#9CA3AF' }}>رصيد المحفظة الحالي:</span>
                      <strong style={{ color: '#34D399', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Wallet size={14} />
                        <span>
                          {selectedListing.seller_wallet_balance != null
                            ? `${Number(selectedListing.seller_wallet_balance).toLocaleString()} SDG`
                            : 'غير متوفر'}
                        </span>
                      </strong>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#9CA3AF' }}>رسوم النشر المدفوعة:</span>
                      <strong style={{ color: '#F59E0B' }}>
                        {Number(selectedListing.fee_amount || selectedListing.listing_fee || 0).toLocaleString()} SDG
                      </strong>
                    </div>
                  </div>
                </div>

                {/* CARD 2: ACCOUNT SPECS */}
                <div style={{
                  background: '#1E293B',
                  border: '1px solid #334155',
                  borderRadius: 12,
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#F59E0B', fontWeight: 800, fontSize: '0.95rem' }}>
                    <ShieldAlert size={18} />
                    <span>مواصفات وتفاصيل الحساب</span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.88rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #293548', paddingBottom: 6 }}>
                      <span style={{ color: '#9CA3AF' }}>السعر المطلوب:</span>
                      <strong style={{ color: '#F59E0B', fontSize: '1.05rem', fontWeight: 900 }}>
                        {Number(selectedListing.price).toLocaleString()} SDG
                      </strong>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #293548', paddingBottom: 6 }}>
                      <span style={{ color: '#9CA3AF' }}>مستوى الحساب:</span>
                      <strong style={{ color: '#F9FAFB' }}>{selectedListing.account_level}</strong>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #293548', paddingBottom: 6 }}>
                      <span style={{ color: '#9CA3AF' }}>الرانك / التصنيف:</span>
                      <strong style={{ color: '#F9FAFB' }}>{selectedListing.rank || '—'}</strong>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #293548', paddingBottom: 6 }}>
                      <span style={{ color: '#9CA3AF' }}>طريقة الربط:</span>
                      <strong style={{ color: '#F9FAFB' }}>{selectedListing.binding_type}</strong>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #293548', paddingBottom: 6 }}>
                      <span style={{ color: '#9CA3AF' }}>التفاوض على السعر:</span>
                      <strong style={{ color: selectedListing.is_negotiable ? '#34D399' : '#9CA3AF' }}>
                        {selectedListing.is_negotiable ? 'نعم (قابل للتفاوض)' : 'لا (نهائي)'}
                      </strong>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#9CA3AF' }}>مدة العرض في السوق:</span>
                      <strong style={{ color: '#F9FAFB' }}>
                        {selectedListing.listing_duration_days || selectedListing.duration_days} يوم
                      </strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* AUDIT TIMELINE (IF EXISTS) */}
              {selectedListing.events && selectedListing.events.length > 0 && (
                <div style={{
                  background: '#1E293B',
                  border: '1px solid #334155',
                  borderRadius: 12,
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10
                }}>
                  <div style={{ color: '#9CA3AF', fontWeight: 800, fontSize: '0.85rem' }}>
                    سجل التغييرات والمراجعة ({selectedListing.events.length}):
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {selectedListing.events.map((evt: any, i: number) => (
                      <div key={i} style={{
                        fontSize: '0.8rem',
                        color: '#9CA3AF',
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '6px 10px',
                        background: '#0F172A',
                        borderRadius: 6
                      }}>
                        <span><strong>{evt.event_type}</strong> {evt.reason ? `— ${evt.reason}` : ''}</span>
                        <span style={{ fontFamily: 'monospace' }}>{new Date(evt.created_at).toLocaleDateString('ar-EG')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* MODAL ACTIONS BAR */}
              <div style={{
                display: 'flex',
                gap: 12,
                justifyContent: 'flex-end',
                paddingTop: 16,
                borderTop: '1px solid #1E293B',
                flexWrap: 'wrap'
              }}>
                {selectedListing.status === 'PENDING_REVIEW' && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleApprove(selectedListing.id)}
                      style={{
                        background: 'linear-gradient(135deg, #059669 0%, #10B981 100%)',
                        color: '#FFFFFF',
                        border: 'none',
                        borderRadius: 10,
                        padding: '10px 22px',
                        fontWeight: 900,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
                      }}
                    >
                      <Check size={18} />
                      <span>قبول ونشر الإعلان</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setRejectingListing(selectedListing)}
                      style={{
                        background: 'linear-gradient(135deg, #DC2626 0%, #EF4444 100%)',
                        color: '#FFFFFF',
                        border: 'none',
                        borderRadius: 10,
                        padding: '10px 22px',
                        fontWeight: 900,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)'
                      }}
                    >
                      <XCircle size={18} />
                      <span>رفض الإعلان</span>
                    </button>
                  </>
                )}

                {selectedListing.status !== 'CANCELLED' && selectedListing.payment_status === 'PAID' && (
                  <button
                    type="button"
                    onClick={() => setRefundingListing(selectedListing)}
                    style={{
                      background: 'rgba(245, 158, 11, 0.15)',
                      border: '1px solid #F59E0B',
                      color: '#F59E0B',
                      borderRadius: 10,
                      padding: '10px 18px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8
                    }}
                  >
                    <ShieldAlert size={16} />
                    <span>إلغاء واسترداد الرسوم</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setSelectedListing(null)}
                  style={{
                    background: '#1E293B',
                    color: '#E5E7EB',
                    border: '1px solid #334155',
                    borderRadius: 10,
                    padding: '10px 20px',
                    cursor: 'pointer',
                    fontWeight: 700
                  }}
                >
                  إغلاق
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ADMIN LIGHTBOX MODAL */}
      {adminLightboxUrl && (
        <div
          onClick={() => setAdminLightboxUrl(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.94)',
            zIndex: 100000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            cursor: 'zoom-out'
          }}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setAdminLightboxUrl(null);
            }}
            style={{
              position: 'absolute',
              top: 24,
              right: 24,
              background: 'rgba(15, 23, 42, 0.85)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              color: '#FFFFFF',
              borderRadius: 10,
              padding: 10,
              cursor: 'pointer',
              zIndex: 100001
            }}
          >
            <X size={24} />
          </button>

          <img
            src={adminLightboxUrl}
            alt="تكبير صورة الحساب"
            onClick={(e) => e.stopPropagation()}
            onError={(e) => { (e.currentTarget as HTMLImageElement).src = DEFAULT_MARKETPLACE_PLACEHOLDER; }}
            style={{
              maxWidth: '92vw',
              maxHeight: '92vh',
              objectFit: 'contain',
              borderRadius: 8,
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.9)',
              cursor: 'default'
            }}
          />
        </div>
      )}

      {/* REJECT MODAL */}
      {rejectingListing && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: 16
        }}>
          <div style={{
            background: '#111827',
            border: '1px solid #374151',
            borderRadius: 14,
            maxWidth: 440,
            width: '100%',
            padding: 22,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            direction: 'rtl'
          }}>
            <h3 style={{ color: '#F9FAFB', margin: 0 }}>رفض إعلان ({rejectingListing.public_code})</h3>

            <div>
              <label style={{ color: '#9CA3AF', fontSize: '0.85rem', display: 'block', marginBottom: 6 }}>
                سبب الرفض المنظم *
              </label>
              <select
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                style={{
                  width: '100%',
                  background: '#1F2937',
                  border: '1px solid #374151',
                  color: '#F9FAFB',
                  padding: '9px 12px',
                  borderRadius: 8
                }}
              >
                {structuredRejectReasons.map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ color: '#9CA3AF', fontSize: '0.85rem', display: 'block', marginBottom: 6 }}>
                ملاحظات تفصيلية للبائع (اختياري)
              </label>
              <textarea
                rows={3}
                value={rejectNotes}
                onChange={(e) => setRejectNotes(e.target.value)}
                placeholder="اكتب توضيحاً للبائع حول سبب الرفض..."
                style={{
                  width: '100%',
                  background: '#1F2937',
                  border: '1px solid #374151',
                  color: '#F9FAFB',
                  padding: '9px 12px',
                  borderRadius: 8
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setRejectingListing(null)}
                style={{
                  background: '#1F2937',
                  color: '#9CA3AF',
                  border: '1px solid #374151',
                  borderRadius: 8,
                  padding: '8px 16px',
                  cursor: 'pointer'
                }}
              >
                إلغاء
              </button>

              <button
                type="button"
                onClick={handleRejectConfirm}
                disabled={isRejecting}
                style={{
                  background: '#EF4444',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: 8,
                  padding: '8px 18px',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                {isRejecting ? 'جارٍ الرفض...' : 'تأكيد الرفض'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CANCEL + REFUND MODAL */}
      {refundingListing && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: 16
        }}>
          <div style={{
            background: '#111827',
            border: '1px solid #374151',
            borderRadius: 14,
            maxWidth: 460,
            width: '100%',
            padding: 22,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            direction: 'rtl'
          }}>
            <h3 style={{ color: '#F59E0B', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShieldAlert size={20} />
              <span>إلغاء الإعلان واسترداد الرسوم لمحظفة المستخدم</span>
            </h3>

            <p style={{ color: '#D1D5DB', fontSize: '0.9rem', margin: 0 }}>
              سيتم إلغاء الإعلان ({refundingListing.public_code}) وإعادة مبلغ{' '}
              <strong style={{ color: '#F59E0B' }}>
                {Number(refundingListing.fee_amount || refundingListing.listing_fee).toLocaleString()} SDG
              </strong>{' '}
              إلى محفظة البائع ({refundingListing.seller_name}) فوراً.
            </p>

            <div>
              <label style={{ color: '#9CA3AF', fontSize: '0.85rem', display: 'block', marginBottom: 6 }}>
                سبب الإلغاء والاسترداد *
              </label>
              <input
                type="text"
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                style={{
                  width: '100%',
                  background: '#1F2937',
                  border: '1px solid #374151',
                  color: '#F9FAFB',
                  padding: '9px 12px',
                  borderRadius: 8
                }}
              />
            </div>

            <div>
              <label style={{ color: '#9CA3AF', fontSize: '0.85rem', display: 'block', marginBottom: 6 }}>
                ملاحظات إضافية للمستخدم (اختياري)
              </label>
              <textarea
                rows={2}
                value={refundNotes}
                onChange={(e) => setRefundNotes(e.target.value)}
                placeholder="اكتب توضيحاً للاسترداد..."
                style={{
                  width: '100%',
                  background: '#1F2937',
                  border: '1px solid #374151',
                  color: '#F9FAFB',
                  padding: '9px 12px',
                  borderRadius: 8
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setRefundingListing(null)}
                style={{
                  background: '#1F2937',
                  color: '#9CA3AF',
                  border: '1px solid #374151',
                  borderRadius: 8,
                  padding: '8px 16px',
                  cursor: 'pointer'
                }}
              >
                تراجع
              </button>

              <button
                type="button"
                onClick={handleCancelRefundConfirm}
                disabled={isRefunding}
                style={{
                  background: '#F59E0B',
                  color: '#0B0F19',
                  border: 'none',
                  borderRadius: 8,
                  padding: '8px 18px',
                  fontWeight: 900,
                  cursor: 'pointer'
                }}
              >
                {isRefunding ? 'جارٍ الاسترداد...' : 'تأكيد الإلغاء والاسترداد'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
