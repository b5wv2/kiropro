import React, { useEffect, useState } from 'react';
import { 
  ArrowDownCircle, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Eye, 
  RefreshCw, 
  AlertCircle,
  FileText, 
  Search, 
  ExternalLink
} from 'lucide-react';
import { api, BASE_URL } from '../../lib/api';
import { formatCurrency } from '../../lib/formatters';

export interface TopupRequestItem {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  payment_method_id: string | null;
  payment_method_name: string | null;
  bank_name: string | null;
  account_name: string | null;
  account_number: string | null;
  amount_usd: number;
  exchange_rate: number;
  amount_sdg: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  receipt_url: string;
  user_note: string | null;
  admin_note: string | null;
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewer_name: string | null;
  reviewer_email: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export const AdminTopups: React.FC = () => {
  const [topups, setTopups] = useState<TopupRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTopup, setSelectedTopup] = useState<TopupRequestItem | null>(null);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Action states
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [adminNote, setAdminNote] = useState('');
  const [receiptModalUrl, setReceiptModalUrl] = useState<string | null>(null);
  
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);

  const fetchTopups = async () => {
    try {
      setLoading(true);
      setErrorToast(null);
      const data = await api.get<TopupRequestItem[]>('/api/admin/topups');
      setTopups(data);
      // Update selected if open
      if (selectedTopup) {
        const updated = data.find(t => t.id === selectedTopup.id);
        if (updated) setSelectedTopup(updated);
      }
    } catch (err: any) {
      console.error('Failed to load topup requests', err);
      setErrorToast('فشل تحميل طلبات الشحن من الخادم.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTopups();
  }, []);

  const handleApprove = async () => {
    if (!selectedTopup || isApproving) return;
    
    if (!window.confirm(`هل أنت متأكد من اعتماد طلب الشحن وإيداع ${formatCurrency(selectedTopup.amount_usd)} في محفظة العميل (${selectedTopup.user_name})؟`)) {
      return;
    }

    setIsApproving(true);
    setErrorToast(null);

    try {
      const res = await api.post(`/api/admin/topups/${selectedTopup.id}/approve`, {
        admin_note: adminNote.trim() || undefined
      });
      setSuccessToast(res.message || 'تمت الموافقة وإيداع الرصيد بنجاح!');
      await fetchTopups();
      setTimeout(() => setSuccessToast(null), 4000);
    } catch (err: any) {
      console.error('Approve failed', err);
      setErrorToast(err?.data?.error || err.message || 'فشل اعتماد طلب الشحن.');
    } finally {
      setIsApproving(false);
    }
  };

  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTopup || isRejecting) return;

    if (!rejectionReason.trim()) {
      alert('يرجى كتابة سبب الرفض لتوضيحه للعميل.');
      return;
    }

    setIsRejecting(true);
    setErrorToast(null);

    try {
      const res = await api.post(`/api/admin/topups/${selectedTopup.id}/reject`, {
        rejection_reason: rejectionReason.trim(),
        admin_note: adminNote.trim() || undefined
      });
      setSuccessToast(res.message || 'تم رفض طلب الشحن بنجاح.');
      setShowRejectModal(false);
      setRejectionReason('');
      await fetchTopups();
      setTimeout(() => setSuccessToast(null), 4000);
    } catch (err: any) {
      console.error('Reject failed', err);
      setErrorToast(err?.data?.error || err.message || 'فشل رفض طلب الشحن.');
    } finally {
      setIsRejecting(false);
    }
  };

  // Filtered Topups
  const filteredTopups = topups.filter(item => {
    if (statusFilter !== 'ALL' && item.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = item.user_name?.toLowerCase().includes(q);
      const matchEmail = item.user_email?.toLowerCase().includes(q);
      const matchId = item.id.toLowerCase().includes(q);
      const matchBank = item.bank_name?.toLowerCase().includes(q);
      return matchName || matchEmail || matchId || matchBank;
    }
    return true;
  });

  const counts = {
    ALL: topups.length,
    PENDING: topups.filter(t => t.status === 'PENDING').length,
    APPROVED: topups.filter(t => t.status === 'APPROVED').length,
    REJECTED: topups.filter(t => t.status === 'REJECTED').length
  };

  const getFullReceiptUrl = (url: string) => {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    return `${BASE_URL}${url}`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Action Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>
            طلبات شحن الرصيد والتحويل البنكي
          </h2>
          <p style={{ fontSize: '0.825rem', color: '#64748b', margin: '4px 0 0 0' }}>
            مراجعة إيصالات التحويل البنكي اليدوي، التحقق منها، واعتماد إضافة الرصيد إلى محفظة العميل
          </p>
        </div>

        <button 
          onClick={fetchTopups} 
          className="admin-btn admin-btn-secondary admin-btn-sm"
          disabled={loading}
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          <span>تحديث القائمة</span>
        </button>
      </div>

      {/* Notifications */}
      {successToast && (
        <div style={{ 
          background: '#ecfdf5', 
          border: '1px solid #10b981', 
          color: '#065f46', 
          borderRadius: '10px', 
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontSize: '0.875rem',
          fontWeight: 600
        }}>
          <CheckCircle2 size={18} />
          <span>{successToast}</span>
        </div>
      )}

      {errorToast && (
        <div style={{ 
          background: '#fef2f2', 
          border: '1px solid #ef4444', 
          color: '#991b1b', 
          borderRadius: '10px', 
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontSize: '0.875rem'
        }}>
          <AlertCircle size={18} />
          <span>{errorToast}</span>
        </div>
      )}

      {/* Filter Tabs & Search Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div className="admin-tabs" style={{ margin: 0 }}>
          <button
            onClick={() => setStatusFilter('ALL')}
            className={`admin-tab-btn ${statusFilter === 'ALL' ? 'active' : ''}`}
          >
            الكل ({counts.ALL})
          </button>
          <button
            onClick={() => setStatusFilter('PENDING')}
            className={`admin-tab-btn ${statusFilter === 'PENDING' ? 'active' : ''}`}
            style={{ position: 'relative' }}
          >
            <span>قيد المراجعة</span>
            {counts.PENDING > 0 && (
              <span style={{ 
                background: '#eab308', 
                color: '#000', 
                fontSize: '0.7rem', 
                fontWeight: 800, 
                padding: '1px 6px', 
                borderRadius: '10px',
                marginRight: '6px'
              }}>
                {counts.PENDING}
              </span>
            )}
          </button>
          <button
            onClick={() => setStatusFilter('APPROVED')}
            className={`admin-tab-btn ${statusFilter === 'APPROVED' ? 'active' : ''}`}
          >
            المقبولة ({counts.APPROVED})
          </button>
          <button
            onClick={() => setStatusFilter('REJECTED')}
            className={`admin-tab-btn ${statusFilter === 'REJECTED' ? 'active' : ''}`}
          >
            المرفوضة ({counts.REJECTED})
          </button>
        </div>

        <div style={{ position: 'relative', width: '280px' }}>
          <Search size={16} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            type="text"
            placeholder="بحث بالعميل، الإيميل أو البنك..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="admin-input"
            style={{ paddingRight: '36px' }}
          />
        </div>
      </div>

      {/* Main Table */}
      <div className="admin-card">
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
            <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 12px' }} />
            <p style={{ margin: 0 }}>جاري استرداد طلبات الشحن من قاعدة البيانات...</p>
          </div>
        ) : filteredTopups.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', color: '#64748b' }}>
            <ArrowDownCircle size={44} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
              لا توجد طلبات شحن تطابق هذا الفلتر
            </h3>
            <p style={{ fontSize: '0.85rem' }}>
              عند قيام المستخدمين بإنشاء طلبات شحن وتحويل بنكي، ستظهر الطلبات هنا فورياً للمراجعة.
            </p>
          </div>
        ) : (
          <div className="admin-table-responsive">
            <table className="admin-table">
              <thead>
                <tr>
                  <th style={{ width: '100px' }}>رقم الطلب</th>
                  <th>العميل</th>
                  <th>مبلغ الشحن ($)</th>
                  <th>المبلغ المحول (SDG)</th>
                  <th>طريقة الدفع</th>
                  <th>الإيصال</th>
                  <th>الحالة</th>
                  <th>تاريخ الإنشاء</th>
                  <th style={{ width: '90px', textAlign: 'center' }}>معاينة</th>
                </tr>
              </thead>
              <tbody>
                {filteredTopups.map((t) => (
                  <tr key={t.id} style={{ background: selectedTopup?.id === t.id ? '#f0fdf4' : undefined }}>
                    <td>
                      <code style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0369a1' }}>
                        #{t.id.slice(0, 8)}
                      </code>
                    </td>
                    <td>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>{t.user_name}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{t.user_email}</div>
                    </td>
                    <td>
                      <span style={{ fontWeight: 800, color: '#10b981', fontSize: '0.95rem' }}>
                        {formatCurrency(t.amount_usd)}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontWeight: 700, color: '#0f172a' }}>
                        {Number(t.amount_sdg).toLocaleString()} ج.س
                      </span>
                      <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                        سعر الصرف: 1$ = {Number(t.exchange_rate).toLocaleString()}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1e293b' }}>
                        {t.payment_method_name || 'تحويل بنكي'}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        {t.bank_name || '—'}
                      </div>
                    </td>
                    <td>
                      <button
                        onClick={() => setReceiptModalUrl(getFullReceiptUrl(t.receipt_url))}
                        className="admin-btn admin-btn-secondary admin-btn-sm"
                        style={{ padding: '4px 8px', fontSize: '0.75rem', gap: '4px' }}
                      >
                        <FileText size={13} />
                        <span>عرض الإيصال</span>
                      </button>
                    </td>
                    <td>
                      {t.status === 'PENDING' && (
                        <span className="admin-badge admin-badge-warning" style={{ gap: '4px' }}>
                          <Clock size={12} />
                          قيد المراجعة
                        </span>
                      )}
                      {t.status === 'APPROVED' && (
                        <span className="admin-badge admin-badge-success" style={{ gap: '4px' }}>
                          <CheckCircle2 size={12} />
                          معتمد ومودع
                        </span>
                      )}
                      {t.status === 'REJECTED' && (
                        <span className="admin-badge admin-badge-danger" style={{ gap: '4px' }}>
                          <XCircle size={12} />
                          مرفوض
                        </span>
                      )}
                    </td>
                    <td>
                      <span style={{ fontSize: '0.8rem', color: '#64748b', whiteSpace: 'nowrap' }}>
                        {new Date(t.created_at).toLocaleDateString('ar-EG', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        onClick={() => setSelectedTopup(t)}
                        className="admin-btn admin-btn-secondary admin-btn-sm"
                        style={{ padding: '6px 10px' }}
                        title="مراجعة وتفاصيل الطلب"
                      >
                        <Eye size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Review & Details Modal */}
      {selectedTopup && (
        <div className="admin-modal-backdrop" onClick={() => setSelectedTopup(null)}>
          <div 
            className="admin-modal" 
            style={{ maxWidth: '680px', width: '95%' }} 
            onClick={(e) => e.stopPropagation()}
          >
            <div className="admin-modal-header">
              <div>
                <h3 className="admin-modal-title">تفاصيل ومراجعة طلب الشحن</h3>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  معرف الطلب: <code style={{ fontWeight: 700 }}>#{selectedTopup.id}</code>
                </span>
              </div>
              <button 
                className="admin-modal-close" 
                onClick={() => setSelectedTopup(null)}
              >
                &times;
              </button>
            </div>

            <div className="admin-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Top Banner Status */}
              <div style={{
                background: selectedTopup.status === 'APPROVED' ? '#ecfdf5' : selectedTopup.status === 'REJECTED' ? '#fef2f2' : '#fefce8',
                border: `1px solid ${selectedTopup.status === 'APPROVED' ? '#10b981' : selectedTopup.status === 'REJECTED' ? '#ef4444' : '#eab308'}`,
                borderRadius: '10px',
                padding: '14px 18px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '10px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {selectedTopup.status === 'PENDING' && <Clock size={20} color="#ca8a04" />}
                  {selectedTopup.status === 'APPROVED' && <CheckCircle2 size={20} color="#059669" />}
                  {selectedTopup.status === 'REJECTED' && <XCircle size={20} color="#dc2626" />}
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#0f172a' }}>
                      حالة الطلب: {selectedTopup.status === 'PENDING' ? 'قيد المراجعة والتدقيق' : selectedTopup.status === 'APPROVED' ? 'تمت الموافقة وإيداع الرصيد' : 'تم رفض الطلب'}
                    </div>
                    {selectedTopup.reviewed_at && (
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        تمت المراجعة بواسطة: {selectedTopup.reviewer_name || 'مسؤول النظام'} بتاريخ {new Date(selectedTopup.reviewed_at).toLocaleString('ar-EG')}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ textAlign: 'left' }}>
                  <span style={{ fontSize: '1.25rem', fontWeight: 900, color: '#10b981' }}>
                    {formatCurrency(selectedTopup.amount_usd)}
                  </span>
                </div>
              </div>

              {/* Request Breakdown Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
                <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>بيانات العميل</div>
                  <div style={{ fontWeight: 700, color: '#0f172a', marginTop: '4px' }}>{selectedTopup.user_name}</div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{selectedTopup.user_email}</div>
                </div>

                <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>المبلغ المطلوب بالعملة المحلية</div>
                  <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '1.05rem', marginTop: '4px' }}>
                    {Number(selectedTopup.amount_sdg).toLocaleString()} SDG
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    سعر الصرف المقفل: 1$ = {Number(selectedTopup.exchange_rate).toLocaleString()} SDG
                  </div>
                </div>

                <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>طريقة الدفع المختارة</div>
                  <div style={{ fontWeight: 700, color: '#0f172a', marginTop: '4px' }}>
                    {selectedTopup.payment_method_name || 'تحويل بنكي'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    {selectedTopup.bank_name} • {selectedTopup.account_number}
                  </div>
                </div>
              </div>

              {/* User Note if exists */}
              {selectedTopup.user_note && (
                <div style={{ background: '#f1f5f9', padding: '12px 16px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '2px' }}>
                    ملاحظة مرسلة من العميل:
                  </span>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: '#1e293b' }}>
                    {selectedTopup.user_note}
                  </p>
                </div>
              )}

              {/* Rejection Reason if Rejected */}
              {selectedTopup.status === 'REJECTED' && selectedTopup.rejection_reason && (
                <div style={{ background: '#fef2f2', padding: '12px 16px', borderRadius: '8px', border: '1px solid #f87171' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#991b1b', display: 'block', marginBottom: '2px' }}>
                    سبب الرفض:
                  </span>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: '#b91c1c', fontWeight: 600 }}>
                    {selectedTopup.rejection_reason}
                  </p>
                </div>
              )}

              {/* Transfer Receipt Card */}
              <div style={{ border: '1.5px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                <div style={{ 
                  background: '#f8fafc', 
                  padding: '10px 14px', 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  borderBottom: '1px solid #e2e8f0'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '0.875rem', color: '#1e293b' }}>
                    <FileText size={16} />
                    <span>إشعار التحويل البنكي المرفوع من العميل</span>
                  </div>
                  <a
                    href={getFullReceiptUrl(selectedTopup.receipt_url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="admin-btn admin-btn-secondary admin-btn-sm"
                    style={{ padding: '4px 8px', fontSize: '0.75rem', gap: '4px' }}
                  >
                    <ExternalLink size={13} />
                    <span>فتح في نافذة كاملة</span>
                  </a>
                </div>

                <div style={{ padding: '16px', textAlign: 'center', background: '#f1f5f9' }}>
                  {selectedTopup.receipt_url.toLowerCase().endsWith('.pdf') ? (
                    <div style={{ padding: '24px', background: '#fff', borderRadius: '8px' }}>
                      <FileText size={48} color="#dc2626" style={{ margin: '0 auto 12px' }} />
                      <p style={{ margin: '0 0 12px 0', fontWeight: 700 }}>ملف مستند PDF مرفق كإيصال</p>
                      <a
                        href={getFullReceiptUrl(selectedTopup.receipt_url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="admin-btn admin-btn-primary admin-btn-sm"
                      >
                        معاينة وتنزيل ملف PDF
                      </a>
                    </div>
                  ) : (
                    <img 
                      src={getFullReceiptUrl(selectedTopup.receipt_url)} 
                      alt="Receipt" 
                      style={{ 
                        maxHeight: '280px', 
                        maxWidth: '100%', 
                        objectFit: 'contain', 
                        borderRadius: '6px',
                        cursor: 'pointer',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                      }}
                      onClick={() => setReceiptModalUrl(getFullReceiptUrl(selectedTopup.receipt_url))}
                      title="انقر لتكبير الإيصال"
                    />
                  )}
                </div>
              </div>

              {/* Admin Note Input */}
              {selectedTopup.status === 'PENDING' && (
                <div className="admin-form-group">
                  <label className="admin-label">ملاحظات إدارية داخلية (اختياري)</label>
                  <input
                    type="text"
                    placeholder="مثال: تم التحقق من رقم الحساب وتطابق المبلغ..."
                    value={adminNote}
                    onChange={(e) => setAdminNote(e.target.value)}
                    className="admin-input"
                  />
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="admin-modal-footer">
              <button 
                type="button" 
                onClick={() => setSelectedTopup(null)} 
                className="admin-btn admin-btn-secondary"
              >
                إغلاق
              </button>

              {selectedTopup.status === 'PENDING' && (
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setShowRejectModal(true)}
                    className="admin-btn admin-btn-outline-danger"
                    disabled={isApproving || isRejecting}
                  >
                    <XCircle size={16} />
                    <span>رفض الطلب</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleApprove}
                    className="admin-btn admin-btn-primary"
                    style={{ background: '#10b981', borderColor: '#10b981' }}
                    disabled={isApproving || isRejecting}
                  >
                    {isApproving ? (
                      <>
                        <RefreshCw size={15} className="animate-spin" />
                        <span>جاري الإيداع...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={16} />
                        <span>موافقة وإيداع {formatCurrency(selectedTopup.amount_usd)}</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal with Mandatory Reason */}
      {showRejectModal && selectedTopup && (
        <div className="admin-modal-backdrop" style={{ zIndex: 11000 }} onClick={() => !isRejecting && setShowRejectModal(false)}>
          <div 
            className="admin-modal" 
            style={{ maxWidth: '480px', width: '90%' }} 
            onClick={(e) => e.stopPropagation()}
          >
            <div className="admin-modal-header">
              <h3 className="admin-modal-title" style={{ color: '#dc2626' }}>
                رفض طلب الشحن #{selectedTopup.id.slice(0, 8)}
              </h3>
              <button 
                className="admin-modal-close" 
                onClick={() => !isRejecting && setShowRejectModal(false)}
                disabled={isRejecting}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleRejectSubmit} className="admin-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p style={{ margin: 0, fontSize: '0.875rem', color: '#475569' }}>
                يرجى كتابة سبب رفض الطلب بوضوح. سيظهر هذا السبب للعميل في قائمة طلبات الشحن وسجل حسابه.
              </p>

              <div className="admin-form-group">
                <label className="admin-label">سبب الرفض*</label>
                <textarea
                  required
                  rows={3}
                  placeholder="مثال: صورة الإشعار غير واضحة، أو المبلغ المحول أقل من المطلوب..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="admin-input"
                  style={{ resize: 'vertical' }}
                  autoFocus
                />
              </div>

              <div className="admin-modal-footer" style={{ marginTop: '8px' }}>
                <button 
                  type="button" 
                  onClick={() => setShowRejectModal(false)} 
                  className="admin-btn admin-btn-secondary"
                  disabled={isRejecting}
                >
                  إلغاء
                </button>
                <button 
                  type="submit" 
                  className="admin-btn admin-btn-outline-danger"
                  style={{ background: '#ef4444', color: '#fff' }}
                  disabled={isRejecting}
                >
                  {isRejecting ? 'جاري الرفض...' : 'تأكيد رفض الطلب'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Full Image Preview Modal */}
      {receiptModalUrl && (
        <div 
          className="admin-modal-backdrop" 
          style={{ zIndex: 12000 }} 
          onClick={() => setReceiptModalUrl(null)}
        >
          <div 
            style={{ 
              maxWidth: '90vw', 
              maxHeight: '90vh', 
              position: 'relative', 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center' 
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setReceiptModalUrl(null)}
              style={{
                position: 'absolute',
                top: '-40px',
                right: '0',
                background: '#fff',
                border: 'none',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                cursor: 'pointer',
                fontWeight: 900,
                fontSize: '1.2rem'
              }}
            >
              &times;
            </button>
            <img 
              src={receiptModalUrl} 
              alt="Full Receipt" 
              style={{ 
                maxHeight: '85vh', 
                maxWidth: '90vw', 
                objectFit: 'contain', 
                borderRadius: '12px',
                boxShadow: '0 8px 30px rgba(0,0,0,0.5)'
              }} 
            />
          </div>
        </div>
      )}
    </div>
  );
};
