import React, { useEffect, useState } from 'react';
import { 
  ShieldCheck, 
  Search, 
  RefreshCw, 
  Activity, 
  AlertTriangle, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Eye, 
  Lock
} from 'lucide-react';
import { api } from '../../lib/api';

interface SecurityEventItem {
  id: string;
  user_id?: string;
  event_type: string;
  ip_address: string;
  device_id?: string;
  session_id?: string;
  user_agent?: string;
  metadata: any;
  created_at: string;
  user?: {
    name?: string;
    email?: string;
    role?: string;
  };
}

interface SecurityStats {
  activeSessions: number;
  activeUsers: number;
  loginFailures24h: number;
  securityEvents24h: number;
  activeBans: number;
  bansToday: number;
  suspiciousLogins: number;
}

export const AdminSecurityAudit: React.FC = () => {
  const [events, setEvents] = useState<SecurityEventItem[]>([]);
  const [stats, setStats] = useState<SecurityStats | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [eventType, setEventType] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(0);
  const limit = 30;

  // Selected event for metadata view
  const [selectedMeta, setSelectedMeta] = useState<any | null>(null);

  const fetchStats = async () => {
    setStatsLoading(true);
    try {
      const data = await api.get('/api/admin/security/stats');
      setStats(data);
    } catch (err) {
      console.error('Failed to fetch security stats:', err);
    } finally {
      setStatsLoading(false);
    }
  };

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const params: any = {
        limit,
        offset: page * limit
      };
      if (search.trim()) params.search = search.trim();
      if (eventType) params.eventType = eventType;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;

      const res = await api.get('/api/admin/security/events', { params });
      setEvents(res.events || []);
      setTotal(res.total || 0);
    } catch (err) {
      console.error('Failed to load security events:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [page, eventType, startDate, endDate]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
    fetchEvents();
  };

  const getEventBadge = (type: string) => {
    if (type === 'LOGIN_SUCCESS' || type === 'SESSION_CREATED') {
      return { color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)', icon: <CheckCircle2 size={13} /> };
    }
    if (type === 'LOGIN_FAILED' || type === 'BAN_CREATED') {
      return { color: '#f87171', bg: 'rgba(239, 68, 68, 0.12)', icon: <XCircle size={13} /> };
    }
    if (type === 'BAN_REVOKED') {
      return { color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.12)', icon: <CheckCircle2 size={13} /> };
    }
    if (type === 'SUSPICIOUS_LOGIN' || type === 'BAN_MATCH' || type === 'ABUSE_SIGNAL') {
      return { color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.12)', icon: <AlertTriangle size={13} /> };
    }
    if (type === 'PASSWORD_CHANGED' || type === 'PASSWORD_RESET_COMPLETED') {
      return { color: '#a78bfa', bg: 'rgba(167, 139, 250, 0.12)', icon: <Lock size={13} /> };
    }
    return { color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.12)', icon: <Clock size={13} /> };
  };

  const maskDev = (id?: string) => {
    if (!id) return '—';
    if (id.length <= 10) return id;
    return `${id.substring(0, 7)}...${id.substring(id.length - 4)}`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', direction: 'rtl' }}>
      {/* Top Security Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.85rem' }}>
        <div className="admin-card" style={{ padding: '1rem' }}>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem' }}>الجلسات النشطة</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#38bdf8' }}>
            {statsLoading ? '...' : stats?.activeSessions || 0}
          </div>
          <div style={{ fontSize: '0.7rem', color: '#64748b' }}>مستخدمين: {stats?.activeUsers || 0}</div>
        </div>

        <div className="admin-card" style={{ padding: '1rem' }}>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem' }}>فشل الدخول (24 س)</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: (stats?.loginFailures24h || 0) > 5 ? '#f87171' : '#f3f4f6' }}>
            {statsLoading ? '...' : stats?.loginFailures24h || 0}
          </div>
          <div style={{ fontSize: '0.7rem', color: '#64748b' }}>محاولات دخول غير ناجحة</div>
        </div>

        <div className="admin-card" style={{ padding: '1rem' }}>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem' }}>إجمالي الأحداث (24 س)</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#f3f4f6' }}>
            {statsLoading ? '...' : stats?.securityEvents24h || 0}
          </div>
          <div style={{ fontSize: '0.7rem', color: '#64748b' }}>سجلات نشاط أمني</div>
        </div>

        <div className="admin-card" style={{ padding: '1rem' }}>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem' }}>سجلات الحظر النشطة</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: (stats?.activeBans || 0) > 0 ? '#f87171' : '#10b981' }}>
            {statsLoading ? '...' : stats?.activeBans || 0}
          </div>
          <div style={{ fontSize: '0.7rem', color: '#64748b' }}>حظر اليوم: {stats?.bansToday || 0}</div>
        </div>

        <div className="admin-card" style={{ padding: '1rem' }}>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem' }}>إشارات الاشتباه (7 أيام)</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: (stats?.suspiciousLogins || 0) > 0 ? '#fbbf24' : '#10b981' }}>
            {statsLoading ? '...' : stats?.suspiciousLogins || 0}
          </div>
          <div style={{ fontSize: '0.7rem', color: '#64748b' }}>تطابق جهاز/IP مشبوه</div>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="admin-filter-bar" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
        <form onSubmit={handleSearchSubmit} className="admin-search-wrapper" style={{ flex: '1 1 260px' }}>
          <Search size={18} className="admin-search-icon" />
          <input
            type="text"
            className="admin-input admin-search-input"
            placeholder="ابحث بالبريد، المعرّف، IP، أو الجهاز..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <select
            className="admin-input"
            value={eventType}
            onChange={(e) => {
              setEventType(e.target.value);
              setPage(0);
            }}
            style={{ minWidth: 160 }}
          >
            <option value="">كافة أنواع الأحداث</option>
            <option value="LOGIN_SUCCESS">LOGIN_SUCCESS (دخول ناجح)</option>
            <option value="LOGIN_FAILED">LOGIN_FAILED (فشل دخول)</option>
            <option value="LOGOUT">LOGOUT (تسجيل خروج)</option>
            <option value="SESSION_CREATED">SESSION_CREATED (إنشاء جلسة)</option>
            <option value="SESSION_REVOKED">SESSION_REVOKED (إلغاء جلسة)</option>
            <option value="PASSWORD_CHANGED">PASSWORD_CHANGED (تغيير كلمة المرور)</option>
            <option value="PASSWORD_RESET_COMPLETED">PASSWORD_RESET (استعادة كلمة المرور)</option>
            <option value="REGISTER">REGISTER (تسجيل جديد)</option>
            <option value="BAN_CREATED">BAN_CREATED (حظر جديد)</option>
            <option value="BAN_REVOKED">BAN_REVOKED (فك حظر)</option>
            <option value="BAN_EXPIRED">BAN_EXPIRED (انتهاء حظر)</option>
            <option value="BAN_MATCH">BAN_MATCH (تطابق حظر)</option>
            <option value="SUSPICIOUS_LOGIN">SUSPICIOUS_LOGIN (اشتباه)</option>
          </select>

          <input
            type="date"
            className="admin-input"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setPage(0);
            }}
            title="من تاريخ"
          />

          <input
            type="date"
            className="admin-input"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              setPage(0);
            }}
            title="إلى تاريخ"
          />

          <button
            onClick={() => {
              fetchStats();
              fetchEvents();
            }}
            className="admin-btn admin-btn-secondary admin-btn-sm"
            title="تحديث السجل"
          >
            <RefreshCw size={14} />
            <span>تحديث</span>
          </button>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="admin-card">
        <div className="admin-card-header">
          <h3 className="admin-card-title">
            <ShieldCheck size={18} color="#38bdf8" />
            <span>سجل الأحداث الأمنية والرقابة (Security Audit Log) ({total})</span>
          </h3>
          <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
            سجل تدقيق أمني غير قابل للتعديل مسجل في PostgreSQL
          </span>
        </div>

        <div className="admin-table-container">
          <table className="admin-table">
            <thead>
              <tr>
                <th>نوع الحدث</th>
                <th>المستخدم / البريد</th>
                <th>عنوان IP</th>
                <th>معرّف الجهاز (KIROPRO)</th>
                <th>التاريخ والوقت</th>
                <th>البيانات</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '3rem' }}>
                    <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 0.5rem auto' }} />
                    <p>جاري تحميل سجل الأمان...</p>
                  </td>
                </tr>
              ) : events.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                    لا توجد أحداث أمنية تطابق شروط البحث.
                  </td>
                </tr>
              ) : (
                events.map((e) => {
                  const badge = getEventBadge(e.event_type);
                  return (
                    <tr key={e.id}>
                      <td>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          padding: '0.3rem 0.65rem',
                          borderRadius: 6,
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          background: badge.bg,
                          color: badge.color
                        }}>
                          {badge.icon}
                          <span>{e.event_type}</span>
                        </span>
                      </td>
                      <td>
                        {e.user?.email ? (
                          <div>
                            <div style={{ fontWeight: 600, color: '#f3f4f6' }}>{e.user.name || 'مستخدم'}</div>
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{e.user.email}</div>
                          </div>
                        ) : e.user_id ? (
                          <code style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{e.user_id.substring(0, 8)}...</code>
                        ) : (
                          <span style={{ color: '#64748b', fontSize: '0.8rem' }}>زائر / غير مسجل</span>
                        )}
                      </td>
                      <td>
                        <code style={{ color: '#e2e8f0', background: '#1e293b', padding: '0.2rem 0.4rem', borderRadius: 4, fontSize: '0.8rem' }}>
                          {e.ip_address}
                        </code>
                      </td>
                      <td>
                        <code style={{ color: '#38bdf8', background: '#1e293b', padding: '0.2rem 0.4rem', borderRadius: 4, fontSize: '0.8rem' }}>
                          {maskDev(e.device_id)}
                        </code>
                      </td>
                      <td>
                        <span style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>
                          {new Date(e.created_at).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}
                        </span>
                      </td>
                      <td>
                        <button
                          onClick={() => setSelectedMeta(e)}
                          className="admin-btn admin-btn-secondary admin-btn-sm"
                          style={{ padding: '0.25rem 0.55rem', fontSize: '0.75rem' }}
                        >
                          <Eye size={12} />
                          <span>تفاصيل</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {total > limit && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', borderTop: '1px solid #1f2937' }}>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
              عرض {page * limit + 1} - {Math.min((page + 1) * limit, total)} من أصل {total} حدث
            </span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                disabled={page === 0}
                onClick={() => setPage(p => Math.max(0, p - 1))}
                className="admin-btn admin-btn-secondary admin-btn-sm"
              >
                السابق
              </button>
              <button
                disabled={(page + 1) * limit >= total}
                onClick={() => setPage(p => p + 1)}
                className="admin-btn admin-btn-secondary admin-btn-sm"
              >
                التالي
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Metadata Viewer Modal */}
      {selectedMeta && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(4px)',
          zIndex: 10005,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem'
        }}>
          <div className="admin-card" style={{ maxWidth: 640, width: '100%', padding: '1.5rem', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#f3f4f6', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Activity size={18} color="#38bdf8" />
                <span>تفاصيل الحدث: {selectedMeta.event_type}</span>
              </h3>
              <button onClick={() => setSelectedMeta(null)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '1rem' }}>
              <div><strong>المعرّف:</strong> {selectedMeta.id}</div>
              <div><strong>المستخدم:</strong> {selectedMeta.user?.name || '—'} ({selectedMeta.user?.email || selectedMeta.user_id || 'زائر'})</div>
              <div><strong>عنوان IP:</strong> {selectedMeta.ip_address}</div>
              <div><strong>معرّف الجهاز:</strong> {selectedMeta.device_id || '—'}</div>
              <div><strong>User-Agent:</strong> <span style={{ fontSize: '0.75rem', color: '#94a3b8', wordBreak: 'break-all' }}>{selectedMeta.user_agent || '—'}</span></div>
              <div><strong>التاريخ:</strong> {new Date(selectedMeta.created_at).toLocaleString('ar-EG')}</div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
              <label style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                البيانات الوصفية المسجلة (JSON Metadata):
              </label>
              <pre style={{
                background: '#0a0f1d',
                padding: '1rem',
                borderRadius: 8,
                color: '#38bdf8',
                fontSize: '0.8rem',
                direction: 'ltr',
                margin: 0,
                overflowX: 'auto'
              }}>
                {JSON.stringify(selectedMeta.metadata || {}, null, 2)}
              </pre>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button
                onClick={() => setSelectedMeta(null)}
                className="admin-btn admin-btn-secondary admin-btn-sm"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
