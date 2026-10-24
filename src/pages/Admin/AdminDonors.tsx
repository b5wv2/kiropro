import React, { useEffect, useState } from 'react';
import {
  Search,
  RefreshCw,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  X,
  TrendingUp,
  ShieldAlert,
  Flame,
  UserCheck
} from 'lucide-react';
import { api } from '../../lib/api';

export interface AdminDonor {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  wallet_balance: number;
  total_donated_amount: number;
  military_rank: string;
  rank_badge: string;
  rank_level: number;
  accent_color: string;
  currency: string;
  donations_today: number;
  total_transactions_count: number;
  last_donation_at: string | null;
}

export const AdminDonors: React.FC = () => {
  const [donors, setDonors] = useState<AdminDonor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterTodayOnly, setFilterTodayOnly] = useState(false);

  // Reset Modal state
  const [selectedDonor, setSelectedDonor] = useState<AdminDonor | null>(null);
  const [resetType, setResetType] = useState<'reset_only' | 'refund_and_reset'>('reset_only');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const fetchDonors = async () => {
    try {
      setLoading(true);
      const res = await api.get<{ donors: AdminDonor[] }>('/api/admin/donors');
      if (res?.donors) {
        setDonors(res.donors);
      }
    } catch (err: any) {
      console.error('Failed to load donors:', err);
      showToast(err?.data?.error || err.message || 'تعذر تحميل بيانات الداعمين.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDonors();
  }, []);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4500);
  };

  const handleOpenResetModal = (donor: AdminDonor) => {
    setSelectedDonor(donor);
    setResetType('reset_only');
  };

  const handleExecuteReset = async () => {
    if (!selectedDonor) return;

    try {
      setSubmitting(true);
      const res = await api.post<{ success: boolean; message: string; refundedAmount?: number }>(
        `/api/admin/donors/${selectedDonor.id}/reset`,
        { action: resetType, refund: resetType === 'refund_and_reset' }
      );

      showToast(res.message || 'تم تصفير بيانات الداعم بنجاح.', 'success');
      setSelectedDonor(null);
      await fetchDonors();
    } catch (err: any) {
      console.error('Failed to reset donor:', err);
      showToast(err?.data?.error || err.message || 'فشل تنفيذ عملية التصفير.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Filter donors
  const filteredDonors = donors.filter(d => {
    const term = search.toLowerCase().trim();
    const matchesSearch =
      !term ||
      (d.name && d.name.toLowerCase().includes(term)) ||
      (d.email && d.email.toLowerCase().includes(term)) ||
      (d.military_rank && d.military_rank.toLowerCase().includes(term));

    const matchesToday = !filterTodayOnly || d.donations_today > 0;

    return matchesSearch && matchesToday;
  });

  // KPI calculations
  const totalDonationsSum = donors.reduce((acc, d) => acc + (d.total_donated_amount || 0), 0);
  const totalDonationsTodayCount = donors.reduce((acc, d) => acc + (d.donations_today || 0), 0);
  const cappedUsersCount = donors.filter(d => d.donations_today >= 5).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Toast Notification */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            top: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10005,
            background: toast.type === 'success' ? '#10B981' : '#EF4444',
            color: '#FFFFFF',
            padding: '12px 24px',
            borderRadius: 12,
            boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 14,
            fontWeight: 800
          }}
        >
          {toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Top Header & Breadcrumb */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#0F172A', margin: 0 }}>
            إدارة الداعمين والرتب العسكرية 🎖️
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#64748B', margin: '4px 0 0 0' }}>
            متابعة إجمالي مبالغ دعم المنصة، رتب المستخدمين، العمليات اليومية، والتصفير أو الاسترجاع اليدوي.
          </p>
        </div>

        <button
          onClick={fetchDonors}
          disabled={loading}
          className="admin-btn admin-btn-secondary"
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          <span>تحديث القائمة</span>
        </button>
      </div>

      {/* KPI Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        <div className="admin-card" style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(245, 158, 11, 0.12)', color: '#D97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <TrendingUp size={24} />
          </div>
          <div>
            <span style={{ fontSize: 12, color: '#64748B', fontWeight: 700 }}>إجمالي مبالغ الدعم التراكمية</span>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#0F172A', marginTop: 2 }}>
              {totalDonationsSum.toLocaleString('en-US')} ج.س
            </div>
          </div>
        </div>

        <div className="admin-card" style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(59, 130, 246, 0.12)', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <UserCheck size={24} />
          </div>
          <div>
            <span style={{ fontSize: 12, color: '#64748B', fontWeight: 700 }}>إجمالي الداعمين المسجلين</span>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#0F172A', marginTop: 2 }}>
              {donors.length} داعم
            </div>
          </div>
        </div>

        <div className="admin-card" style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(16, 185, 129, 0.12)', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Flame size={24} />
          </div>
          <div>
            <span style={{ fontSize: 12, color: '#64748B', fontWeight: 700 }}>عمليات الدعم المنفذة اليوم</span>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#0F172A', marginTop: 2 }}>
              {totalDonationsTodayCount} عملية
            </div>
          </div>
        </div>

        <div className="admin-card" style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(239, 68, 68, 0.12)', color: '#DC2626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ShieldAlert size={24} />
          </div>
          <div>
            <span style={{ fontSize: 12, color: '#64748B', fontWeight: 700 }}>المكتملون للحد اليومي (5/5)</span>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#DC2626', marginTop: 2 }}>
              {cappedUsersCount} مستخدم
            </div>
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="admin-card" style={{ padding: 20 }}>
        {/* Filter and Search Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 18 }}>
          <div style={{ position: 'relative', width: '100%', maxWidth: 360 }}>
            <Search size={18} style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', right: 12, color: '#94A3B8' }} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="بحث بالاسم، البريد الإلكتروني، أو الرتبة..."
              className="admin-input"
              style={{ width: '100%', paddingRight: 38 }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: '#475569', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={filterTodayOnly}
                onChange={e => setFilterTodayOnly(e.target.checked)}
                style={{ width: 16, height: 16, cursor: 'pointer' }}
              />
              <span>عرض داعمي اليوم فقط ({donors.filter(d => d.donations_today > 0).length})</span>
            </label>
          </div>
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto' }}>
          <table className="admin-table" style={{ width: '100%', textAlign: 'right' }}>
            <thead>
              <tr>
                <th>العميل والبريد</th>
                <th>رصيد المحفظة الحالي</th>
                <th>إجمالي الدعم التراكمي</th>
                <th>الرتبة العسكرية</th>
                <th>دعم اليوم</th>
                <th>تاريخ الانضمام</th>
                <th style={{ textAlign: 'center' }}>إجراءات التحكم</th>
              </tr>
            </thead>
            <tbody>
              {loading && donors.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '40px 0', color: '#64748B' }}>
                    <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                    <div>جارٍ تحميل سجل الداعمين والرتب...</div>
                  </td>
                </tr>
              ) : filteredDonors.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '40px 0', color: '#64748B' }}>
                    لم يتم العثور على أي داعمين مطابقين للبحث.
                  </td>
                </tr>
              ) : (
                filteredDonors.map(donor => {
                  const isPresident = donor.military_rank?.includes('رئيس') || donor.military_rank?.includes('الدولة');
                  const isCapped = donor.donations_today >= 5;

                  return (
                    <tr key={donor.id}>
                      {/* Customer Info */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div
                            style={{
                              width: 38,
                              height: 38,
                              borderRadius: '50%',
                              background: isPresident ? '#0F172A' : '#F1F5F9',
                              color: isPresident ? '#FDE047' : '#0F172A',
                              border: isPresident ? '1.5px solid #F59E0B' : '1px solid #CBD5E1',
                              fontWeight: 900,
                              fontSize: 14,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0
                            }}
                          >
                            {donor.name ? donor.name.charAt(0).toUpperCase() : '👤'}
                          </div>
                          <div>
                            <div style={{ fontWeight: 800, color: '#0F172A' }}>{donor.name}</div>
                            <div style={{ fontSize: 12, color: '#64748B', direction: 'ltr', textAlign: 'right' }}>
                              {donor.email}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Wallet Balance */}
                      <td>
                        <span style={{ fontWeight: 800, color: '#059669', fontSize: 14 }}>
                          {donor.wallet_balance.toLocaleString('en-US')} ج.س
                        </span>
                      </td>

                      {/* Total Donated */}
                      <td>
                        <span style={{ fontWeight: 900, color: '#D97706', fontSize: 15 }}>
                          {donor.total_donated_amount.toLocaleString('en-US')} ج.س
                        </span>
                      </td>

                      {/* Rank Badge */}
                      <td>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            padding: '3px 10px',
                            borderRadius: 9999,
                            fontSize: 12,
                            fontWeight: 800,
                            background: isPresident ? '#0F172A' : (donor.accent_color ? `${donor.accent_color}18` : '#F1F5F9'),
                            color: isPresident ? '#FDE047' : (donor.accent_color || '#475569'),
                            border: isPresident ? '1.5px solid #F59E0B' : `1px solid ${donor.accent_color || '#CBD5E1'}`
                          }}
                        >
                          <span>{donor.rank_badge}</span>
                          <span>{donor.military_rank}</span>
                        </span>
                      </td>

                      {/* Today's Donations Count */}
                      <td>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '2px 8px',
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 800,
                            background: isCapped ? '#FEF2F2' : (donor.donations_today > 0 ? '#ECFDF5' : '#F8FAFC'),
                            color: isCapped ? '#DC2626' : (donor.donations_today > 0 ? '#059669' : '#64748B'),
                            border: isCapped ? '1px solid #FECACA' : '1px solid #E2E8F0'
                          }}
                        >
                          {donor.donations_today} / 5
                          {isCapped && <span>⚠️</span>}
                        </span>
                      </td>

                      {/* Joined Date */}
                      <td>
                        <div style={{ fontSize: 12, color: '#64748B' }}>
                          {new Date(donor.createdAt).toLocaleDateString('ar-EG', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </div>
                      </td>

                      {/* Actions */}
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => handleOpenResetModal(donor)}
                          className="admin-btn admin-btn-danger"
                          style={{
                            padding: '6px 12px',
                            fontSize: 12,
                            fontWeight: 800,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            background: '#EF4444',
                            color: '#FFFFFF'
                          }}
                        >
                          <RotateCcw size={14} />
                          <span>تصفير الدعم والرتبة</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CONFIRMATION / RESET MODAL */}
      {selectedDonor && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20
          }}
          onClick={() => !submitting && setSelectedDonor(null)}
        >
          <div
            className="admin-card"
            style={{
              width: '100%',
              maxWidth: 520,
              padding: 24,
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              position: 'relative'
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid #E2E8F0', paddingBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: '#FEF2F2', color: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <RotateCcw size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: 17, fontWeight: 900, color: '#0F172A', margin: 0 }}>
                    تصفير الدعم والرتبة العسكرية
                  </h3>
                  <span style={{ fontSize: 12, color: '#64748B' }}>
                    العميل: {selectedDonor.name} ({selectedDonor.email})
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedDonor(null)}
                disabled={submitting}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94A3B8' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Donor Stats Summary Box */}
            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: 14, marginBottom: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                <span style={{ color: '#64748B', fontWeight: 700 }}>الرتبة العسكرية الحالية:</span>
                <span style={{ fontWeight: 800, color: '#0F172A' }}>
                  {selectedDonor.military_rank} {selectedDonor.rank_badge}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                <span style={{ color: '#64748B', fontWeight: 700 }}>إجمالي مبالغ الدعم التراكمية:</span>
                <span style={{ fontWeight: 900, color: '#D97706' }}>
                  {selectedDonor.total_donated_amount.toLocaleString('en-US')} ج.س
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: '#64748B', fontWeight: 700 }}>رصيد المحفظة الحالي:</span>
                <span style={{ fontWeight: 800, color: '#059669' }}>
                  {selectedDonor.wallet_balance.toLocaleString('en-US')} ج.س
                </span>
              </div>
            </div>

            {/* Choose Action Mode */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
              <label style={{ fontSize: 13, fontWeight: 800, color: '#0F172A' }}>
                حدد نوع الإجراء المطلوب تطبيقه:
              </label>

              {/* Option 1: Reset Only */}
              <div
                onClick={() => setResetType('reset_only')}
                style={{
                  border: `2px solid ${resetType === 'reset_only' ? '#EF4444' : '#E2E8F0'}`,
                  background: resetType === 'reset_only' ? '#FEF2F2' : '#FFFFFF',
                  borderRadius: 10,
                  padding: 12,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  transition: 'all 150ms ease'
                }}
              >
                <input
                  type="radio"
                  name="reset_type"
                  checked={resetType === 'reset_only'}
                  onChange={() => setResetType('reset_only')}
                  style={{ marginTop: 3, cursor: 'pointer' }}
                />
                <div>
                  <div style={{ fontWeight: 800, fontSize: 14, color: '#0F172A' }}>
                    1. تصفير الدعم والرتبة فقط (بدون استرجاع رصيد)
                  </div>
                  <div style={{ fontSize: 12, color: '#64748B', marginTop: 3, lineHeight: 1.4 }}>
                    إعادة `total_donated_amount = 0` وتصفير الرتبة إلى "مدني". لا يتم المساس برصيد المحفظة ولا إعادة أي أموال (مخصص للحالات التأديبية أو عندما كان الدعم مقصوداً).
                  </div>
                </div>
              </div>

              {/* Option 2: Refund to Wallet & Reset */}
              <div
                onClick={() => setResetType('refund_and_reset')}
                style={{
                  border: `2px solid ${resetType === 'refund_and_reset' ? '#10B981' : '#E2E8F0'}`,
                  background: resetType === 'refund_and_reset' ? '#ECFDF5' : '#FFFFFF',
                  borderRadius: 10,
                  padding: 12,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  transition: 'all 150ms ease'
                }}
              >
                <input
                  type="radio"
                  name="reset_type"
                  checked={resetType === 'refund_and_reset'}
                  onChange={() => setResetType('refund_and_reset')}
                  style={{ marginTop: 3, cursor: 'pointer' }}
                />
                <div>
                  <div style={{ fontWeight: 800, fontSize: 14, color: '#0F172A' }}>
                    2. تصفير مع إعادة الرصيد للمحفظة (Refund to Wallet)
                  </div>
                  <div style={{ fontSize: 12, color: '#64748B', marginTop: 3, lineHeight: 1.4 }}>
                    إعادة مبلغ الدعم بالكامل ({selectedDonor.total_donated_amount.toLocaleString('en-US')} ج.س) إلى رصيد محفظة العميل ليصبح{' '}
                    <strong>{(selectedDonor.wallet_balance + selectedDonor.total_donated_amount).toLocaleString('en-US')} ج.س</strong>، وتصفير الدعم والرتبة إلى "مدني" (لحالات دعم الأطفال بالخطأ).
                  </div>
                </div>
              </div>
            </div>

            {/* Actions Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                className="admin-btn admin-btn-secondary"
                disabled={submitting}
                onClick={() => setSelectedDonor(null)}
              >
                إلغاء التراجع
              </button>

              <button
                type="button"
                disabled={submitting}
                onClick={handleExecuteReset}
                className="admin-btn"
                style={{
                  background: resetType === 'refund_and_reset' ? '#059669' : '#DC2626',
                  color: '#FFFFFF',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                }}
              >
                {submitting && <RefreshCw size={14} className="animate-spin" />}
                <span>
                  {resetType === 'refund_and_reset' ? 'تأكيد التصفير وإعادة الأموال للمحفظة' : 'تأكيد تصفير الدعم والرتبة فوراً'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDonors;
