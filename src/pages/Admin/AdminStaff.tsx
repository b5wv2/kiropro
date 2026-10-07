import React, { useEffect, useState } from 'react';
import { 
  Shield, 
  ShieldAlert, 
  ShieldCheck, 
  UserCheck, 
  UserPlus, 
  UserX, 
  Users, 
  Search, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  Key, 
  Lock, 
  Mail, 
  User as UserIcon, 
  Crown, 
  Check, 
  X,
  Sliders,
  Layers,
  Sparkles,
  ShoppingBag,
  DollarSign,
  Cpu
} from 'lucide-react';
import { api } from '../../lib/api';
import { StatCard } from '../../components/admin/StatCard';

interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: string;
  isSuperAdmin: boolean;
  permissions: string[];
  createdAt: string;
  updatedAt?: string;
  emailVerified: boolean;
  activeSession?: {
    session_id: string;
    ip_address: string;
    device_type: string;
    last_seen_at: string;
  } | null;
}

interface PermissionDef {
  id: string;
  name: string;
  category: 'OPERATIONS' | 'CATALOG' | 'FINANCE' | 'SYSTEM';
  description: string;
}

export const AdminStaff: React.FC = () => {
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [availablePermissions, setAvailablePermissions] = useState<PermissionDef[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [search, setSearch] = useState<string>('');
  
  // Feedback alert
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modals state
  const [createModalOpen, setCreateModalOpen] = useState<boolean>(false);
  const [createTab, setCreateTab] = useState<'APPOINT' | 'CREATE'>('APPOINT');
  const [appointEmail, setAppointEmail] = useState<string>('');
  const [appointPermissions, setAppointPermissions] = useState<string[]>([]);
  const [newAdminName, setNewAdminName] = useState<string>('');
  const [newAdminEmail, setNewAdminEmail] = useState<string>('');
  const [newAdminPassword, setNewAdminPassword] = useState<string>('');
  const [newAdminPermissions, setNewAdminPermissions] = useState<string[]>([]);
  const [submittingAction, setSubmittingAction] = useState<boolean>(false);

  // Edit Permissions Modal
  const [editingUser, setEditingUser] = useState<StaffUser | null>(null);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);

  // Revoke Single Modal
  const [revokingUser, setRevokingUser] = useState<StaffUser | null>(null);
  const [revokeDemoteOption, setRevokeDemoteOption] = useState<boolean>(false);

  // Revoke All Modal
  const [bulkRevokeModalOpen, setBulkRevokeModalOpen] = useState<boolean>(false);
  const [bulkRevokeDemoteOption, setBulkRevokeDemoteOption] = useState<boolean>(false);

  // Demote Modal
  const [demotingUser, setDemotingUser] = useState<StaffUser | null>(null);

  const fetchStaff = async () => {
    try {
      const data = await api.get('/api/admin/staff');
      if (data && data.success) {
        setStaff(data.staff || []);
        setAvailablePermissions(data.availablePermissions || []);
        setIsSuperAdmin(Boolean(data.currentUserIsSuperAdmin));
      }
    } catch (err: any) {
      console.error('Failed to load staff list:', err);
      showFeedback('error', err.response?.data?.error || 'فشل تحميل بيانات فريق الإدارة.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStaff();
  }, []);

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => {
      setFeedback(null);
    }, 6000);
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchStaff();
  };

  // Helpers for category labeling & icons
  const getCategoryInfo = (category: string) => {
    switch (category) {
      case 'OPERATIONS':
        return { label: 'العمليات والطلبات', icon: ShoppingBag, color: '#3b82f6', bg: '#eff6ff' };
      case 'CATALOG':
        return { label: 'الكتالوج والمنتجات', icon: Layers, color: '#8b5cf6', bg: '#f5f3ff' };
      case 'FINANCE':
        return { label: 'الشؤون المالية والشركاء', icon: DollarSign, color: '#10b981', bg: '#ecfdf5' };
      case 'SYSTEM':
        return { label: 'النظام والرقابة', icon: Cpu, color: '#f59e0b', bg: '#fffbeb' };
      default:
        return { label: 'صلاحيات عامة', icon: Shield, color: '#64748b', bg: '#f8fafc' };
    }
  };

  // Permission presets
  const applyPreset = (preset: 'ALL' | 'OPERATIONS' | 'FINANCE' | 'CATALOG' | 'NONE', target: 'APPOINT' | 'CREATE' | 'EDIT') => {
    let result: string[] = [];
    if (preset === 'ALL') {
      result = availablePermissions.map(p => p.id);
    } else if (preset === 'OPERATIONS') {
      result = ['ORDERS_MANAGE', 'CUSTOMERS_MANAGE', 'REVIEWS_MANAGE', 'KIROPRO_CARDS_MANAGE'];
    } else if (preset === 'FINANCE') {
      result = ['TOPUPS_MANAGE', 'PAYMENT_METHODS_MANAGE', 'CRYPTO_MANAGE', 'PARTNERS_MANAGE', 'CASHBACK_MANAGE', 'PROMO_CODES_MANAGE', 'WHEEL_MANAGE'];
    } else if (preset === 'CATALOG') {
      result = ['PRODUCTS_MANAGE', 'KIROPRO_CARDS_MANAGE', 'VIRTUAL_NUMBERS_MANAGE', 'PROVIDERS_MANAGE'];
    } else if (preset === 'NONE') {
      result = [];
    }

    if (target === 'APPOINT') setAppointPermissions(result);
    if (target === 'CREATE') setNewAdminPermissions(result);
    if (target === 'EDIT') setSelectedPermissions(result);
  };

  const togglePermission = (permId: string, currentList: string[], setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    if (currentList.includes(permId)) {
      setter(currentList.filter(id => id !== permId));
    } else {
      setter([...currentList, permId]);
    }
  };

  // Submit Appoint Existing
  const handleAppointSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appointEmail.trim()) {
      showFeedback('error', 'يرجى إدخال البريد الإلكتروني للمستخدم.');
      return;
    }
    setSubmittingAction(true);
    try {
      const res = await api.post('/api/admin/staff/appoint', {
        email: appointEmail.trim(),
        permissions: appointPermissions
      });
      showFeedback('success', res.message || 'تم تعيين الإداري بنجاح.');
      setCreateModalOpen(false);
      setAppointEmail('');
      setAppointPermissions([]);
      fetchStaff();
    } catch (err: any) {
      showFeedback('error', err.response?.data?.error || 'فشل تعيين الإداري.');
    } finally {
      setSubmittingAction(false);
    }
  };

  // Submit Create New Admin
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdminEmail.trim() || !newAdminPassword.trim()) {
      showFeedback('error', 'يرجى إدخال البريد الإلكتروني وكلمة المرور.');
      return;
    }
    if (newAdminPassword.length < 6) {
      showFeedback('error', 'كلمة المرور يجب أن لا تقل عن 6 خانات.');
      return;
    }
    setSubmittingAction(true);
    try {
      const res = await api.post('/api/admin/staff/create', {
        name: newAdminName.trim() || 'مسؤول إداري',
        email: newAdminEmail.trim(),
        password: newAdminPassword,
        permissions: newAdminPermissions
      });
      showFeedback('success', res.message || 'تم إنشاء الحساب الإداري بنجاح.');
      setCreateModalOpen(false);
      setNewAdminName('');
      setNewAdminEmail('');
      setNewAdminPassword('');
      setNewAdminPermissions([]);
      fetchStaff();
    } catch (err: any) {
      showFeedback('error', err.response?.data?.error || 'فشل إنشاء الحساب الإداري.');
    } finally {
      setSubmittingAction(false);
    }
  };

  // Open Edit Permissions
  const handleOpenEdit = (user: StaffUser) => {
    setEditingUser(user);
    if (user.permissions.includes('*')) {
      setSelectedPermissions(availablePermissions.map(p => p.id));
    } else {
      setSelectedPermissions(user.permissions || []);
    }
  };

  // Submit Update Permissions
  const handleSavePermissions = async () => {
    if (!editingUser) return;
    setSubmittingAction(true);
    try {
      const res = await api.patch(`/api/admin/staff/${editingUser.id}/permissions`, {
        permissions: selectedPermissions
      });
      showFeedback('success', res.message || 'تم تحديث الصلاحيات بنجاح.');
      setEditingUser(null);
      fetchStaff();
    } catch (err: any) {
      showFeedback('error', err.response?.data?.error || 'فشل تحديث الصلاحيات.');
    } finally {
      setSubmittingAction(false);
    }
  };

  // Submit Single Revoke
  const handleConfirmRevoke = async () => {
    if (!revokingUser) return;
    setSubmittingAction(true);
    try {
      const res = await api.post(`/api/admin/staff/${revokingUser.id}/revoke`, {
        demoteToCustomer: revokeDemoteOption
      });
      showFeedback('success', res.message || 'تم سحب الصلاحيات بنجاح.');
      setRevokingUser(null);
      setRevokeDemoteOption(false);
      fetchStaff();
    } catch (err: any) {
      showFeedback('error', err.response?.data?.error || 'فشل سحب الصلاحيات.');
    } finally {
      setSubmittingAction(false);
    }
  };

  // Submit Bulk Revoke All
  const handleConfirmBulkRevoke = async () => {
    setSubmittingAction(true);
    try {
      const res = await api.post('/api/admin/staff/revoke-all', {
        demoteToCustomer: bulkRevokeDemoteOption
      });
      showFeedback('success', res.message || 'تم سحب الصلاحيات من جميع الإداريين بنجاح.');
      setBulkRevokeModalOpen(false);
      setBulkRevokeDemoteOption(false);
      fetchStaff();
    } catch (err: any) {
      showFeedback('error', err.response?.data?.error || 'فشل سحب الصلاحيات.');
    } finally {
      setSubmittingAction(false);
    }
  };

  // Submit Demote
  const handleConfirmDemote = async () => {
    if (!demotingUser) return;
    setSubmittingAction(true);
    try {
      const res = await api.delete(`/api/admin/staff/${demotingUser.id}`);
      showFeedback('success', res.message || 'تم إلغاء رتبة الإداري وتحويله لعميل عادي.');
      setDemotingUser(null);
      fetchStaff();
    } catch (err: any) {
      showFeedback('error', err.response?.data?.error || 'فشل إلغاء رتبة الإداري.');
    } finally {
      setSubmittingAction(false);
    }
  };

  // Statistics
  const totalAdmins = staff.length;
  const superAdminCount = staff.filter(s => s.isSuperAdmin).length;
  const activeSubAdmins = staff.filter(s => !s.isSuperAdmin && (s.permissions.length > 0 || s.permissions.includes('*'))).length;
  const revokedAdmins = staff.filter(s => !s.isSuperAdmin && s.permissions.length === 0).length;

  // Filtered staff list
  const filteredStaff = staff.filter(s => {
    const term = search.toLowerCase();
    return (
      (s.name || '').toLowerCase().includes(term) ||
      (s.email || '').toLowerCase().includes(term)
    );
  });

  if (loading) {
    return (
      <div className="admin-empty-state">
        <div className="admin-skeleton" style={{ width: '100%', height: '140px', borderRadius: '16px' }} />
        <div className="admin-skeleton" style={{ width: '100%', height: '320px', borderRadius: '16px', marginTop: '20px' }} />
      </div>
    );
  }

  return (
    <>
      {/* Top Banner Alert if Feedback */}
      {feedback && (
        <div 
          style={{
            padding: '14px 20px',
            borderRadius: '12px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            backgroundColor: feedback.type === 'success' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
            color: feedback.type === 'success' ? '#059669' : '#dc2626',
            border: `1px solid ${feedback.type === 'success' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {feedback.type === 'success' ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
            <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{feedback.message}</span>
          </div>
          <button 
            onClick={() => setFeedback(null)} 
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
          >
            <X size={18} />
          </button>
        </div>
      )}

      {/* Top Control Bar with Quick Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <UserCheck size={24} color="#6366f1" />
            <span>فريق الإدارة والصلاحيات (Staff & RBAC)</span>
          </h2>
          <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '4px 0 0 0' }}>
            تعيين إداريين جدد، تخصيص الصلاحيات بدقة، وسحب الصلاحيات بالكامل من أي مسؤول بواسطة الأدمن الرئيسي.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={handleRefresh}
            className="admin-btn admin-btn-secondary admin-btn-sm"
            disabled={refreshing}
            title="تحديث القائمة"
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
            <span>{refreshing ? 'جاري التحديث...' : 'تحديث'}</span>
          </button>

          {isSuperAdmin && (
            <>
              <button
                onClick={() => setBulkRevokeModalOpen(true)}
                className="admin-btn admin-btn-outline-danger admin-btn-sm"
                style={{ fontWeight: 700 }}
                title="سحب كل الصلاحيات من جميع الإداريين دفعة واحدة"
              >
                <ShieldAlert size={16} />
                <span>سحب الصلاحيات من الجميع</span>
              </button>

              <button
                onClick={() => {
                  setCreateModalOpen(true);
                  setCreateTab('APPOINT');
                  setAppointPermissions([]);
                  setNewAdminPermissions([]);
                }}
                className="admin-btn admin-btn-primary admin-btn-sm"
                style={{ fontWeight: 700, backgroundColor: '#6366f1', borderColor: '#6366f1' }}
              >
                <UserPlus size={16} />
                <span>+ تعيين إداري جديد</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="admin-stat-grid" style={{ marginBottom: '24px' }}>
        <StatCard
          label="إجمالي المشرفين"
          value={totalAdmins.toLocaleString('ar-EG')}
          icon={Users}
          iconColor="#6366f1"
          iconBg="#eef2ff"
          subtitle="حسابات الأدمن بالنظام"
        />

        <StatCard
          label="الأدمن الرئيسي"
          value={superAdminCount.toLocaleString('ar-EG')}
          icon={Crown}
          iconColor="#f59e0b"
          iconBg="#fffbeb"
          subtitle="كامل الصلاحيات وغير قابل للتعديل"
        />

        <StatCard
          label="مشرفين بصلاحيات محددة"
          value={activeSubAdmins.toLocaleString('ar-EG')}
          icon={ShieldCheck}
          iconColor="#10b981"
          iconBg="#ecfdf5"
          subtitle="يمتلكون صلاحيات نشطة"
        />

        <StatCard
          label="مسحوبي الصلاحيات / معطلين"
          value={revokedAdmins.toLocaleString('ar-EG')}
          icon={UserX}
          iconColor="#ef4444"
          iconBg="#fef2f2"
          subtitle="بدون أي صلاحيات إدارية"
        />
      </div>

      {/* Search and Filters */}
      <div className="admin-filter-bar" style={{ marginBottom: '20px' }}>
        <div className="admin-search-wrapper" style={{ flex: 1 }}>
          <Search size={18} className="admin-search-icon" />
          <input
            type="text"
            className="admin-input admin-search-input"
            placeholder="ابحث بالاسم أو البريد الإلكتروني للمسؤول..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Staff List Table / Cards */}
      <div className="admin-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th style={{ width: '250px' }}>المسؤول</th>
                <th style={{ width: '140px' }}>الرتبة</th>
                <th>الصلاحيات الممنوحة</th>
                <th style={{ width: '140px' }}>حالة الحساب</th>
                <th style={{ width: '220px', textAlign: 'center' }}>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filteredStaff.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
                    <Users size={40} style={{ margin: '0 auto 12px auto', opacity: 0.5 }} />
                    <p style={{ margin: 0, fontWeight: 600 }}>لم يتم العثور على أي مسؤولين مطابقين للبحث.</p>
                  </td>
                </tr>
              ) : (
                filteredStaff.map((admin) => {
                  const hasWildcard = admin.isSuperAdmin || admin.permissions.includes('*');
                  const permCount = hasWildcard ? availablePermissions.length : admin.permissions.length;
                  const isRevoked = !hasWildcard && admin.permissions.length === 0;

                  return (
                    <tr key={admin.id}>
                      {/* User Info */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div 
                            style={{ 
                              width: '42px', 
                              height: '42px', 
                              borderRadius: '12px', 
                              backgroundColor: admin.isSuperAdmin ? '#fef3c7' : '#e0e7ff',
                              color: admin.isSuperAdmin ? '#b45309' : '#4338ca',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 800,
                              fontSize: '1.1rem',
                              border: admin.isSuperAdmin ? '1px solid #fcd34d' : '1px solid #c7d2fe'
                            }}
                          >
                            {(admin.name || 'A').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span>{admin.name || 'بدون اسم'}</span>
                              {admin.isSuperAdmin && (
                                <span title="الأدمن الرئيسي" style={{ display: 'inline-flex' }}>
                                  <Crown size={15} color="#f59e0b" fill="#f59e0b" />
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{admin.email}</div>
                          </div>
                        </div>
                      </td>

                      {/* Role Badge */}
                      <td>
                        {admin.isSuperAdmin ? (
                          <span 
                            style={{ 
                              display: 'inline-flex', 
                              alignItems: 'center', 
                              gap: '6px', 
                              padding: '4px 10px', 
                              borderRadius: '20px', 
                              backgroundColor: '#fffbeb', 
                              color: '#b45309', 
                              border: '1px solid #fde68a',
                              fontSize: '0.78rem',
                              fontWeight: 700
                            }}
                          >
                            <Crown size={13} />
                            الأدمن الرئيسي
                          </span>
                        ) : (
                          <span 
                            style={{ 
                              display: 'inline-flex', 
                              alignItems: 'center', 
                              gap: '6px', 
                              padding: '4px 10px', 
                              borderRadius: '20px', 
                              backgroundColor: '#f1f5f9', 
                              color: '#475569', 
                              border: '1px solid #e2e8f0',
                              fontSize: '0.78rem',
                              fontWeight: 600
                            }}
                          >
                            <Shield size={13} />
                            مشرف فرعي
                          </span>
                        )}
                      </td>

                      {/* Permissions Chips */}
                      <td>
                        {hasWildcard ? (
                          <span 
                            style={{ 
                              display: 'inline-flex', 
                              alignItems: 'center', 
                              gap: '6px', 
                              padding: '4px 12px', 
                              borderRadius: '8px', 
                              backgroundColor: '#ecfdf5', 
                              color: '#065f46', 
                              fontSize: '0.82rem',
                              fontWeight: 700,
                              border: '1px solid #a7f3d0'
                            }}
                          >
                            <Sparkles size={14} color="#10b981" />
                            كامل الصلاحيات (وصول شامل لجميع الأقسام)
                          </span>
                        ) : isRevoked ? (
                          <span 
                            style={{ 
                              display: 'inline-flex', 
                              alignItems: 'center', 
                              gap: '6px', 
                              padding: '4px 12px', 
                              borderRadius: '8px', 
                              backgroundColor: '#fef2f2', 
                              color: '#991b1b', 
                              fontSize: '0.82rem',
                              fontWeight: 700,
                              border: '1px solid #fecaca'
                            }}
                          >
                            <AlertTriangle size={14} />
                            مسحوب الصلاحيات (معطل بالكامل)
                          </span>
                        ) : (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxWidth: '520px' }}>
                            {admin.permissions.map(permId => {
                              const pDef = availablePermissions.find(p => p.id === permId);
                              return (
                                <span
                                  key={permId}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    padding: '3px 8px',
                                    borderRadius: '6px',
                                    backgroundColor: '#f8fafc',
                                    border: '1px solid #e2e8f0',
                                    fontSize: '0.75rem',
                                    color: '#334155',
                                    fontWeight: 600
                                  }}
                                  title={pDef?.description || permId}
                                >
                                  <Check size={12} color="#10b981" />
                                  {pDef?.name || permId}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </td>

                      {/* Status / Active Sessions */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span 
                            style={{ 
                              display: 'inline-flex', 
                              alignItems: 'center', 
                              gap: '6px', 
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              color: isRevoked ? '#ef4444' : '#10b981'
                            }}
                          >
                            <span 
                              style={{ 
                                width: '8px', 
                                height: '8px', 
                                borderRadius: '50%', 
                                backgroundColor: isRevoked ? '#ef4444' : '#10b981' 
                              }} 
                            />
                            {isRevoked ? 'معطل' : `نشط (${permCount} صلاحيات)`}
                          </span>
                          <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                            {admin.activeSession ? 'متصل الآن' : 'غير متصل حالياً'}
                          </span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                          {admin.isSuperAdmin ? (
                            <span 
                              style={{ 
                                fontSize: '0.78rem', 
                                color: '#94a3b8', 
                                fontStyle: 'italic',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              <Lock size={13} />
                              حساب محمي
                            </span>
                          ) : (
                            <>
                              <button
                                onClick={() => handleOpenEdit(admin)}
                                className="admin-btn admin-btn-secondary admin-btn-sm"
                                style={{ padding: '5px 10px', fontSize: '0.78rem' }}
                                title="تعديل الصلاحيات الممنوحة"
                              >
                                <Sliders size={14} />
                                <span>تعديل</span>
                              </button>

                              {!isRevoked && (
                                <button
                                  onClick={() => {
                                    setRevokingUser(admin);
                                    setRevokeDemoteOption(false);
                                  }}
                                  className="admin-btn admin-btn-outline-danger admin-btn-sm"
                                  style={{ padding: '5px 10px', fontSize: '0.78rem' }}
                                  title="سحب كافة الصلاحيات"
                                >
                                  <ShieldAlert size={14} />
                                  <span>سحب الصلاحيات</span>
                                </button>
                              )}

                              <button
                                onClick={() => setDemotingUser(admin)}
                                className="admin-btn admin-btn-outline-danger admin-btn-sm"
                                style={{ padding: '5px 8px', fontSize: '0.78rem', color: '#94a3b8' }}
                                title="إلغاء رتبة الإداري وتحويله لعميل عادي"
                              >
                                <UserX size={14} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* =========================================================================
          MODAL 1: APPOINT / CREATE NEW ADMIN
      ========================================================================= */}
      {createModalOpen && (
        <div className="admin-modal-backdrop" onClick={() => !submittingAction && setCreateModalOpen(false)}>
          <div className="admin-modal" style={{ maxWidth: '680px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3 className="admin-modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <UserPlus size={20} color="#6366f1" />
                <span>تعيين مسؤول جديد في لوحة الإدارة</span>
              </h3>
              <button 
                className="admin-modal-close" 
                onClick={() => !submittingAction && setCreateModalOpen(false)}
                disabled={submittingAction}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Subtabs */}
            <div style={{ display: 'flex', gap: '10px', padding: '12px 24px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
              <button
                type="button"
                onClick={() => setCreateTab('APPOINT')}
                className={`admin-btn admin-btn-sm ${createTab === 'APPOINT' ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
                style={{ flex: 1 }}
              >
                ترقية مستخدم حالي (بالبريد الإلكتروني)
              </button>
              <button
                type="button"
                onClick={() => setCreateTab('CREATE')}
                className={`admin-btn admin-btn-sm ${createTab === 'CREATE' ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
                style={{ flex: 1 }}
              >
                إنشاء حساب إداري جديد من الصفر
              </button>
            </div>

            <div className="admin-modal-body" style={{ overflowY: 'auto', flex: 1, padding: '20px 24px' }}>
              {createTab === 'APPOINT' ? (
                <form id="appoint-form" onSubmit={handleAppointSubmit}>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                      البريد الإلكتروني للمستخدم المسجل:
                    </label>
                    <div style={{ position: 'relative' }}>
                      <Mail size={18} style={{ position: 'absolute', top: '12px', right: '12px', color: '#94a3b8' }} />
                      <input
                        type="email"
                        required
                        className="admin-input"
                        placeholder="example@domain.com"
                        value={appointEmail}
                        onChange={(e) => setAppointEmail(e.target.value)}
                        style={{ paddingRight: '40px' }}
                      />
                    </div>
                    <span style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px', display: 'block' }}>
                      سيتم تحويل حسابه الحالي فوراً إلى إداري (ADMIN) وتطبيق الصلاحيات المختارة أدناه.
                    </span>
                  </div>

                  {/* Permissions Selection */}
                  <div style={{ marginTop: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                      <label style={{ fontSize: '0.875rem', fontWeight: 700, color: '#334155' }}>
                        تحديد الصلاحيات الممنوحة:
                      </label>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button type="button" onClick={() => applyPreset('ALL', 'APPOINT')} className="admin-btn admin-btn-secondary admin-btn-xs" style={{ fontSize: '0.72rem' }}>تحديد الكل</button>
                        <button type="button" onClick={() => applyPreset('OPERATIONS', 'APPOINT')} className="admin-btn admin-btn-secondary admin-btn-xs" style={{ fontSize: '0.72rem' }}>عمليات</button>
                        <button type="button" onClick={() => applyPreset('FINANCE', 'APPOINT')} className="admin-btn admin-btn-secondary admin-btn-xs" style={{ fontSize: '0.72rem' }}>مالي</button>
                        <button type="button" onClick={() => applyPreset('CATALOG', 'APPOINT')} className="admin-btn admin-btn-secondary admin-btn-xs" style={{ fontSize: '0.72rem' }}>منتجات</button>
                        <button type="button" onClick={() => applyPreset('NONE', 'APPOINT')} className="admin-btn admin-btn-secondary admin-btn-xs" style={{ fontSize: '0.72rem' }}>إلغاء</button>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '10px' }}>
                      {availablePermissions.map(p => {
                        const checked = appointPermissions.includes(p.id);
                        const catInfo = getCategoryInfo(p.category);
                        return (
                          <div
                            key={p.id}
                            onClick={() => togglePermission(p.id, appointPermissions, setAppointPermissions)}
                            style={{
                              padding: '10px 12px',
                              borderRadius: '8px',
                              border: `1px solid ${checked ? '#6366f1' : '#e2e8f0'}`,
                              backgroundColor: checked ? 'rgba(99, 102, 241, 0.05)' : '#ffffff',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: '10px',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {}}
                              style={{ marginTop: '3px', cursor: 'pointer' }}
                            />
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                                <span style={{ fontWeight: 700, fontSize: '0.85rem', color: checked ? '#4338ca' : '#1e293b' }}>
                                  {p.name}
                                </span>
                                <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '4px', backgroundColor: catInfo.bg, color: catInfo.color, fontWeight: 600 }}>
                                  {catInfo.label}
                                </span>
                              </div>
                              <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px', lineHeight: 1.3 }}>
                                {p.description}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </form>
              ) : (
                <form id="create-form" onSubmit={handleCreateSubmit}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                        اسم المسؤول:
                      </label>
                      <div style={{ position: 'relative' }}>
                        <UserIcon size={18} style={{ position: 'absolute', top: '12px', right: '12px', color: '#94a3b8' }} />
                        <input
                          type="text"
                          required
                          className="admin-input"
                          placeholder="الاسم الكامل"
                          value={newAdminName}
                          onChange={(e) => setNewAdminName(e.target.value)}
                          style={{ paddingRight: '40px' }}
                        />
                      </div>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                        البريد الإلكتروني:
                      </label>
                      <div style={{ position: 'relative' }}>
                        <Mail size={18} style={{ position: 'absolute', top: '12px', right: '12px', color: '#94a3b8' }} />
                        <input
                          type="email"
                          required
                          className="admin-input"
                          placeholder="admin@example.com"
                          value={newAdminEmail}
                          onChange={(e) => setNewAdminEmail(e.target.value)}
                          style={{ paddingRight: '40px' }}
                        />
                      </div>
                    </div>
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                      كلمة المرور:
                    </label>
                    <div style={{ position: 'relative' }}>
                      <Key size={18} style={{ position: 'absolute', top: '12px', right: '12px', color: '#94a3b8' }} />
                      <input
                        type="password"
                        required
                        minLength={6}
                        className="admin-input"
                        placeholder="كلمة مرور قوية (6 خانات على الأقل)"
                        value={newAdminPassword}
                        onChange={(e) => setNewAdminPassword(e.target.value)}
                        style={{ paddingRight: '40px' }}
                      />
                    </div>
                  </div>

                  {/* Permissions Selection */}
                  <div style={{ marginTop: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                      <label style={{ fontSize: '0.875rem', fontWeight: 700, color: '#334155' }}>
                        تحديد الصلاحيات الممنوحة:
                      </label>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button type="button" onClick={() => applyPreset('ALL', 'CREATE')} className="admin-btn admin-btn-secondary admin-btn-xs" style={{ fontSize: '0.72rem' }}>تحديد الكل</button>
                        <button type="button" onClick={() => applyPreset('OPERATIONS', 'CREATE')} className="admin-btn admin-btn-secondary admin-btn-xs" style={{ fontSize: '0.72rem' }}>عمليات</button>
                        <button type="button" onClick={() => applyPreset('FINANCE', 'CREATE')} className="admin-btn admin-btn-secondary admin-btn-xs" style={{ fontSize: '0.72rem' }}>مالي</button>
                        <button type="button" onClick={() => applyPreset('CATALOG', 'CREATE')} className="admin-btn admin-btn-secondary admin-btn-xs" style={{ fontSize: '0.72rem' }}>منتجات</button>
                        <button type="button" onClick={() => applyPreset('NONE', 'CREATE')} className="admin-btn admin-btn-secondary admin-btn-xs" style={{ fontSize: '0.72rem' }}>إلغاء</button>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '10px' }}>
                      {availablePermissions.map(p => {
                        const checked = newAdminPermissions.includes(p.id);
                        return (
                          <div
                            key={p.id}
                            onClick={() => togglePermission(p.id, newAdminPermissions, setNewAdminPermissions)}
                            style={{
                              padding: '10px 12px',
                              borderRadius: '8px',
                              border: `1px solid ${checked ? '#6366f1' : '#e2e8f0'}`,
                              backgroundColor: checked ? 'rgba(99, 102, 241, 0.05)' : '#ffffff',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: '10px'
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {}}
                              style={{ marginTop: '3px', cursor: 'pointer' }}
                            />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 700, fontSize: '0.85rem', color: checked ? '#4338ca' : '#1e293b' }}>
                                {p.name}
                              </div>
                              <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px', lineHeight: 1.3 }}>
                                {p.description}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </form>
              )}
            </div>

            <div className="admin-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="admin-btn admin-btn-secondary"
                disabled={submittingAction}
              >
                إلغاء
              </button>
              <button
                type="submit"
                form={createTab === 'APPOINT' ? 'appoint-form' : 'create-form'}
                className="admin-btn admin-btn-primary"
                disabled={submittingAction}
                style={{ backgroundColor: '#6366f1', borderColor: '#6366f1' }}
              >
                {submittingAction ? 'جاري المعالجة...' : createTab === 'APPOINT' ? 'ترقية وتعيين كإداري' : 'إنشاء الحساب الإداري'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 2: EDIT PERMISSIONS MODAL
      ========================================================================= */}
      {editingUser && (
        <div className="admin-modal-backdrop" onClick={() => !submittingAction && setEditingUser(null)}>
          <div className="admin-modal" style={{ maxWidth: '680px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3 className="admin-modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sliders size={20} color="#6366f1" />
                <span>تعديل صلاحيات ({editingUser.name || editingUser.email})</span>
              </h3>
              <button 
                className="admin-modal-close" 
                onClick={() => !submittingAction && setEditingUser(null)}
                disabled={submittingAction}
              >
                <X size={20} />
              </button>
            </div>

            <div className="admin-modal-body" style={{ overflowY: 'auto', flex: 1, padding: '20px 24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <div style={{ fontSize: '0.85rem', color: '#64748b' }}>البريد الإلكتروني: <strong>{editingUser.email}</strong></div>
                  <div style={{ fontSize: '0.85rem', color: '#64748b' }}>تم اختيار <strong>{selectedPermissions.length}</strong> من أصل {availablePermissions.length} صلاحية</div>
                </div>

                <div style={{ display: 'flex', gap: '6px' }}>
                  <button type="button" onClick={() => applyPreset('ALL', 'EDIT')} className="admin-btn admin-btn-secondary admin-btn-xs" style={{ fontSize: '0.72rem' }}>تحديد الكل</button>
                  <button type="button" onClick={() => applyPreset('OPERATIONS', 'EDIT')} className="admin-btn admin-btn-secondary admin-btn-xs" style={{ fontSize: '0.72rem' }}>عمليات</button>
                  <button type="button" onClick={() => applyPreset('FINANCE', 'EDIT')} className="admin-btn admin-btn-secondary admin-btn-xs" style={{ fontSize: '0.72rem' }}>مالي</button>
                  <button type="button" onClick={() => applyPreset('CATALOG', 'EDIT')} className="admin-btn admin-btn-secondary admin-btn-xs" style={{ fontSize: '0.72rem' }}>منتجات</button>
                  <button type="button" onClick={() => applyPreset('NONE', 'EDIT')} className="admin-btn admin-btn-secondary admin-btn-xs" style={{ fontSize: '0.72rem' }}>إلغاء</button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '10px' }}>
                {availablePermissions.map(p => {
                  const checked = selectedPermissions.includes(p.id);
                  return (
                    <div
                      key={p.id}
                      onClick={() => togglePermission(p.id, selectedPermissions, setSelectedPermissions)}
                      style={{
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: `1px solid ${checked ? '#6366f1' : '#e2e8f0'}`,
                        backgroundColor: checked ? 'rgba(99, 102, 241, 0.05)' : '#ffffff',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '10px',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {}}
                        style={{ marginTop: '3px', cursor: 'pointer' }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.85rem', color: checked ? '#4338ca' : '#1e293b' }}>
                          {p.name}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px', lineHeight: 1.3 }}>
                          {p.description}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="admin-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="admin-btn admin-btn-secondary"
                disabled={submittingAction}
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleSavePermissions}
                className="admin-btn admin-btn-primary"
                disabled={submittingAction}
                style={{ backgroundColor: '#6366f1', borderColor: '#6366f1' }}
              >
                {submittingAction ? 'جاري الحفظ...' : 'حفظ التعديلات'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 3: SINGLE REVOKE PERMISSIONS CONFIRMATION
      ========================================================================= */}
      {revokingUser && (
        <div className="admin-modal-backdrop" onClick={() => !submittingAction && setRevokingUser(null)}>
          <div className="admin-modal" style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3 className="admin-modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#dc2626' }}>
                <ShieldAlert size={20} />
                <span>سحب الصلاحيات من ({revokingUser.name || revokingUser.email})</span>
              </h3>
              <button 
                className="admin-modal-close" 
                onClick={() => !submittingAction && setRevokingUser(null)}
                disabled={submittingAction}
              >
                <X size={20} />
              </button>
            </div>

            <div className="admin-modal-body" style={{ padding: '20px' }}>
              <p style={{ margin: 0, color: '#334155', lineHeight: 1.6, fontSize: '0.95rem' }}>
                هل أنت متأكد من رغبتك في سحب كافة الصلاحيات الإدارية من هذا المسؤول؟
              </p>
              <p style={{ marginTop: '8px', color: '#64748b', fontSize: '0.85rem', lineHeight: 1.5 }}>
                سيتم إبطال جميع جلساته النشطة فوراً ولن يتمكن من الوصول لأي قسم إداري في المنصة.
              </p>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '16px', padding: '10px 12px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={revokeDemoteOption}
                  onChange={(e) => setRevokeDemoteOption(e.target.checked)}
                />
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1e293b' }}>
                  تحويل رتبة الحساب أيضاً إلى عميل عادي (CUSTOMER)
                </span>
              </label>
            </div>

            <div className="admin-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setRevokingUser(null)}
                className="admin-btn admin-btn-secondary"
                disabled={submittingAction}
              >
                تراجع
              </button>
              <button
                type="button"
                onClick={handleConfirmRevoke}
                className="admin-btn admin-btn-danger"
                disabled={submittingAction}
              >
                {submittingAction ? 'جاري التنفيذ...' : 'تأكيد سحب الصلاحيات'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 4: BULK REVOKE ALL SUB-ADMINS CONFIRMATION
      ========================================================================= */}
      {bulkRevokeModalOpen && (
        <div className="admin-modal-backdrop" onClick={() => !submittingAction && setBulkRevokeModalOpen(false)}>
          <div className="admin-modal" style={{ maxWidth: '540px' }} onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3 className="admin-modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#dc2626' }}>
                <AlertTriangle size={22} />
                <span>تحذير: سحب الصلاحيات من جميع الإداريين</span>
              </h3>
              <button 
                className="admin-modal-close" 
                onClick={() => !submittingAction && setBulkRevokeModalOpen(false)}
                disabled={submittingAction}
              >
                <X size={20} />
              </button>
            </div>

            <div className="admin-modal-body" style={{ padding: '20px' }}>
              <div 
                style={{ 
                  padding: '12px 16px', 
                  backgroundColor: '#fef2f2', 
                  border: '1px solid #fecaca', 
                  borderRadius: '10px',
                  color: '#991b1b',
                  fontSize: '0.9rem',
                  lineHeight: 1.6,
                  marginBottom: '14px'
                }}
              >
                <strong>إجراء أمني حاسم:</strong> سيتم سحب وتصفير جميع الصلاحيات من <strong>جميع الإداريين الفرعيين</strong> دفعة واحدة وإلغاء جلساتهم النشطة.
              </div>

              <p style={{ margin: 0, color: '#334155', fontSize: '0.9rem', lineHeight: 1.6 }}>
                حساب <strong>الأدمن الرئيسي (Super Admin)</strong> فقط هو الذي سيبقى نشطاً وبكامل صلاحياته.
              </p>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '16px', padding: '10px 12px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={bulkRevokeDemoteOption}
                  onChange={(e) => setBulkRevokeDemoteOption(e.target.checked)}
                />
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1e293b' }}>
                  تحويل جميع المشرفين أيضاً إلى عملاء عاديين (CUSTOMER)
                </span>
              </label>
            </div>

            <div className="admin-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setBulkRevokeModalOpen(false)}
                className="admin-btn admin-btn-secondary"
                disabled={submittingAction}
              >
                إلغاء العملية
              </button>
              <button
                type="button"
                onClick={handleConfirmBulkRevoke}
                className="admin-btn admin-btn-danger"
                disabled={submittingAction}
                style={{ fontWeight: 800 }}
              >
                {submittingAction ? 'جاري التنفيذ...' : 'نعم، اسحب الصلاحيات من الجميع'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 5: DEMOTE TO CUSTOMER CONFIRMATION
      ========================================================================= */}
      {demotingUser && (
        <div className="admin-modal-backdrop" onClick={() => !submittingAction && setDemotingUser(null)}>
          <div className="admin-modal" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3 className="admin-modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#dc2626' }}>
                <UserX size={20} />
                <span>إلغاء رتبة الإداري ({demotingUser.name || demotingUser.email})</span>
              </h3>
              <button 
                className="admin-modal-close" 
                onClick={() => !submittingAction && setDemotingUser(null)}
                disabled={submittingAction}
              >
                <X size={20} />
              </button>
            </div>

            <div className="admin-modal-body" style={{ padding: '20px' }}>
              <p style={{ margin: 0, color: '#334155', lineHeight: 1.6, fontSize: '0.95rem' }}>
                هل تريد إلغاء رتبة الإداري وتحويله نهائياً إلى عميل عادي (CUSTOMER)؟
              </p>
              <p style={{ marginTop: '8px', color: '#64748b', fontSize: '0.85rem', lineHeight: 1.5 }}>
                سيتم سحب جميع صلاحياته الإدارية وإلغاء جلسات الدخول الخاصة به.
              </p>
            </div>

            <div className="admin-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setDemotingUser(null)}
                className="admin-btn admin-btn-secondary"
                disabled={submittingAction}
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleConfirmDemote}
                className="admin-btn admin-btn-danger"
                disabled={submittingAction}
              >
                {submittingAction ? 'جاري التحويل...' : 'تأكيد التحويل لعميل'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
