import React, { useEffect, useState, useMemo } from 'react';
import { 
  Coins, 
  Search, 
  RefreshCw, 
  Copy, 
  Check, 
  ArrowUpRight, 
  Lock, 
  DollarSign, 
  Sliders, 
  Loader2,
  Image as ImageIcon,
  Upload,
  Trash2,
  Edit2,
  Plus
} from 'lucide-react';
import { api } from '../../lib/api';
import { getProductImageUrl } from '../../utils/imageUrl';

interface CryptoNetworkRow {
  id: string;
  identifier: string;
  name: string;
  currency: string;
  validator_type: string;
  min_amount: number;
  enabled: boolean;
  display_order: number;
  orders_count?: number;
}

interface CryptoStats {
  inventory: {
    available: number;
    reserved: number;
    sold: number;
    minOrderAmount: number;
    exchangeRate: number;
    imageUrl?: string | null;
    updatedAt: string;
  };
  ordersSummary: {
    totalCryptoOrders: string | number;
    awaitingOrders: string | number;
    completedOrders: string | number;
    canceledOrders: string | number;
  };
  networks: CryptoNetworkRow[];
}

interface CryptoOrder {
  id: string;
  userId: string;
  userEmail: string;
  userName: string | null;
  usdtAmount: number;
  cryptoNetwork: string;
  walletAddress: string;
  chargedAmount: number;
  chargedCurrency: string;
  exchangeRateUsed: number;
  status: 'AWAITING_TRANSFER' | 'COMPLETED' | 'CANCELED';
  txHash: string | null;
  createdAt: string;
  completedAt: string | null;
  canceledAt: string | null;
  canceledReason: string | null;
}

export const AdminCrypto: React.FC = () => {
  const [stats, setStats] = useState<CryptoStats | null>(null);
  const [orders, setOrders] = useState<CryptoOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'AWAITING_TRANSFER' | 'COMPLETED' | 'CANCELED'>('ALL');

  // Copy feedback state
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Modals state
  const [completeModalOrder, setCompleteModalOrder] = useState<CryptoOrder | null>(null);
  const [txHashInput, setTxHashInput] = useState('');
  const [isCompleting, setIsCompleting] = useState(false);

  const [cancelModalOrder, setCancelModalOrder] = useState<CryptoOrder | null>(null);
  const [cancelReasonInput, setCancelReasonInput] = useState('');
  const [isCanceling, setIsCanceling] = useState(false);

  // Inventory Modal State
  const [inventoryModalOpen, setInventoryModalOpen] = useState(false);
  const [newAvailableInput, setNewAvailableInput] = useState<number | string>('');
  const [isSavingInventory, setIsSavingInventory] = useState(false);

  // Exchange Rate Modal State
  const [rateModalOpen, setRateModalOpen] = useState(false);
  const [newRateInput, setNewRateInput] = useState<number | string>('');
  const [isSavingRate, setIsSavingRate] = useState(false);

  // Minimum Order Amount Modal State
  const [minModalOpen, setMinModalOpen] = useState(false);
  const [newMinInput, setNewMinInput] = useState<number | string>('');
  const [isSavingMin, setIsSavingMin] = useState(false);

  // Network CRUD Modal State
  const [networkModalOpen, setNetworkModalOpen] = useState(false);
  const [editingNetworkId, setEditingNetworkId] = useState<string | null>(null);
  const [netName, setNetName] = useState('');
  const [netIdentifier, setNetIdentifier] = useState('');
  const [netValidatorType, setNetValidatorType] = useState<'EVM' | 'TRON'>('EVM');
  const [netMinAmount, setNetMinAmount] = useState<number | string>(1);
  const [netEnabled, setNetEnabled] = useState(true);
  const [netDisplayOrder, setNetDisplayOrder] = useState<number | string>(1);
  const [isSavingNetwork, setIsSavingNetwork] = useState(false);

  // Tabs: [ الطلبات ] [ الإعدادات ] [ الشبكات ] [ المظهر والصورة ]
  const [activeTab, setActiveTab] = useState<'orders' | 'settings' | 'networks' | 'appearance'>('orders');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageSuccess, setImageSuccess] = useState<string | null>(null);
  const imageInputRef = React.useRef<HTMLInputElement | null>(null);

  const fetchData = async () => {
    try {
      setRefreshing(true);
      const [statsRes, ordersRes] = await Promise.all([
        api.get('/api/admin/crypto/stats'),
        api.get(`/api/admin/crypto/orders?status=${statusFilter}&search=${encodeURIComponent(search)}`)
      ]);

      if (statsRes) setStats(statsRes);
      if (ordersRes?.orders) setOrders(ordersRes.orders);
    } catch (err) {
      console.error('Failed to load crypto admin data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [statusFilter, search]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleOpenCompleteModal = (order: CryptoOrder) => {
    setCompleteModalOrder(order);
    setTxHashInput('');
  };

  const handleConfirmComplete = async () => {
    if (!completeModalOrder) return;
    setIsCompleting(true);
    try {
      await api.post(`/api/admin/crypto/orders/${completeModalOrder.id}/complete`, {
        txHash: txHashInput.trim() || undefined
      });
      setCompleteModalOrder(null);
      await fetchData();
    } catch (err: any) {
      alert(err.message || 'فشل إكمال الطلب.');
    } finally {
      setIsCompleting(false);
    }
  };

  const handleOpenCancelModal = (order: CryptoOrder) => {
    setCancelModalOrder(order);
    setCancelReasonInput('');
  };

  const handleConfirmCancel = async () => {
    if (!cancelModalOrder) return;
    setIsCanceling(true);
    try {
      await api.post(`/api/admin/crypto/orders/${cancelModalOrder.id}/cancel`, {
        reason: cancelReasonInput.trim() || 'إلغاء من قبل إدارة المنصة'
      });
      setCancelModalOrder(null);
      await fetchData();
    } catch (err: any) {
      alert(err.message || 'فشل إلغاء الطلب.');
    } finally {
      setIsCanceling(false);
    }
  };

  // Inventory Save with Reserved validation & preview
  const handleSaveInventory = async () => {
    const num = Number(newAvailableInput);
    if (isNaN(num) || num < 0) {
      alert('الكمية المتاحة يجب أن تكون رقماً أكبر من أو يساوي 0.');
      return;
    }

    const currentReserved = stats?.inventory.reserved || 0;
    if (num < currentReserved) {
      alert(`لا يمكن جعل المخزون المتاح (${num} USDT) أقل من المحجوز حالياً (${currentReserved} USDT).`);
      return;
    }

    setIsSavingInventory(true);
    try {
      await api.patch('/api/admin/crypto/inventory', { available: num });
      setInventoryModalOpen(false);
      await fetchData();
    } catch (err: any) {
      alert(err.message || 'فشل تحديث المخزون.');
    } finally {
      setIsSavingInventory(false);
    }
  };

  const handleSaveRate = async () => {
    const num = Number(newRateInput);
    if (isNaN(num) || num <= 0) {
      alert('سعر الصرف يجب أن يكون رقماً أكبر من 0.');
      return;
    }
    setIsSavingRate(true);
    try {
      await api.patch('/api/admin/crypto/rate', { rate: num });
      setRateModalOpen(false);
      await fetchData();
    } catch (err: any) {
      alert(err.message || 'فشل تحديث سعر الصرف.');
    } finally {
      setIsSavingRate(false);
    }
  };

  const handleSaveMinAmount = async () => {
    const num = Number(newMinInput);
    if (isNaN(num) || num < 1.0) {
      alert('الحد الأدنى للطلب يجب أن يكون رقماً أكبر من أو يساوي 1 USDT.');
      return;
    }
    setIsSavingMin(true);
    try {
      await api.patch('/api/admin/crypto/settings', { minAmount: num });
      setMinModalOpen(false);
      await fetchData();
    } catch (err: any) {
      alert(err.message || 'فشل تحديث الحد الأدنى.');
    } finally {
      setIsSavingMin(false);
    }
  };

  // Network Actions
  const handleOpenAddNetwork = () => {
    setEditingNetworkId(null);
    setNetName('');
    setNetIdentifier('');
    setNetValidatorType('EVM');
    setNetMinAmount(1);
    setNetEnabled(true);
    setNetDisplayOrder((stats?.networks.length || 0) + 1);
    setNetworkModalOpen(true);
  };

  const handleOpenEditNetwork = (net: CryptoNetworkRow) => {
    setEditingNetworkId(net.id);
    setNetName(net.name);
    setNetIdentifier(net.identifier);
    setNetValidatorType(net.validator_type as 'EVM' | 'TRON');
    setNetMinAmount(net.min_amount);
    setNetEnabled(net.enabled);
    setNetDisplayOrder(net.display_order);
    setNetworkModalOpen(true);
  };

  const handleSaveNetwork = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!netName.trim() || !netIdentifier.trim()) {
      alert('يرجى ملء اسم الشبكة والمعرف الخاص بها.');
      return;
    }

    const numMin = Number(netMinAmount);
    if (isNaN(numMin) || numMin < 1.0) {
      alert('الحد الأدنى للشبكة يجب أن يكون أكبر من أو يساوي 1 USDT.');
      return;
    }

    setIsSavingNetwork(true);
    try {
      if (editingNetworkId) {
        await api.patch(`/api/admin/crypto/networks/${editingNetworkId}`, {
          name: netName.trim(),
          identifier: netIdentifier.trim().toUpperCase(),
          validatorType: netValidatorType,
          minAmount: numMin,
          enabled: netEnabled,
          displayOrder: Number(netDisplayOrder) || 1
        });
      } else {
        await api.post('/api/admin/crypto/networks', {
          name: netName.trim(),
          identifier: netIdentifier.trim().toUpperCase(),
          validatorType: netValidatorType,
          minAmount: numMin,
          enabled: netEnabled,
          displayOrder: Number(netDisplayOrder) || 1
        });
      }
      setNetworkModalOpen(false);
      await fetchData();
    } catch (err: any) {
      alert(err.message || 'فشل حفظ بيانات الشبكة.');
    } finally {
      setIsSavingNetwork(false);
    }
  };

  const handleToggleNetwork = async (networkId: string, currentEnabled: boolean) => {
    try {
      await api.patch(`/api/admin/crypto/networks/${networkId}`, {
        enabled: !currentEnabled
      });
      await fetchData();
    } catch (err: any) {
      alert(err.message || 'فشل تعديل حالة الشبكة.');
    }
  };

  const handleDeleteNetwork = async (net: CryptoNetworkRow) => {
    if ((net.orders_count || 0) > 0) {
      alert('لا يمكن حذف هذه الشبكة لأنها مرتبطة بطلبات سابقة. يمكنك تعطيلها.');
      return;
    }

    if (!window.confirm(`هل أنت متأكد من رغبتك في حذف شبكة "${net.name}"؟`)) {
      return;
    }

    try {
      await api.delete(`/api/admin/crypto/networks/${net.id}`);
      await fetchData();
    } catch (err: any) {
      const msg = err?.data?.error || err?.message || 'فشل حذف الشبكة.';
      alert(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingImage(true);
    setImageError(null);
    setImageSuccess(null);

    const formData = new FormData();
    formData.append('image', file);

    try {
      const res = await api.upload('/api/admin/crypto/image', formData);
      if (res?.success) {
        setImageSuccess('تم تحديث صورة منتج USDT بنجاح!');
        await fetchData();
      }
    } catch (err: any) {
      console.error('Failed to upload USDT image:', err);
      setImageError(err.message || 'فشل رفع الصورة.');
    } finally {
      setIsUploadingImage(false);
      if (imageInputRef.current) {
        imageInputRef.current.value = '';
      }
    }
  };

  const handleRemoveImage = async () => {
    if (!window.confirm('هل أنت متأكد من رغبتك في حذف صورة منتج USDT واستعادة الصورة الافتراضية؟')) {
      return;
    }
    try {
      await api.delete('/api/admin/crypto/image');
      await fetchData();
    } catch (err: any) {
      alert(err.message || 'فشل إزالة الصورة.');
    }
  };

  // Inventory preview calculation
  const inventoryDiff = useMemo(() => {
    if (!stats) return 0;
    const current = stats.inventory.available;
    const next = Number(newAvailableInput);
    if (isNaN(next)) return 0;
    return next - current;
  }, [stats, newAvailableInput]);

  return (
    <div style={{ padding: '24px 20px', maxWidth: 1200, margin: '0 auto', color: '#F8FAFC' }} dir="rtl">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 6px 0', color: '#F8FAFC' }}>
            <Coins size={28} color="#F59E0B" />
            <span>إدارة تحويلات USDT الفورية</span>
          </h1>
          <p style={{ color: '#94A3B8', fontSize: 14, margin: 0 }}>
            لوحة تحكم متكاملة للمخزون، سعر الصرف المستقل، الشبكات، ومتابعة الطلبات وتأكيدها.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchData}
          disabled={refreshing}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 16px',
            background: '#1E293B',
            color: '#F8FAFC',
            border: '1px solid #334155',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 700,
            cursor: refreshing ? 'not-allowed' : 'pointer'
          }}
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          <span>تحديث البيانات</span>
        </button>
      </div>

      {/* 5 Stats & Settings Cards */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 24 }}>
          {/* 1. Available Inventory */}
          <div style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 12, padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ color: '#94A3B8', fontSize: 13, fontWeight: 600 }}>المخزون المتاح (Available)</span>
              <button 
                type="button"
                onClick={() => {
                  setNewAvailableInput(stats.inventory.available);
                  setInventoryModalOpen(true);
                }}
                style={{ background: 'transparent', border: 'none', color: '#F59E0B', cursor: 'pointer', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <Edit2 size={12} /> تعديل
              </button>
            </div>
            <div style={{ fontSize: 26, fontWeight: 900, color: '#10B981' }}>
              {stats.inventory.available.toLocaleString()} <span style={{ fontSize: 14, color: '#94A3B8' }}>USDT</span>
            </div>
          </div>

          {/* 2. Reserved Inventory */}
          <div style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 12, padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ color: '#94A3B8', fontSize: 13, fontWeight: 600 }}>المحجوز (Reserved)</span>
              <Lock size={16} color="#F59E0B" />
            </div>
            <div style={{ fontSize: 26, fontWeight: 900, color: '#F59E0B' }}>
              {stats.inventory.reserved.toLocaleString()} <span style={{ fontSize: 14, color: '#94A3B8' }}>USDT</span>
            </div>
          </div>

          {/* 3. Sold Inventory */}
          <div style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 12, padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ color: '#94A3B8', fontSize: 13, fontWeight: 600 }}>المباع (Sold)</span>
              <ArrowUpRight size={16} color="#38BDF8" />
            </div>
            <div style={{ fontSize: 26, fontWeight: 900, color: '#38BDF8' }}>
              {stats.inventory.sold.toLocaleString()} <span style={{ fontSize: 14, color: '#94A3B8' }}>USDT</span>
            </div>
          </div>

          {/* 4. Independent USDT Rate */}
          <div style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 12, padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ color: '#94A3B8', fontSize: 13, fontWeight: 600 }}>سعر USDT المستقل</span>
              <button 
                type="button"
                onClick={() => {
                  setNewRateInput(stats.inventory.exchangeRate);
                  setRateModalOpen(true);
                }}
                style={{ background: 'transparent', border: 'none', color: '#38BDF8', cursor: 'pointer', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <DollarSign size={12} /> تعديل
              </button>
            </div>
            <div style={{ fontSize: 26, fontWeight: 900, color: '#F8FAFC' }}>
              {stats.inventory.exchangeRate.toLocaleString()} <span style={{ fontSize: 14, color: '#94A3B8' }}>SDG</span>
            </div>
          </div>

          {/* 5. Minimum Amount (Editable >= 1) */}
          <div style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 12, padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ color: '#94A3B8', fontSize: 13, fontWeight: 600 }}>الحد الأدنى للطلب</span>
              <button 
                type="button"
                onClick={() => {
                  setNewMinInput(stats.inventory.minOrderAmount);
                  setMinModalOpen(true);
                }}
                style={{ background: 'transparent', border: 'none', color: '#F59E0B', cursor: 'pointer', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <Sliders size={12} /> تعديل
              </button>
            </div>
            <div style={{ fontSize: 26, fontWeight: 900, color: '#F8FAFC' }}>
              {stats.inventory.minOrderAmount} <span style={{ fontSize: 14, color: '#94A3B8' }}>USDT</span>
            </div>
          </div>
        </div>
      )}

      {/* 4 Navigation Tabs */}
      <div style={{ display: 'flex', gap: 10, borderBottom: '1px solid #1E293B', marginBottom: 20, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => setActiveTab('orders')}
          style={{
            padding: '12px 20px',
            background: 'transparent',
            border: 'none',
            borderBottom: activeTab === 'orders' ? '2px solid #F59E0B' : '2px solid transparent',
            color: activeTab === 'orders' ? '#F59E0B' : '#94A3B8',
            fontWeight: 800,
            cursor: 'pointer',
            fontSize: 15
          }}
        >
          الطلبات ({stats?.ordersSummary.totalCryptoOrders || 0})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('settings')}
          style={{
            padding: '12px 20px',
            background: 'transparent',
            border: 'none',
            borderBottom: activeTab === 'settings' ? '2px solid #F59E0B' : '2px solid transparent',
            color: activeTab === 'settings' ? '#F59E0B' : '#94A3B8',
            fontWeight: 800,
            cursor: 'pointer',
            fontSize: 15
          }}
        >
          الإعدادات والمخزون
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('networks')}
          style={{
            padding: '12px 20px',
            background: 'transparent',
            border: 'none',
            borderBottom: activeTab === 'networks' ? '2px solid #F59E0B' : '2px solid transparent',
            color: activeTab === 'networks' ? '#F59E0B' : '#94A3B8',
            fontWeight: 800,
            cursor: 'pointer',
            fontSize: 15
          }}
        >
          إدارة الشبكات ({stats?.networks.length || 0})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('appearance')}
          style={{
            padding: '12px 20px',
            background: 'transparent',
            border: 'none',
            borderBottom: activeTab === 'appearance' ? '2px solid #F59E0B' : '2px solid transparent',
            color: activeTab === 'appearance' ? '#F59E0B' : '#94A3B8',
            fontWeight: 800,
            cursor: 'pointer',
            fontSize: 15,
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          <ImageIcon size={16} />
          <span>المظهر والصورة</span>
        </button>
      </div>

      {/* TAB 1: ORDERS */}
      {activeTab === 'orders' && (
        <>
          {/* Filters and Search Bar */}
          <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(['ALL', 'AWAITING_TRANSFER', 'COMPLETED', 'CANCELED'] as const).map(tab => {
                const labels: Record<string, string> = {
                  ALL: 'الكل',
                  AWAITING_TRANSFER: '⏳ في انتظار التحويل',
                  COMPLETED: '✅ مكتملة',
                  CANCELED: '❌ ملغية'
                };
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setStatusFilter(tab)}
                    style={{
                      padding: '8px 14px',
                      background: statusFilter === tab ? '#F59E0B' : '#1E293B',
                      color: statusFilter === tab ? '#0B0F19' : '#94A3B8',
                      border: 'none',
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 800,
                      cursor: 'pointer'
                    }}
                  >
                    {labels[tab]}
                  </button>
                );
              })}
            </div>

            <div style={{ position: 'relative', width: 280 }}>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث برقم الطلب، الإيميل، المحفظة..."
                style={{
                  width: '100%',
                  background: '#0F172A',
                  border: '1px solid #334155',
                  borderRadius: 8,
                  padding: '8px 12px 8px 36px',
                  color: '#F8FAFC',
                  fontSize: 13,
                  boxSizing: 'border-box'
                }}
              />
              <Search size={16} color="#64748B" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
            </div>
          </div>

          {/* Orders Table */}
          <div style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#1E293B', color: '#94A3B8', borderBottom: '1px solid #334155' }}>
                    <th style={{ padding: '14px 16px' }}>رقم الطلب</th>
                    <th style={{ padding: '14px 16px' }}>العميل</th>
                    <th style={{ padding: '14px 16px' }}>الكمية المطلوبة</th>
                    <th style={{ padding: '14px 16px' }}>الشبكة</th>
                    <th style={{ padding: '14px 16px' }}>عنوان المحفظة</th>
                    <th style={{ padding: '14px 16px' }}>المبلغ المخصوم</th>
                    <th style={{ padding: '14px 16px' }}>الحالة</th>
                    <th style={{ padding: '14px 16px' }}>التاريخ</th>
                    <th style={{ padding: '14px 16px', textAlign: 'center' }}>الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={9} style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>
                        <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                        <span>جاري تحميل الطلبات...</span>
                      </td>
                    </tr>
                  ) : orders.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>
                        لا توجد طلبات تطابق الفلتر الحالي.
                      </td>
                    </tr>
                  ) : (
                    orders.map(order => (
                      <tr key={order.id} style={{ borderBottom: '1px solid #1E293B' }}>
                        <td style={{ padding: '14px 16px', fontFamily: 'monospace', fontWeight: 700 }}>
                          #{order.id.slice(0, 8).toUpperCase()}
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ fontWeight: 700, color: '#F8FAFC' }}>{order.userName || 'بدون اسم'}</div>
                          <div style={{ fontSize: 11, color: '#94A3B8' }}>{order.userEmail}</div>
                        </td>
                        <td style={{ padding: '14px 16px', fontWeight: 900, color: '#10B981', fontSize: 14 }}>
                          {order.usdtAmount} USDT
                        </td>
                        <td style={{ padding: '14px 16px', fontWeight: 700 }}>
                          {order.cryptoNetwork}
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#38BDF8', direction: 'ltr' }}>
                              {order.walletAddress.slice(0, 8)}...{order.walletAddress.slice(-6)}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopy(order.walletAddress, order.id)}
                              style={{ background: 'transparent', border: 'none', color: copiedId === order.id ? '#10B981' : '#64748B', cursor: 'pointer', padding: 2 }}
                            >
                              {copiedId === order.id ? <Check size={12} /> : <Copy size={12} />}
                            </button>
                          </div>
                        </td>
                        <td style={{ padding: '14px 16px', fontWeight: 700 }}>
                          {Number(order.chargedAmount).toLocaleString()} {order.chargedCurrency}
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          {order.status === 'AWAITING_TRANSFER' && (
                            <span style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#F59E0B', padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 800 }}>
                              ⏳ في انتظار التحويل
                            </span>
                          )}
                          {order.status === 'COMPLETED' && (
                            <span style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10B981', padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 800 }}>
                              ✅ مكتمل
                            </span>
                          )}
                          {order.status === 'CANCELED' && (
                            <span style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#EF4444', padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 800 }}>
                              ❌ ملغي
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '14px 16px', color: '#94A3B8', fontSize: 12 }}>
                          {new Date(order.createdAt).toLocaleDateString('ar-SA')}
                        </td>
                        <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                          {order.status === 'AWAITING_TRANSFER' ? (
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                              <button
                                type="button"
                                onClick={() => handleOpenCompleteModal(order)}
                                style={{ background: '#10B981', color: '#FFFFFF', border: 'none', padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 800, cursor: 'pointer' }}
                              >
                                تم التحويل
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenCancelModal(order)}
                                style={{ background: '#EF4444', color: '#FFFFFF', border: 'none', padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 800, cursor: 'pointer' }}
                              >
                                إلغاء الطلب
                              </button>
                            </div>
                          ) : (
                            <span style={{ color: '#64748B', fontSize: 12 }}>لا توجد إجراءات</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* TAB 2: SETTINGS & INVENTORY */}
      {activeTab === 'settings' && stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
          {/* Inventory Manager Card */}
          <div style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 12, padding: 24 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 12, color: '#F8FAFC' }}>
              📦 تعديل المخزون المتاح (Available Inventory)
            </h2>
            <p style={{ color: '#94A3B8', fontSize: 13, marginBottom: 18 }}>
              المخزون المتاح حالياً: <strong style={{ color: '#10B981' }}>{stats.inventory.available} USDT</strong> (المحجوز: {stats.inventory.reserved} USDT).
            </p>
            <button
              type="button"
              onClick={() => {
                setNewAvailableInput(stats.inventory.available);
                setInventoryModalOpen(true);
              }}
              style={{
                background: 'var(--accent-yellow)',
                color: '#0B0F19',
                border: 'none',
                padding: '10px 20px',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 900,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              <Edit2 size={16} />
              <span>تعديل المخزون الآن</span>
            </button>
          </div>

          {/* Exchange Rate Card */}
          <div style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 12, padding: 24 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 12, color: '#F8FAFC' }}>
              💵 سعر صرف USDT المستقل (Exchange Rate)
            </h2>
            <p style={{ color: '#94A3B8', fontSize: 13, marginBottom: 18 }}>
              السعر الحالي: <strong style={{ color: '#38BDF8' }}>1 USDT = {stats.inventory.exchangeRate} SDG</strong>. مستقل تماماً عن سعر صرف الدولار العام.
            </p>
            <button
              type="button"
              onClick={() => {
                setNewRateInput(stats.inventory.exchangeRate);
                setRateModalOpen(true);
              }}
              style={{
                background: '#38BDF8',
                color: '#0B0F19',
                border: 'none',
                padding: '10px 20px',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 900,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              <DollarSign size={16} />
              <span>تعديل سعر USDT</span>
            </button>
          </div>

          {/* Minimum Order Amount Card */}
          <div style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 12, padding: 24 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 12, color: '#F8FAFC' }}>
              ⚙️ الحد الأدنى للشراء (Minimum Order Amount)
            </h2>
            <p style={{ color: '#94A3B8', fontSize: 13, marginBottom: 18 }}>
              الحد الأدنى الحالي: <strong style={{ color: '#F59E0B' }}>{stats.inventory.minOrderAmount} USDT</strong> (يمكنك ضبطه على 1، 2، 3، أو أي قيمة أكبر).
            </p>
            <button
              type="button"
              onClick={() => {
                setNewMinInput(stats.inventory.minOrderAmount);
                setMinModalOpen(true);
              }}
              style={{
                background: '#F59E0B',
                color: '#0B0F19',
                border: 'none',
                padding: '10px 20px',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 900,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              <Sliders size={16} />
              <span>تعديل الحد الأدنى</span>
            </button>
          </div>
        </div>
      )}

      {/* TAB 3: NETWORKS MANAGEMENT */}
      {activeTab === 'networks' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: '#F8FAFC' }}>
              إدارة شبكات التحويل المدعومة
            </h2>
            <button
              type="button"
              onClick={handleOpenAddNetwork}
              style={{
                background: 'var(--accent-yellow)',
                color: '#0B0F19',
                border: 'none',
                padding: '8px 16px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 900,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <Plus size={16} />
              <span>إضافة شبكة جديدة</span>
            </button>
          </div>

          <div style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#1E293B', color: '#94A3B8', borderBottom: '1px solid #334155' }}>
                  <th style={{ padding: '14px 16px' }}>الترتيب</th>
                  <th style={{ padding: '14px 16px' }}>اسم الشبكة</th>
                  <th style={{ padding: '14px 16px' }}>المعرف (Code)</th>
                  <th style={{ padding: '14px 16px' }}>نوع العنوان (Type)</th>
                  <th style={{ padding: '14px 16px' }}>الحد الأدنى</th>
                  <th style={{ padding: '14px 16px' }}>الحالة (Status)</th>
                  <th style={{ padding: '14px 16px' }}>الطلبات المرتبطة</th>
                  <th style={{ padding: '14px 16px', textAlign: 'center' }}>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {stats?.networks.map((net) => (
                  <tr key={net.id} style={{ borderBottom: '1px solid #1E293B' }}>
                    <td style={{ padding: '14px 16px', fontWeight: 800, color: '#94A3B8' }}>
                      #{net.display_order}
                    </td>
                    <td style={{ padding: '14px 16px', fontWeight: 800, color: '#F8FAFC' }}>
                      {net.name}
                    </td>
                    <td style={{ padding: '14px 16px', fontFamily: 'monospace', color: '#38BDF8' }}>
                      {net.identifier}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ 
                        background: net.validator_type === 'TRON' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                        color: net.validator_type === 'TRON' ? '#EF4444' : '#38BDF8',
                        padding: '3px 8px',
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 800
                      }}>
                        {net.validator_type}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', fontWeight: 700 }}>
                      {net.min_amount} USDT
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      {net.enabled ? (
                        <span style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10B981', padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 800 }}>
                          مفعلة
                        </span>
                      ) : (
                        <span style={{ background: 'rgba(148, 163, 184, 0.15)', color: '#94A3B8', padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 800 }}>
                          معطلة
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '14px 16px', fontWeight: 700 }}>
                      {net.orders_count || 0} طلب
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                        <button
                          type="button"
                          onClick={() => handleOpenEditNetwork(net)}
                          style={{ background: '#1E293B', border: '1px solid #334155', color: '#F8FAFC', padding: '5px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
                        >
                          تعديل
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleNetwork(net.id, net.enabled)}
                          style={{
                            background: net.enabled ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                            border: 'none',
                            color: net.enabled ? '#EF4444' : '#10B981',
                            padding: '5px 10px',
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          {net.enabled ? 'تعطيل' : 'تفعيل'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteNetwork(net)}
                          title={(net.orders_count || 0) > 0 ? 'لا يمكن حذف شبكة مرتبطة بطلبات' : 'حذف الشبكة'}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: (net.orders_count || 0) > 0 ? '#475569' : '#EF4444',
                            cursor: (net.orders_count || 0) > 0 ? 'not-allowed' : 'pointer',
                            padding: 4
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: PRODUCT APPEARANCE & IMAGE */}
      {activeTab === 'appearance' && stats && (
        <div style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 12, padding: 24, maxWidth: 640 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 12, color: '#F8FAFC' }}>
            تخصيص صورة بطاقة USDT في المتجر
          </h2>
          <p style={{ color: '#94A3B8', fontSize: 13, marginBottom: 20 }}>
            يمكنك رفع صورة مخصصة تظهر في بطاقة المنتج في الصفحة الرئيسية للمتجر، أو استعادة الصورة الافتراضية.
          </p>

          <div style={{ display: 'flex', gap: 20, alignItems: 'center', marginBottom: 24 }}>
            <div style={{ width: 120, height: 120, borderRadius: 12, overflow: 'hidden', border: '2px solid #334155', background: '#1E293B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img
                src={getProductImageUrl(stats.inventory.imageUrl || '/uploads/products/usdt-card.webp')}
                alt="USDT Card"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>

            <div>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/svg+xml"
                style={{ display: 'none' }}
                onChange={handleImageUpload}
              />
              <button
                type="button"
                disabled={isUploadingImage}
                onClick={() => imageInputRef.current?.click()}
                style={{
                  background: '#F59E0B',
                  color: '#0B0F19',
                  border: 'none',
                  padding: '10px 18px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: isUploadingImage ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 8
                }}
              >
                {isUploadingImage ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                <span>رفع صورة جديدة</span>
              </button>

              {stats.inventory.imageUrl && (
                <div>
                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    style={{ background: 'transparent', border: 'none', color: '#EF4444', fontSize: 12, cursor: 'pointer', padding: 0 }}
                  >
                    حذف واستعادة الصورة الافتراضية
                  </button>
                </div>
              )}
            </div>
          </div>

          {imageSuccess && (
            <div style={{ color: '#10B981', fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
              {imageSuccess}
            </div>
          )}
          {imageError && (
            <div style={{ color: '#EF4444', fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
              {imageError}
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: INVENTORY UPDATE WITH PREVIEW */}
      {inventoryModalOpen && stats && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }}>
          <div style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 12, padding: 24, width: '100%', maxWidth: 440, color: '#F8FAFC' }}>
            <h3 style={{ fontSize: 18, fontWeight: 900, marginBottom: 16 }}>
              تعديل مخزون USDT المتاح
            </h3>

            <div style={{ background: '#1E293B', padding: '12px 16px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: '#94A3B8' }}>مخزون USDT الحالي:</span>
                <span style={{ fontWeight: 800 }}>{stats.inventory.available} USDT</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94A3B8' }}>المخزون المحجوز حالياً:</span>
                <span style={{ fontWeight: 800, color: '#F59E0B' }}>{stats.inventory.reserved} USDT</span>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                القيمة الجديدة للمخزون:
              </label>
              <input
                type="number"
                min={stats.inventory.reserved}
                step="any"
                value={newAvailableInput}
                onChange={(e) => setNewAvailableInput(e.target.value)}
                style={{
                  width: '100%',
                  background: '#1E293B',
                  border: '1px solid #334155',
                  borderRadius: 8,
                  padding: '10px 14px',
                  color: '#F8FAFC',
                  fontSize: 16,
                  fontWeight: 800,
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Preview Difference */}
            <div style={{ background: '#1E293B', padding: '12px 16px', borderRadius: 8, marginBottom: 20, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: '#94A3B8' }}>الحالي:</span>
                <span style={{ fontWeight: 700 }}>{stats.inventory.available} USDT</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: '#94A3B8' }}>الجديد:</span>
                <span style={{ fontWeight: 700 }}>{newAvailableInput || 0} USDT</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6, borderTop: '1px dashed #334155' }}>
                <span style={{ color: '#94A3B8' }}>الفرق:</span>
                <span style={{ fontWeight: 900, color: inventoryDiff >= 0 ? '#10B981' : '#EF4444' }}>
                  {inventoryDiff >= 0 ? `+${inventoryDiff}` : inventoryDiff} USDT
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setInventoryModalOpen(false)}
                style={{ background: '#334155', color: '#F8FAFC', border: 'none', padding: '8px 16px', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={isSavingInventory}
                onClick={handleSaveInventory}
                style={{ background: '#10B981', color: '#FFFFFF', border: 'none', padding: '8px 20px', borderRadius: 8, fontWeight: 800, cursor: 'pointer' }}
              >
                {isSavingInventory ? 'جاري الحفظ...' : 'حفظ المخزون'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: EXCHANGE RATE */}
      {rateModalOpen && stats && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }}>
          <div style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 12, padding: 24, width: '100%', maxWidth: 420, color: '#F8FAFC' }}>
            <h3 style={{ fontSize: 18, fontWeight: 900, marginBottom: 16 }}>
              تعديل سعر صرف USDT
            </h3>
            <p style={{ color: '#94A3B8', fontSize: 13, marginBottom: 14 }}>
              السعر الحالي: <strong>1 USDT = {stats.inventory.exchangeRate} SDG</strong>. السعر الجديد يؤثر على الطلبات الجديدة فقط.
            </p>
            <input
              type="number"
              value={newRateInput}
              onChange={(e) => setNewRateInput(e.target.value)}
              style={{
                width: '100%',
                background: '#1E293B',
                border: '1px solid #334155',
                borderRadius: 8,
                padding: '10px 14px',
                color: '#F8FAFC',
                fontSize: 16,
                fontWeight: 800,
                marginBottom: 20,
                boxSizing: 'border-box'
              }}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setRateModalOpen(false)}
                style={{ background: '#334155', color: '#F8FAFC', border: 'none', padding: '8px 16px', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={isSavingRate}
                onClick={handleSaveRate}
                style={{ background: '#38BDF8', color: '#0B0F19', border: 'none', padding: '8px 20px', borderRadius: 8, fontWeight: 800, cursor: 'pointer' }}
              >
                {isSavingRate ? 'جاري الحفظ...' : 'حفظ السعر'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: MINIMUM ORDER AMOUNT */}
      {minModalOpen && stats && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }}>
          <div style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 12, padding: 24, width: '100%', maxWidth: 420, color: '#F8FAFC' }}>
            <h3 style={{ fontSize: 18, fontWeight: 900, marginBottom: 16 }}>
              تعديل الحد الأدنى للطلب
            </h3>
            <p style={{ color: '#94A3B8', fontSize: 13, marginBottom: 14 }}>
              يمكنك تحديد أي قيمة تبدأ من <strong>1 USDT</strong> وما فوق (1، 2، 3، 5، إلخ).
            </p>
            <input
              type="number"
              min={1}
              step="any"
              value={newMinInput}
              onChange={(e) => setNewMinInput(e.target.value)}
              style={{
                width: '100%',
                background: '#1E293B',
                border: '1px solid #334155',
                borderRadius: 8,
                padding: '10px 14px',
                color: '#F8FAFC',
                fontSize: 16,
                fontWeight: 800,
                marginBottom: 20,
                boxSizing: 'border-box'
              }}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setMinModalOpen(false)}
                style={{ background: '#334155', color: '#F8FAFC', border: 'none', padding: '8px 16px', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={isSavingMin}
                onClick={handleSaveMinAmount}
                style={{ background: '#F59E0B', color: '#0B0F19', border: 'none', padding: '8px 20px', borderRadius: 8, fontWeight: 800, cursor: 'pointer' }}
              >
                {isSavingMin ? 'جاري الحفظ...' : 'حفظ الحد الأدنى'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: ADD/EDIT NETWORK */}
      {networkModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }}>
          <form onSubmit={handleSaveNetwork} style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 12, padding: 24, width: '100%', maxWidth: 460, color: '#F8FAFC' }}>
            <h3 style={{ fontSize: 18, fontWeight: 900, marginBottom: 16 }}>
              {editingNetworkId ? 'تعديل شبكة تحويل' : 'إضافة شبكة تحويل جديدة'}
            </h3>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 4 }}>اسم الشبكة:</label>
              <input
                type="text"
                value={netName}
                onChange={(e) => setNetName(e.target.value)}
                placeholder="مثلاً: Polygon"
                required
                style={{ width: '100%', background: '#1E293B', border: '1px solid #334155', borderRadius: 8, padding: '8px 12px', color: '#F8FAFC', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Network Code (المعرف):</label>
              <input
                type="text"
                value={netIdentifier}
                onChange={(e) => setNetIdentifier(e.target.value.toUpperCase())}
                placeholder="مثلاً: POLYGON"
                required
                disabled={Boolean(editingNetworkId)}
                style={{ width: '100%', background: '#1E293B', border: '1px solid #334155', borderRadius: 8, padding: '8px 12px', color: '#F8FAFC', fontFamily: 'monospace', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 4 }}>نوع العنوان (Address Type):</label>
              <select
                value={netValidatorType}
                onChange={(e) => setNetValidatorType(e.target.value as 'EVM' | 'TRON')}
                style={{ width: '100%', background: '#1E293B', border: '1px solid #334155', borderRadius: 8, padding: '8px 12px', color: '#F8FAFC', boxSizing: 'border-box' }}
              >
                <option value="EVM">EVM (0x... - Polygon, BSC, Ethereum, Arbitrum, Avalanche)</option>
                <option value="TRON">TRON (T... - TRC20)</option>
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 4 }}>الحد الأدنى (USDT):</label>
                <input
                  type="number"
                  min={1}
                  step="any"
                  value={netMinAmount}
                  onChange={(e) => setNetMinAmount(e.target.value)}
                  style={{ width: '100%', background: '#1E293B', border: '1px solid #334155', borderRadius: 8, padding: '8px 12px', color: '#F8FAFC', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 4 }}>ترتيب الظهور (Sort Order):</label>
                <input
                  type="number"
                  min={1}
                  value={netDisplayOrder}
                  onChange={(e) => setNetDisplayOrder(e.target.value)}
                  style={{ width: '100%', background: '#1E293B', border: '1px solid #334155', borderRadius: 8, padding: '8px 12px', color: '#F8FAFC', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                <input
                  type="checkbox"
                  checked={netEnabled}
                  onChange={(e) => setNetEnabled(e.target.checked)}
                />
                <span>مفعلة وتظهر في واجهة الشراء للعملاء</span>
              </label>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setNetworkModalOpen(false)}
                style={{ background: '#334155', color: '#F8FAFC', border: 'none', padding: '8px 16px', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={isSavingNetwork}
                style={{ background: 'var(--accent-yellow)', color: '#0B0F19', border: 'none', padding: '8px 20px', borderRadius: 8, fontWeight: 800, cursor: 'pointer' }}
              >
                {isSavingNetwork ? 'جاري الحفظ...' : 'حفظ الشبكة'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 5: COMPLETE ORDER */}
      {completeModalOrder && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }}>
          <div style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 12, padding: 24, width: '100%', maxWidth: 480, color: '#F8FAFC' }}>
            <h3 style={{ fontSize: 18, fontWeight: 900, marginBottom: 12, color: '#10B981' }}>
              تأكيد إتمام تحويل USDT
            </h3>
            <p style={{ color: '#94A3B8', fontSize: 13, lineHeight: 1.6, marginBottom: 16 }}>
              هل قمت بالفعل بتحويل <strong style={{ color: '#F8FAFC' }}>{completeModalOrder.usdtAmount} USDT</strong> على شبكة <strong style={{ color: '#F8FAFC' }}>{completeModalOrder.cryptoNetwork}</strong> إلى العنوان التالي:
            </p>
            <div style={{ background: '#1E293B', padding: 12, borderRadius: 8, fontFamily: 'monospace', fontSize: 12, color: '#38BDF8', direction: 'ltr', wordBreak: 'break-all', marginBottom: 16 }}>
              {completeModalOrder.walletAddress}
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, color: '#94A3B8', marginBottom: 6 }}>
                معرف المعاملة (TxID / Hash) - اختياري:
              </label>
              <input
                type="text"
                value={txHashInput}
                onChange={(e) => setTxHashInput(e.target.value)}
                placeholder="0x... أو Transaction Hash"
                style={{ width: '100%', background: '#1E293B', border: '1px solid #334155', borderRadius: 8, padding: '8px 12px', color: '#F8FAFC', fontSize: 12, fontFamily: 'monospace', direction: 'ltr', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setCompleteModalOrder(null)}
                style={{ background: '#334155', color: '#F8FAFC', border: 'none', padding: '8px 16px', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}
              >
                تراجع
              </button>
              <button
                type="button"
                disabled={isCompleting}
                onClick={handleConfirmComplete}
                style={{ background: '#10B981', color: '#FFFFFF', border: 'none', padding: '8px 20px', borderRadius: 8, fontWeight: 800, cursor: 'pointer' }}
              >
                {isCompleting ? 'جاري الإكمال...' : 'نعم، تم التحويل'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 6: CANCEL ORDER */}
      {cancelModalOrder && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }}>
          <div style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 12, padding: 24, width: '100%', maxWidth: 480, color: '#F8FAFC' }}>
            <h3 style={{ fontSize: 18, fontWeight: 900, marginBottom: 12, color: '#EF4444' }}>
              تأكيد إلغاء الطلب ورد الرصيد للعميل
            </h3>
            <p style={{ color: '#94A3B8', fontSize: 13, lineHeight: 1.6, marginBottom: 16 }}>
              سيتم فك حجز <strong style={{ color: '#F8FAFC' }}>{cancelModalOrder.usdtAmount} USDT</strong> وإعادتها للمخزون، وإعادة مبلغ <strong style={{ color: '#F8FAFC' }}>{Number(cancelModalOrder.chargedAmount).toLocaleString()} {cancelModalOrder.chargedCurrency}</strong> تلقائياً إلى رصيد محفظة العميل.
            </p>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, color: '#94A3B8', marginBottom: 6 }}>
                سبب الإلغاء (يظهر للعميل في الإشعار):
              </label>
              <input
                type="text"
                value={cancelReasonInput}
                onChange={(e) => setCancelReasonInput(e.target.value)}
                placeholder="مثلاً: عنوان المحفظة غير صحيح أو تم بناءً على طلب العميل"
                style={{ width: '100%', background: '#1E293B', border: '1px solid #334155', borderRadius: 8, padding: '8px 12px', color: '#F8FAFC', fontSize: 12, boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setCancelModalOrder(null)}
                style={{ background: '#334155', color: '#F8FAFC', border: 'none', padding: '8px 16px', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}
              >
                تراجع
              </button>
              <button
                type="button"
                disabled={isCanceling}
                onClick={handleConfirmCancel}
                style={{ background: '#EF4444', color: '#FFFFFF', border: 'none', padding: '8px 20px', borderRadius: 8, fontWeight: 800, cursor: 'pointer' }}
              >
                {isCanceling ? 'جاري الإلغاء...' : 'تأكيد الإلغاء ورد المبلغ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
