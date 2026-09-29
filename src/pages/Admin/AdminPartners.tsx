import React, { useEffect, useState } from 'react';
import { 
  Users, 
  Search, 
  Plus, 
  DollarSign, 
  Eye, 
  TrendingUp, 
  RefreshCw, 
  ShieldAlert, 
  Tag, 
  Copy, 
  ExternalLink,
  PlusCircle,
  MinusCircle,
  Award
} from 'lucide-react';
import { api } from '../../lib/api';

interface Partner {
  id: string;
  userId: string;
  name: string;
  email: string;
  phone?: string;
  businessName?: string;
  status: 'ACTIVE' | 'SUSPENDED';
  balance: number;
  currency: string;
  levelName?: string;
  levelArabicName?: string;
  badgeColor?: string;
  discountPercent?: number;
  totalPoints: number;
  ordersCount: number;
  totalPurchasesUsd: number;
  createdAt: string;
}

interface DepositRequest {
  id: string;
  partnerId: string;
  partnerName: string;
  partnerEmail: string;
  businessName?: string;
  amountUsd: number;
  exchangeRate: number;
  amountLocal: number;
  currencyLocal: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  partnerNotes?: string;
  rejectionReason?: string;
  createdAt: string;
  reviewedAt?: string;
  paymentMethodName?: string;
}

interface PartnerPricingItem {
  productId: string;
  productName: string;
  offerName: string;
  arabicName?: string;
  costPriceUsd: number;
  retailPriceUsd: number;
  defaultPartnerPriceUsd?: number;
  customPartnerPriceUsd?: number;
  customIsAvailable?: boolean;
}

interface PartnerLevel {
  id: string;
  name: string;
  arabic_name: string;
  min_points: number;
  max_points?: number;
  discount_percent: number;
  badge_color: string;
  perks_description?: string;
  display_order: number;
}

interface RateHistoryItem {
  id: string;
  old_rate: number;
  new_rate: number;
  base_currency: string;
  quote_currency: string;
  adminName?: string;
  reason?: string;
  created_at: string;
}

export const AdminPartners: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'list' | 'deposits' | 'pricing' | 'levels' | 'rates'>('list');
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'SUSPENDED'>('ALL');

  // Create Partner Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    email: '',
    phone: '',
    businessName: '',
    levelId: '',
    status: 'ACTIVE' as 'ACTIVE' | 'SUSPENDED',
    notes: ''
  });
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createdResult, setCreatedResult] = useState<{ name: string; email: string; setupUrl: string } | null>(null);

  // Partner Details Drawer / Modal State
  const [selectedPartner, setSelectedPartner] = useState<any | null>(null);

  // Wallet Credit/Debit Modal State
  const [walletModalPartner, setWalletModalPartner] = useState<Partner | null>(null);
  const [walletModalType, setWalletModalType] = useState<'CREDIT' | 'DEBIT'>('CREDIT');
  const [walletAmount, setWalletAmount] = useState<number | ''>('');
  const [walletReason, setWalletReason] = useState('');
  const [walletSubmitting, setWalletSubmitting] = useState(false);

  // Deposits State
  const [deposits, setDeposits] = useState<DepositRequest[]>([]);
  const [depositsLoading, setDepositsLoading] = useState(false);
  const [depositFilter, setDepositFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  const [selectedReceiptId, setSelectedReceiptId] = useState<string | null>(null);
  const [rejectModalDeposit, setRejectModalDeposit] = useState<DepositRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Pricing State
  const [pricingPartnerId, setPricingPartnerId] = useState<string>('');
  const [pricingItems, setPricingItems] = useState<PartnerPricingItem[]>([]);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [editingPricingItem, setEditingPricingItem] = useState<{ productId: string; name: string; price: number; isAvailable: boolean } | null>(null);

  // Levels State
  const [levels, setLevels] = useState<PartnerLevel[]>([]);
  const [levelsLoading, setLevelsLoading] = useState(false);
  const [editingLevel, setEditingLevel] = useState<PartnerLevel | null>(null);

  // Rate History State
  const [rateHistory, setRateHistory] = useState<RateHistoryItem[]>([]);
  const [rateHistoryLoading, setRateHistoryLoading] = useState(false);

  const fetchPartners = async () => {
    try {
      setLoading(true);
      const data = await api.get('/api/admin/partners');
      setPartners(data);
      if (data.length > 0 && !pricingPartnerId) {
        setPricingPartnerId(data[0].id);
      }
    } catch (err) {
      console.error('Failed to load partners', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchDeposits = async () => {
    try {
      setDepositsLoading(true);
      const data = await api.get(`/api/admin/partner-deposits?status=${depositFilter}`);
      setDeposits(data);
    } catch (err) {
      console.error('Failed to load deposits', err);
    } finally {
      setDepositsLoading(false);
    }
  };

  const fetchPricing = async (partnerId: string) => {
    if (!partnerId) return;
    try {
      setPricingLoading(true);
      const data = await api.get(`/api/admin/partners/${partnerId}/pricing`);
      setPricingItems(data);
    } catch (err) {
      console.error('Failed to load pricing', err);
    } finally {
      setPricingLoading(false);
    }
  };

  const fetchLevels = async () => {
    try {
      setLevelsLoading(true);
      const data = await api.get('/api/admin/partner-levels');
      setLevels(data);
    } catch (err) {
      console.error('Failed to load levels', err);
    } finally {
      setLevelsLoading(false);
    }
  };

  const fetchRateHistory = async () => {
    try {
      setRateHistoryLoading(true);
      const data = await api.get('/api/admin/exchange-rate-history');
      setRateHistory(data);
    } catch (err) {
      console.error('Failed to load rate history', err);
    } finally {
      setRateHistoryLoading(false);
    }
  };

  useEffect(() => {
    fetchPartners();
  }, []);

  useEffect(() => {
    if (activeSubTab === 'deposits') fetchDeposits();
    if (activeSubTab === 'pricing') fetchPricing(pricingPartnerId);
    if (activeSubTab === 'levels') fetchLevels();
    if (activeSubTab === 'rates') fetchRateHistory();
  }, [activeSubTab, depositFilter, pricingPartnerId]);

  // Open Partner Details
  const openPartnerDetails = async (partnerId: string) => {
    try {
      setSelectedPartner(null);
      const data = await api.get(`/api/admin/partners/${partnerId}`);
      setSelectedPartner(data);
    } catch (err) {
      console.error('Failed to load partner details', err);
    }
  };

  // Handle Create Partner Submit
  const handleCreatePartner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.name || !createForm.email) return;

    try {
      setCreateSubmitting(true);
      const res = await api.post('/api/admin/partners', createForm);
      setCreatedResult({
        name: res.partner.name,
        email: res.partner.email,
        setupUrl: res.partner.setupUrl
      });
      fetchPartners();
    } catch (err: any) {
      alert(err.message || 'فشل إنشاء حساب الشريك.');
    } finally {
      setCreateSubmitting(false);
    }
  };

  // Toggle Partner Status (Active / Suspended)
  const togglePartnerStatus = async (partner: Partner) => {
    const nextStatus = partner.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    const confirmMsg = nextStatus === 'SUSPENDED'
      ? `هل أنت متأكد من رغبتك في إيقاف حساب الشريك "${partner.name}"؟ لن يتمكن من تسجيل الدخول أو شحن الألعاب.`
      : `تفعيل حساب الشريك "${partner.name}" مجدداً؟`;

    if (!window.confirm(confirmMsg)) return;

    try {
      await api.patch(`/api/admin/partners/${partner.id}/status`, {
        status: nextStatus,
        reason: 'تحديث من لوحة الإدارة'
      });
      fetchPartners();
      if (selectedPartner && selectedPartner.partnerId === partner.id) {
        setSelectedPartner({ ...selectedPartner, status: nextStatus });
      }
    } catch (err: any) {
      alert(err.message || 'فشل تحديث حالة الشريك.');
    }
  };

  // Submit Wallet Adjustment (Credit / Debit)
  const handleWalletSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!walletModalPartner || !walletAmount || !walletReason) return;

    try {
      setWalletSubmitting(true);
      const endpoint = walletModalType === 'CREDIT'
        ? `/api/admin/partners/${walletModalPartner.id}/wallet/credit`
        : `/api/admin/partners/${walletModalPartner.id}/wallet/debit`;

      const res = await api.post(endpoint, {
        amount: Number(walletAmount),
        reason: walletReason
      });

      alert(res.message);
      setWalletModalPartner(null);
      setWalletAmount('');
      setWalletReason('');
      fetchPartners();
      if (selectedPartner && selectedPartner.partnerId === walletModalPartner.id) {
        openPartnerDetails(walletModalPartner.id);
      }
    } catch (err: any) {
      alert(err.message || 'فشل تعديل الرصيد.');
    } finally {
      setWalletSubmitting(false);
    }
  };

  // Resend Setup Link
  const handleResendSetupLink = async (partnerId: string) => {
    try {
      const res = await api.post(`/api/admin/partners/${partnerId}/resend-setup-link`, {});
      alert(`تم إرسال الرابط الجديد للبريد الإلكتروني بنجاح!\n\nالرابط المباشر:\n${res.setupUrl}`);
    } catch (err: any) {
      alert(err.message || 'فشل إعادة إرسال الرابط.');
    }
  };

  // Approve Deposit
  const handleApproveDeposit = async (id: string, amountUsd: number, partnerName: string) => {
    if (!window.confirm(`هل أنت متأكد من اعتماد إيداع التاجر ${partnerName} بمبلغ $${amountUsd.toFixed(2)} USD؟`)) return;

    try {
      const res = await api.post(`/api/admin/partner-deposits/${id}/approve`, {});
      alert(res.message);
      fetchDeposits();
      fetchPartners();
    } catch (err: any) {
      alert(err.message || 'فشل اعتماد الإيداع.');
    }
  };

  // Reject Deposit
  const handleRejectDeposit = async () => {
    if (!rejectModalDeposit || !rejectReason.trim()) return;

    try {
      await api.post(`/api/admin/partner-deposits/${rejectModalDeposit.id}/reject`, {
        reason: rejectReason.trim()
      });
      alert('تم رفض طلب الإيداع.');
      setRejectModalDeposit(null);
      setRejectReason('');
      fetchDeposits();
    } catch (err: any) {
      alert(err.message || 'فشل رفض الإيداع.');
    }
  };

  // Save Pricing Item
  const handleSavePricing = async () => {
    if (!editingPricingItem || !pricingPartnerId) return;

    try {
      await api.put(`/api/admin/partners/${pricingPartnerId}/pricing/${editingPricingItem.productId}`, {
        partnerPriceUsd: editingPricingItem.price,
        isAvailable: editingPricingItem.isAvailable
      });
      setEditingPricingItem(null);
      fetchPricing(pricingPartnerId);
    } catch (err: any) {
      alert(err.message || 'فشل حفظ السعر.');
    }
  };

  // Reset Pricing Item
  const handleResetPricing = async (productId: string) => {
    if (!pricingPartnerId) return;
    if (!window.confirm('استعادة السعر الافتراضي لهذا المنتج وإلغاء التخصيص؟')) return;

    try {
      await api.delete(`/api/admin/partners/${pricingPartnerId}/pricing/${productId}`);
      fetchPricing(pricingPartnerId);
    } catch (err: any) {
      alert(err.message || 'فشل حذف التخصيص.');
    }
  };

  // Save Level
  const handleSaveLevel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLevel) return;

    try {
      await api.put(`/api/admin/partner-levels/${editingLevel.id}`, {
        arabicName: editingLevel.arabic_name,
        minPoints: editingLevel.min_points,
        maxPoints: editingLevel.max_points,
        discountPercent: editingLevel.discount_percent,
        badgeColor: editingLevel.badge_color,
        perksDescription: editingLevel.perks_description
      });
      alert('تم تحديث إعدادات المستوى بنجاح.');
      setEditingLevel(null);
      fetchLevels();
    } catch (err: any) {
      alert(err.message || 'فشل تحديث المستوى.');
    }
  };

  // Filter partners
  const filteredPartners = partners.filter(p => {
    const matchesSearch = 
      (p.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (p.email || '').toLowerCase().includes(search.toLowerCase()) ||
      (p.businessName || '').toLowerCase().includes(search.toLowerCase()) ||
      (p.phone || '').includes(search);

    const matchesStatus = statusFilter === 'ALL' || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalPartnerBalance = partners.reduce((sum, p) => sum + (p.balance || 0), 0);
  const totalPartnerPurchases = partners.reduce((sum, p) => sum + (p.totalPurchasesUsd || 0), 0);

  return (
    <div className="admin-page-container" dir="rtl">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 900, color: '#0B0F19', margin: '0 0 6px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>🤝 بوابة الشركاء والتجار</span>
            <span style={{ fontSize: '0.8rem', background: '#FEF3C7', color: '#92400E', padding: '3px 10px', borderRadius: 8, border: '1px solid #FCD34D' }}>
              partner.kiropro.store
            </span>
          </h1>
          <p style={{ color: '#64748B', margin: 0, fontSize: '0.95rem' }}>
            إدارة حسابات التجار، الأسعار الخاصة، الإيداعات بالدولار، كشف الحسابات ومستويات الولاء
          </p>
        </div>

        <button
          onClick={() => {
            setCreatedResult(null);
            setCreateForm({
              name: '',
              email: '',
              phone: '',
              businessName: '',
              levelId: levels[0]?.id || '',
              status: 'ACTIVE',
              notes: ''
            });
            setShowCreateModal(true);
          }}
          style={{
            background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: 10,
            padding: '12px 22px',
            fontWeight: 800,
            fontSize: '0.95rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            boxShadow: '0 4px 14px rgba(245, 158, 11, 0.35)'
          }}
        >
          <Plus size={18} />
          إنشاء شريك جديد
        </button>
      </div>

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div style={{ background: '#FFFFFF', padding: 20, borderRadius: 14, border: '1px solid #E2E8F0', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ color: '#64748B', fontSize: '0.85rem', fontWeight: 700, marginBottom: 6 }}>إجمالي الشركاء المعتمدين</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#0B0F19' }}>{partners.length}</div>
        </div>

        <div style={{ background: '#FFFFFF', padding: 20, borderRadius: 14, border: '1px solid #E2E8F0', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ color: '#64748B', fontSize: '0.85rem', fontWeight: 700, marginBottom: 6 }}>إجمالي رصيد التجار الحالي</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#166534' }}>${totalPartnerBalance.toFixed(2)} USD</div>
        </div>

        <div style={{ background: '#FFFFFF', padding: 20, borderRadius: 14, border: '1px solid #E2E8F0', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ color: '#64748B', fontSize: '0.85rem', fontWeight: 700, marginBottom: 6 }}>حجم مشتريات التجار المنفذة</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#0284C7' }}>${totalPartnerPurchases.toFixed(2)} USD</div>
        </div>

        <div style={{ background: '#FFFFFF', padding: 20, borderRadius: 14, border: '1px solid #E2E8F0', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ color: '#64748B', fontSize: '0.85rem', fontWeight: 700, marginBottom: 6 }}>نطاق المنصة الرئيسي</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#D97706', marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>partner.kiropro.store</span>
            <ExternalLink size={16} />
          </div>
        </div>
      </div>

      {/* Sub Tabs Navigation */}
      <div style={{ display: 'flex', gap: 10, borderBottom: '2px solid #E2E8F0', marginBottom: 20, overflowX: 'auto', paddingBottom: 2 }}>
        <button
          onClick={() => setActiveSubTab('list')}
          style={{
            background: 'none',
            border: 'none',
            padding: '10px 18px',
            fontSize: '0.95rem',
            fontWeight: 800,
            cursor: 'pointer',
            borderBottom: activeSubTab === 'list' ? '3px solid #F59E0B' : '3px solid transparent',
            color: activeSubTab === 'list' ? '#D97706' : '#64748B',
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          <Users size={18} />
          قائمة الشركاء ({partners.length})
        </button>

        <button
          onClick={() => setActiveSubTab('deposits')}
          style={{
            background: 'none',
            border: 'none',
            padding: '10px 18px',
            fontSize: '0.95rem',
            fontWeight: 800,
            cursor: 'pointer',
            borderBottom: activeSubTab === 'deposits' ? '3px solid #F59E0B' : '3px solid transparent',
            color: activeSubTab === 'deposits' ? '#D97706' : '#64748B',
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          <DollarSign size={18} />
          طلبات الإيداع
        </button>

        <button
          onClick={() => setActiveSubTab('pricing')}
          style={{
            background: 'none',
            border: 'none',
            padding: '10px 18px',
            fontSize: '0.95rem',
            fontWeight: 800,
            cursor: 'pointer',
            borderBottom: activeSubTab === 'pricing' ? '3px solid #F59E0B' : '3px solid transparent',
            color: activeSubTab === 'pricing' ? '#D97706' : '#64748B',
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          <Tag size={18} />
          أسعار الشركاء المخصصة
        </button>

        <button
          onClick={() => setActiveSubTab('levels')}
          style={{
            background: 'none',
            border: 'none',
            padding: '10px 18px',
            fontSize: '0.95rem',
            fontWeight: 800,
            cursor: 'pointer',
            borderBottom: activeSubTab === 'levels' ? '3px solid #F59E0B' : '3px solid transparent',
            color: activeSubTab === 'levels' ? '#D97706' : '#64748B',
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          <Award size={18} />
          المستويات والنقاط
        </button>

        <button
          onClick={() => setActiveSubTab('rates')}
          style={{
            background: 'none',
            border: 'none',
            padding: '10px 18px',
            fontSize: '0.95rem',
            fontWeight: 800,
            cursor: 'pointer',
            borderBottom: activeSubTab === 'rates' ? '3px solid #F59E0B' : '3px solid transparent',
            color: activeSubTab === 'rates' ? '#D97706' : '#64748B',
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          <TrendingUp size={18} />
          سجل أسعار الصرف
        </button>
      </div>

      {/* SUB-TAB 1: PARTNERS LIST */}
      {activeSubTab === 'list' && (
        <div style={{ background: '#FFFFFF', borderRadius: 14, border: '1px solid #E2E8F0', padding: 20 }}>
          {/* Filters */}
          <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 260, position: 'relative' }}>
              <Search size={18} style={{ position: 'absolute', right: 14, top: 12, color: '#94A3B8' }} />
              <input
                type="text"
                placeholder="بحث بالاسم، البريد الإلكتروني، اسم المتجر أو الهاتف..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 40px 10px 14px',
                  borderRadius: 10,
                  border: '1px solid #CBD5E1',
                  fontSize: '0.9rem'
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setStatusFilter('ALL')}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: '1px solid #CBD5E1',
                  background: statusFilter === 'ALL' ? '#0B0F19' : '#FFFFFF',
                  color: statusFilter === 'ALL' ? '#FFFFFF' : '#475569',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                الكل
              </button>
              <button
                onClick={() => setStatusFilter('ACTIVE')}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: '1px solid #CBD5E1',
                  background: statusFilter === 'ACTIVE' ? '#166534' : '#FFFFFF',
                  color: statusFilter === 'ACTIVE' ? '#FFFFFF' : '#475569',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                النشطين
              </button>
              <button
                onClick={() => setStatusFilter('SUSPENDED')}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: '1px solid #CBD5E1',
                  background: statusFilter === 'SUSPENDED' ? '#991B1B' : '#FFFFFF',
                  color: statusFilter === 'SUSPENDED' ? '#FFFFFF' : '#475569',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                المعطلين
              </button>
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>جارٍ تحميل قائمة الشركاء...</div>
          ) : filteredPartners.length === 0 ? (
            <div style={{ padding: 50, textAlign: 'center', color: '#94A3B8' }}>لم يتم العثور على أي شركاء يطابقون البحث.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0', color: '#475569', fontSize: '0.85rem' }}>
                    <th style={{ padding: 14 }}>الشريك / التاجر</th>
                    <th style={{ padding: 14 }}>البريد والهاتف</th>
                    <th style={{ padding: 14 }}>الرصيد (USD)</th>
                    <th style={{ padding: 14 }}>المستوى</th>
                    <th style={{ padding: 14 }}>النقاط</th>
                    <th style={{ padding: 14 }}>المشتريات</th>
                    <th style={{ padding: 14 }}>الحالة</th>
                    <th style={{ padding: 14, textAlign: 'center' }}>الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPartners.map(p => (
                    <tr key={p.id} style={{ borderBottom: '1px solid #F1F5F9', fontSize: '0.9rem' }}>
                      <td style={{ padding: 14 }}>
                        <div style={{ fontWeight: 800, color: '#0F172A' }}>{p.name}</div>
                        {p.businessName && (
                          <div style={{ fontSize: '0.78rem', color: '#64748B' }}>🏢 {p.businessName}</div>
                        )}
                      </td>
                      <td style={{ padding: 14 }}>
                        <div style={{ color: '#0284C7', fontWeight: 600 }}>{p.email}</div>
                        <div style={{ fontSize: '0.78rem', color: '#64748B' }}>{p.phone || 'بدون هاتف'}</div>
                      </td>
                      <td style={{ padding: 14 }}>
                        <span style={{ fontWeight: 900, color: p.balance > 0 ? '#166534' : '#64748B', fontSize: '1rem' }}>
                          ${p.balance.toFixed(2)}
                        </span>
                      </td>
                      <td style={{ padding: 14 }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '3px 10px',
                          borderRadius: 8,
                          background: p.badgeColor || '#F59E0B',
                          color: '#FFFFFF',
                          fontWeight: 800,
                          fontSize: '0.78rem'
                        }}>
                          {p.levelArabicName || p.levelName || 'برونزي'}
                        </span>
                      </td>
                      <td style={{ padding: 14, fontWeight: 700, color: '#D97706' }}>
                        {p.totalPoints} نقطة
                      </td>
                      <td style={{ padding: 14 }}>
                        <div style={{ fontWeight: 700 }}>${p.totalPurchasesUsd.toFixed(2)}</div>
                        <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>{p.ordersCount} طلب</div>
                      </td>
                      <td style={{ padding: 14 }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '3px 10px',
                          borderRadius: 6,
                          fontSize: '0.75rem',
                          fontWeight: 800,
                          background: p.status === 'ACTIVE' ? '#DCFCE7' : '#FEE2E2',
                          color: p.status === 'ACTIVE' ? '#166534' : '#991B1B'
                        }}>
                          {p.status === 'ACTIVE' ? 'نشط' : 'معطل'}
                        </span>
                      </td>
                      <td style={{ padding: 14 }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                          {/* Details */}
                          <button
                            title="عرض التفاصيل وكشف الحساب"
                            onClick={() => openPartnerDetails(p.id)}
                            style={{
                              padding: 6,
                              borderRadius: 6,
                              border: '1px solid #CBD5E1',
                              background: '#F8FAFC',
                              cursor: 'pointer'
                            }}
                          >
                            <Eye size={16} color="#0284C7" />
                          </button>

                          {/* Credit */}
                          <button
                            title="إضافة رصيد يدوياً"
                            onClick={() => {
                              setWalletModalPartner(p);
                              setWalletModalType('CREDIT');
                              setWalletAmount('');
                              setWalletReason('');
                            }}
                            style={{
                              padding: 6,
                              borderRadius: 6,
                              border: '1px solid #BBF7D0',
                              background: '#F0FDF4',
                              cursor: 'pointer'
                            }}
                          >
                            <PlusCircle size={16} color="#166534" />
                          </button>

                          {/* Debit */}
                          <button
                            title="خصم رصيد يدوياً"
                            onClick={() => {
                              setWalletModalPartner(p);
                              setWalletModalType('DEBIT');
                              setWalletAmount('');
                              setWalletReason('');
                            }}
                            style={{
                              padding: 6,
                              borderRadius: 6,
                              border: '1px solid #FECACA',
                              background: '#FEF2F2',
                              cursor: 'pointer'
                            }}
                          >
                            <MinusCircle size={16} color="#991B1B" />
                          </button>

                          {/* Toggle Status */}
                          <button
                            title={p.status === 'ACTIVE' ? 'تعطيل الحساب' : 'تفعيل الحساب'}
                            onClick={() => togglePartnerStatus(p)}
                            style={{
                              padding: 6,
                              borderRadius: 6,
                              border: '1px solid #CBD5E1',
                              background: '#FFFFFF',
                              cursor: 'pointer'
                            }}
                          >
                            <ShieldAlert size={16} color={p.status === 'ACTIVE' ? '#991B1B' : '#166534'} />
                          </button>

                          {/* Resend Setup Link */}
                          <button
                            title="إعادة إرسال رابط تعيين كلمة المرور"
                            onClick={() => handleResendSetupLink(p.id)}
                            style={{
                              padding: 6,
                              borderRadius: 6,
                              border: '1px solid #FCD34D',
                              background: '#FEF3C7',
                              cursor: 'pointer'
                            }}
                          >
                            <RefreshCw size={16} color="#D97706" />
                          </button>
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

      {/* SUB-TAB 2: DEPOSIT REQUESTS */}
      {activeSubTab === 'deposits' && (
        <div style={{ background: '#FFFFFF', borderRadius: 14, border: '1px solid #E2E8F0', padding: 20 }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
            {(['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as const).map(st => (
              <button
                key={st}
                onClick={() => setDepositFilter(st)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: '1px solid #CBD5E1',
                  background: depositFilter === st ? '#0B0F19' : '#FFFFFF',
                  color: depositFilter === st ? '#FFFFFF' : '#475569',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                {st === 'PENDING' ? 'قيد المراجعة' : st === 'APPROVED' ? 'المعتمدة' : st === 'REJECTED' ? 'المرفوضة' : 'جميع الإيداعات'}
              </button>
            ))}
          </div>

          {depositsLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>جارٍ تحميل طلبات الإيداع...</div>
          ) : deposits.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>لا توجد طلبات إيداع في هذه الفئة.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0', color: '#475569', fontSize: '0.85rem' }}>
                    <th style={{ padding: 14 }}>الشريك</th>
                    <th style={{ padding: 14 }}>المبلغ المطلوب (USD)</th>
                    <th style={{ padding: 14 }}>المبلغ المحلي المحول</th>
                    <th style={{ padding: 14 }}>طريقة الدفع</th>
                    <th style={{ padding: 14 }}>الإيصال المالي</th>
                    <th style={{ padding: 14 }}>الحالة</th>
                    <th style={{ padding: 14 }}>التاريخ</th>
                    <th style={{ padding: 14, textAlign: 'center' }}>القرار</th>
                  </tr>
                </thead>
                <tbody>
                  {deposits.map(d => (
                    <tr key={d.id} style={{ borderBottom: '1px solid #F1F5F9', fontSize: '0.9rem' }}>
                      <td style={{ padding: 14 }}>
                        <div style={{ fontWeight: 800 }}>{d.partnerName}</div>
                        <div style={{ fontSize: '0.78rem', color: '#64748B' }}>{d.partnerEmail}</div>
                      </td>
                      <td style={{ padding: 14, fontWeight: 900, color: '#166534', fontSize: '1rem' }}>
                        ${d.amountUsd.toFixed(2)} USD
                      </td>
                      <td style={{ padding: 14 }}>
                        <div style={{ fontWeight: 800 }}>{d.amountLocal.toLocaleString()} {d.currencyLocal}</div>
                        <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>سعر الصرف: 1 USD = {d.exchangeRate} {d.currencyLocal}</div>
                      </td>
                      <td style={{ padding: 14, fontWeight: 600, color: '#475569' }}>
                        {d.paymentMethodName || 'تحويل بنكي'}
                      </td>
                      <td style={{ padding: 14 }}>
                        <button
                          onClick={() => setSelectedReceiptId(d.id)}
                          style={{
                            background: '#EFF6FF',
                            color: '#1D4ED8',
                            border: '1px solid #BFDBFE',
                            borderRadius: 6,
                            padding: '4px 10px',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4
                          }}
                        >
                          <Eye size={14} />
                          معاينة الإيصال
                        </button>
                      </td>
                      <td style={{ padding: 14 }}>
                        <span style={{
                          padding: '3px 10px',
                          borderRadius: 6,
                          fontSize: '0.75rem',
                          fontWeight: 800,
                          background: d.status === 'APPROVED' ? '#DCFCE7' : d.status === 'REJECTED' ? '#FEE2E2' : '#FEF3C7',
                          color: d.status === 'APPROVED' ? '#166534' : d.status === 'REJECTED' ? '#991B1B' : '#92400E'
                        }}>
                          {d.status === 'APPROVED' ? 'معتمد ✓' : d.status === 'REJECTED' ? 'مرفوض ✗' : 'قيد المراجعة ⏳'}
                        </span>
                      </td>
                      <td style={{ padding: 14, fontSize: '0.8rem', color: '#64748B' }}>
                        {new Date(d.createdAt).toLocaleString('ar-EG')}
                      </td>
                      <td style={{ padding: 14 }}>
                        {d.status === 'PENDING' ? (
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                            <button
                              onClick={() => handleApproveDeposit(d.id, d.amountUsd, d.partnerName)}
                              style={{
                                background: '#166534',
                                color: '#FFFFFF',
                                border: 'none',
                                borderRadius: 6,
                                padding: '6px 12px',
                                fontWeight: 800,
                                fontSize: '0.8rem',
                                cursor: 'pointer'
                              }}
                            >
                              اعتماد وإضافة
                            </button>
                            <button
                              onClick={() => {
                                setRejectModalDeposit(d);
                                setRejectReason('');
                              }}
                              style={{
                                background: '#991B1B',
                                color: '#FFFFFF',
                                border: 'none',
                                borderRadius: 6,
                                padding: '6px 12px',
                                fontWeight: 800,
                                fontSize: '0.8rem',
                                cursor: 'pointer'
                              }}
                            >
                              رفض
                            </button>
                          </div>
                        ) : (
                          <div style={{ textAlign: 'center', fontSize: '0.8rem', color: '#94A3B8' }}>مكتمل</div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 3: PARTNER PRICING */}
      {activeSubTab === 'pricing' && (
        <div style={{ background: '#FFFFFF', borderRadius: 14, border: '1px solid #E2E8F0', padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
            <label style={{ fontWeight: 800, color: '#0F172A' }}>اختر الشريك لتحديد أسعاره المخصصة:</label>
            <select
              value={pricingPartnerId}
              onChange={e => setPricingPartnerId(e.target.value)}
              style={{
                padding: '10px 14px',
                borderRadius: 8,
                border: '1px solid #CBD5E1',
                fontWeight: 700,
                minWidth: 260
              }}
            >
              {partners.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.email}) - {p.businessName || 'بدون متجر'}
                </option>
              ))}
            </select>
          </div>

          {pricingLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>جارٍ تحميل أسعار المنتجات...</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0', color: '#475569', fontSize: '0.85rem' }}>
                    <th style={{ padding: 14 }}>المنتج / الباقة</th>
                    <th style={{ padding: 14 }}>تكلفة المزود ($)</th>
                    <th style={{ padding: 14 }}>سعر المتجر العام ($)</th>
                    <th style={{ padding: 14 }}>سعر الشريك الافتراضي ($)</th>
                    <th style={{ padding: 14 }}>السعر المخصص لهذا التاجر ($)</th>
                    <th style={{ padding: 14 }}>الحالة للتاجر</th>
                    <th style={{ padding: 14, textAlign: 'center' }}>الإجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {pricingItems.map(item => (
                    <tr key={item.productId} style={{ borderBottom: '1px solid #F1F5F9', fontSize: '0.9rem' }}>
                      <td style={{ padding: 14 }}>
                        <div style={{ fontWeight: 800 }}>{item.arabicName || item.productName}</div>
                        <div style={{ fontSize: '0.78rem', color: '#64748B' }}>{item.offerName}</div>
                      </td>
                      <td style={{ padding: 14, color: '#64748B', fontWeight: 600 }}>
                        ${Number(item.costPriceUsd).toFixed(2)}
                      </td>
                      <td style={{ padding: 14, color: '#0F172A', fontWeight: 700 }}>
                        ${Number(item.retailPriceUsd).toFixed(2)}
                      </td>
                      <td style={{ padding: 14, color: '#0284C7', fontWeight: 700 }}>
                        ${Number(item.defaultPartnerPriceUsd || (item.retailPriceUsd * 0.95)).toFixed(2)}
                      </td>
                      <td style={{ padding: 14 }}>
                        {item.customPartnerPriceUsd !== null && item.customPartnerPriceUsd !== undefined ? (
                          <span style={{ fontWeight: 900, color: '#D97706', background: '#FEF3C7', padding: '3px 8px', borderRadius: 6 }}>
                            ${Number(item.customPartnerPriceUsd).toFixed(2)} (مخصص)
                          </span>
                        ) : (
                          <span style={{ color: '#94A3B8' }}>الافتراضي</span>
                        )}
                      </td>
                      <td style={{ padding: 14 }}>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: 6,
                          fontSize: '0.75rem',
                          fontWeight: 800,
                          background: item.customIsAvailable !== false ? '#DCFCE7' : '#FEE2E2',
                          color: item.customIsAvailable !== false ? '#166534' : '#991B1B'
                        }}>
                          {item.customIsAvailable !== false ? 'متاح للشراء' : 'محظور عليه'}
                        </span>
                      </td>
                      <td style={{ padding: 14 }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                          <button
                            onClick={() => {
                              const currPrice = item.customPartnerPriceUsd !== null && item.customPartnerPriceUsd !== undefined
                                ? Number(item.customPartnerPriceUsd)
                                : Number(item.defaultPartnerPriceUsd || (item.retailPriceUsd * 0.95));

                              setEditingPricingItem({
                                productId: item.productId,
                                name: item.arabicName || item.productName,
                                price: currPrice,
                                isAvailable: item.customIsAvailable !== false
                              });
                            }}
                            style={{
                              background: '#F59E0B',
                              color: '#FFFFFF',
                              border: 'none',
                              borderRadius: 6,
                              padding: '5px 12px',
                              fontWeight: 800,
                              fontSize: '0.8rem',
                              cursor: 'pointer'
                            }}
                          >
                            تعديل السعر
                          </button>

                          {item.customPartnerPriceUsd !== null && item.customPartnerPriceUsd !== undefined && (
                            <button
                              onClick={() => handleResetPricing(item.productId)}
                              style={{
                                background: '#F1F5F9',
                                color: '#64748B',
                                border: '1px solid #CBD5E1',
                                borderRadius: 6,
                                padding: '5px 8px',
                                fontSize: '0.8rem',
                                cursor: 'pointer'
                              }}
                              title="استعادة السعر الافتراضي"
                            >
                              إلغاء التخصيص
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

      {/* SUB-TAB 4: LEVELS & POINTS */}
      {activeSubTab === 'levels' && (
        <div style={{ background: '#FFFFFF', borderRadius: 14, border: '1px solid #E2E8F0', padding: 20 }}>
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 900, color: '#0F172A', margin: '0 0 6px 0' }}>مستويات الشركاء ونظام النقاط</h3>
            <p style={{ color: '#64748B', fontSize: '0.9rem', margin: 0 }}>
              يتم احتساب 1 نقطة لكل 1 دولار يتم شراؤه. يتم ترقية التاجر تلقائياً فور بلوغ الحد المطلوب وتطبيق نسبة الخصم.
            </p>
          </div>

          {levelsLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>جارٍ تحميل المستويات...</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
              {levels.map(lvl => (
                <div key={lvl.id} style={{ border: `2px solid ${lvl.badge_color || '#CBD5E1'}`, borderRadius: 14, padding: 18, background: '#F8FAFC' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div style={{
                      background: lvl.badge_color || '#F59E0B',
                      color: '#FFFFFF',
                      padding: '4px 12px',
                      borderRadius: 8,
                      fontWeight: 900,
                      fontSize: '0.9rem'
                    }}>
                      {lvl.arabic_name} ({lvl.name})
                    </div>
                    <span style={{ fontSize: '1.2rem', fontWeight: 900, color: '#166534' }}>
                      خصم {lvl.discount_percent}%
                    </span>
                  </div>

                  <div style={{ fontSize: '0.85rem', color: '#475569', marginBottom: 8 }}>
                    <strong>حد النقاط:</strong> من {lvl.min_points} إلى {lvl.max_points !== null && lvl.max_points !== undefined ? lvl.max_points : 'ما لا نهاية'}
                  </div>

                  <div style={{ fontSize: '0.82rem', color: '#64748B', background: '#FFFFFF', padding: 10, borderRadius: 8, border: '1px solid #E2E8F0', minHeight: 45, marginBottom: 12 }}>
                    {lvl.perks_description || 'لا توجد مزايا إضافية مدخلة'}
                  </div>

                  <button
                    onClick={() => setEditingLevel(lvl)}
                    style={{
                      width: '100%',
                      background: '#0B0F19',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: 8,
                      padding: '8px 12px',
                      fontWeight: 800,
                      fontSize: '0.85rem',
                      cursor: 'pointer'
                    }}
                  >
                    تعديل إعدادات المستوى
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 5: EXCHANGE RATE HISTORY */}
      {activeSubTab === 'rates' && (
        <div style={{ background: '#FFFFFF', borderRadius: 14, border: '1px solid #E2E8F0', padding: 20 }}>
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 900, color: '#0F172A', margin: '0 0 6px 0' }}>سجل أرشفة أسعار الصرف</h3>
            <p style={{ color: '#64748B', fontSize: '0.9rem', margin: 0 }}>
              توثيق كامل لكل عملية تغيير في سعر الصرف، المسؤول المنفذ، والسبب المدخل
            </p>
          </div>

          {rateHistoryLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>جارٍ تحميل سجل أسعار الصرف...</div>
          ) : rateHistory.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>لا توجد تعديلات مسجلة بعد.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0', color: '#475569', fontSize: '0.85rem' }}>
                    <th style={{ padding: 14 }}>التاريخ والوقت</th>
                    <th style={{ padding: 14 }}>السعر القديم</th>
                    <th style={{ padding: 14 }}>السعر الجديد</th>
                    <th style={{ padding: 14 }}>المسؤول المنفذ</th>
                    <th style={{ padding: 14 }}>السبب والبيان</th>
                  </tr>
                </thead>
                <tbody>
                  {rateHistory.map(h => (
                    <tr key={h.id} style={{ borderBottom: '1px solid #F1F5F9', fontSize: '0.9rem' }}>
                      <td style={{ padding: 14, color: '#64748B' }}>
                        {new Date(h.created_at).toLocaleString('ar-EG')}
                      </td>
                      <td style={{ padding: 14, color: '#991B1B', fontWeight: 700 }}>
                        1 USD = {h.old_rate} {h.quote_currency}
                      </td>
                      <td style={{ padding: 14, color: '#166534', fontWeight: 900 }}>
                        1 USD = {h.new_rate} {h.quote_currency}
                      </td>
                      <td style={{ padding: 14, fontWeight: 700 }}>
                        {h.adminName || 'المسؤول'}
                      </td>
                      <td style={{ padding: 14, color: '#475569' }}>
                        {h.reason || 'تحديث دوري لسعر الصرف'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: CREATE PARTNER */}
      {showCreateModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: 16 }}>
          <div style={{ background: '#FFFFFF', borderRadius: 16, width: '100%', maxWidth: 540, padding: 24, boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 900, color: '#0F172A', margin: '0 0 16px 0' }}>
              إنشاء شريك / تاجر جديد
            </h2>

            {createdResult ? (
              <div>
                <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', padding: 16, borderRadius: 12, marginBottom: 16 }}>
                  <div style={{ color: '#166534', fontWeight: 800, fontSize: '1rem', marginBottom: 6 }}>
                    ✓ تم إنشاء حساب الشريك بنجاح!
                  </div>
                  <p style={{ margin: '0 0 10px 0', fontSize: '0.85rem', color: '#475569' }}>
                    تم إرسال بريد ترحيبي إلى <strong>{createdResult.email}</strong> يحتوي على رابط إعداد كلمة المرور الخاص به.
                  </p>
                  <div style={{ fontSize: '0.8rem', color: '#0F172A', fontWeight: 700, marginBottom: 4 }}>
                    رابط إعداد كلمة المرور المباشر (يمكنك نسخه وتسليمه له يدوياً):
                  </div>
                  <div style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', padding: 8, borderRadius: 6, fontSize: '0.75rem', wordBreak: 'break-all', color: '#1D4ED8', userSelect: 'all' }}>
                    {createdResult.setupUrl}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(createdResult.setupUrl);
                      alert('تم نسخ الرابط إلى الحافظة!');
                    }}
                    style={{
                      flex: 1,
                      background: '#F59E0B',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: 8,
                      padding: 12,
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6
                    }}
                  >
                    <Copy size={16} />
                    نسخ الرابط
                  </button>

                  <button
                    onClick={() => setShowCreateModal(false)}
                    style={{
                      flex: 1,
                      background: '#0B0F19',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: 8,
                      padding: 12,
                      fontWeight: 800,
                      cursor: 'pointer'
                    }}
                  >
                    إغلاق النافذة
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreatePartner}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: 4 }}>اسم الشريك *</label>
                    <input
                      type="text"
                      required
                      placeholder="مثال: أحمد محمد"
                      value={createForm.name}
                      onChange={e => setCreateForm({ ...createForm, name: e.target.value })}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #CBD5E1' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: 4 }}>اسم المتجر / النشاط</label>
                    <input
                      type="text"
                      placeholder="مثال: متجر النخبة للشحن"
                      value={createForm.businessName}
                      onChange={e => setCreateForm({ ...createForm, businessName: e.target.value })}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #CBD5E1' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: 4 }}>البريد الإلكتروني *</label>
                    <input
                      type="email"
                      required
                      placeholder="partner@example.com"
                      value={createForm.email}
                      onChange={e => setCreateForm({ ...createForm, email: e.target.value })}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #CBD5E1' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: 4 }}>رقم الهاتف (واتساب)</label>
                    <input
                      type="text"
                      placeholder="مثال: +249912345678"
                      value={createForm.phone}
                      onChange={e => setCreateForm({ ...createForm, phone: e.target.value })}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #CBD5E1' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: 4 }}>المستوى الأولي</label>
                    <select
                      value={createForm.levelId}
                      onChange={e => setCreateForm({ ...createForm, levelId: e.target.value })}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #CBD5E1' }}
                    >
                      {levels.map(l => (
                        <option key={l.id} value={l.id}>{l.arabic_name} ({l.discount_percent}%)</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: 4 }}>حالة الحساب</label>
                    <select
                      value={createForm.status}
                      onChange={e => setCreateForm({ ...createForm, status: e.target.value as any })}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #CBD5E1' }}
                    >
                      <option value="ACTIVE">نشط (جاهز للشحن فور تعيين كلمة المرور)</option>
                      <option value="SUSPENDED">معطل مؤقتاً</option>
                    </select>
                  </div>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: 4 }}>ملاحظات داخلية (اختياري)</label>
                  <textarea
                    rows={2}
                    placeholder="ملاحظات للإدارة حول هذا التاجر..."
                    value={createForm.notes}
                    onChange={e => setCreateForm({ ...createForm, notes: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #CBD5E1' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    style={{
                      background: '#F1F5F9',
                      color: '#475569',
                      border: '1px solid #CBD5E1',
                      borderRadius: 8,
                      padding: '10px 18px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    إلغاء
                  </button>

                  <button
                    type="submit"
                    disabled={createSubmitting}
                    style={{
                      background: '#F59E0B',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: 8,
                      padding: '10px 22px',
                      fontWeight: 800,
                      cursor: 'pointer'
                    }}
                  >
                    {createSubmitting ? 'جارٍ الإنشاء...' : 'إنشاء الشريك وإرسال الرابط'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* MODAL 2: WALLET CREDIT / DEBIT */}
      {walletModalPartner && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: 16 }}>
          <div style={{ background: '#FFFFFF', borderRadius: 16, width: '100%', maxWidth: 460, padding: 24 }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 900, color: walletModalType === 'CREDIT' ? '#166534' : '#991B1B', margin: '0 0 10px 0' }}>
              {walletModalType === 'CREDIT' ? 'إضافة رصيد للمحفظة (Credit)' : 'خصم رصيد من المحفظة (Debit)'}
            </h2>

            <p style={{ fontSize: '0.9rem', color: '#475569', margin: '0 0 16px 0' }}>
              التاجر: <strong>{walletModalPartner.name}</strong> ({walletModalPartner.email})<br />
              الرصيد الحالي: <strong>${walletModalPartner.balance.toFixed(2)} USD</strong>
            </p>

            <form onSubmit={handleWalletSubmit}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: 4 }}>المبلغ بالدولار USD *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="0.00"
                  value={walletAmount}
                  onChange={e => setWalletAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #CBD5E1', fontSize: '1.1rem', fontWeight: 800 }}
                />
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: 4 }}>سبب العملية (إلزامي للتدقيق المالي) *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="مثال: تسوية تحويل بنكي مباشر / تعويض خطأ شحن..."
                  value={walletReason}
                  onChange={e => setWalletReason(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #CBD5E1' }}
                />
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setWalletModalPartner(null)}
                  style={{
                    background: '#F1F5F9',
                    color: '#475569',
                    border: '1px solid #CBD5E1',
                    borderRadius: 8,
                    padding: '10px 18px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  إلغاء
                </button>

                <button
                  type="submit"
                  disabled={walletSubmitting}
                  style={{
                    background: walletModalType === 'CREDIT' ? '#166534' : '#991B1B',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: 8,
                    padding: '10px 22px',
                    fontWeight: 800,
                    cursor: 'pointer'
                  }}
                >
                  {walletSubmitting ? 'جارٍ التنفيذ...' : walletModalType === 'CREDIT' ? 'تأكيد إضافة الرصيد' : 'تأكيد الخصم'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: VIEW RECEIPT */}
      {selectedReceiptId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: 16 }}>
          <div style={{ background: '#FFFFFF', borderRadius: 16, width: '100%', maxWidth: 540, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontWeight: 900 }}>صورة إشعار التحويل المالي</h3>
              <button onClick={() => setSelectedReceiptId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 900 }}>✕</button>
            </div>

            <div style={{ textAlign: 'center', background: '#0F172A', borderRadius: 10, padding: 10, minHeight: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img
                src={`/api/partner/deposits/${selectedReceiptId}/receipt`}
                alt="Receipt"
                style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: 6, objectFit: 'contain' }}
              />
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: REJECT DEPOSIT REASON */}
      {rejectModalDeposit && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: 16 }}>
          <div style={{ background: '#FFFFFF', borderRadius: 16, width: '100%', maxWidth: 440, padding: 24 }}>
            <h3 style={{ margin: '0 0 10px 0', fontWeight: 900, color: '#991B1B' }}>سبب رفض طلب الإيداع</h3>
            <p style={{ fontSize: '0.85rem', color: '#64748B', margin: '0 0 14px 0' }}>
              سيتم إرسال هذا السبب إلى التاجر عبر البريد الإلكتروني.
            </p>

            <textarea
              rows={3}
              required
              placeholder="مثال: لم يتم العثور على التحويل في الحساب البنكي / الإشعار غير واضح..."
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #CBD5E1', marginBottom: 16 }}
            />

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setRejectModalDeposit(null)}
                style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #CBD5E1', borderRadius: 8, padding: '8px 16px', fontWeight: 700 }}
              >
                إلغاء
              </button>
              <button
                onClick={handleRejectDeposit}
                style={{ background: '#991B1B', color: '#FFFFFF', border: 'none', borderRadius: 8, padding: '8px 18px', fontWeight: 800 }}
              >
                تأكيد الرفض
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: EDIT PRODUCT PRICING */}
      {editingPricingItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: 16 }}>
          <div style={{ background: '#FFFFFF', borderRadius: 16, width: '100%', maxWidth: 420, padding: 24 }}>
            <h3 style={{ margin: '0 0 8px 0', fontWeight: 900 }}>تحديد سعر خاص للباقة</h3>
            <div style={{ fontSize: '0.9rem', color: '#64748B', marginBottom: 14 }}>{editingPricingItem.name}</div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: 4 }}>سعر الشريك بالدولار ($) *</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={editingPricingItem.price}
                onChange={e => setEditingPricingItem({ ...editingPricingItem, price: Number(e.target.value) })}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #CBD5E1', fontSize: '1.1rem', fontWeight: 800 }}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={editingPricingItem.isAvailable}
                  onChange={e => setEditingPricingItem({ ...editingPricingItem, isAvailable: e.target.checked })}
                />
                السماح لهذا التاجر بشراء هذه الباقة
              </label>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setEditingPricingItem(null)}
                style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #CBD5E1', borderRadius: 8, padding: '8px 16px', fontWeight: 700 }}
              >
                إلغاء
              </button>
              <button
                onClick={handleSavePricing}
                style={{ background: '#F59E0B', color: '#FFFFFF', border: 'none', borderRadius: 8, padding: '8px 18px', fontWeight: 800 }}
              >
                حفظ السعر المخصص
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 6: EDIT LEVEL */}
      {editingLevel && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: 16 }}>
          <div style={{ background: '#FFFFFF', borderRadius: 16, width: '100%', maxWidth: 480, padding: 24 }}>
            <h3 style={{ margin: '0 0 14px 0', fontWeight: 900 }}>تعديل المستوى: {editingLevel.arabic_name}</h3>

            <form onSubmit={handleSaveLevel}>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: 4 }}>الاسم بالعربية</label>
                <input
                  type="text"
                  required
                  value={editingLevel.arabic_name}
                  onChange={e => setEditingLevel({ ...editingLevel, arabic_name: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #CBD5E1' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: 4 }}>الحد الأدنى للنقاط</label>
                  <input
                    type="number"
                    value={editingLevel.min_points}
                    onChange={e => setEditingLevel({ ...editingLevel, min_points: Number(e.target.value) })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #CBD5E1' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: 4 }}>الحد الأقصى للنقاط</label>
                  <input
                    type="number"
                    placeholder="فارغ = ما لا نهاية"
                    value={editingLevel.max_points ?? ''}
                    onChange={e => setEditingLevel({ ...editingLevel, max_points: e.target.value === '' ? undefined : Number(e.target.value) })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #CBD5E1' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: 4 }}>نسبة الخصم المئوية (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="50"
                    value={editingLevel.discount_percent}
                    onChange={e => setEditingLevel({ ...editingLevel, discount_percent: Number(e.target.value) })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #CBD5E1' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: 4 }}>لون الشارة (HEX)</label>
                  <input
                    type="text"
                    value={editingLevel.badge_color}
                    onChange={e => setEditingLevel({ ...editingLevel, badge_color: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #CBD5E1' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: 4 }}>وصف المزايا</label>
                <textarea
                  rows={2}
                  value={editingLevel.perks_description || ''}
                  onChange={e => setEditingLevel({ ...editingLevel, perks_description: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #CBD5E1' }}
                />
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setEditingLevel(null)}
                  style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #CBD5E1', borderRadius: 8, padding: '8px 16px', fontWeight: 700 }}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  style={{ background: '#F59E0B', color: '#FFFFFF', border: 'none', borderRadius: 8, padding: '8px 18px', fontWeight: 800 }}
                >
                  حفظ المستوى
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DRAWER: PARTNER DETAILS & LEDGER */}
      {selectedPartner && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'flex-start', zIndex: 10000 }}>
          <div style={{ background: '#FFFFFF', width: '100%', maxWidth: 640, height: '100%', overflowY: 'auto', padding: 24, boxShadow: '-5px 0 25px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, borderBottom: '1px solid #E2E8F0', paddingBottom: 14 }}>
              <div>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 900, color: '#0F172A', margin: '0 0 4px 0' }}>
                  {selectedPartner.name}
                </h2>
                <div style={{ fontSize: '0.85rem', color: '#64748B' }}>
                  {selectedPartner.email} • {selectedPartner.phone || 'بدون هاتف'}
                </div>
              </div>
              <button
                onClick={() => setSelectedPartner(null)}
                style={{ background: '#F1F5F9', border: 'none', borderRadius: 8, padding: '6px 12px', fontWeight: 800, cursor: 'pointer' }}
              >
                ✕ إغلاق
              </button>
            </div>

            {/* Quick Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', padding: 14, borderRadius: 10 }}>
                <div style={{ fontSize: '0.8rem', color: '#166534', fontWeight: 700 }}>رصيد المحفظة</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#166534' }}>${selectedPartner.balance.toFixed(2)} USD</div>
              </div>

              <div style={{ background: '#FEF3C7', border: '1px solid #FCD34D', padding: 14, borderRadius: 10 }}>
                <div style={{ fontSize: '0.8rem', color: '#92400E', fontWeight: 700 }}>النقاط والمستوى</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#92400E' }}>
                  {selectedPartner.totalPoints} نقطة ({selectedPartner.levelArabicName})
                </div>
              </div>
            </div>

            {/* Recent Orders */}
            <h4 style={{ fontSize: '1rem', fontWeight: 900, margin: '20px 0 10px 0' }}>آخر طلبات الشحن</h4>
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
              {selectedPartner.recentOrders?.length === 0 ? (
                <div style={{ padding: 16, textAlign: 'center', color: '#94A3B8', fontSize: '0.85rem' }}>لا توجد طلبات سابقة.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'right' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                      <th style={{ padding: 8 }}>الباقة</th>
                      <th style={{ padding: 8 }}>اللاعب</th>
                      <th style={{ padding: 8 }}>المبلغ</th>
                      <th style={{ padding: 8 }}>الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedPartner.recentOrders?.map((o: any) => (
                      <tr key={o.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: 8 }}>{o.package_name}</td>
                        <td style={{ padding: 8 }}>{o.player_id}</td>
                        <td style={{ padding: 8, fontWeight: 700 }}>${Number(o.partner_price_usd).toFixed(2)}</td>
                        <td style={{ padding: 8 }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: o.status === 'COMPLETED' ? '#166534' : '#92400E' }}>
                            {o.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Recent Ledger */}
            <h4 style={{ fontSize: '1rem', fontWeight: 900, margin: '20px 0 10px 0' }}>كشف الحساب المالي (Ledger)</h4>
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 10, overflow: 'hidden' }}>
              {selectedPartner.recentLedger?.length === 0 ? (
                <div style={{ padding: 16, textAlign: 'center', color: '#94A3B8', fontSize: '0.85rem' }}>لا توجد حركات مالية مسجلة.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'right' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                      <th style={{ padding: 8 }}>النوع</th>
                      <th style={{ padding: 8 }}>المبلغ</th>
                      <th style={{ padding: 8 }}>الرصيد بعد</th>
                      <th style={{ padding: 8 }}>البيان</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedPartner.recentLedger?.map((l: any) => (
                      <tr key={l.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: 8, fontWeight: 800 }}>{l.type}</td>
                        <td style={{ padding: 8, fontWeight: 700, color: l.type === 'DEPOSIT' || l.type === 'REFUND' || l.type === 'MANUAL_CREDIT' ? '#166534' : '#991B1B' }}>
                          {l.type === 'DEPOSIT' || l.type === 'REFUND' || l.type === 'MANUAL_CREDIT' ? '+' : '-'}${Number(l.amount).toFixed(2)}
                        </td>
                        <td style={{ padding: 8 }}>${Number(l.balance_after).toFixed(2)}</td>
                        <td style={{ padding: 8, fontSize: '0.75rem', color: '#64748B' }}>{l.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
