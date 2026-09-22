import React, { useEffect, useState } from 'react';
import { 
  ShieldCheck, 
  X, 
  Laptop, 
  Smartphone, 
  Tablet, 
  Clock, 
  Globe, 
  Ban, 
  Unlock, 
  Trash2, 
  RefreshCw, 
  Activity, 
  AlertTriangle,
  History,
  CheckCircle2,
  XCircle,
  Eye
} from 'lucide-react';
import { api } from '../../lib/api';
import styles from './UserSecurityModal.module.css';

interface UserSecurityModalProps {
  userId: string;
  onClose: () => void;
  onStatusChanged?: () => void;
}

export const UserSecurityModal: React.FC<UserSecurityModalProps> = ({
  userId,
  onClose,
  onStatusChanged
}) => {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'sessions' | 'logins' | 'devices' | 'ips' | 'events' | 'bans'>('sessions');

  // Action Modals State
  const [showBanModal, setShowBanModal] = useState(false);
  const [showUnbanModal, setShowUnbanModal] = useState<string | null>(null); // banId
  const [showRevokeAllConfirm, setShowRevokeAllConfirm] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Ban Form State
  const [banReason, setBanReason] = useState('');
  const [banAccount, setBanAccount] = useState(true);
  const [banIp, setBanIp] = useState(true);
  const [banDevice, setBanDevice] = useState(true);
  const [banDuration, setBanDuration] = useState<number | null>(null); // null = Permanent
  const [customHours, setCustomHours] = useState('');

  // Unban Form State
  const [unbanReason, setUnbanReason] = useState('فك الحظر من قبل الإدارة بعد المراجعة');

  // Selected event metadata viewer
  const [selectedMetaEvent, setSelectedMetaEvent] = useState<any | null>(null);

  const fetchSecurityData = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/api/admin/users/${userId}/security`);
      setData(res);
    } catch (err: any) {
      console.error('Failed to load user security details:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSecurityData();
  }, [userId]);

  const handleRevokeSession = async (sessionId: string) => {
    if (!window.confirm('هل تريد بالتأكيد إلغاء هذه الجلسة فوراً؟')) return;
    setActionLoading(true);
    try {
      await api.post(`/api/admin/users/${userId}/sessions/${sessionId}/revoke`, {
        reason: 'إلغاء يدوي من لوحة التحكم'
      });
      await fetchSecurityData();
    } catch (err: any) {
      alert(err?.message || 'فشل إلغاء الجلسة.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRevokeAllSessions = async () => {
    setActionLoading(true);
    try {
      await api.post(`/api/admin/users/${userId}/sessions/revoke-all`, {
        reason: 'إلغاء جميع الجلسات من المشرف'
      });
      setShowRevokeAllConfirm(false);
      await fetchSecurityData();
    } catch (err: any) {
      alert(err?.message || 'فشل إلغاء الجلسات.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateBan = async () => {
    if (!banReason.trim()) {
      setActionError('يرجى كتابة سبب الحظر.');
      return;
    }

    // Determine scope
    let scope = 'ACCOUNT_IP_DEVICE';
    if (banAccount && banIp && banDevice) scope = 'ACCOUNT_IP_DEVICE';
    else if (banAccount && banIp) scope = 'ACCOUNT_IP';
    else if (banAccount && banDevice) scope = 'ACCOUNT_DEVICE';
    else if (banAccount) scope = 'ACCOUNT';
    else if (banIp) scope = 'IP';
    else if (banDevice) scope = 'DEVICE';
    else {
      setActionError('يجب تحديد نوع حظر واحد على الأقل (الحساب، أو IP، أو الجهاز).');
      return;
    }

    let durationHours: number | null = banDuration;
    if (banDuration === -1) {
      const parsed = parseInt(customHours, 10);
      if (!parsed || parsed <= 0) {
        setActionError('يرجى إدخال عدد ساعات صحيح.');
        return;
      }
      durationHours = parsed;
    }

    setActionLoading(true);
    setActionError(null);

    try {
      await api.post(`/api/admin/users/${userId}/ban`, {
        reason: banReason.trim(),
        scope,
        durationHours
      });
      setShowBanModal(false);
      setBanReason('');
      await fetchSecurityData();
      if (onStatusChanged) onStatusChanged();
    } catch (err: any) {
      setActionError(err?.message || 'فشل تطبيق الحظر.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRevokeBan = async (banId: string) => {
    setActionLoading(true);
    setActionError(null);

    try {
      await api.post(`/api/admin/bans/${banId}/revoke`, {
        reason: unbanReason.trim()
      });
      setShowUnbanModal(null);
      await fetchSecurityData();
      if (onStatusChanged) onStatusChanged();
    } catch (err: any) {
      alert(err?.message || 'فشل فك الحظر.');
    } finally {
      setActionLoading(false);
    }
  };

  const getDeviceIcon = (type: string) => {
    switch (type?.toLowerCase()) {
      case 'mobile':
        return <Smartphone size={20} />;
      case 'tablet':
        return <Tablet size={20} />;
      default:
        return <Laptop size={20} />;
    }
  };

  const formatDate = (d?: string | Date) => {
    if (!d) return '—';
    return new Date(d).toLocaleString('ar-EG', {
      dateStyle: 'medium',
      timeStyle: 'short'
    });
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerTitleGroup}>
            <div className={styles.headerIcon}>
              <ShieldCheck size={24} />
            </div>
            <div>
              <h2 className={styles.title}>مركز الأمان والنشاط: {data?.user?.name || 'العميل'}</h2>
              <p className={styles.subtitle}>
                <span>{data?.user?.email}</span>
                <span>•</span>
                <span>المعرّف: {userId}</span>
              </p>
            </div>
          </div>
          <button onClick={onClose} className={styles.closeBtn} title="إغلاق">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {loading ? (
            <div className={styles.emptyState}>
              <RefreshCw size={28} className="animate-spin" style={{ margin: '0 auto 0.75rem auto' }} />
              <p>جاري تحميل بيانات الأمان والسجلات...</p>
            </div>
          ) : !data ? (
            <div className={styles.emptyState}>
              <AlertTriangle size={32} color="#f87171" style={{ margin: '0 auto 0.75rem auto' }} />
              <p>فشل تحميل بيانات أمان المستخدم.</p>
            </div>
          ) : (
            <>
              {/* Security Status Banner */}
              <div className={`${styles.statusBanner} ${data.summary.isBanned ? styles.statusBanned : styles.statusActive}`}>
                <div className={styles.statusInfo}>
                  <div className={`${styles.statusBadge} ${data.summary.isBanned ? styles.badgeBanned : styles.badgeActive}`}>
                    {data.summary.isBanned ? (
                      <>
                        <Ban size={16} />
                        <span>محظور (Banned)</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={16} />
                        <span>نشط وآمن (Active)</span>
                      </>
                    )}
                  </div>
                  <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                    {data.summary.isBanned 
                      ? 'الحساب مقيد حالياً ولا يمكنه تسجيل الدخول أو إجراء أي عمليات.' 
                      : 'الحساب يعمل بشكل طبيعي ولم يتم تسجيل قيود نشطة.'}
                  </span>
                </div>

                <div className={styles.quickActions}>
                  {data.summary.isBanned ? (
                    <button 
                      onClick={() => setShowUnbanModal(data.bans.find((b: any) => b.status === 'ACTIVE')?.id || null)}
                      className={`${styles.btnAction} ${styles.btnUnban}`}
                    >
                      <Unlock size={15} />
                      <span>فك الحظر</span>
                    </button>
                  ) : (
                    <button 
                      onClick={() => {
                        setBanAccount(true);
                        setBanIp(true);
                        setBanDevice(true);
                        setBanDuration(null);
                        setShowBanModal(true);
                      }}
                      className={`${styles.btnAction} ${styles.btnBan}`}
                    >
                      <Ban size={15} />
                      <span>حظر المستخدم</span>
                    </button>
                  )}

                  <button 
                    onClick={() => setShowRevokeAllConfirm(true)}
                    className={`${styles.btnAction} ${styles.btnRevokeAll}`}
                    title="إلغاء جميع جلسات المستخدم النشطة"
                  >
                    <Trash2 size={15} />
                    <span>إلغاء جميع الجلسات</span>
                  </button>

                  <button 
                    onClick={fetchSecurityData}
                    className={`${styles.btnAction} ${styles.btnRevokeAll}`}
                    title="تحديث البيانات"
                  >
                    <RefreshCw size={14} />
                    <span>تحديث</span>
                  </button>
                </div>
              </div>

              {/* Stats Summary Grid */}
              <div className={styles.statsGrid}>
                <div className={styles.statCard}>
                  <span className={styles.statLabel}>الجلسات النشطة</span>
                  <span className={styles.statValue}>{data.summary.activeSessionsCount}</span>
                  <span className={styles.statSub}>من أصل {data.allSessions?.length || 0} جلسة</span>
                </div>
                <div className={styles.statCard}>
                  <span className={styles.statLabel}>الأجهزة المسجلة</span>
                  <span className={styles.statValue}>{data.summary.knownDevicesCount}</span>
                  <span className={styles.statSub}>أجهزة فريدة</span>
                </div>
                <div className={styles.statCard}>
                  <span className={styles.statLabel}>عناوين IP</span>
                  <span className={styles.statValue}>{data.summary.knownIpsCount}</span>
                  <span className={styles.statSub}>شبكات مختلفة</span>
                </div>
                <div className={styles.statCard}>
                  <span className={styles.statLabel}>فشل الدخول (24 س)</span>
                  <span className={styles.statValue} style={{ color: data.summary.failedLogins24h > 3 ? '#f87171' : '#f3f4f6' }}>
                    {data.summary.failedLogins24h}
                  </span>
                  <span className={styles.statSub}>7 أيام: {data.summary.failedLogins7d}</span>
                </div>
                <div className={styles.statCard}>
                  <span className={styles.statLabel}>الأحداث الأمنية</span>
                  <span className={styles.statValue}>{data.summary.securityEventsCount}</span>
                  <span className={styles.statSub}>سجلات مسجلة</span>
                </div>
                <div className={styles.statCard}>
                  <span className={styles.statLabel}>سجلات الحظر</span>
                  <span className={styles.statValue} style={{ color: data.summary.activeBansCount > 0 ? '#f87171' : '#10b981' }}>
                    {data.summary.activeBansCount}
                  </span>
                  <span className={styles.statSub}>الإجمالي: {data.bans?.length || 0}</span>
                </div>
              </div>

              {/* Tab Navigation */}
              <div className={styles.tabNav}>
                <button 
                  className={`${styles.tabBtn} ${activeTab === 'sessions' ? styles.tabBtnActive : ''}`}
                  onClick={() => setActiveTab('sessions')}
                >
                  <Clock size={16} />
                  <span>الجلسات النشطة ({data.activeSessions?.length || 0})</span>
                </button>
                <button 
                  className={`${styles.tabBtn} ${activeTab === 'logins' ? styles.tabBtnActive : ''}`}
                  onClick={() => setActiveTab('logins')}
                >
                  <History size={16} />
                  <span>سجل الدخول</span>
                </button>
                <button 
                  className={`${styles.tabBtn} ${activeTab === 'devices' ? styles.tabBtnActive : ''}`}
                  onClick={() => setActiveTab('devices')}
                >
                  <Laptop size={16} />
                  <span>الأجهزة ({data.knownDevices?.length || 0})</span>
                </button>
                <button 
                  className={`${styles.tabBtn} ${activeTab === 'ips' ? styles.tabBtnActive : ''}`}
                  onClick={() => setActiveTab('ips')}
                >
                  <Globe size={16} />
                  <span>عناوين IP ({data.knownIps?.length || 0})</span>
                </button>
                <button 
                  className={`${styles.tabBtn} ${activeTab === 'events' ? styles.tabBtnActive : ''}`}
                  onClick={() => setActiveTab('events')}
                >
                  <Activity size={16} />
                  <span>الأحداث الأمنية</span>
                </button>
                <button 
                  className={`${styles.tabBtn} ${activeTab === 'bans' ? styles.tabBtnActive : ''}`}
                  onClick={() => setActiveTab('bans')}
                >
                  <Ban size={16} />
                  <span>سجل الحظر ({data.bans?.length || 0})</span>
                </button>
              </div>

              {/* Tab Content */}
              <div className={styles.tabContent}>
                {/* 1. SESSIONS TAB */}
                {activeTab === 'sessions' && (
                  <div className={styles.sessionsList}>
                    {(!data.activeSessions || data.activeSessions.length === 0) ? (
                      <div className={styles.emptyState}>لا توجد جلسات نشطة حالياً لهذا المستخدم.</div>
                    ) : (
                      data.activeSessions.map((s: any) => (
                        <div key={s.id} className={styles.sessionCard}>
                          <div className={styles.sessionPrimary}>
                            <div className={styles.sessionIcon}>
                              {getDeviceIcon(s.device_type)}
                            </div>
                            <div className={styles.sessionInfo}>
                              <div className={styles.sessionTitle}>
                                {s.browser} {s.browser_version} على {s.operating_system} {s.os_version}
                              </div>
                              <div className={styles.sessionMeta}>
                                <span>IP: {s.ip_address}</span>
                                <span className={styles.sessionDot}>•</span>
                                <span>الجهاز: {s.deviceIdMasked}</span>
                                <span className={styles.sessionDot}>•</span>
                                <span>آخر نشاط: {formatDate(s.last_seen_at)}</span>
                                <span className={styles.sessionDot}>•</span>
                                <span>بدء الجلسة: {formatDate(s.login_at)}</span>
                              </div>
                            </div>
                          </div>

                          <button 
                            onClick={() => handleRevokeSession(s.session_id)}
                            className={styles.btnRevokeSingle}
                            disabled={actionLoading}
                          >
                            إلغاء الجلسة
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* 2. LOGIN HISTORY TAB */}
                {activeTab === 'logins' && (
                  <div className={styles.tableContainer}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>الحالة</th>
                          <th>عنوان IP</th>
                          <th>الجهاز</th>
                          <th>الوقت</th>
                          <th>التفاصيل</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(!data.loginHistory || data.loginHistory.length === 0) ? (
                          <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem' }}>لا توجد محاولات دخول مسجلة.</td></tr>
                        ) : (
                          data.loginHistory.map((e: any) => {
                            const isSuccess = e.event_type === 'LOGIN_SUCCESS' || e.event_type === 'SESSION_CREATED';
                            const isLogout = e.event_type === 'LOGOUT';
                            return (
                              <tr key={e.id}>
                                <td>
                                  <span style={{ 
                                    display: 'inline-flex', 
                                    alignItems: 'center', 
                                    gap: '0.3rem', 
                                    color: isSuccess ? '#10b981' : isLogout ? '#94a3b8' : '#f87171',
                                    fontWeight: 600
                                  }}>
                                    {isSuccess ? <CheckCircle2 size={14} /> : isLogout ? <Clock size={14} /> : <XCircle size={14} />}
                                    <span>{e.event_type}</span>
                                  </span>
                                </td>
                                <td>{e.ip_address}</td>
                                <td>{e.deviceIdMasked || '—'}</td>
                                <td>{formatDate(e.created_at)}</td>
                                <td>
                                  {e.metadata?.reason && (
                                    <span style={{ color: '#fca5a5', fontSize: '0.75rem' }}>{e.metadata.reason}</span>
                                  )}
                                  {e.metadata?.browser && (
                                    <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{e.metadata.browser} ({e.metadata.os})</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* 3. DEVICES TAB */}
                {activeTab === 'devices' && (
                  <div className={styles.tableContainer}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>معرّف الجهاز (KIROPRO ID)</th>
                          <th>نوع الجهاز</th>
                          <th>المتصفح والنظام</th>
                          <th>الجلسات</th>
                          <th>أول ظهور</th>
                          <th>آخر ظهور</th>
                          <th>الارتباطات (Abuse Correlation)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(!data.knownDevices || data.knownDevices.length === 0) ? (
                          <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem' }}>لا توجد أجهزة مسجلة حتى الآن.</td></tr>
                        ) : (
                          data.knownDevices.map((d: any, idx: number) => (
                            <tr key={idx}>
                              <td>
                                <code style={{ color: '#38bdf8', background: '#1e293b', padding: '0.2rem 0.45rem', borderRadius: 4 }}>
                                  {d.deviceId}
                                </code>
                              </td>
                              <td>{d.deviceType}</td>
                              <td>{d.browser} {d.browserVersion} / {d.operatingSystem}</td>
                              <td>{d.sessionsCount} جلسة</td>
                              <td>{formatDate(d.firstSeen)}</td>
                              <td>{formatDate(d.lastSeen)}</td>
                              <td>
                                {d.correlatedUsers && d.correlatedUsers.length > 0 ? (
                                  <div className={styles.correlationBadge}>
                                    <AlertTriangle size={12} />
                                    <span>ظهر مع {d.correlatedUsers.length} حساب آخر ({d.correlatedUsers.map((u: any) => u.name || u.email).join(', ')})</span>
                                  </div>
                                ) : (
                                  <span style={{ color: '#10b981', fontSize: '0.75rem' }}>خاص بهذا الحساب فقط</span>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* 4. IP ADDRESSES TAB */}
                {activeTab === 'ips' && (
                  <div className={styles.tableContainer}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>عنوان IP</th>
                          <th>الجلسات</th>
                          <th>محاولات الدخول</th>
                          <th>أول ظهور</th>
                          <th>آخر ظهور</th>
                          <th>حالة العنوان</th>
                          <th>الحسابات المسجلة من هذا IP</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(!data.knownIps || data.knownIps.length === 0) ? (
                          <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem' }}>لا توجد عناوين IP مسجلة.</td></tr>
                        ) : (
                          data.knownIps.map((item: any, idx: number) => (
                            <tr key={idx}>
                              <td>
                                <code style={{ color: '#f3f4f6', background: '#1e293b', padding: '0.2rem 0.45rem', borderRadius: 4 }}>
                                  {item.ip}
                                </code>
                              </td>
                              <td>{item.sessionsCount}</td>
                              <td>{item.loginAttempts}</td>
                              <td>{formatDate(item.firstSeen)}</td>
                              <td>{formatDate(item.lastSeen)}</td>
                              <td>
                                {item.isBanned ? (
                                  <span style={{ color: '#f87171', fontWeight: 600 }}>محظور (Banned)</span>
                                ) : (
                                  <span style={{ color: '#10b981' }}>طبيعي</span>
                                )}
                              </td>
                              <td>
                                {item.correlatedUsers && item.correlatedUsers.length > 0 ? (
                                  <div className={styles.correlationBadge}>
                                    <AlertTriangle size={12} />
                                    <span>ظهر مع {item.correlatedUsers.length} حساب ({item.correlatedUsers.map((u: any) => u.name || u.email).join(', ')})</span>
                                  </div>
                                ) : (
                                  <span style={{ color: '#10b981', fontSize: '0.75rem' }}>لم يظهر مع حسابات أخرى</span>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* 5. SECURITY EVENTS TAB */}
                {activeTab === 'events' && (
                  <div className={styles.tableContainer}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>الحدث</th>
                          <th>IP</th>
                          <th>الجهاز</th>
                          <th>الوقت</th>
                          <th>البيانات الوصفية</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(!data.securityEvents || data.securityEvents.length === 0) ? (
                          <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem' }}>لا توجد أحداث أمنية مسجلة.</td></tr>
                        ) : (
                          data.securityEvents.map((e: any) => (
                            <tr key={e.id}>
                              <td>
                                <span style={{ fontWeight: 600, color: '#60a5fa' }}>{e.event_type}</span>
                              </td>
                              <td>{e.ip_address}</td>
                              <td>{e.deviceIdMasked || '—'}</td>
                              <td>{formatDate(e.created_at)}</td>
                              <td>
                                <button
                                  onClick={() => setSelectedMetaEvent(e)}
                                  className={styles.btnRevokeSingle}
                                  style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#60a5fa', borderColor: 'rgba(59, 130, 246, 0.3)' }}
                                >
                                  <Eye size={12} style={{ display: 'inline', marginLeft: 4 }} />
                                  <span>عرض البيانات</span>
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* 6. BANS HISTORY TAB */}
                {activeTab === 'bans' && (
                  <div className={styles.tableContainer}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>الحالة</th>
                          <th>النطاق (Scope)</th>
                          <th>السبب</th>
                          <th>تاريخ الحظر</th>
                          <th>ينتهي في</th>
                          <th>المشرف</th>
                          <th>الإجراء</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(!data.bans || data.bans.length === 0) ? (
                          <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem' }}>لا توجد سجلات حظر سابقة.</td></tr>
                        ) : (
                          data.bans.map((b: any) => (
                            <tr key={b.id}>
                              <td>
                                <span style={{ 
                                  color: b.status === 'ACTIVE' ? '#f87171' : b.status === 'REVOKED' ? '#10b981' : '#94a3b8',
                                  fontWeight: 700
                                }}>
                                  {b.status === 'ACTIVE' ? 'نشط (فعّال)' : b.status === 'REVOKED' ? 'تم فك الحظر' : 'منتهي الصلاحية'}
                                </span>
                              </td>
                              <td>
                                <code style={{ color: '#fbbf24', background: '#1e293b', padding: '0.2rem 0.4rem', borderRadius: 4 }}>
                                  {b.scope}
                                </code>
                              </td>
                              <td>{b.reason}</td>
                              <td>{formatDate(b.created_at)}</td>
                              <td>{b.expires_at ? formatDate(b.expires_at) : 'دائم (Permanent)'}</td>
                              <td>{b.creator_name || b.creator_email || 'الإدارة'}</td>
                              <td>
                                {b.status === 'ACTIVE' && (
                                  <button
                                    onClick={() => setShowUnbanModal(b.id)}
                                    className={`${styles.btnAction} ${styles.btnUnban}`}
                                    style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                                  >
                                    فك الحظر
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* --- SUB-MODAL 1: BAN USER MODAL --- */}
      {showBanModal && (
        <div className={styles.formModal}>
          <div className={styles.formBox}>
            <h3 className={styles.formTitle}>
              <Ban size={20} color="#ef4444" />
              <span>حظر المستخدم: {data?.user?.name || data?.user?.email}</span>
            </h3>

            <div className={styles.formGroup}>
              <span className={styles.formLabel}>معرّف الحساب: {userId}</span>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>البريد: {data?.user?.email}</span>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>سبب الحظر (مطلوب):</label>
              <textarea
                className={styles.formTextarea}
                rows={2}
                placeholder="أدخل سبب الحظر للمراجعة والرقابة..."
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>نطاق الحظر (Scope):</label>
              <div className={styles.checkboxGroup}>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={banAccount}
                    onChange={(e) => setBanAccount(e.target.checked)}
                  />
                  <span>الحساب</span>
                </label>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={banIp}
                    onChange={(e) => setBanIp(e.target.checked)}
                  />
                  <span>عنوان IP</span>
                </label>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={banDevice}
                    onChange={(e) => setBanDevice(e.target.checked)}
                  />
                  <span>الجهاز</span>
                </label>
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>مدة الحظر:</label>
              <div className={styles.durationGrid}>
                <button
                  type="button"
                  className={`${styles.durationBtn} ${banDuration === null ? styles.durationBtnSelected : ''}`}
                  onClick={() => setBanDuration(null)}
                >
                  دائم (Permanent)
                </button>
                <button
                  type="button"
                  className={`${styles.durationBtn} ${banDuration === 1 ? styles.durationBtnSelected : ''}`}
                  onClick={() => setBanDuration(1)}
                >
                  1 ساعة
                </button>
                <button
                  type="button"
                  className={`${styles.durationBtn} ${banDuration === 24 ? styles.durationBtnSelected : ''}`}
                  onClick={() => setBanDuration(24)}
                >
                  24 ساعة
                </button>
                <button
                  type="button"
                  className={`${styles.durationBtn} ${banDuration === 168 ? styles.durationBtnSelected : ''}`}
                  onClick={() => setBanDuration(168)}
                >
                  7 أيام
                </button>
                <button
                  type="button"
                  className={`${styles.durationBtn} ${banDuration === 720 ? styles.durationBtnSelected : ''}`}
                  onClick={() => setBanDuration(720)}
                >
                  30 يوم
                </button>
                <button
                  type="button"
                  className={`${styles.durationBtn} ${banDuration === -1 ? styles.durationBtnSelected : ''}`}
                  onClick={() => setBanDuration(-1)}
                >
                  مخصص
                </button>
              </div>

              {banDuration === -1 && (
                <div style={{ marginTop: '0.5rem' }}>
                  <input
                    type="number"
                    className={styles.formInput}
                    placeholder="عدد الساعات (مثلاً 48)..."
                    value={customHours}
                    onChange={(e) => setCustomHours(e.target.value)}
                  />
                </div>
              )}
            </div>

            {actionError && (
              <div style={{ color: '#f87171', fontSize: '0.8rem', background: 'rgba(239, 68, 68, 0.1)', padding: '0.5rem', borderRadius: 6 }}>
                {actionError}
              </div>
            )}

            <div className={styles.formActions}>
              <button
                type="button"
                onClick={() => setShowBanModal(false)}
                className={styles.btnCancel}
                disabled={actionLoading}
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleCreateBan}
                className={styles.btnSubmitDanger}
                disabled={actionLoading}
              >
                {actionLoading ? 'جاري التنفيذ...' : 'تأكيد الحظر'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- SUB-MODAL 2: UNBAN CONFIRMATION MODAL --- */}
      {showUnbanModal && (
        <div className={styles.formModal}>
          <div className={styles.formBox}>
            <h3 className={styles.formTitle}>
              <Unlock size={20} color="#10b981" />
              <span>تأكيد فك الحظر</span>
            </h3>

            <p style={{ fontSize: '0.85rem', color: '#cbd5e1', lineHeight: 1.6 }}>
              هل تريد بالتأكيد فك هذا الحظر عن المستخدم؟
            </p>

            <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', padding: '0.75rem', borderRadius: 8, fontSize: '0.8rem', color: '#fbbf24' }}>
              <strong>ملاحظة هامة:</strong> فك الحظر لا يُعيد أي جلسة سابقة تم إلغاؤها. سيتمكن المستخدم من تسجيل الدخول بحسابه بطلب جلسة جديدة ونظيفة.
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>سبب فك الحظر:</label>
              <input
                type="text"
                className={styles.formInput}
                value={unbanReason}
                onChange={(e) => setUnbanReason(e.target.value)}
              />
            </div>

            <div className={styles.formActions}>
              <button
                type="button"
                onClick={() => setShowUnbanModal(null)}
                className={styles.btnCancel}
                disabled={actionLoading}
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => handleRevokeBan(showUnbanModal)}
                className={styles.btnSubmitSuccess}
                disabled={actionLoading}
              >
                {actionLoading ? 'جاري التنفيذ...' : 'تأكيد فك الحظر'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- SUB-MODAL 3: REVOKE ALL CONFIRMATION --- */}
      {showRevokeAllConfirm && (
        <div className={styles.formModal}>
          <div className={styles.formBox}>
            <h3 className={styles.formTitle}>
              <AlertTriangle size={20} color="#ef4444" />
              <span>إلغاء جميع الجلسات النشطة</span>
            </h3>

            <p style={{ fontSize: '0.85rem', color: '#cbd5e1', lineHeight: 1.6 }}>
              هل تريد تسجيل خروج هذا المستخدم من كافة الأجهزة والمتصفحات فوراً؟
              سيتم رفض أي طلبات قادمة من رموزه الحالية.
            </p>

            <div className={styles.formActions}>
              <button
                type="button"
                onClick={() => setShowRevokeAllConfirm(false)}
                className={styles.btnCancel}
                disabled={actionLoading}
              >
                تراجع
              </button>
              <button
                type="button"
                onClick={handleRevokeAllSessions}
                className={styles.btnSubmitDanger}
                disabled={actionLoading}
              >
                {actionLoading ? 'جاري الإلغاء...' : 'تأكيد إلغاء كل الجلسات'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- SUB-MODAL 4: METADATA VIEWER --- */}
      {selectedMetaEvent && (
        <div className={styles.formModal}>
          <div className={styles.formBox} style={{ maxWidth: 640 }}>
            <h3 className={styles.formTitle}>
              <Activity size={20} color="#60a5fa" />
              <span>بيانات الحدث: {selectedMetaEvent.event_type}</span>
            </h3>

            <div style={{ maxHeight: 350, overflowY: 'auto' }}>
              <pre style={{ background: '#0a0f1d', padding: '1rem', borderRadius: 8, color: '#38bdf8', fontSize: '0.8rem', direction: 'ltr' }}>
                {JSON.stringify(selectedMetaEvent.metadata || {}, null, 2)}
              </pre>
            </div>

            <div className={styles.formActions}>
              <button
                type="button"
                onClick={() => setSelectedMetaEvent(null)}
                className={styles.btnCancel}
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
