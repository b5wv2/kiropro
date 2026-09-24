import React, { useEffect, useState } from 'react';
import { 
  Trophy, 
  Users, 
  UserCheck, 
  CreditCard, 
  Coins, 
  Search, 
  RefreshCw, 
  Eye, 
  X, 
  Calendar, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Copy, 
  Check, 
  ArrowUpDown, 
  ChevronRight, 
  ChevronLeft,
  Flame,
  ShieldAlert
} from 'lucide-react';
import { api } from '../../lib/api';

interface ReferralStats {
  totalReferrers: number;
  totalReferrals: number;
  qualifiedReferrals: number;
  payingReferrals: number;
  referralRevenue: number;
  referralCommissions: number;
  currency: string;
}

interface LeaderboardItem {
  rank: number;
  userId: string;
  name: string;
  email: string;
  referralCode: string;
  isBanned: boolean;
  accountStatus: 'ACTIVE' | 'BANNED';
  totalReferrals: number;
  qualifiedReferrals: number;
  payingReferrals: number;
  referralRevenue: number;
  referralCommission: number;
  firstReferralDate: string | null;
  lastReferralDate: string | null;
  userCreatedAt: string;
}

interface RefereeItem {
  referralId: string;
  refereeId: string;
  name: string;
  email: string;
  referralCodeUsed: string;
  registeredAt: string;
  isQualified: boolean;
  hasDeposited: boolean;
  ordersCount: number;
  topupsCount: number;
  totalSpent: number;
  referrerRewardAmount: number;
  referrerRewardPaid: boolean;
  refereeRewardAmount: number;
  refereeRewardPaid: boolean;
  accountStatus: 'ACTIVE' | 'BANNED';
  riskFlags: string[];
}

interface ReferrerDetailsResponse {
  referrer: {
    userId: string;
    name: string;
    email: string;
    referralCode: string;
  };
  referees: RefereeItem[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
  };
}

export const AdminReferralLeaderboard: React.FC = () => {
  // Global stats state
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // Leaderboard table state
  const [items, setItems] = useState<LeaderboardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Pagination & Filter state
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'BANNED'>('ALL');
  const [minReferrals, setMinReferrals] = useState('');
  const [hasDepositedFilter, setHasDepositedFilter] = useState<'ALL' | 'YES' | 'NO'>('ALL');
  const [sortBy, setSortBy] = useState<'qualified' | 'total' | 'paying' | 'revenue' | 'commission' | 'date'>('qualified');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('DESC');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Modal State for "View Referees"
  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [selectedReferrerId, setSelectedReferrerId] = useState<string | null>(null);
  const [referrerDetails, setReferrerDetails] = useState<ReferrerDetailsResponse | null>(null);
  const [modalPage, setModalPage] = useState(1);
  const [modalSearch, setModalSearch] = useState('');
  const [modalQualifiedFilter, setModalQualifiedFilter] = useState<'ALL' | 'YES' | 'NO'>('ALL');

  // Fetch summary cards
  const fetchStats = async () => {
    setStatsLoading(true);
    try {
      const data = await api.get<ReferralStats>('/api/admin/referrals/stats');
      setStats(data || null);
    } catch (err) {
      console.error('[AdminReferralLeaderboard] Error fetching stats:', err);
    } finally {
      setStatsLoading(false);
    }
  };

  // Fetch leaderboard items
  const fetchLeaderboard = async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams();
      queryParams.set('page', String(page));
      queryParams.set('limit', String(limit));
      if (search.trim()) queryParams.set('search', search.trim());
      if (statusFilter !== 'ALL') queryParams.set('status', statusFilter);
      if (minReferrals && Number(minReferrals) > 0) queryParams.set('minReferrals', minReferrals);
      if (hasDepositedFilter !== 'ALL') queryParams.set('hasDeposited', hasDepositedFilter);
      if (sortBy) queryParams.set('sortBy', sortBy);
      if (sortOrder) queryParams.set('sortOrder', sortOrder);
      if (startDate) queryParams.set('startDate', startDate);
      if (endDate) queryParams.set('endDate', endDate);

      const res: any = await api.get(`/api/admin/referrals/leaderboard?${queryParams.toString()}`);
      if (res && res.items) {
        setItems(res.items);
        setTotalPages(res.pagination?.totalPages || 1);
        setTotalCount(res.pagination?.totalCount || 0);
      }
    } catch (err) {
      console.error('[AdminReferralLeaderboard] Error fetching leaderboard:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch referee details for modal
  const fetchReferrerDetails = async (referrerId: string, pageNum = 1) => {
    setModalLoading(true);
    try {
      const queryParams = new URLSearchParams();
      queryParams.set('page', String(pageNum));
      queryParams.set('limit', '15');
      if (modalSearch.trim()) queryParams.set('search', modalSearch.trim());
      if (modalQualifiedFilter !== 'ALL') queryParams.set('isQualified', modalQualifiedFilter);

      const res: any = await api.get(`/api/admin/referrals/${referrerId}?${queryParams.toString()}`);
      if (res) {
        setReferrerDetails(res);
      }
    } catch (err) {
      console.error('[AdminReferralLeaderboard] Error fetching referrer details:', err);
    } finally {
      setModalLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    fetchLeaderboard();
  }, [page, statusFilter, hasDepositedFilter, sortBy, sortOrder]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchLeaderboard();
  };

  const handleResetFilters = () => {
    setSearch('');
    setStatusFilter('ALL');
    setMinReferrals('');
    setHasDepositedFilter('ALL');
    setSortBy('qualified');
    setSortOrder('DESC');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  const handleOpenModal = (referrerId: string) => {
    setSelectedReferrerId(referrerId);
    setModalPage(1);
    setModalSearch('');
    setModalQualifiedFilter('ALL');
    setModalOpen(true);
    fetchReferrerDetails(referrerId, 1);
  };

  const handleModalSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedReferrerId) {
      setModalPage(1);
      fetchReferrerDetails(selectedReferrerId, 1);
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const renderRiskBadge = (flag: string) => {
    switch (flag) {
      case 'SAME_IP_AS_REFERRER':
        return <span key={flag} style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FCA5A5', padding: '2px 8px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 800 }}>⚠️ نفس IP الداعي</span>;
      case 'SAME_DEVICE_AS_REFERRER':
        return <span key={flag} style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #F87171', padding: '2px 8px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 800 }}>⚠️ نفس جهاز الداعي</span>;
      case 'MUTUAL_CROSS_REFERRAL':
        return <span key={flag} style={{ background: '#FFFBEB', color: '#D97706', border: '1px solid #FCD34D', padding: '2px 8px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 800 }}>🔄 إحالة تبادلية</span>;
      case 'RAPID_BURST_REGISTRATION':
        return <span key={flag} style={{ background: '#FFFBEB', color: '#B45309', border: '1px solid #FDE68A', padding: '2px 8px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 800 }}>⚡ تسجيل سريع متتالي</span>;
      case 'UNVERIFIED_EMAIL':
        return <span key={flag} style={{ background: '#F1F5F9', color: '#64748B', border: '1px solid #CBD5E1', padding: '2px 8px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 700 }}>✉️ بريد غير موثق</span>;
      case 'BANNED_ACCOUNT':
        return <span key={flag} style={{ background: '#450A0A', color: '#FECACA', border: '1px solid #991B1B', padding: '2px 8px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 800 }}>🚫 محظور</span>;
      default:
        return <span key={flag} style={{ background: '#F3F4F6', color: '#4B5563', padding: '2px 6px', borderRadius: 4, fontSize: '0.7rem' }}>{flag}</span>;
    }
  };

  return (
    <div style={{ paddingBottom: '40px' }} dir="rtl">
      {/* Page Title & Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#0B0F19', margin: '0 0 6px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Trophy size={28} color="#EAB308" />
            <span>متصدرين الإحالات (Referral Leaderboard)</span>
          </h2>
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
            متابعة نتائج مسابقة الإحالات، المتصدرين، وتدقيق المدعوين وعمليات الشحن وإشارات الأمان.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button 
            type="button"
            onClick={() => { fetchStats(); fetchLeaderboard(); }} 
            className="btn btn-secondary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}
          >
            <RefreshCw size={15} />
            <span>تحديث البيانات</span>
          </button>
        </div>
      </div>

      {/* Stats Cards Section */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div style={{ background: '#FFFFFF', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 700 }}>إجمالي الدُعاة</span>
            <Users size={18} color="#3B82F6" />
          </div>
          <strong style={{ fontSize: '1.6rem', color: '#0B0F19', fontWeight: 900 }}>
            {statsLoading ? '...' : (stats?.totalReferrers || 0).toLocaleString('en-US')}
          </strong>
        </div>

        <div style={{ background: '#FFFFFF', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 700 }}>إجمالي الدعوات</span>
            <Users size={18} color="#8B5CF6" />
          </div>
          <strong style={{ fontSize: '1.6rem', color: '#0B0F19', fontWeight: 900 }}>
            {statsLoading ? '...' : (stats?.totalReferrals || 0).toLocaleString('en-US')}
          </strong>
        </div>

        <div style={{ background: '#FFFFFF', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 700 }}>الدعوات المؤهلة</span>
            <UserCheck size={18} color="#10B981" />
          </div>
          <strong style={{ fontSize: '1.6rem', color: '#059669', fontWeight: 900 }}>
            {statsLoading ? '...' : (stats?.qualifiedReferrals || 0).toLocaleString('en-US')}
          </strong>
        </div>

        <div style={{ background: '#FFFFFF', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 700 }}>المشحون لهم (Paying)</span>
            <CreditCard size={18} color="#F59E0B" />
          </div>
          <strong style={{ fontSize: '1.6rem', color: '#D97706', fontWeight: 900 }}>
            {statsLoading ? '...' : (stats?.payingReferrals || 0).toLocaleString('en-US')}
          </strong>
        </div>

        <div style={{ background: '#FFFFFF', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 700 }}>قيمة شحن المدعوين</span>
            <Coins size={18} color="#059669" />
          </div>
          <strong style={{ fontSize: '1.5rem', color: '#0B0F19', fontWeight: 900 }}>
            {statsLoading ? '...' : `${Number(stats?.referralRevenue || 0).toLocaleString('en-US')} SDG`}
          </strong>
        </div>

        <div style={{ background: '#FFFFFF', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 700 }}>العمولات المكتسبة</span>
            <Coins size={18} color="#D97706" />
          </div>
          <strong style={{ fontSize: '1.5rem', color: '#15803d', fontWeight: 900 }}>
            {statsLoading ? '...' : `${Number(stats?.referralCommissions || 0).toLocaleString('en-US')} SDG`}
          </strong>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div style={{ background: '#FFFFFF', padding: '18px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
        <form onSubmit={handleSearchSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '12px' }}>
            {/* Text Search */}
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', color: '#64748b', fontWeight: 700, marginBottom: 4 }}>
                بحث (اسم، كود، بريد)
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  placeholder="ابحث بالاسم، الكود، أو البريد..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px 8px 34px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.85rem'
                  }}
                />
                <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
              </div>
            </div>

            {/* Account Status Filter */}
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', color: '#64748b', fontWeight: 700, marginBottom: 4 }}>
                حالة الحساب
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem', background: '#fff' }}
              >
                <option value="ALL">جميع الحالات</option>
                <option value="ACTIVE">نشط فقط</option>
                <option value="BANNED">محظور فقط</option>
              </select>
            </div>

            {/* Has Deposited Filter */}
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', color: '#64748b', fontWeight: 700, marginBottom: 4 }}>
                شحن المدعوين
              </label>
              <select
                value={hasDepositedFilter}
                onChange={(e) => setHasDepositedFilter(e.target.value as any)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem', background: '#fff' }}
              >
                <option value="ALL">الكل</option>
                <option value="YES">لديه مدعوون قاموا بالشحن</option>
                <option value="NO">لم يقم أي مدعو بالشحن</option>
              </select>
            </div>

            {/* Min Referrals Filter */}
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', color: '#64748b', fontWeight: 700, marginBottom: 4 }}>
                الحد الأدنى للدعوات
              </label>
              <input
                type="number"
                placeholder="مثلاً: 2"
                min="0"
                value={minReferrals}
                onChange={(e) => setMinReferrals(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
              />
            </div>

            {/* Sort Field */}
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', color: '#64748b', fontWeight: 700, marginBottom: 4 }}>
                الترتيب حسب
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem', background: '#fff' }}
              >
                <option value="qualified">الدعوات المؤهلة (الافتراضي)</option>
                <option value="total">إجمالي الدعوات</option>
                <option value="paying">المدعوون الذين شحنوا</option>
                <option value="revenue">قيمة الشحن</option>
                <option value="commission">العمولة المكتسبة</option>
                <option value="date">تاريخ آخر إحالة</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button
              type="button"
              onClick={handleResetFilters}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: '0.82rem' }}
            >
              إعادة تعيين الفلاتر
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              style={{ fontSize: '0.82rem', fontWeight: 800 }}
            >
              تطبيق الفلاتر والبحث
            </button>
          </div>
        </form>
      </div>

      {/* LEADERBOARD TABLE */}
      <div style={{ background: '#FFFFFF', borderRadius: '14px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
        {loading ? (
          <div style={{ padding: '50px', textAlign: 'center', color: '#64748b' }}>
            <RefreshCw size={28} className="animate-spin" style={{ margin: '0 auto 10px', opacity: 0.5 }} />
            <div>جاري تحميل جدول المتصدرين...</div>
          </div>
        ) : items.length === 0 ? (
          <div style={{ padding: '50px', textAlign: 'center', color: '#64748b' }}>
            <Trophy size={42} style={{ margin: '0 auto 12px', opacity: 0.25 }} />
            <div style={{ fontSize: '1rem', fontWeight: 800 }}>لا توجد نتائج مطابقة</div>
            <div style={{ fontSize: '0.85rem' }}>جرب تعديل شروط البحث أو الفلاتر أعلاه.</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 800 }}>
                  <th style={{ padding: '14px 16px' }}>#</th>
                  <th style={{ padding: '14px 16px' }}>الداعي (المستخدم)</th>
                  <th style={{ padding: '14px 16px' }}>كود الإحالة</th>
                  <th style={{ padding: '14px 16px' }}>إجمالي الدعوات</th>
                  <th style={{ padding: '14px 16px' }}>الدعوات المؤهلة</th>
                  <th style={{ padding: '14px 16px' }}>شحن المدعوين</th>
                  <th style={{ padding: '14px 16px' }}>قيمة الشحن</th>
                  <th style={{ padding: '14px 16px' }}>العمولة</th>
                  <th style={{ padding: '14px 16px' }}>آخر إحالة</th>
                  <th style={{ padding: '14px 16px' }}>الحالة</th>
                  <th style={{ padding: '14px 16px', textAlign: 'center' }}>المدعوون</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => {
                  let rankBadge = null;
                  if (row.rank === 1) rankBadge = <span style={{ fontSize: '1.2rem', marginLeft: 4 }}>🥇</span>;
                  else if (row.rank === 2) rankBadge = <span style={{ fontSize: '1.2rem', marginLeft: 4 }}>🥈</span>;
                  else if (row.rank === 3) rankBadge = <span style={{ fontSize: '1.2rem', marginLeft: 4 }}>🥉</span>;

                  return (
                    <tr 
                      key={row.userId} 
                      style={{ 
                        borderBottom: '1px solid #f1f5f9', 
                        transition: 'background 0.15s ease',
                        background: row.rank <= 3 ? '#FFFDF5' : 'transparent'
                      }}
                    >
                      <td style={{ padding: '14px 16px', fontWeight: 900, color: row.rank <= 3 ? '#D97706' : '#64748b' }}>
                        {rankBadge}
                        #{row.rank}
                      </td>

                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ fontWeight: 800, color: '#0B0F19' }}>{row.name}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{row.email}</div>
                      </td>

                      <td style={{ padding: '14px 16px' }}>
                        <button
                          type="button"
                          onClick={() => handleCopyCode(row.referralCode)}
                          style={{
                            background: '#F1F5F9',
                            border: '1px solid #E2E8F0',
                            borderRadius: '6px',
                            padding: '3px 8px',
                            fontSize: '0.8rem',
                            fontWeight: 800,
                            color: '#1E293B',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4
                          }}
                          title="نسخ كود الإحالة"
                        >
                          <span>{row.referralCode}</span>
                          {copiedCode === row.referralCode ? <Check size={12} color="#16A34A" /> : <Copy size={12} color="#64748B" />}
                        </button>
                      </td>

                      <td style={{ padding: '14px 16px', fontWeight: 700, color: '#334155' }}>
                        {row.totalReferrals}
                      </td>

                      <td style={{ padding: '14px 16px' }}>
                        <span style={{ 
                          background: row.qualifiedReferrals > 0 ? '#ECFDF5' : '#F8FAFC', 
                          color: row.qualifiedReferrals > 0 ? '#059669' : '#94A3B8',
                          padding: '3px 10px',
                          borderRadius: '12px',
                          fontWeight: 900,
                          fontSize: '0.85rem',
                          border: row.qualifiedReferrals > 0 ? '1px solid #A7F3D0' : '1px solid #E2E8F0'
                        }}>
                          {row.qualifiedReferrals}
                        </span>
                      </td>

                      <td style={{ padding: '14px 16px', fontWeight: 700, color: row.payingReferrals > 0 ? '#D97706' : '#94A3B8' }}>
                        {row.payingReferrals} مستخدم
                      </td>

                      <td style={{ padding: '14px 16px', fontWeight: 800, color: '#0B0F19' }}>
                        {row.referralRevenue.toLocaleString('en-US')} SDG
                      </td>

                      <td style={{ padding: '14px 16px', fontWeight: 800, color: '#15803d' }}>
                        {row.referralCommission.toLocaleString('en-US')} SDG
                      </td>

                      <td style={{ padding: '14px 16px', fontSize: '0.78rem', color: '#64748b' }}>
                        {row.lastReferralDate ? new Date(row.lastReferralDate).toLocaleDateString('ar-EG') : '—'}
                      </td>

                      <td style={{ padding: '14px 16px' }}>
                        {row.isBanned ? (
                          <span style={{ background: '#FEF2F2', color: '#DC2626', padding: '3px 8px', borderRadius: 6, fontSize: '0.75rem', fontWeight: 800 }}>محظور</span>
                        ) : (
                          <span style={{ background: '#F0FDF4', color: '#16A34A', padding: '3px 8px', borderRadius: 6, fontSize: '0.75rem', fontWeight: 800 }}>نشط</span>
                        )}
                      </td>

                      <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => handleOpenModal(row.userId)}
                          style={{
                            background: '#0B0F19',
                            color: '#FACC15',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '6px 14px',
                            fontSize: '0.78rem',
                            fontWeight: 800,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5
                          }}
                        >
                          <Eye size={14} />
                          <span>عرض المدعوين</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderTop: '1px solid #e2e8f0', background: '#F8FAFC' }}>
            <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
              عرض الصفحة {page} من {totalPages} (إجمالي {totalCount} داعٍ)
            </span>

            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="btn btn-secondary btn-sm"
                style={{ opacity: page <= 1 ? 0.5 : 1 }}
              >
                <ChevronRight size={14} />
                <span>السابق</span>
              </button>

              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className="btn btn-secondary btn-sm"
                style={{ opacity: page >= totalPages ? 0.5 : 1 }}
              >
                <span>التالي</span>
                <ChevronLeft size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* REFERRAL DETAILS MODAL */}
      {modalOpen && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(11, 15, 25, 0.7)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '16px'
          }}
          onClick={() => setModalOpen(false)}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '16px',
              maxWidth: '1000px',
              width: '100%',
              maxHeight: '90vh',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
            }}
            onClick={(e) => e.stopPropagation()}
            dir="rtl"
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 24px', borderBottom: '1px solid #e2e8f0', background: '#F8FAFC' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 900, color: '#0B0F19', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Users size={22} color="#3B82F6" />
                  <span>تفاصيل المدعوين لكود ({referrerDetails?.referrer.referralCode || '...'})</span>
                </h3>
                <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 4 }}>
                  الداعي: <strong>{referrerDetails?.referrer.name}</strong> ({referrerDetails?.referrer.email})
                </div>
              </div>

              <button
                type="button"
                onClick={() => setModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', padding: 6 }}
                aria-label="إغلاق"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Search & Filter */}
            <div style={{ padding: '14px 24px', borderBottom: '1px solid #f1f5f9', background: '#fff' }}>
              <form onSubmit={handleModalSearchSubmit} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <input
                  type="text"
                  placeholder="بحث في المدعوين بالاسم أو البريد..."
                  value={modalSearch}
                  onChange={(e) => setModalSearch(e.target.value)}
                  style={{ flex: 1, minWidth: 200, padding: '7px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
                />

                <select
                  value={modalQualifiedFilter}
                  onChange={(e) => {
                    setModalQualifiedFilter(e.target.value as any);
                    if (selectedReferrerId) fetchReferrerDetails(selectedReferrerId, 1);
                  }}
                  style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.82rem', background: '#fff' }}
                >
                  <option value="ALL">جميع المدعوين</option>
                  <option value="YES">المؤهلون فقط</option>
                  <option value="NO">غير المؤهلين</option>
                </select>

                <button type="submit" className="btn btn-primary btn-sm" style={{ fontWeight: 800 }}>
                  تصفية
                </button>
              </form>
            </div>

            {/* Modal Table Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px' }}>
              {modalLoading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                  <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 8px', opacity: 0.5 }} />
                  <div>جاري تحميل بيانات المدعوين...</div>
                </div>
              ) : !referrerDetails?.referees || referrerDetails.referees.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                  <Users size={36} style={{ margin: '0 auto 8px', opacity: 0.3 }} />
                  <div>لا يوجد مدعوون مطابقون للبحث.</div>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: '0.78rem', fontWeight: 800 }}>
                      <th style={{ padding: '12px 10px' }}>المدعو</th>
                      <th style={{ padding: '12px 10px' }}>تاريخ التسجيل</th>
                      <th style={{ padding: '12px 10px' }}>مؤهل؟</th>
                      <th style={{ padding: '12px 10px' }}>قام بالشحن؟</th>
                      <th style={{ padding: '12px 10px' }}>إجمالي الشحن</th>
                      <th style={{ padding: '12px 10px' }}>العمولة الممنوحة</th>
                      <th style={{ padding: '12px 10px' }}>إشارات الأمان والمخاطر</th>
                    </tr>
                  </thead>
                  <tbody>
                    {referrerDetails.referees.map((ref) => (
                      <tr key={ref.refereeId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '12px 10px' }}>
                          <div style={{ fontWeight: 800, color: '#0B0F19' }}>{ref.name}</div>
                          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{ref.email}</div>
                          <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>ID: {ref.refereeId.slice(0, 8)}...</div>
                        </td>

                        <td style={{ padding: '12px 10px', fontSize: '0.78rem', color: '#64748b' }}>
                          {new Date(ref.registeredAt).toLocaleDateString('ar-EG')}
                        </td>

                        <td style={{ padding: '12px 10px' }}>
                          {ref.isQualified ? (
                            <span style={{ background: '#ECFDF5', color: '#059669', padding: '2px 8px', borderRadius: 6, fontSize: '0.75rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <CheckCircle2 size={12} />
                              <span>مؤهل</span>
                            </span>
                          ) : (
                            <span style={{ background: '#FEF2F2', color: '#DC2626', padding: '2px 8px', borderRadius: 6, fontSize: '0.75rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <XCircle size={12} />
                              <span>غير مؤهل</span>
                            </span>
                          )}
                        </td>

                        <td style={{ padding: '12px 10px' }}>
                          {ref.hasDeposited ? (
                            <span style={{ background: '#F0FDF4', color: '#16A34A', padding: '2px 8px', borderRadius: 6, fontSize: '0.75rem', fontWeight: 800 }}>
                              🟢 قام بالشحن ({ref.ordersCount + ref.topupsCount})
                            </span>
                          ) : (
                            <span style={{ background: '#F8FAFC', color: '#94A3B8', padding: '2px 8px', borderRadius: 6, fontSize: '0.75rem' }}>
                              ⚪ لم يشحن
                            </span>
                          )}
                        </td>

                        <td style={{ padding: '12px 10px', fontWeight: 800 }}>
                          {ref.totalSpent.toLocaleString('en-US')} SDG
                        </td>

                        <td style={{ padding: '12px 10px', fontWeight: 800, color: ref.referrerRewardPaid ? '#15803d' : '#64748b' }}>
                          {ref.referrerRewardPaid ? `+${ref.referrerRewardAmount} SDG` : 'قيد الانتظار'}
                        </td>

                        <td style={{ padding: '12px 10px' }}>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {ref.riskFlags.length === 0 ? (
                              <span style={{ color: '#059669', fontSize: '0.75rem', fontWeight: 700 }}>✔️ سليم</span>
                            ) : (
                              ref.riskFlags.map(flag => renderRiskBadge(flag))
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Modal Footer & Pagination */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 24px', borderTop: '1px solid #e2e8f0', background: '#F8FAFC' }}>
              <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                إجمالي المدعوين: {referrerDetails?.pagination.totalCount || 0}
              </span>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  disabled={modalPage <= 1}
                  onClick={() => {
                    const p = Math.max(1, modalPage - 1);
                    setModalPage(p);
                    if (selectedReferrerId) fetchReferrerDetails(selectedReferrerId, p);
                  }}
                  className="btn btn-secondary btn-sm"
                  style={{ opacity: modalPage <= 1 ? 0.5 : 1, fontSize: '0.75rem' }}
                >
                  السابق
                </button>

                <button
                  type="button"
                  disabled={!referrerDetails?.pagination || modalPage >= referrerDetails.pagination.totalPages}
                  onClick={() => {
                    const p = modalPage + 1;
                    setModalPage(p);
                    if (selectedReferrerId) fetchReferrerDetails(selectedReferrerId, p);
                  }}
                  className="btn btn-secondary btn-sm"
                  style={{ opacity: (!referrerDetails?.pagination || modalPage >= referrerDetails.pagination.totalPages) ? 0.5 : 1, fontSize: '0.75rem' }}
                >
                  التالي
                </button>

                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: '0.75rem', fontWeight: 800 }}
                >
                  إغلاق
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
