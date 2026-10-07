import React, { useState, useEffect, useCallback } from 'react';
import {
  CreditCard,
  Plus,
  UploadCloud,
  ShieldCheck,
  Eye,
  Trash2,
  Power,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Settings,
  KeyRound,
  Search,
  Layers,
  Download,
  FileText,
  X
} from 'lucide-react';
import { api } from '../../lib/api';
import { AdminKiroProCard, KiroProCardStats, KiroProCardVoucher } from '../../types';

export const AdminKiroProCards: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'inventory' | 'add' | 'bulk' | 'vouchers' | 'settings'>('inventory');
  const [stats, setStats] = useState<KiroProCardStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [cards, setCards] = useState<AdminKiroProCard[]>([]);
  const [loadingCards, setLoadingCards] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Reveal Modal State
  const [revealTargetCard, setRevealTargetCard] = useState<AdminKiroProCard | null>(null);
  const [revealReason, setRevealReason] = useState<string>('');
  const [revealedDetails, setRevealedDetails] = useState<{
    id: string;
    cardNumber: string;
    expDate: string;
    cvv: string;
    balance: number;
    cardLast4: string;
  } | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [revealError, setRevealError] = useState<string | null>(null);

  // Add Single Card Form State
  const [singleCardNumber, setSingleCardNumber] = useState('');
  const [singleExpDate, setSingleExpDate] = useState('');
  const [singleCvv, setSingleCvv] = useState('');
  const [singleBalance, setSingleBalance] = useState('1.00');
  const [singleNotes, setSingleNotes] = useState('');
  const [submittingSingle, setSubmittingSingle] = useState(false);
  const [singleError, setSingleError] = useState<string | null>(null);
  const [singleSuccess, setSingleSuccess] = useState<string | null>(null);

  // Bulk Import Form State
  const [bulkMode, setBulkMode] = useState<'file' | 'text'>('file');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileDetails, setFileDetails] = useState<{ name: string; size: string; rows: number } | null>(null);
  const [bulkCsvText, setBulkCsvText] = useState('');
  const [submittingBulk, setSubmittingBulk] = useState(false);
  const [bulkResult, setBulkResult] = useState<{
    imported: number;
    failed: number;
    message: string;
    errors?: Array<{ row: number; reason: string }>;
  } | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);

  // Vouchers State
  const [vouchers, setVouchers] = useState<KiroProCardVoucher[]>([]);
  const [loadingVouchers, setLoadingVouchers] = useState(false);
  const [genVoucherCount, setGenVoucherCount] = useState(5);
  const [genVoucherDays, setGenVoucherDays] = useState(30);
  const [generatingVouchers, setGeneratingVouchers] = useState(false);
  const [voucherSuccess, setVoucherSuccess] = useState<string | null>(null);

  // Settings State
  const [lowStockThreshold, setLowStockThreshold] = useState(5);
  const [complianceNotice, setComplianceNotice] = useState('');
  const [cardProductPrice, setCardProductPrice] = useState<number>(2.00);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const res: any = await api.get('/api/admin/kiropro-cards/stats');
      if (res && (res.success || res.totalCards !== undefined)) {
        setStats(res);
      }
    } catch (err) {
      console.error('Failed to load card stats', err);
    } finally {
      setLoadingStats(false);
    }
  }, []);

  const loadCards = useCallback(async () => {
    setLoadingCards(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.append('status', statusFilter);
      if (searchQuery.trim()) params.append('search', searchQuery.trim());
      params.append('limit', '50');

      const res: any = await api.get(`/api/admin/kiropro-cards/inventory?${params.toString()}`);
      if (res && res.cards) {
        setCards(res.cards);
      }
    } catch (err) {
      console.error('Failed to load cards inventory', err);
    } finally {
      setLoadingCards(false);
    }
  }, [statusFilter, searchQuery]);

  const loadVouchers = useCallback(async () => {
    setLoadingVouchers(true);
    try {
      const res: any = await api.get('/api/admin/kiropro-cards/vouchers');
      if (res && res.vouchers) {
        setVouchers(res.vouchers);
      }
    } catch (err) {
      console.error('Failed to load vouchers', err);
    } finally {
      setLoadingVouchers(false);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const res: any = await api.get('/api/admin/kiropro-cards/settings');
      if (res && res.settings) {
        setLowStockThreshold(res.settings.lowStockThreshold || 5);
        setComplianceNotice(res.settings.complianceNotice || '');
        if (res.settings.productPriceUsd !== undefined) {
          setCardProductPrice(Number(res.settings.productPriceUsd));
        }
      }
    } catch (err) {
      console.error('Failed to load settings', err);
    }
  }, []);

  useEffect(() => {
    loadStats();
    loadCards();
  }, [loadStats, loadCards]);

  useEffect(() => {
    if (activeSubTab === 'vouchers') {
      loadVouchers();
    } else if (activeSubTab === 'settings') {
      loadSettings();
    }
  }, [activeSubTab, loadVouchers, loadSettings]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRevealCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!revealTargetCard || !revealReason.trim() || revealing) return;

    setRevealing(true);
    setRevealError(null);

    try {
      const res: any = await api.post(`/api/admin/kiropro-cards/${revealTargetCard.id}/reveal`, {
        reason: revealReason.trim()
      });

      if (res.success && res.card) {
        setRevealedDetails(res.card);
      } else {
        setRevealError(res.error || 'فشل فك تشفير البطاقة.');
      }
    } catch (err: any) {
      setRevealError(err?.response?.data?.error || err.message || 'فشل كشف بيانات البطاقة.');
    } finally {
      setRevealing(false);
    }
  };

  const handleToggleDisable = async (cardId: string) => {
    try {
      await api.patch(`/api/admin/kiropro-cards/${cardId}/toggle-disable`);
      loadCards();
      loadStats();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'تعذر تعديل حالة البطاقة');
    }
  };

  const handleDeleteCard = async (cardId: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذه البطاقة نهائياً من المخزون؟')) return;
    try {
      await api.delete(`/api/admin/kiropro-cards/${cardId}`);
      loadCards();
      loadStats();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'تعذر حذف البطاقة. قد تكون مرتبطة بطلب نشط.');
    }
  };

  const handleAddSingleCard = async (e: React.FormEvent) => {
    e.preventDefault();
    setSingleError(null);
    setSingleSuccess(null);
    setSubmittingSingle(true);

    try {
      const res: any = await api.post('/api/admin/kiropro-cards/add', {
        cardNumber: singleCardNumber.trim(),
        expDate: singleExpDate.trim(),
        cvv: singleCvv.trim(),
        balance: parseFloat(singleBalance) || 1.00,
        notes: singleNotes.trim() || undefined
      });

      if (res.success) {
        setSingleSuccess(`تمت إضافة البطاقة بنجاح (تنتهي بـ ${res.card?.last4 || res.card?.card_last4 || '••••'})`);
        setSingleCardNumber('');
        setSingleExpDate('');
        setSingleCvv('');
        setSingleNotes('');
        loadStats();
        loadCards();
      } else {
        setSingleError(res.error || 'تعذر إضافة البطاقة.');
      }
    } catch (err: any) {
      setSingleError(err?.response?.data?.error || err.message || 'تعذر إضافة البطاقة.');
    } finally {
      setSubmittingSingle(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setSelectedFile(null);
      setFileDetails(null);
      return;
    }
    setSelectedFile(file);
    setBulkError(null);
    setBulkResult(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = (event.target?.result as string) || '';
      const lines = text.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/).map((l) => l.trim()).filter(Boolean);
      const isHeader = lines[0] && (lines[0].toLowerCase().includes('card') || lines[0].toLowerCase().includes('exp'));
      const estimatedRows = isHeader ? Math.max(0, lines.length - 1) : lines.length;

      const sizeKb = (file.size / 1024).toFixed(1);
      setFileDetails({
        name: file.name,
        size: `${sizeKb} KB`,
        rows: estimatedRows
      });
    };
    reader.readAsText(file);
  };

  const handleDownloadTemplate = () => {
    const csvContent = 'card_number,exp_date,cvv,balance\r\n' +
      '5555555555554444,12/28,123,1.00\r\n' +
      '5105105105105100,11/27,456,1.00\r\n';
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'kiropro_cards_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleBulkImport = async (e: React.FormEvent) => {
    e.preventDefault();
    setBulkError(null);
    setBulkResult(null);

    const formData = new FormData();

    if (bulkMode === 'file') {
      if (!selectedFile) {
        setBulkError('يرجى اختيار ملف CSV أولاً.');
        return;
      }
      formData.append('file', selectedFile);
    } else {
      if (!bulkCsvText.trim()) {
        setBulkError('يرجى لصق بيانات البطاقات.');
        return;
      }
      const blob = new Blob([bulkCsvText], { type: 'text/csv' });
      formData.append('file', blob, 'pasted_cards.csv');
    }

    setSubmittingBulk(true);
    try {
      const res: any = await api.upload('/api/admin/kiropro-cards/bulk-import', formData);

      if (res && res.success) {
        setBulkResult({
          imported: res.imported,
          failed: res.failed || 0,
          message: res.message || `تم استيراد ${res.imported} بطاقة بنجاح.`,
          errors: res.errors
        });
        if (bulkMode === 'file') {
          setSelectedFile(null);
          setFileDetails(null);
        } else {
          setBulkCsvText('');
        }
        loadStats();
        loadCards();
      } else {
        setBulkError(res?.message || res?.error || 'فشل الاستيراد الجماعي.');
        if (res && res.errors && res.errors.length > 0) {
          setBulkResult({
            imported: res.imported || 0,
            failed: res.failed || res.errors.length,
            message: res.message || 'حدثت أخطاء أثناء فحص ملف الاستيراد.',
            errors: res.errors
          });
        }
      }
    } catch (err: any) {
      const errorData = err?.data;
      if (errorData && errorData.errors) {
        setBulkResult({
          imported: errorData.imported || 0,
          failed: errorData.failed || errorData.errors.length,
          message: errorData.message || 'تعذر استيراد بعض أو كل الصفوف.',
          errors: errorData.errors
        });
        setBulkError(errorData.message || 'فشل استيراد الملف.');
      } else {
        setBulkError(err?.message || 'فشل رفع ومعالجة ملف الاستيراد.');
      }
    } finally {
      setSubmittingBulk(false);
    }
  };

  const handleGenerateVouchers = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneratingVouchers(true);
    setVoucherSuccess(null);

    try {
      const res: any = await api.post('/api/admin/kiropro-cards/vouchers/generate', {
        count: genVoucherCount,
        expiresDays: genVoucherDays
      });

      if (res.success) {
        setVoucherSuccess(res.message || `تم توليد ${genVoucherCount} كود إصدار بنجاح!`);
        loadVouchers();
        loadStats();
      }
    } catch (err: any) {
      alert(err?.response?.data?.error || 'فشل توليد الأكواد');
    } finally {
      setGeneratingVouchers(false);
    }
  };

  const handleToggleVoucher = async (voucherId: string) => {
    try {
      await api.patch(`/api/admin/kiropro-cards/vouchers/${voucherId}/toggle-disable`);
      loadVouchers();
      loadStats();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'تعذر تعديل حالة الكود');
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsSuccess(null);

    try {
      await api.patch('/api/admin/kiropro-cards/settings', {
        lowStockThreshold,
        complianceNotice,
        productPriceUsd: cardProductPrice
      });
      setSettingsSuccess('تم حفظ إعدادات نظام بطاقات كيرو برو بنجاح.');
      loadStats();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'تعذر حفظ الإعدادات');
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="admin-page-container" dir="rtl">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: 'linear-gradient(135deg, #facc15 0%, #ca8a04 100%)',
              color: '#000',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(250, 204, 21, 0.35)'
            }}>
              <CreditCard size={24} />
            </div>
            <div>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--text-primary)', margin: 0 }}>
                إدارة بطاقات كيرو برو الافتراضية (KiroPro Card)
              </h1>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '4px 0 0' }}>
                خزنة ماستركارد المسبقة الدفع • تشفير AES-256-GCM • منع Race Condition بالكامل
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => { loadStats(); loadCards(); if (activeSubTab === 'vouchers') loadVouchers(); }}
          className="btn btn-secondary btn-sm"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <RefreshCw size={14} className={loadingStats || loadingCards ? 'animate-spin' : ''} />
          <span>تحديث البيانات</span>
        </button>
      </div>

      {/* Low Stock Alert Banner */}
      {stats?.isLowStock && (
        <div style={{
          marginBottom: 20,
          padding: '14px 18px',
          background: '#fef2f2',
          border: '1.5px solid #fecaca',
          borderRadius: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          color: '#991b1b'
        }}>
          <AlertTriangle size={24} color="#dc2626" style={{ flexShrink: 0 }} />
          <div>
            <strong style={{ fontSize: '0.95rem' }}>تنبيه نقص المخزون:</strong>
            <p style={{ margin: '2px 0 0', fontSize: '0.85rem' }}>
              المخزون المتاح من بطاقات كيرو برو ({stats.available}) أقل من حد الأمان المحدد ({stats.lowStockThreshold || 5}). يرجى إضافة بطاقات جديدة لمنع نفاد المخزون.
            </p>
          </div>
        </div>
      )}

      {/* Stats Widgets Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div className="admin-card" style={{ padding: 18, background: '#ffffff', borderRadius: 14, border: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 700 }}>المخزون المتاح للبيع</span>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#10b981' }} />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#10b981' }}>
            {stats?.available ?? '...'}
          </div>
          <span style={{ fontSize: '0.72rem', color: '#64748b' }}>بطاقات جاهزة للتسليم الفوري</span>
        </div>

        <div className="admin-card" style={{ padding: 18, background: '#ffffff', borderRadius: 14, border: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 700 }}>البطاقات المستلمة والمباعة</span>
            <CheckCircle2 size={16} color="#3b82f6" />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#3b82f6' }}>
            {stats?.claimed ?? '...'}
          </div>
          <span style={{ fontSize: '0.72rem', color: '#64748b' }}>تم تخصيصها للعملاء بأمان</span>
        </div>

        <div className="admin-card" style={{ padding: 18, background: '#ffffff', borderRadius: 14, border: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 700 }}>إجمالي البطاقات بالخزنة</span>
            <Layers size={16} color="#f59e0b" />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#0f172a' }}>
            {stats?.totalCards ?? '...'}
          </div>
          <span style={{ fontSize: '0.72rem', color: '#64748b' }}>معطلة: {stats?.disabled ?? 0}</span>
        </div>

        <div className="admin-card" style={{ padding: 18, background: '#ffffff', borderRadius: 14, border: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 700 }}>قسائم الهدايا المتاحة</span>
            <KeyRound size={16} color="#8b5cf6" />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#8b5cf6' }}>
            {stats?.availableVouchers ?? '...'}
          </div>
          <span style={{ fontSize: '0.72rem', color: '#64748b' }}>مستردة: {stats?.redeemedVouchers ?? 0}</span>
        </div>
      </div>

      {/* Subtabs Navigation */}
      <div style={{ display: 'flex', gap: 8, borderBottom: '1.5px solid var(--border-subtle)', marginBottom: 20, overflowX: 'auto', paddingBottom: 6 }}>
        <button
          type="button"
          onClick={() => setActiveSubTab('inventory')}
          style={{
            padding: '8px 16px',
            borderRadius: 8,
            border: 'none',
            background: activeSubTab === 'inventory' ? '#0f172a' : 'transparent',
            color: activeSubTab === 'inventory' ? '#facc15' : 'var(--text-secondary)',
            fontWeight: 800,
            fontSize: '0.85rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          <CreditCard size={15} />
          <span>المخزون والبطاقات ({cards.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('add')}
          style={{
            padding: '8px 16px',
            borderRadius: 8,
            border: 'none',
            background: activeSubTab === 'add' ? '#0f172a' : 'transparent',
            color: activeSubTab === 'add' ? '#facc15' : 'var(--text-secondary)',
            fontWeight: 800,
            fontSize: '0.85rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          <Plus size={15} />
          <span>إضافة بطاقة فردية</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('bulk')}
          style={{
            padding: '8px 16px',
            borderRadius: 8,
            border: 'none',
            background: activeSubTab === 'bulk' ? '#0f172a' : 'transparent',
            color: activeSubTab === 'bulk' ? '#facc15' : 'var(--text-secondary)',
            fontWeight: 800,
            fontSize: '0.85rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          <UploadCloud size={15} />
          <span>استيراد جماعي (CSV)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('vouchers')}
          style={{
            padding: '8px 16px',
            borderRadius: 8,
            border: 'none',
            background: activeSubTab === 'vouchers' ? '#0f172a' : 'transparent',
            color: activeSubTab === 'vouchers' ? '#facc15' : 'var(--text-secondary)',
            fontWeight: 800,
            fontSize: '0.85rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          <KeyRound size={15} />
          <span>أكواد الإصدار ($2.00) 🎁</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('settings')}
          style={{
            padding: '8px 16px',
            borderRadius: 8,
            border: 'none',
            background: activeSubTab === 'settings' ? '#0f172a' : 'transparent',
            color: activeSubTab === 'settings' ? '#facc15' : 'var(--text-secondary)',
            fontWeight: 800,
            fontSize: '0.85rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          <Settings size={15} />
          <span>إعدادات النظام والأمان</span>
        </button>
      </div>

      {/* SUBTAB 1: INVENTORY TABLE */}
      {activeSubTab === 'inventory' && (
        <div className="admin-card" style={{ background: '#ffffff', borderRadius: 14, border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
          {/* Filters Bar */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(['ALL', 'AVAILABLE', 'CLAIMED', 'DISABLED'] as const).map(st => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: '1px solid',
                    borderColor: statusFilter === st ? '#0f172a' : '#e2e8f0',
                    background: statusFilter === st ? '#0f172a' : '#ffffff',
                    color: statusFilter === st ? '#ffffff' : '#64748b',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  {st === 'ALL' ? 'جميع البطاقات' : st === 'AVAILABLE' ? 'متاح للبيع' : st === 'CLAIMED' ? 'مباع ومستلم' : 'معطل مؤقتاً'}
                </button>
              ))}
            </div>

            <div style={{ position: 'relative', width: 260 }}>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="بحث بآخر 4 أرقام أو ملاحظات..."
                style={{
                  width: '100%',
                  padding: '7px 32px 7px 12px',
                  borderRadius: 6,
                  border: '1px solid var(--border-subtle)',
                  fontSize: '0.8rem',
                  outline: 'none'
                }}
              />
              <Search size={14} style={{ position: 'absolute', right: 10, top: 9, color: '#94a3b8' }} />
            </div>
          </div>

          {/* Cards Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid var(--border-subtle)', color: '#475569', fontWeight: 800 }}>
                  <th style={{ padding: '12px 16px' }}>رقم البطاقة (Masked)</th>
                  <th style={{ padding: '12px 16px' }}>تاريخ الانتهاء</th>
                  <th style={{ padding: '12px 16px' }}>الرصيد</th>
                  <th style={{ padding: '12px 16px' }}>الحالة</th>
                  <th style={{ padding: '12px 16px' }}>المستلم / الطلب</th>
                  <th style={{ padding: '12px 16px' }}>تاريخ الإضافة</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center' }}>إجراءات الإدارة</th>
                </tr>
              </thead>
              <tbody>
                {loadingCards ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '40px 16px', color: '#64748b' }}>
                      <RefreshCw size={20} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                      <span>جاري تحميل بطاقات الخزنة المشفرة...</span>
                    </td>
                  </tr>
                ) : cards.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '40px 16px', color: '#64748b' }}>
                      <CreditCard size={32} style={{ margin: '0 auto 8px', opacity: 0.3 }} />
                      <p style={{ margin: 0, fontWeight: 700 }}>لا توجد بطاقات تطابق معايير البحث الحالية.</p>
                    </td>
                  </tr>
                ) : (
                  cards.map((card) => {
                    const isAvail = card.status === 'AVAILABLE';
                    const isClaimed = card.status === 'CLAIMED';
                    const isDisabled = card.status === 'DISABLED';

                    return (
                      <tr key={card.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        {/* Masked Card Number */}
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{
                              fontFamily: 'monospace',
                              fontWeight: 900,
                              fontSize: '0.9rem',
                              letterSpacing: '1px',
                              direction: 'ltr',
                              color: '#0f172a'
                            }}>
                              •••• •••• •••• {card.last4}
                            </span>
                            <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>Mastercard</span>
                          </div>
                        </td>

                        {/* Exp Date */}
                        <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontWeight: 800, direction: 'ltr' }}>
                          {card.expDate}
                        </td>

                        {/* Balance */}
                        <td style={{ padding: '12px 16px', fontWeight: 800, color: '#059669', direction: 'ltr' }}>
                          ${Number(card.balance).toFixed(2)} USD
                        </td>

                        {/* Status */}
                        <td style={{ padding: '12px 16px' }}>
                          {isAvail && (
                            <span style={{ fontSize: '0.72rem', background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0', padding: '2px 8px', borderRadius: 10, fontWeight: 800 }}>
                              ● متاح للبيع
                            </span>
                          )}
                          {isClaimed && (
                            <span style={{ fontSize: '0.72rem', background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', padding: '2px 8px', borderRadius: 10, fontWeight: 800 }}>
                              ✓ مباع ومستلم
                            </span>
                          )}
                          {isDisabled && (
                            <span style={{ fontSize: '0.72rem', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', padding: '2px 8px', borderRadius: 10, fontWeight: 800 }}>
                              ✕ معطل
                            </span>
                          )}
                        </td>

                        {/* Assigned info */}
                        <td style={{ padding: '12px 16px' }}>
                          {card.customer ? (
                            <div>
                              <strong style={{ fontSize: '0.78rem', color: '#0f172a', display: 'block' }}>{card.customer.email}</strong>
                              {card.orderId && (
                                <span style={{ fontSize: '0.68rem', color: '#64748b', fontFamily: 'monospace', direction: 'ltr' }}>
                                  طلب: {card.orderId.substring(0, 8)}...
                                </span>
                              )}
                            </div>
                          ) : (
                            <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>— غير مخصص بعد —</span>
                          )}
                        </td>

                        {/* Created At */}
                        <td style={{ padding: '12px 16px', fontSize: '0.75rem', color: '#64748b' }}>
                          {new Date(card.createdAt).toLocaleDateString('ar-EG')}
                        </td>

                        {/* Actions */}
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', gap: 6 }}>
                            {/* Audited Reveal Button */}
                            <button
                              type="button"
                              onClick={() => {
                                setRevealTargetCard(card);
                                setRevealReason('');
                                setRevealedDetails(null);
                                setRevealError(null);
                              }}
                              style={{
                                background: '#f1f5f9',
                                border: '1px solid #cbd5e1',
                                borderRadius: 6,
                                padding: '5px 8px',
                                color: '#0f172a',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                fontSize: '0.72rem',
                                fontWeight: 800
                              }}
                              title="كشف بيانات البطاقة (مع تسجيل سبب في سجل التدقيق)"
                            >
                              <Eye size={13} />
                              <span>كشف تدقيقي</span>
                            </button>

                            {/* Toggle Disable (Only if not claimed) */}
                            {!isClaimed && (
                              <button
                                type="button"
                                onClick={() => handleToggleDisable(card.id)}
                                style={{
                                  background: isDisabled ? '#dcfce7' : '#fee2e2',
                                  border: 'none',
                                  borderRadius: 6,
                                  padding: '5px 8px',
                                  color: isDisabled ? '#15803d' : '#991b1b',
                                  cursor: 'pointer',
                                  fontSize: '0.72rem',
                                  fontWeight: 800
                                }}
                                title={isDisabled ? 'تفعيل البطاقة للبيع' : 'تعطيل البطاقة مؤقتاً'}
                              >
                                <Power size={13} />
                              </button>
                            )}

                            {/* Delete (Only if not claimed) */}
                            {!isClaimed && (
                              <button
                                type="button"
                                onClick={() => handleDeleteCard(card.id)}
                                style={{
                                  background: '#fee2e2',
                                  border: 'none',
                                  borderRadius: 6,
                                  padding: '5px 8px',
                                  color: '#dc2626',
                                  cursor: 'pointer'
                                }}
                                title="حذف البطاقة من المخزون"
                              >
                                <Trash2 size={13} />
                              </button>
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
      )}

      {/* SUBTAB 2: ADD SINGLE CARD */}
      {activeSubTab === 'add' && (
        <div className="admin-card" style={{ background: '#ffffff', borderRadius: 14, border: '1px solid var(--border-subtle)', padding: 24, maxWidth: 640 }}>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: 6 }}>
            إضافة بطاقة ماستركارد مشفرة إلى الخزنة
          </h3>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 20 }}>
            يتم تشفير رقم البطاقة ورمز الأمان CVV فورياً باستخدام مفتاح بنكي AES-256-GCM وحفظ آخر 4 أرقام فقط في السجلات المكشوفة.
          </p>

          {singleError && (
            <div style={{ marginBottom: 16, padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#dc2626', fontSize: '0.85rem' }}>
              {singleError}
            </div>
          )}

          {singleSuccess && (
            <div style={{ marginBottom: 16, padding: '10px 14px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 8, color: '#059669', fontSize: '0.85rem', fontWeight: 800 }}>
              {singleSuccess}
            </div>
          )}

          <form onSubmit={handleAddSingleCard} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: 6 }}>
                رقم البطاقة (16 رقم - يتم التحقق بخوارزمية Luhn):
              </label>
              <input
                type="text"
                required
                value={singleCardNumber}
                onChange={(e) => setSingleCardNumber(e.target.value.replace(/\D/g, '').substring(0, 16))}
                placeholder="5500000000000004"
                style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-subtle)', fontFamily: 'monospace', fontSize: '1rem', letterSpacing: '1px', direction: 'ltr' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: 6 }}>
                  تاريخ الانتهاء (MM/YY):
                </label>
                <input
                  type="text"
                  required
                  placeholder="12/28"
                  value={singleExpDate}
                  onChange={(e) => setSingleExpDate(e.target.value.substring(0, 5))}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-subtle)', fontFamily: 'monospace', fontSize: '0.95rem', direction: 'ltr' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: 6 }}>
                  رمز الأمان (CVV - 3 أرقام):
                </label>
                <input
                  type="password"
                  required
                  maxLength={4}
                  placeholder="888"
                  value={singleCvv}
                  onChange={(e) => setSingleCvv(e.target.value.replace(/\D/g, '').substring(0, 4))}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-subtle)', fontFamily: 'monospace', fontSize: '0.95rem', direction: 'ltr' }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: 6 }}>
                رصيد البطاقة (USD):
              </label>
              <input
                type="number"
                step="0.01"
                min="0.5"
                required
                value={singleBalance}
                onChange={(e) => setSingleBalance(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-subtle)', fontSize: '0.95rem', direction: 'ltr' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: 6 }}>
                ملاحظات داخلية (اختياري):
              </label>
              <input
                type="text"
                value={singleNotes}
                onChange={(e) => setSingleNotes(e.target.value)}
                placeholder="دفعة بنك X - صلاحية حتى 2028"
                style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-subtle)', fontSize: '0.85rem' }}
              />
            </div>

            <button
              type="submit"
              disabled={submittingSingle}
              className="btn btn-primary"
              style={{ marginTop: 8, width: '100%', padding: '12px 18px', fontSize: '0.95rem' }}
            >
              {submittingSingle ? 'جاري التشفير والحفظ في الخزنة...' : 'تشفير وإضافة البطاقة للخزنة 🔒'}
            </button>
          </form>
        </div>
      )}

      {/* SUBTAB 3: BULK IMPORT */}
      {activeSubTab === 'bulk' && (
        <div className="admin-card" style={{ background: '#ffffff', borderRadius: 14, border: '1px solid var(--border-subtle)', padding: 24, maxWidth: 760 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
            <div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>
                استيراد جماعي لبطاقات ماستركارد (CSV)
              </h3>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>
                ارفع ملف CSV يحتوي على أرقام البطاقات وتاريخ الانتهاء والـ CVV والرصيد لتشفيرها وحفظها بالمخزون.
              </p>
            </div>

            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="btn btn-secondary btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', padding: '8px 14px', borderRadius: 8 }}
            >
              <Download size={15} />
              <span>تحميل نموذج CSV</span>
            </button>
          </div>

          {/* Mode Switcher */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20, background: '#f8fafc', padding: 4, borderRadius: 8, border: '1px solid #e2e8f0', width: 'fit-content' }}>
            <button
              type="button"
              onClick={() => { setBulkMode('file'); setBulkError(null); }}
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                border: 'none',
                background: bulkMode === 'file' ? '#0f172a' : 'transparent',
                color: bulkMode === 'file' ? '#ffffff' : '#64748b',
                fontWeight: 700,
                fontSize: '0.82rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <UploadCloud size={14} />
              <span>رفع ملف CSV</span>
            </button>
            <button
              type="button"
              onClick={() => { setBulkMode('text'); setBulkError(null); }}
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                border: 'none',
                background: bulkMode === 'text' ? '#0f172a' : 'transparent',
                color: bulkMode === 'text' ? '#ffffff' : '#64748b',
                fontWeight: 700,
                fontSize: '0.82rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <FileText size={14} />
              <span>لصق بيانات نصية</span>
            </button>
          </div>

          {bulkError && (
            <div style={{ marginBottom: 16, padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#dc2626', fontSize: '0.85rem' }}>
              <strong>خطأ في الاستيراد: </strong>{bulkError}
            </div>
          )}

          {bulkResult && (
            <div style={{ marginBottom: 20, padding: '16px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 12 }}>
              <div style={{ display: 'flex', gap: 12, marginBottom: bulkResult.errors && bulkResult.errors.length > 0 ? 14 : 0 }}>
                <div style={{ padding: '8px 14px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 8, color: '#059669', fontSize: '0.85rem', fontWeight: 800 }}>
                  ✓ تم استيرادها بنجاح (Imported): {bulkResult.imported}
                </div>
                <div style={{ padding: '8px 14px', background: bulkResult.failed > 0 ? '#fef2f2' : '#f1f5f9', border: bulkResult.failed > 0 ? '1px solid #fecaca' : '1px solid #e2e8f0', borderRadius: 8, color: bulkResult.failed > 0 ? '#dc2626' : '#64748b', fontSize: '0.85rem', fontWeight: 800 }}>
                  ✕ صفوف متعذرة (Failed): {bulkResult.failed}
                </div>
              </div>

              {/* Structured Error Table */}
              {bulkResult.errors && bulkResult.errors.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#b91c1c', marginBottom: 8 }}>
                    تفاصيل الصفوف غير الصالحة:
                  </div>
                  <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'right' }}>
                      <thead>
                        <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1' }}>
                          <th style={{ padding: '8px 12px', width: 90, color: '#475569' }}>رقم السطر (Row)</th>
                          <th style={{ padding: '8px 12px', color: '#475569' }}>سبب الرفض (Error Reason)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bulkResult.errors.map((err, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? '#ffffff' : '#fafafa' }}>
                            <td style={{ padding: '8px 12px', fontWeight: 800, color: '#0f172a' }}>
                              سطر #{err.row}
                            </td>
                            <td style={{ padding: '8px 12px', color: '#dc2626' }}>
                              {err.reason}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleBulkImport} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {bulkMode === 'file' ? (
              <div>
                {!selectedFile ? (
                  <label
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '36px 20px',
                      border: '2px dashed #cbd5e1',
                      borderRadius: 12,
                      background: '#f8fafc',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <UploadCloud size={36} color="#64748b" style={{ marginBottom: 10 }} />
                    <span style={{ fontSize: '0.92rem', fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
                      اضغط لاختيار ملف CSV أو اسحبه هنا
                    </span>
                    <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                      الصيغة المدعومة: card_number,exp_date,cvv,balance (UTF-8, بحد أقصى 500 بطاقة)
                    </span>
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      onChange={handleFileSelect}
                      style={{ display: 'none' }}
                    />
                  </label>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <FileText size={24} color="#16a34a" />
                      <div>
                        <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#166534' }}>
                          {fileDetails?.name || selectedFile.name}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#4b5563', marginTop: 2 }}>
                          الحجم: <strong>{fileDetails?.size}</strong> | عدد البطاقات المتوقع: <strong>{fileDetails?.rows} صف</strong>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => { setSelectedFile(null); setFileDetails(null); }}
                      style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', padding: 4 }}
                      title="إلغاء الملف"
                    >
                      <X size={18} />
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: 6 }}>
                  الصق الأسطر بتنسيق: <code style={{ direction: 'ltr', background: '#f1f5f9', padding: '2px 4px', borderRadius: 4 }}>card_number,exp_date,cvv,balance</code>
                </label>
                <textarea
                  rows={8}
                  required
                  value={bulkCsvText}
                  onChange={(e) => setBulkCsvText(e.target.value)}
                  placeholder={`5500000000000004,12/28,888,1.00\n5500000000000012,11/27,123,1.00`}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: 8,
                    border: '1px solid var(--border-subtle)',
                    fontFamily: 'monospace',
                    fontSize: '0.85rem',
                    lineHeight: 1.5,
                    direction: 'ltr'
                  }}
                />
              </div>
            )}

            <button
              type="submit"
              disabled={submittingBulk || (bulkMode === 'file' && !selectedFile)}
              className="btn btn-primary"
              style={{ padding: '12px 20px', fontSize: '0.95rem' }}
            >
              {submittingBulk ? 'جاري الفحص والتشفير الجماعي في Transaction...' : 'بدء الاستيراد والتشفير الجماعي ⚡'}
            </button>
          </form>
        </div>
      )}

      {/* SUBTAB 4: ISSUANCE CODES */}
      {activeSubTab === 'vouchers' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Voucher Generation Card */}
          <div className="admin-card" style={{ background: '#ffffff', borderRadius: 14, border: '1px solid var(--border-subtle)', padding: 22, maxWidth: 680 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                توليد أكواد إصدار KiroPro Card (قيمة كل كود: $2.00)
              </h3>
              <span style={{ fontSize: '0.75rem', background: '#fef3c7', color: '#b45309', padding: '3px 8px', borderRadius: 6, fontWeight: 800 }}>
                قيمة الكود: $2.00 USD
              </span>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
              أكواد إصدار رسمية بصيغة <strong style={{ color: '#0f172a', fontFamily: 'monospace' }}>KPC-XXXX-XXXX-XXXX</strong> تتيح للعميل إصدار بطاقة ماستركارد افتراضية فورياً عبر خيار "كود إصدار" دون خصم من محفظته.
            </p>

            {voucherSuccess && (
              <div style={{ marginBottom: 14, padding: '10px 14px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 8, color: '#059669', fontSize: '0.85rem', fontWeight: 800 }}>
                {voucherSuccess}
              </div>
            )}

            <form onSubmit={handleGenerateVouchers} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: 6 }}>
                  اختر الكمية المطلوبة للتوليد:
                </label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  {[1, 10, 50, 100].map(qty => (
                    <button
                      key={qty}
                      type="button"
                      onClick={() => setGenVoucherCount(qty)}
                      style={{
                        padding: '6px 14px',
                        borderRadius: 8,
                        border: genVoucherCount === qty ? '2px solid #0f172a' : '1px solid var(--border-subtle)',
                        background: genVoucherCount === qty ? '#0f172a' : '#f8fafc',
                        color: genVoucherCount === qty ? '#facc15' : '#475569',
                        fontWeight: 800,
                        fontSize: '0.82rem',
                        cursor: 'pointer'
                      }}
                    >
                      {qty} {qty === 1 ? 'كود' : 'أكواد'}
                    </button>
                  ))}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginInlineStart: 6 }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>أو أدخل يدوياً:</span>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={genVoucherCount}
                      onChange={(e) => setGenVoucherCount(Math.min(100, Math.max(1, parseInt(e.target.value, 10) || 1)))}
                      style={{ width: 75, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border-subtle)', fontSize: '0.85rem' }}
                    />
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: 4 }}>
                    مدة الصلاحية (أيام):
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    required
                    value={genVoucherDays}
                    onChange={(e) => setGenVoucherDays(parseInt(e.target.value, 10) || 30)}
                    style={{ width: 110, padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border-subtle)', fontSize: '0.85rem' }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={generatingVouchers}
                  className="btn btn-primary"
                  style={{ padding: '9px 22px', fontSize: '0.85rem', fontWeight: 800 }}
                >
                  {generatingVouchers ? 'جاري التوليد...' : `توليد ${genVoucherCount} كود إصدار 🎁`}
                </button>
              </div>
            </form>
          </div>

          {/* Vouchers List */}
          <div className="admin-card" style={{ background: '#ffffff', borderRadius: 14, border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)', fontWeight: 800, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>قائمة أكواد الإصدار المولدة ({vouchers.length})</span>
              <button
                type="button"
                onClick={loadVouchers}
                style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', fontWeight: 700 }}
              >
                <RefreshCw size={13} />
                <span>تحديث</span>
              </button>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border-subtle)', color: '#475569', fontWeight: 800 }}>
                    <th style={{ padding: '12px 16px' }}>كود الإصدار</th>
                    <th style={{ padding: '12px 16px' }}>القيمة</th>
                    <th style={{ padding: '12px 16px' }}>الحالة</th>
                    <th style={{ padding: '12px 16px' }}>رقم الطلب</th>
                    <th style={{ padding: '12px 16px' }}>العميل المسترد</th>
                    <th style={{ padding: '12px 16px' }}>تاريخ الإنشاء</th>
                    <th style={{ padding: '12px 16px', textAlign: 'center' }}>الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingVouchers ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '30px 16px', color: '#64748b' }}>
                        جاري تحميل أكواد الإصدار...
                      </td>
                    </tr>
                  ) : vouchers.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '30px 16px', color: '#64748b' }}>
                        لم يتم توليد أي أكواد إصدار بعد.
                      </td>
                    </tr>
                  ) : (
                    vouchers.map(v => {
                      const status = v.status || (v.isRedeemed ? 'REDEEMED' : (!v.isActive ? 'DISABLED' : 'AVAILABLE'));
                      return (
                        <tr key={v.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontWeight: 900, color: '#0f172a', direction: 'ltr' }}>
                            {v.code}
                          </td>
                          <td style={{ padding: '12px 16px', fontWeight: 800, color: '#059669' }}>
                            ${Number(v.value || 2.00).toFixed(2)}
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            {status === 'REDEEMED' ? (
                              <span style={{ fontSize: '0.72rem', background: '#f1f5f9', color: '#64748b', padding: '2px 8px', borderRadius: 10, fontWeight: 800 }}>
                                مسترد ✅
                              </span>
                            ) : status === 'DISABLED' ? (
                              <span style={{ fontSize: '0.72rem', background: '#fef2f2', color: '#dc2626', padding: '2px 8px', borderRadius: 10, fontWeight: 800 }}>
                                معطل ⛔
                              </span>
                            ) : status === 'EXPIRED' ? (
                              <span style={{ fontSize: '0.72rem', background: '#fffbeb', color: '#d97706', padding: '2px 8px', borderRadius: 10, fontWeight: 800 }}>
                                منتهي ⌛
                              </span>
                            ) : (
                              <span style={{ fontSize: '0.72rem', background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0', padding: '2px 8px', borderRadius: 10, fontWeight: 800 }}>
                                متاح للاستخدام ⚡
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: '0.75rem', direction: 'ltr' }}>
                            {v.redeemedOrderId ? `#${v.redeemedOrderId.slice(0, 8)}` : '—'}
                          </td>
                          <td style={{ padding: '12px 16px', fontSize: '0.75rem' }}>
                            {v.redeemedUserEmail ? (
                              <div>
                                <span style={{ fontWeight: 700, color: '#0f172a' }}>{v.redeemedUserName || ''}</span>
                                <span style={{ display: 'block', color: '#64748b', fontSize: '0.7rem' }}>{v.redeemedUserEmail}</span>
                              </div>
                            ) : '—'}
                          </td>
                          <td style={{ padding: '12px 16px', fontSize: '0.75rem', color: '#64748b' }}>
                            {new Date(v.createdAt).toLocaleDateString('ar-EG')}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                            <div style={{ display: 'inline-flex', gap: 6 }}>
                              <button
                                type="button"
                                onClick={() => handleCopy(v.code, v.id)}
                                style={{
                                  background: copiedId === v.id ? '#10b981' : '#f1f5f9',
                                  color: copiedId === v.id ? '#ffffff' : '#0f172a',
                                  border: 'none',
                                  borderRadius: 6,
                                  padding: '4px 8px',
                                  cursor: 'pointer',
                                  fontSize: '0.72rem',
                                  fontWeight: 800
                                }}
                              >
                                {copiedId === v.id ? 'تم النسخ' : 'نسخ'}
                              </button>

                              {!v.isRedeemed && (
                                <button
                                  type="button"
                                  onClick={() => handleToggleVoucher(v.id)}
                                  title={v.isActive ? 'تعطيل الكود' : 'تفعيل الكود'}
                                  style={{
                                    background: v.isActive ? '#fef2f2' : '#ecfdf5',
                                    color: v.isActive ? '#dc2626' : '#059669',
                                    border: 'none',
                                    borderRadius: 6,
                                    padding: '4px 8px',
                                    cursor: 'pointer',
                                    fontSize: '0.72rem',
                                    fontWeight: 800
                                  }}
                                >
                                  {v.isActive ? 'تعطيل' : 'تفعيل'}
                                </button>
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
        </div>
      )}

      {/* SUBTAB 5: SETTINGS */}
      {activeSubTab === 'settings' && (
        <div className="admin-card" style={{ background: '#ffffff', borderRadius: 14, border: '1px solid var(--border-subtle)', padding: 24, maxWidth: 640 }}>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: 6 }}>
            إعدادات مخزون كيرو برو وشروط الاستخدام
          </h3>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 20 }}>
            تخصيص تنبيهات نفاد المخزون ورسالة الإقرار الإلزامية قبل إظهار بيانات البطاقة للعميل.
          </p>

          {settingsSuccess && (
            <div style={{ marginBottom: 16, padding: '10px 14px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 8, color: '#059669', fontSize: '0.85rem', fontWeight: 800 }}>
              {settingsSuccess}
            </div>
          )}

          <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: 6 }}>
                سعر بيع بطاقة كيرو برو للعميل ($ USD):
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={cardProductPrice}
                onChange={(e) => setCardProductPrice(parseFloat(e.target.value) || 0)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-subtle)', fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}
              />
              <span style={{ fontSize: '0.72rem', color: '#64748b', display: 'block', marginTop: 4 }}>
                سعر شراء بطاقة KiroPro Virtual Mastercard المعروض في المتجر ونافذة الشحن السريع للزبائن.
              </span>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: 6 }}>
                حد تنبيه نقص المخزون (Low Stock Threshold):
              </label>
              <input
                type="number"
                min={1}
                max={100}
                required
                value={lowStockThreshold}
                onChange={(e) => setLowStockThreshold(parseInt(e.target.value, 10) || 5)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-subtle)', fontSize: '0.9rem' }}
              />
              <span style={{ fontSize: '0.72rem', color: '#64748b', display: 'block', marginTop: 4 }}>
                سيظهر تنبيه فوري في لوحة التحكم عند انخفاض عدد البطاقات المتاحة عن هذا الرقم.
              </span>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: 6 }}>
                نص الإقرار والتوافق الإلزامي للعميل:
              </label>
              <textarea
                rows={4}
                value={complianceNotice}
                onChange={(e) => setComplianceNotice(e.target.value)}
                placeholder="هذه البطاقة مخصصة للشراء الرقمي والتفعيل عبر الإنترنت..."
                style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-subtle)', fontSize: '0.85rem', lineHeight: 1.5 }}
              />
            </div>

            <button
              type="submit"
              disabled={savingSettings}
              className="btn btn-primary"
              style={{ marginTop: 8, padding: '12px 18px', fontSize: '0.95rem' }}
            >
              {savingSettings ? 'جاري الحفظ...' : 'حفظ الإعدادات'}
            </button>
          </form>
        </div>
      )}

      {/* AUDITED REVEAL MODAL */}
      {revealTargetCard && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.75)' }}>
          <div style={{ background: '#ffffff', borderRadius: 16, padding: 24, maxWidth: 500, width: '100%', boxShadow: '0 20px 40px rgba(0,0,0,0.3)', border: '1.5px solid #cbd5e1' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid #e2e8f0', paddingBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ShieldCheck size={20} color="#059669" />
                <h4 style={{ margin: 0, fontWeight: 800, fontSize: '1rem', color: '#0f172a' }}>
                  كشف بيانات البطاقة المشفرة (مدقق أمنياً)
                </h4>
              </div>
              <button
                type="button"
                onClick={() => { setRevealTargetCard(null); setRevealedDetails(null); }}
                style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#64748b' }}
              >
                ✕
              </button>
            </div>

            {revealError && (
              <div style={{ marginBottom: 14, padding: '10px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#dc2626', fontSize: '0.82rem' }}>
                {revealError}
              </div>
            )}

            {!revealedDetails ? (
              <form onSubmit={handleRevealCard}>
                <div style={{ padding: '12px 14px', background: '#f8fafc', borderRadius: 8, marginBottom: 16, fontSize: '0.8rem', color: '#475569', lineHeight: 1.5 }}>
                  🔒 <strong>تنبيه أمان صارم:</strong> عملية فك التشفير يتم تسجيلها فورياً في جدول التدقيق (AuditLog) مع توثيق اسمك وتاريخ الكشف والسبب.
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: 6 }}>
                    سبب كشف البطاقة (إلزامي للتدقيق):
                  </label>
                  <input
                    type="text"
                    required
                    value={revealReason}
                    onChange={(e) => setRevealReason(e.target.value)}
                    placeholder="تحقق بناءً على تذكرة دعم العميل #123"
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid var(--border-subtle)', fontSize: '0.85rem', outline: 'none' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => setRevealTargetCard(null)}
                    className="btn btn-secondary btn-sm"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={revealing || !revealReason.trim()}
                    className="btn btn-primary btn-sm"
                    style={{ background: '#dc2626', borderColor: '#dc2626' }}
                  >
                    {revealing ? 'جاري فك التشفير وتدوين السجل...' : 'تأكيد وفك التشفير 🔓'}
                  </button>
                </div>
              </form>
            ) : (
              <div>
                <div style={{
                  background: '#0B0F19',
                  borderRadius: 12,
                  padding: 18,
                  border: '1.5px solid #facc15',
                  marginBottom: 16
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <span style={{ color: '#facc15', fontWeight: 800, fontSize: '0.85rem' }}>بيانات البطاقة المكشوفة</span>
                    <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>سجل الكشف: موثق ✓</span>
                  </div>

                  {/* Card Number */}
                  <div style={{ marginBottom: 12 }}>
                    <span style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block', marginBottom: 4 }}>رقم البطاقة (PAN):</span>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1e293b', padding: '8px 12px', borderRadius: 6 }}>
                      <code style={{ color: '#facc15', fontFamily: 'monospace', fontSize: '1rem', fontWeight: 900, direction: 'ltr', letterSpacing: '1.5px' }}>
                        {revealedDetails.cardNumber}
                      </code>
                      <button
                        type="button"
                        onClick={() => handleCopy(revealedDetails.cardNumber, 'reveal_pan')}
                        style={{ background: copiedId === 'reveal_pan' ? '#10b981' : '#334155', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 8px', fontSize: '0.72rem', cursor: 'pointer' }}
                      >
                        {copiedId === 'reveal_pan' ? 'تم النسخ' : 'نسخ'}
                      </button>
                    </div>
                  </div>

                  {/* Expiry & CVV */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <span style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block', marginBottom: 4 }}>تاريخ الانتهاء:</span>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1e293b', padding: '8px 12px', borderRadius: 6 }}>
                        <code style={{ color: '#38bdf8', fontFamily: 'monospace', fontSize: '0.95rem', fontWeight: 800, direction: 'ltr' }}>
                          {revealedDetails.expDate}
                        </code>
                        <button
                          type="button"
                          onClick={() => handleCopy(revealedDetails.expDate, 'reveal_exp')}
                          style={{ background: copiedId === 'reveal_exp' ? '#10b981' : '#334155', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 8px', fontSize: '0.72rem', cursor: 'pointer' }}
                        >
                          {copiedId === 'reveal_exp' ? '✓' : 'نسخ'}
                        </button>
                      </div>
                    </div>

                    <div>
                      <span style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block', marginBottom: 4 }}>رمز الأمان (CVV):</span>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1e293b', padding: '8px 12px', borderRadius: 6 }}>
                        <code style={{ color: '#f43f5e', fontFamily: 'monospace', fontSize: '0.95rem', fontWeight: 800, direction: 'ltr' }}>
                          {revealedDetails.cvv}
                        </code>
                        <button
                          type="button"
                          onClick={() => handleCopy(revealedDetails.cvv, 'reveal_cvv')}
                          style={{ background: copiedId === 'reveal_cvv' ? '#10b981' : '#334155', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 8px', fontSize: '0.72rem', cursor: 'pointer' }}
                        >
                          {copiedId === 'reveal_cvv' ? '✓' : 'نسخ'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => { setRevealTargetCard(null); setRevealedDetails(null); }}
                  className="btn btn-secondary btn-sm"
                  style={{ width: '100%' }}
                >
                  إغلاق نافذة الكشف
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminKiroProCards;
