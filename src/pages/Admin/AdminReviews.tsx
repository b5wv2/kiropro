import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { 
  Star, 
  CheckCircle2, 
  XCircle, 
  Link as LinkIcon, 
  Copy, 
  Check, 
  ExternalLink, 
  Search, 
  Plus, 
  ShieldCheck, 
  User, 
  RefreshCw, 
  ShoppingBag 
} from 'lucide-react';

interface Review {
  id: string;
  user_id?: string | null;
  order_id?: string | null;
  product_id?: string | null;
  product_name: string;
  rating: number;
  comment?: string | null;
  reviewer_type: 'AUTHENTICATED' | 'GUEST';
  customer_name: string;
  review_token_id?: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  admin_note?: string | null;
  created_at: string;
  user_name?: string | null;
  user_email?: string | null;
  order_full_id?: string | null;
  order_package_name?: string | null;
  token_label?: string | null;
  token_type?: string | null;
}

interface ReviewCounts {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
}

interface ReviewTokenRecord {
  id: string;
  token_hash: string;
  type: 'ORDER_SPECIFIC' | 'GENERAL';
  order_id?: string | null;
  product_id?: string | null;
  product_name?: string | null;
  label?: string | null;
  creator_name?: string | null;
  creator_email?: string | null;
  order_package_name?: string | null;
  max_uses: number;
  uses_count: number;
  is_active: boolean;
  expires_at?: string | null;
  created_at: string;
}

interface CompletedOrderOption {
  id: string;
  packageName: string;
  customerPriceUsd?: number;
  createdAt: string;
  userName?: string;
  userEmail?: string;
}

export const AdminReviews: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'moderation' | 'links'>('moderation');

  // Moderation state
  const [reviews, setReviews] = useState<Review[]>([]);
  const [counts, setCounts] = useState<ReviewCounts>({ total: 0, pending: 0, approved: 0, rejected: 0 });
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  const [searchQuery, setSearchQuery] = useState('');

  // Links state
  const [links, setLinks] = useState<ReviewTokenRecord[]>([]);
  const [loadingLinks, setLoadingLinks] = useState(false);

  // Generate Link Modal state
  const [isGeneratorModalOpen, setIsGeneratorModalOpen] = useState(false);
  const [linkType, setLinkType] = useState<'ORDER_SPECIFIC' | 'GENERAL'>('ORDER_SPECIFIC');
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [completedOrders, setCompletedOrders] = useState<CompletedOrderOption[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [generalProductName, setGeneralProductName] = useState('');
  const [generalLabel, setGeneralLabel] = useState('');
  const [generalMaxUses, setGeneralMaxUses] = useState(50);
  const [generalExpiryDays, setGeneralExpiryDays] = useState(30);
  const [generating, setGenerating] = useState(false);
  const [generatedLinkResult, setGeneratedLinkResult] = useState<{ url: string; token: string } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Action status state
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Fetch reviews
  const loadReviews = async () => {
    setLoadingReviews(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.append('status', statusFilter);
      if (searchQuery.trim()) params.append('search', searchQuery.trim());

      const res = await api.get<{ reviews: Review[]; counts: ReviewCounts }>(`/api/admin/reviews?${params.toString()}`);
      setReviews(res.reviews || []);
      setCounts(res.counts || { total: 0, pending: 0, approved: 0, rejected: 0 });
    } catch (err) {
      console.error('Failed to load reviews:', err);
    } finally {
      setLoadingReviews(false);
    }
  };

  // Fetch review links
  const loadLinks = async () => {
    setLoadingLinks(true);
    try {
      const res = await api.get<ReviewTokenRecord[]>('/api/admin/review-links');
      setLinks(res || []);
    } catch (err) {
      console.error('Failed to load review links:', err);
    } finally {
      setLoadingLinks(false);
    }
  };

  // Fetch completed orders for order-specific dropdown
  const loadCompletedOrders = async () => {
    setLoadingOrders(true);
    try {
      const res = await api.get<any>('/api/admin/orders?status=COMPLETED&limit=25');
      const ordersList: any[] = Array.isArray(res) ? res : (res?.orders || []);
      const completedOnly = ordersList.filter((o: any) => !o.status || o.status.toUpperCase() === 'COMPLETED');
      setCompletedOrders(completedOnly.map((o: any) => ({
        id: o.id,
        packageName: o.packageName || 'طلب ألعاب',
        createdAt: o.createdAt,
        userName: o.userName,
        userEmail: o.userEmail
      })));
    } catch (err) {
      console.error('Failed to load completed orders for modal:', err);
    } finally {
      setLoadingOrders(false);
    }
  };

  useEffect(() => {
    if (activeSubTab === 'moderation') {
      loadReviews();
    } else {
      loadLinks();
    }
  }, [activeSubTab, statusFilter]);

  const handleApprove = async (reviewId: string) => {
    setActionLoadingId(reviewId);
    try {
      await api.post(`/api/admin/reviews/${reviewId}/approve`, {});
      showToast('تم اعتماد المراجعة بنجاح وستظهر الآن للعامة ✓');
      loadReviews();
    } catch (err: any) {
      alert(err?.data?.error || 'فشل اعتماد المراجعة.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleReject = async (reviewId: string) => {
    const reason = window.prompt('يرجى كتابة سبب رفض المراجعة (ملاحظة داخلية):', 'لا يستوفي معايير النشر');
    if (reason === null) return;

    setActionLoadingId(reviewId);
    try {
      await api.post(`/api/admin/reviews/${reviewId}/reject`, { rejection_reason: reason });
      showToast('تم رفض المراجعة.');
      loadReviews();
    } catch (err: any) {
      alert(err?.data?.error || 'فشل رفض المراجعة.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleToggleLinkActive = async (linkId: string) => {
    try {
      const res = await api.post<{ message: string; isActive: boolean }>(`/api/admin/review-links/${linkId}/toggle`, {});
      showToast(res.message);
      loadLinks();
    } catch (err: any) {
      alert(err?.data?.error || 'فشل تغيير حالة الرابط.');
    }
  };

  const handleOpenGeneratorModal = () => {
    setGeneratedLinkResult(null);
    setCopiedLink(false);
    setIsGeneratorModalOpen(true);
    loadCompletedOrders();
  };

  const handleGenerateLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenerating(true);

    try {
      const payload: any = { type: linkType };
      if (linkType === 'ORDER_SPECIFIC') {
        if (!selectedOrderId) {
          alert('يرجى اختيار أو إدخال رقم الطلب.');
          setGenerating(false);
          return;
        }
        payload.orderId = selectedOrderId.trim();
      } else {
        payload.productName = generalProductName.trim() || 'تقييم تجربة متجر KIROPRO';
        payload.label = generalLabel.trim() || 'رابط تقييم عام للمتجر';
        payload.maxUses = Number(generalMaxUses) || 50;
        payload.expiryDays = Number(generalExpiryDays) || 30;
      }

      const res = await api.post<{ message: string; url?: string; reviewUrl?: string; token: string }>('/api/admin/review-links', payload);
      const linkUrl = res.reviewUrl || res.url || '';
      setGeneratedLinkResult({ url: linkUrl, token: res.token });
      showToast('تم توليد رابط التقييم بنجاح! ⚡');
      loadLinks();
    } catch (err: any) {
      const errMsg = err?.data?.error || err?.message || 'فشل توليد رابط التقييم.';
      alert(errMsg);
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    showToast('تم نسخ الرابط إلى الحافظة بنجاح 📋');
    setTimeout(() => setCopiedLink(false), 2500);
  };

  return (
    <div className="admin-page-container" dir="rtl">
      {/* Toast Notification */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          left: '24px',
          backgroundColor: '#0F172A',
          color: '#F59E0B',
          border: '1px solid #F59E0B',
          padding: '12px 20px',
          borderRadius: '10px',
          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)',
          zIndex: 99999,
          fontWeight: 700,
          fontSize: '14px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <CheckCircle2 size={18} color="#F59E0B" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Page Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px',
        marginBottom: '24px'
      }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 900, color: '#FFFFFF', margin: '0 0 6px' }}>
            إدارة التقييمات والمراجعات ⭐
          </h1>
          <p style={{ fontSize: '14px', color: '#94A3B8', margin: 0 }}>
            مراجعة تقييمات العملاء واعتمادها للنشر، وتوليد روابط التقييم المشفرة للمشاركة المباشرة
          </p>
        </div>

        {/* Generate Link Button */}
        <button
          onClick={handleOpenGeneratorModal}
          style={{
            backgroundColor: '#F59E0B',
            color: '#0B0F19',
            border: 'none',
            padding: '12px 22px',
            borderRadius: '10px',
            fontWeight: 900,
            fontSize: '15px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 4px 14px rgba(245, 158, 11, 0.35)',
            transition: 'transform 0.15s ease'
          }}
        >
          <Plus size={18} strokeWidth={3} />
          <span>إنشاء رابط تقييم جديد</span>
        </button>
      </div>

      {/* Sub Tabs Navigation */}
      <div style={{
        display: 'flex',
        gap: '8px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        marginBottom: '24px'
      }}>
        <button
          onClick={() => setActiveSubTab('moderation')}
          style={{
            padding: '12px 20px',
            background: 'none',
            border: 'none',
            borderBottom: activeSubTab === 'moderation' ? '3px solid #F59E0B' : '3px solid transparent',
            color: activeSubTab === 'moderation' ? '#F59E0B' : '#94A3B8',
            fontSize: '15px',
            fontWeight: 800,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Star size={18} />
          <span>المراجعات والتقييمات</span>
          {counts.pending > 0 && (
            <span style={{
              backgroundColor: '#F59E0B',
              color: '#0B0F19',
              fontSize: '11px',
              fontWeight: 900,
              padding: '2px 7px',
              borderRadius: '9999px'
            }}>
              {counts.pending}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveSubTab('links')}
          style={{
            padding: '12px 20px',
            background: 'none',
            border: 'none',
            borderBottom: activeSubTab === 'links' ? '3px solid #F59E0B' : '3px solid transparent',
            color: activeSubTab === 'links' ? '#F59E0B' : '#94A3B8',
            fontSize: '15px',
            fontWeight: 800,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <LinkIcon size={18} />
          <span>سجل روابط التقييم (Review Links)</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: MODERATION DASHBOARD */}
      {/* ========================================================================= */}
      {activeSubTab === 'moderation' && (
        <>
          {/* Counters Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '14px',
            marginBottom: '20px'
          }}>
            <div 
              onClick={() => setStatusFilter('PENDING')}
              style={{
                backgroundColor: statusFilter === 'PENDING' ? 'rgba(245, 158, 11, 0.15)' : '#1E293B',
                border: `1px solid ${statusFilter === 'PENDING' ? '#F59E0B' : 'rgba(255, 255, 255, 0.08)'}`,
                borderRadius: '12px',
                padding: '16px',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <div style={{ fontSize: '13px', color: '#94A3B8', fontWeight: 600 }}>بانتظار الاعتماد ⏳</div>
              <div style={{ fontSize: '26px', fontWeight: 900, color: '#F59E0B', marginTop: '4px' }}>
                {counts.pending}
              </div>
            </div>

            <div 
              onClick={() => setStatusFilter('APPROVED')}
              style={{
                backgroundColor: statusFilter === 'APPROVED' ? 'rgba(34, 197, 94, 0.15)' : '#1E293B',
                border: `1px solid ${statusFilter === 'APPROVED' ? '#22C55E' : 'rgba(255, 255, 255, 0.08)'}`,
                borderRadius: '12px',
                padding: '16px',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <div style={{ fontSize: '13px', color: '#94A3B8', fontWeight: 600 }}>معتمدة ومنشورة ✓</div>
              <div style={{ fontSize: '26px', fontWeight: 900, color: '#22C55E', marginTop: '4px' }}>
                {counts.approved}
              </div>
            </div>

            <div 
              onClick={() => setStatusFilter('REJECTED')}
              style={{
                backgroundColor: statusFilter === 'REJECTED' ? 'rgba(239, 68, 68, 0.15)' : '#1E293B',
                border: `1px solid ${statusFilter === 'REJECTED' ? '#EF4444' : 'rgba(255, 255, 255, 0.08)'}`,
                borderRadius: '12px',
                padding: '16px',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <div style={{ fontSize: '13px', color: '#94A3B8', fontWeight: 600 }}>مرفوضة ✗</div>
              <div style={{ fontSize: '26px', fontWeight: 900, color: '#EF4444', marginTop: '4px' }}>
                {counts.rejected}
              </div>
            </div>

            <div 
              onClick={() => setStatusFilter('ALL')}
              style={{
                backgroundColor: statusFilter === 'ALL' ? 'rgba(148, 163, 184, 0.2)' : '#1E293B',
                border: `1px solid ${statusFilter === 'ALL' ? '#CBD5E1' : 'rgba(255, 255, 255, 0.08)'}`,
                borderRadius: '12px',
                padding: '16px',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <div style={{ fontSize: '13px', color: '#94A3B8', fontWeight: 600 }}>جميع التقييمات</div>
              <div style={{ fontSize: '26px', fontWeight: 900, color: '#FFFFFF', marginTop: '4px' }}>
                {counts.total}
              </div>
            </div>
          </div>

          {/* Search Bar & Refresh */}
          <div style={{
            display: 'flex',
            gap: '10px',
            marginBottom: '20px',
            flexWrap: 'wrap'
          }}>
            <div style={{
              flexGrow: 1,
              position: 'relative',
              display: 'flex',
              alignItems: 'center'
            }}>
              <Search size={18} color="#94A3B8" style={{ position: 'absolute', right: '14px' }} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadReviews()}
                placeholder="البحث بالاسم، التعليق، أو المنتج..."
                style={{
                  width: '100%',
                  backgroundColor: '#1E293B',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '10px',
                  padding: '10px 42px 10px 14px',
                  color: '#FFFFFF',
                  fontSize: '14px',
                  outline: 'none'
                }}
              />
            </div>
            <button
              onClick={loadReviews}
              style={{
                backgroundColor: '#1E293B',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '10px',
                padding: '10px 16px',
                color: '#CBD5E1',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontWeight: 600
              }}
            >
              <RefreshCw size={16} />
              <span>تحديث</span>
            </button>
          </div>

          {/* Reviews List */}
          {loadingReviews ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: '#94A3B8' }}>
              <div className="spinner" style={{ margin: '0 auto 12px', width: '32px', height: '32px', border: '3px solid rgba(245,158,11,0.2)', borderTopColor: '#F59E0B', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              <span>جارٍ تحميل المراجعات...</span>
            </div>
          ) : reviews.length === 0 ? (
            <div style={{
              backgroundColor: '#1E293B',
              borderRadius: '14px',
              padding: '48px 20px',
              textAlign: 'center',
              color: '#94A3B8'
            }}>
              <Star size={40} color="#475569" style={{ margin: '0 auto 12px' }} />
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#FFFFFF', marginBottom: '6px' }}>
                لا توجد مراجعات في هذا القسم
              </div>
              <p style={{ fontSize: '13px', margin: 0 }}>
                يمكنك تغيير التصفية أو إنشاء رابط تقييم جديد ومشاركته مع العملاء.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {reviews.map((rev) => (
                <div
                  key={rev.id}
                  style={{
                    backgroundColor: '#1E293B',
                    border: rev.status === 'PENDING' ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '14px',
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px'
                  }}
                >
                  {/* Top Bar: Reviewer info & Status */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '10px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{
                        width: '38px',
                        height: '38px',
                        borderRadius: '50%',
                        backgroundColor: rev.reviewer_type === 'AUTHENTICATED' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(148, 163, 184, 0.2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: rev.reviewer_type === 'AUTHENTICATED' ? '#86EFAC' : '#CBD5E1',
                        fontWeight: 900
                      }}>
                        {rev.reviewer_type === 'AUTHENTICATED' ? <ShieldCheck size={20} /> : <User size={20} />}
                      </div>

                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '15px', fontWeight: 800, color: '#FFFFFF' }}>
                            {rev.customer_name}
                          </span>
                          <span style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '9999px',
                            backgroundColor: rev.reviewer_type === 'AUTHENTICATED' ? '#14532D' : '#334155',
                            color: rev.reviewer_type === 'AUTHENTICATED' ? '#86EFAC' : '#E2E8F0'
                          }}>
                            {rev.reviewer_type === 'AUTHENTICATED' ? 'عميل مسجل' : 'ضيف (مستخدم مجهول)'}
                          </span>
                        </div>
                        {rev.user_email && (
                          <div style={{ fontSize: '12px', color: '#94A3B8' }}>{rev.user_email}</div>
                        )}
                      </div>
                    </div>

                    {/* Status Badge & Date */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '12px', color: '#64748B' }}>
                        {new Date(rev.created_at).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })}
                      </span>
                      {rev.status === 'PENDING' && (
                        <span style={{ backgroundColor: '#FEF3C7', color: '#92400E', fontSize: '12px', fontWeight: 800, padding: '4px 10px', borderRadius: '6px' }}>
                          قيد المراجعة ⏳
                        </span>
                      )}
                      {rev.status === 'APPROVED' && (
                        <span style={{ backgroundColor: '#DCFCE7', color: '#166534', fontSize: '12px', fontWeight: 800, padding: '4px 10px', borderRadius: '6px' }}>
                          معتمد ومنشور ✓
                        </span>
                      )}
                      {rev.status === 'REJECTED' && (
                        <span style={{ backgroundColor: '#FEE2E2', color: '#991B1B', fontSize: '12px', fontWeight: 800, padding: '4px 10px', borderRadius: '6px' }}>
                          مرفوض ✗
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Rating & Product Info */}
                  <div style={{
                    backgroundColor: '#0F172A',
                    borderRadius: '10px',
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '10px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ display: 'inline-flex', gap: '2px', direction: 'ltr' }}>
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star
                            key={s}
                            size={18}
                            fill={s <= rev.rating ? '#F59E0B' : 'transparent'}
                            color={s <= rev.rating ? '#F59E0B' : '#475569'}
                          />
                        ))}
                      </div>
                      <span style={{ fontSize: '14px', fontWeight: 800, color: '#FBBF24' }}>
                        {rev.rating} من 5 نجوم
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                      <ShoppingBag size={16} color="#94A3B8" />
                      <span style={{ color: '#E2E8F0', fontWeight: 700 }}>
                        {rev.order_package_name || rev.product_name || 'خدمة KIROPRO'}
                      </span>
                      {rev.order_full_id && (
                        <span style={{ color: '#F59E0B', direction: 'ltr', fontSize: '12px' }}>
                          #{rev.order_full_id.slice(0, 8).toUpperCase()}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Comment Text */}
                  {rev.comment && (
                    <div style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.03)',
                      borderRight: '3px solid #F59E0B',
                      padding: '10px 14px',
                      borderRadius: '4px 8px 8px 4px',
                      fontSize: '14px',
                      color: '#F1F5F9',
                      lineHeight: 1.6
                    }}>
                      {rev.comment}
                    </div>
                  )}

                  {/* Admin Note if present */}
                  {rev.admin_note && (
                    <div style={{ fontSize: '12px', color: '#F87171' }}>
                      <strong>ملاحظة الإدارة:</strong> {rev.admin_note}
                    </div>
                  )}

                  {/* Actions */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: '10px',
                    borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                    paddingTop: '12px'
                  }}>
                    {rev.status !== 'APPROVED' && (
                      <button
                        onClick={() => handleApprove(rev.id)}
                        disabled={actionLoadingId === rev.id}
                        style={{
                          backgroundColor: '#166534',
                          color: '#FFFFFF',
                          border: 'none',
                          padding: '8px 16px',
                          borderRadius: '8px',
                          fontSize: '13px',
                          fontWeight: 800,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        <CheckCircle2 size={16} />
                        <span>اعتماد ونشر للعامة</span>
                      </button>
                    )}

                    {rev.status !== 'REJECTED' && (
                      <button
                        onClick={() => handleReject(rev.id)}
                        disabled={actionLoadingId === rev.id}
                        style={{
                          backgroundColor: '#991B1B',
                          color: '#FFFFFF',
                          border: 'none',
                          padding: '8px 16px',
                          borderRadius: '8px',
                          fontSize: '13px',
                          fontWeight: 800,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        <XCircle size={16} />
                        <span>رفض المراجعة</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: REVIEW LINKS HISTORY */}
      {/* ========================================================================= */}
      {activeSubTab === 'links' && (
        <>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px'
          }}>
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#FFFFFF', margin: 0 }}>
              روابط التقييم المخصصة والعامة ({links.length})
            </h3>
            <button
              onClick={loadLinks}
              style={{
                backgroundColor: '#1E293B',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                padding: '8px 14px',
                color: '#CBD5E1',
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <RefreshCw size={14} />
              <span>تحديث القائمة</span>
            </button>
          </div>

          {loadingLinks ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: '#94A3B8' }}>
              <div className="spinner" style={{ margin: '0 auto 12px', width: '32px', height: '32px', border: '3px solid rgba(245,158,11,0.2)', borderTopColor: '#F59E0B', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              <span>جارٍ تحميل الروابط...</span>
            </div>
          ) : links.length === 0 ? (
            <div style={{
              backgroundColor: '#1E293B',
              borderRadius: '14px',
              padding: '40px 20px',
              textAlign: 'center',
              color: '#94A3B8'
            }}>
              <LinkIcon size={36} color="#475569" style={{ margin: '0 auto 10px' }} />
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#FFFFFF', marginBottom: '6px' }}>
                لم يتم إنشاء روابط تقييم بعد
              </div>
              <p style={{ fontSize: '13px', margin: '0 0 16px' }}>
                اضغط على زر "إنشاء رابط تقييم جديد" لتوليد رابط مخصص لطلب أو رابط عام للمتجر.
              </p>
              <button
                onClick={handleOpenGeneratorModal}
                style={{
                  backgroundColor: '#F59E0B',
                  color: '#0B0F19',
                  border: 'none',
                  padding: '10px 18px',
                  borderRadius: '8px',
                  fontWeight: 800,
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                إنشاء أول رابط تقييم
              </button>
            </div>
          ) : (
            <div style={{
              backgroundColor: '#1E293B',
              borderRadius: '14px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              overflowX: 'auto'
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', color: '#94A3B8' }}>
                    <th style={{ padding: '14px 16px' }}>النوع / التسمية</th>
                    <th style={{ padding: '14px 16px' }}>المنتج / الطلب</th>
                    <th style={{ padding: '14px 16px' }}>مرات الاستخدام</th>
                    <th style={{ padding: '14px 16px' }}>تاريخ الانتهاء</th>
                    <th style={{ padding: '14px 16px' }}>الحالة</th>
                    <th style={{ padding: '14px 16px', textAlign: 'left' }}>الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {links.map((lnk) => {
                    const isOrderSpecific = lnk.type === 'ORDER_SPECIFIC';
                    const isExhausted = lnk.uses_count >= lnk.max_uses;

                    return (
                      <tr key={lnk.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)', color: '#E2E8F0' }}>
                        <td style={{ padding: '14px 16px' }}>
                          <span style={{
                            fontSize: '11px',
                            fontWeight: 800,
                            padding: '2px 8px',
                            borderRadius: '4px',
                            backgroundColor: isOrderSpecific ? '#0369A1' : '#7C2D12',
                            color: '#FFFFFF',
                            marginLeft: '8px'
                          }}>
                            {isOrderSpecific ? 'طلب محدد' : 'رابط عام'}
                          </span>
                          <span style={{ fontWeight: 700 }}>{lnk.label || 'رابط تقييم'}</span>
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ fontWeight: 600 }}>{lnk.order_package_name || lnk.product_name || 'منتج عام'}</div>
                          {lnk.order_id && (
                            <div style={{ fontSize: '11px', color: '#F59E0B', direction: 'ltr', textAlign: 'right' }}>
                              #{lnk.order_id.slice(0, 8).toUpperCase()}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <span style={{
                            fontWeight: 800,
                            color: isExhausted ? '#F87171' : '#4ADE80'
                          }}>
                            {lnk.uses_count} / {lnk.max_uses}
                          </span>
                        </td>
                        <td style={{ padding: '14px 16px', color: '#94A3B8' }}>
                          {lnk.expires_at ? new Date(lnk.expires_at).toLocaleDateString('ar-EG') : 'بدون انتهاء'}
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          {lnk.is_active && !isExhausted ? (
                            <span style={{ color: '#4ADE80', fontWeight: 700 }}>نشط ✓</span>
                          ) : (
                            <span style={{ color: '#94A3B8' }}>{isExhausted ? 'مستهلك بالكامل' : 'معطل'}</span>
                          )}
                        </td>
                        <td style={{ padding: '14px 16px', textAlign: 'left' }}>
                          <button
                            onClick={() => handleToggleLinkActive(lnk.id)}
                            style={{
                              background: 'none',
                              border: '1px solid #334155',
                              color: lnk.is_active ? '#F87171' : '#4ADE80',
                              padding: '6px 12px',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '12px',
                              fontWeight: 700
                            }}
                          >
                            {lnk.is_active ? 'تعطيل' : 'تفعيل'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ========================================================================= */}
      {/* MODAL: GENERATE REVIEW LINK */}
      {/* ========================================================================= */}
      {isGeneratorModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(5px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: '16px'
        }} dir="rtl">
          <div style={{
            width: '100%',
            maxWidth: '540px',
            backgroundColor: '#111827',
            border: '1px solid rgba(245, 158, 11, 0.35)',
            borderRadius: '18px',
            boxShadow: '0 25px 50px rgba(0, 0, 0, 0.7)',
            overflow: 'hidden'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '20px 24px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#FFFFFF', margin: 0 }}>
                إنشاء رابط تقييم جديد ⚡
              </h3>
              <button
                onClick={() => setIsGeneratorModalOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94A3B8',
                  cursor: 'pointer',
                  fontSize: '20px'
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '24px' }}>
              {generatedLinkResult ? (
                <div>
                  <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                    <CheckCircle2 size={44} color="#22C55E" style={{ margin: '0 auto 10px' }} />
                    <h4 style={{ fontSize: '17px', fontWeight: 800, color: '#FFFFFF', margin: '0 0 4px' }}>
                      تم توليد رابط التقييم الآمن بنجاح!
                    </h4>
                    <p style={{ fontSize: '13px', color: '#94A3B8', margin: 0 }}>
                      يمكنك نسخ الرابط ومشاركته مع العميل عبر WhatsApp أو أي وسيلة أخرى.
                    </p>
                  </div>

                  {/* Generated Link Display Box */}
                  <div style={{
                    backgroundColor: '#0F172A',
                    border: '1px solid #334155',
                    borderRadius: '10px',
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    marginBottom: '20px'
                  }}>
                    <input
                      type="text"
                      readOnly
                      value={generatedLinkResult.url}
                      style={{
                        flexGrow: 1,
                        background: 'none',
                        border: 'none',
                        color: '#FBBF24',
                        fontSize: '13px',
                        fontFamily: 'monospace',
                        outline: 'none',
                        direction: 'ltr'
                      }}
                    />
                    <button
                      onClick={() => handleCopyLink(generatedLinkResult.url)}
                      style={{
                        backgroundColor: copiedLink ? '#166534' : '#F59E0B',
                        color: copiedLink ? '#FFFFFF' : '#0B0F19',
                        border: 'none',
                        padding: '8px 14px',
                        borderRadius: '6px',
                        fontWeight: 800,
                        fontSize: '12px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        flexShrink: 0
                      }}
                    >
                      {copiedLink ? <Check size={14} /> : <Copy size={14} />}
                      <span>{copiedLink ? 'تم النسخ!' : 'نسخ الرابط'}</span>
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: '10px' }}>
                    <a
                      href={generatedLinkResult.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        flexGrow: 1,
                        backgroundColor: '#1E293B',
                        border: '1px solid #334155',
                        color: '#FFFFFF',
                        textDecoration: 'none',
                        textAlign: 'center',
                        padding: '12px',
                        borderRadius: '8px',
                        fontWeight: 700,
                        fontSize: '13px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                      }}
                    >
                      <ExternalLink size={16} />
                      <span>فتح الرابط ومعاينته</span>
                    </a>
                    <button
                      onClick={() => {
                        setGeneratedLinkResult(null);
                        setCopiedLink(false);
                      }}
                      style={{
                        backgroundColor: '#334155',
                        color: '#FFFFFF',
                        border: 'none',
                        padding: '12px 18px',
                        borderRadius: '8px',
                        fontWeight: 700,
                        fontSize: '13px',
                        cursor: 'pointer'
                      }}
                    >
                      إنشاء رابط آخر
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleGenerateLink}>
                  {/* Link Type Selector */}
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#CBD5E1', marginBottom: '8px' }}>
                      نوع الرابط:
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <button
                        type="button"
                        onClick={() => setLinkType('ORDER_SPECIFIC')}
                        style={{
                          backgroundColor: linkType === 'ORDER_SPECIFIC' ? 'rgba(245, 158, 11, 0.15)' : '#0F172A',
                          border: `2px solid ${linkType === 'ORDER_SPECIFIC' ? '#F59E0B' : '#334155'}`,
                          borderRadius: '10px',
                          padding: '12px',
                          color: '#FFFFFF',
                          cursor: 'pointer',
                          textAlign: 'right'
                        }}
                      >
                        <div style={{ fontWeight: 800, fontSize: '14px', color: linkType === 'ORDER_SPECIFIC' ? '#FBBF24' : '#FFFFFF' }}>
                          طلب محدد (Order-Specific)
                        </div>
                        <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>
                          استخدام واحد فقط لطلب محدد
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setLinkType('GENERAL')}
                        style={{
                          backgroundColor: linkType === 'GENERAL' ? 'rgba(245, 158, 11, 0.15)' : '#0F172A',
                          border: `2px solid ${linkType === 'GENERAL' ? '#F59E0B' : '#334155'}`,
                          borderRadius: '10px',
                          padding: '12px',
                          color: '#FFFFFF',
                          cursor: 'pointer',
                          textAlign: 'right'
                        }}
                      >
                        <div style={{ fontWeight: 800, fontSize: '14px', color: linkType === 'GENERAL' ? '#FBBF24' : '#FFFFFF' }}>
                          رابط عام للمتجر (General)
                        </div>
                        <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>
                          لحملات التقييم مع حماية وسقف
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Order-Specific Fields */}
                  {linkType === 'ORDER_SPECIFIC' && (
                    <div style={{ marginBottom: '20px' }}>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#CBD5E1', marginBottom: '8px' }}>
                        اختر الطلب المكتمل:
                      </label>
                      {loadingOrders ? (
                        <div style={{ color: '#94A3B8', fontSize: '12px' }}>جارٍ جلب الطلبات الأخيرة...</div>
                      ) : (
                        <select
                          value={selectedOrderId}
                          onChange={(e) => setSelectedOrderId(e.target.value)}
                          style={{
                            width: '100%',
                            backgroundColor: '#0F172A',
                            border: '1px solid #334155',
                            borderRadius: '8px',
                            padding: '10px 12px',
                            color: '#FFFFFF',
                            fontSize: '13px',
                            outline: 'none'
                          }}
                          required
                        >
                          <option value="">-- اختر طلباً مكتملاً --</option>
                          {completedOrders.map((o) => (
                            <option key={o.id} value={o.id}>
                              #{o.id.slice(0, 8).toUpperCase()} - {o.packageName} ({o.userName || o.userEmail || 'عميل'})
                            </option>
                          ))}
                        </select>
                      )}
                      <div style={{ marginTop: '8px' }}>
                        <span style={{ fontSize: '12px', color: '#94A3B8' }}>أو أدخل معرف الطلب يدوياً (UUID):</span>
                        <input
                          type="text"
                          value={selectedOrderId}
                          onChange={(e) => setSelectedOrderId(e.target.value)}
                          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                          style={{
                            width: '100%',
                            backgroundColor: '#0F172A',
                            border: '1px solid #334155',
                            borderRadius: '8px',
                            padding: '8px 12px',
                            color: '#FFFFFF',
                            fontSize: '13px',
                            marginTop: '4px',
                            outline: 'none',
                            direction: 'ltr'
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* General Link Fields */}
                  {linkType === 'GENERAL' && (
                    <>
                      <div style={{ marginBottom: '14px' }}>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#CBD5E1', marginBottom: '6px' }}>
                          اسم المنتج / التسمية:
                        </label>
                        <input
                          type="text"
                          value={generalProductName}
                          onChange={(e) => setGeneralProductName(e.target.value)}
                          placeholder="مثال: تجربة الشحن الفوري أو اسم لعبة محددة"
                          style={{
                            width: '100%',
                            backgroundColor: '#0F172A',
                            border: '1px solid #334155',
                            borderRadius: '8px',
                            padding: '10px 12px',
                            color: '#FFFFFF',
                            fontSize: '13px',
                            outline: 'none'
                          }}
                        />
                      </div>

                      <div style={{ marginBottom: '14px' }}>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#CBD5E1', marginBottom: '6px' }}>
                          تسمية مرجعية للأدمن:
                        </label>
                        <input
                          type="text"
                          value={generalLabel}
                          onChange={(e) => setGeneralLabel(e.target.value)}
                          placeholder="مثال: حملة تيليجرام مارس 2026"
                          style={{
                            width: '100%',
                            backgroundColor: '#0F172A',
                            border: '1px solid #334155',
                            borderRadius: '8px',
                            padding: '10px 12px',
                            color: '#FFFFFF',
                            fontSize: '13px',
                            outline: 'none'
                          }}
                        />
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '12px', color: '#94A3B8', marginBottom: '4px' }}>
                            أقصى مرات استخدام:
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="1000"
                            value={generalMaxUses}
                            onChange={(e) => setGeneralMaxUses(parseInt(e.target.value, 10) || 50)}
                            style={{
                              width: '100%',
                              backgroundColor: '#0F172A',
                              border: '1px solid #334155',
                              borderRadius: '8px',
                              padding: '8px 10px',
                              color: '#FFFFFF',
                              fontSize: '13px',
                              outline: 'none'
                            }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '12px', color: '#94A3B8', marginBottom: '4px' }}>
                            الصلاحية (أيام):
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="365"
                            value={generalExpiryDays}
                            onChange={(e) => setGeneralExpiryDays(parseInt(e.target.value, 10) || 30)}
                            style={{
                              width: '100%',
                              backgroundColor: '#0F172A',
                              border: '1px solid #334155',
                              borderRadius: '8px',
                              padding: '8px 10px',
                              color: '#FFFFFF',
                              fontSize: '13px',
                              outline: 'none'
                            }}
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={generating}
                    style={{
                      width: '100%',
                      backgroundColor: '#F59E0B',
                      color: '#0B0F19',
                      border: 'none',
                      padding: '14px',
                      borderRadius: '10px',
                      fontWeight: 900,
                      fontSize: '15px',
                      cursor: generating ? 'not-allowed' : 'pointer',
                      boxShadow: '0 4px 14px rgba(245, 158, 11, 0.35)'
                    }}
                  >
                    {generating ? 'جارٍ توليد الرابط المشفر...' : '⚡ توليد الرابط الآن'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminReviews;
