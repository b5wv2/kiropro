import React, { useState, useEffect } from 'react';
import {
  fetchAdminVirtualNumberOrders,
  fetchAdminVirtualNumberSettings,
  updateAdminVirtualNumberSettings,
  fetchAdminVirtualNumberOffers,
  updateAdminVirtualNumberOffer,
  createAdminVirtualNumberOffer,
  VirtualNumberOrder,
  VirtualNumberProviderOffer
} from '../../services/virtualNumberApi';
import { api } from '../../lib/api';
import {
  RefreshCw,
  Save,
  Check,
  AlertTriangle,
  Server,
  Layers,
  Search,
  Plus,
  Edit2,
  DollarSign,
  TrendingUp,
  Percent
} from 'lucide-react';

export const AdminVirtualNumbers: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'orders' | 'offers' | 'settings' | 'provider'>('orders');

  // Orders State
  const [orders, setOrders] = useState<VirtualNumberOrder[]>([]);
  const [totalOrders, setTotalOrders] = useState(0);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [countryFilter, setCountryFilter] = useState<string>('');
  const [serviceFilter, setServiceFilter] = useState<string>('');

  // Settings State
  const [settings, setSettings] = useState<{ free_attempts_limit: number; default_paid_price_sdg: number; is_system_active: boolean }>({
    free_attempts_limit: 5,
    default_paid_price_sdg: 800,
    is_system_active: true
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState(false);

  // Offers State
  const [offers, setOffers] = useState<VirtualNumberProviderOffer[]>([]);
  const [loadingOffers, setLoadingOffers] = useState(false);
  const [offerCountryFilter, setOfferCountryFilter] = useState<string>('');
  const [offerServiceFilter, setOfferServiceFilter] = useState<string>('');

  // Editing Offer State
  const [editingOffer, setEditingOffer] = useState<VirtualNumberProviderOffer | null>(null);
  const [editPriceSdg, setEditPriceSdg] = useState<string>('');
  const [editSupplierCost, setEditSupplierCost] = useState<string>('');
  const [editIsActive, setEditIsActive] = useState<boolean>(true);
  const [editEtaText, setEditEtaText] = useState<string>('');
  const [savingOffer, setSavingOffer] = useState<boolean>(false);

  // Provider State
  const [providerProfile, setProviderProfile] = useState<any>(null);
  const [loadingProvider, setLoadingProvider] = useState(false);
  const [providerError, setProviderError] = useState<string | null>(null);

  useEffect(() => {
    if (activeTab === 'orders') {
      loadOrders();
    } else if (activeTab === 'offers') {
      loadOffers();
    } else if (activeTab === 'settings') {
      loadSettings();
    } else if (activeTab === 'provider') {
      loadProviderStatus();
    }
  }, [activeTab, statusFilter, countryFilter, serviceFilter, offerCountryFilter, offerServiceFilter]);

  const loadOrders = async () => {
    setLoadingOrders(true);
    try {
      const res = await fetchAdminVirtualNumberOrders({
        status: statusFilter || undefined,
        countryCode: countryFilter || undefined,
        serviceCode: serviceFilter || undefined,
        limit: 50
      });
      setOrders(res.orders);
      setTotalOrders(res.total);
    } catch (err: any) {
      console.error('Failed to load admin orders:', err);
    } finally {
      setLoadingOrders(false);
    }
  };

  const loadSettings = async () => {
    try {
      const res = await fetchAdminVirtualNumberSettings();
      if (res.settings) {
        setSettings({
          free_attempts_limit: res.settings.free_attempts_limit,
          default_paid_price_sdg: res.settings.default_paid_price_sdg,
          is_system_active: res.settings.is_system_active
        });
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  };

  const loadOffers = async () => {
    setLoadingOffers(true);
    try {
      const list = await fetchAdminVirtualNumberOffers({
        countryCode: offerCountryFilter || undefined,
        serviceCode: offerServiceFilter || undefined
      });
      setOffers(list);
    } catch (err) {
      console.error('Failed to load offers:', err);
    } finally {
      setLoadingOffers(false);
    }
  };

  const loadProviderStatus = async () => {
    setLoadingProvider(true);
    setProviderError(null);
    try {
      const res: any = await api.get('/api/admin/virtual-numbers/provider-status');
      if (res.configured) {
        setProviderProfile(res.profile);
      } else {
        setProviderError(res.error || '5SIM غير مهيأ');
      }
    } catch (err: any) {
      setProviderError(err.message || 'تعذر الاتصال بمزود الخدمة.');
    } finally {
      setLoadingProvider(false);
    }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      await updateAdminVirtualNumberSettings({
        freeAttemptsLimit: Number(settings.free_attempts_limit),
        defaultPaidPriceSdg: Number(settings.default_paid_price_sdg),
        isSystemActive: settings.is_system_active
      });
      setSettingsSuccess(true);
      setTimeout(() => setSettingsSuccess(false), 2500);
    } catch (err: any) {
      alert(err.message || 'فشل حفظ الإعدادات.');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleOpenEditOffer = (offer: VirtualNumberProviderOffer) => {
    setEditingOffer(offer);
    setEditPriceSdg(String(offer.customerPriceSdg));
    setEditSupplierCost(String(offer.supplierCost));
    setEditIsActive(offer.isActive);
    setEditEtaText(offer.etaText || '');
  };

  const handleSaveOffer = async () => {
    if (!editingOffer) return;
    setSavingOffer(true);
    try {
      await updateAdminVirtualNumberOffer(editingOffer.id, {
        customerPriceSdg: Number(editPriceSdg),
        supplierCost: Number(editSupplierCost),
        isActive: editIsActive,
        etaText: editEtaText
      });
      setEditingOffer(null);
      loadOffers();
    } catch (err: any) {
      alert(err.message || 'فشل حفظ تعديلات العرض.');
    } finally {
      setSavingOffer(false);
    }
  };

  return (
    <div style={{ padding: '24px', direction: 'rtl', maxWidth: 1400, margin: '0 auto', color: '#F8FAFC' }}>
      
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 900, margin: '0 0 6px 0', color: '#F8FAFC' }}>
            إدارة الأرقام الافتراضية والعروض 📱
          </h1>
          <p style={{ margin: 0, color: '#94A3B8', fontSize: '0.9rem' }}>
            مراقبة طلبات العملاء الحية، إدارة مزودي الخدمة وتخصيص أسعار العروض وهوامش الربح.
          </p>
        </div>

        {/* Tab Switcher */}
        <div style={{ display: 'flex', background: 'rgba(15, 23, 42, 0.8)', padding: 6, borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)', gap: 6 }}>
          <button
            type="button"
            onClick={() => setActiveTab('orders')}
            style={{
              background: activeTab === 'orders' ? '#F59E0B' : 'transparent',
              color: activeTab === 'orders' ? '#0B0F19' : '#CBD5E1',
              border: 'none',
              borderRadius: 10,
              padding: '8px 18px',
              fontWeight: 900,
              fontSize: '0.85rem',
              cursor: 'pointer'
            }}
          >
            الطلبات الحية ({totalOrders})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('offers')}
            style={{
              background: activeTab === 'offers' ? '#F59E0B' : 'transparent',
              color: activeTab === 'offers' ? '#0B0F19' : '#CBD5E1',
              border: 'none',
              borderRadius: 10,
              padding: '8px 18px',
              fontWeight: 900,
              fontSize: '0.85rem',
              cursor: 'pointer'
            }}
          >
            عروض المزودين والأسعار
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            style={{
              background: activeTab === 'settings' ? '#F59E0B' : 'transparent',
              color: activeTab === 'settings' ? '#0B0F19' : '#CBD5E1',
              border: 'none',
              borderRadius: 10,
              padding: '8px 18px',
              fontWeight: 900,
              fontSize: '0.85rem',
              cursor: 'pointer'
            }}
          >
            الإعدادات العامة
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('provider')}
            style={{
              background: activeTab === 'provider' ? '#F59E0B' : 'transparent',
              color: activeTab === 'provider' ? '#0B0F19' : '#CBD5E1',
              border: 'none',
              borderRadius: 10,
              padding: '8px 18px',
              fontWeight: 900,
              fontSize: '0.85rem',
              cursor: 'pointer'
            }}
          >
            حالة مزود 5SIM
          </button>
        </div>
      </div>

      {/* TAB 1: ORDERS MONITORING */}
      {activeTab === 'orders' && (
        <div style={{ background: '#1E293B', borderRadius: 16, border: '1px solid rgba(255,255,255,0.08)', padding: 20 }}>
          {/* Filters Bar */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20, alignItems: 'center' }}>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              style={{ background: '#0F172A', color: '#F8FAFC', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '8px 12px', fontSize: '0.85rem' }}
            >
              <option value="">كل الحالات</option>
              <option value="WAITING_FOR_CODE">في انتظار الكود (WAITING_FOR_CODE)</option>
              <option value="COMPLETED">مكتمل وناجح (COMPLETED)</option>
              <option value="CANCELED">ملغي (CANCELED)</option>
              <option value="EXPIRED">منتهي الصلاحية (EXPIRED)</option>
              <option value="FAILED">فشل (FAILED)</option>
            </select>

            <select
              value={countryFilter}
              onChange={e => setCountryFilter(e.target.value)}
              style={{ background: '#0F172A', color: '#F8FAFC', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '8px 12px', fontSize: '0.85rem' }}
            >
              <option value="">كل الدول</option>
              <option value="usa">أمريكا (USA)</option>
              <option value="england">بريطانيا (UK)</option>
              <option value="canada">كندا (Canada)</option>
              <option value="indonesia">إندونيسيا (Indonesia)</option>
              <option value="philippines">الفلبين (Philippines)</option>
              <option value="brazil">البرازيل (Brazil)</option>
              <option value="poland">بولندا (Poland)</option>
              <option value="spain">إسبانيا (Spain)</option>
            </select>

            <select
              value={serviceFilter}
              onChange={e => setServiceFilter(e.target.value)}
              style={{ background: '#0F172A', color: '#F8FAFC', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '8px 12px', fontSize: '0.85rem' }}
            >
              <option value="">كل الخدمات</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="google">Google</option>
              <option value="facebook">Facebook</option>
              <option value="instagram">Instagram</option>
              <option value="twitter">Twitter</option>
              <option value="paypal">PayPal</option>
            </select>

            <button
              type="button"
              onClick={loadOrders}
              style={{ background: 'rgba(255,255,255,0.08)', color: '#CBD5E1', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '8px 14px', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <RefreshCw size={14} className={loadingOrders ? 'spin' : ''} />
              <span>تحديث</span>
            </button>
          </div>

          {/* Orders Table */}
          {loadingOrders ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#94A3B8' }}>جاري تحميل الطلبات...</div>
          ) : orders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#94A3B8' }}>لا توجد طلبات تطابق هذا الفلتر.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'right' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#94A3B8' }}>
                    <th style={{ padding: '12px 10px' }}>رقم الطلب</th>
                    <th style={{ padding: '12px 10px' }}>العميل</th>
                    <th style={{ padding: '12px 10px' }}>الدولة والخدمة</th>
                    <th style={{ padding: '12px 10px' }}>المزود المختار</th>
                    <th style={{ padding: '12px 10px' }}>الرقم المخصص</th>
                    <th style={{ padding: '12px 10px' }}>رمز التحقق</th>
                    <th style={{ padding: '12px 10px' }}>سعر العرض</th>
                    <th style={{ padding: '12px 10px' }}>المدفوع</th>
                    <th style={{ padding: '12px 10px' }}>الحالة</th>
                    <th style={{ padding: '12px 10px' }}>التاريخ</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map(order => (
                    <tr key={order.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '12px 10px', fontFamily: 'monospace' }}>#{order.id.slice(0, 8)}</td>
                      <td style={{ padding: '12px 10px' }}>
                        <div style={{ fontWeight: 700, color: '#F8FAFC' }}>{order.userName || 'مستخدم'}</div>
                        <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>{order.userEmail}</div>
                      </td>
                      <td style={{ padding: '12px 10px' }}>
                        <span style={{ fontWeight: 800, color: '#F8FAFC' }}>{order.serviceNameAr}</span>
                        <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>{order.countryNameAr}</div>
                      </td>
                      <td style={{ padding: '12px 10px' }}>
                        <span style={{ color: '#F59E0B', fontWeight: 800 }}>{order.providerName || order.operator}</span>
                        <div style={{ fontSize: '0.7rem', color: '#64748B' }}>{order.providerId}</div>
                      </td>
                      <td style={{ padding: '12px 10px', direction: 'ltr', textAlign: 'right', fontWeight: 700 }}>
                        {order.phoneNumber || '—'}
                      </td>
                      <td style={{ padding: '12px 10px' }}>
                        {order.smsCode ? (
                          <span style={{ background: 'rgba(16,185,129,0.15)', color: '#10B981', padding: '2px 8px', borderRadius: 6, fontWeight: 900, fontFamily: 'monospace' }}>
                            {order.smsCode}
                          </span>
                        ) : (
                          <span style={{ color: '#64748B' }}>قيد الانتظار</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 10px' }}>
                        {order.customerPrice !== undefined ? `${order.customerPrice.toLocaleString()} SDG` : '—'}
                      </td>
                      <td style={{ padding: '12px 10px' }}>
                        {order.isFreeAttempt ? (
                          <span style={{ color: '#10B981', fontWeight: 800 }}>مجاناً (عرض)</span>
                        ) : (
                          <span style={{ color: '#F8FAFC', fontWeight: 800 }}>{order.chargedAmount} SDG</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 10px' }}>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: 12,
                          fontSize: '0.75rem',
                          fontWeight: 800,
                          background:
                            order.status === 'COMPLETED' ? 'rgba(16,185,129,0.15)' :
                            order.status === 'WAITING_FOR_CODE' ? 'rgba(245,158,11,0.15)' :
                            order.status === 'CANCELED' ? 'rgba(239,68,68,0.15)' : 'rgba(148,163,184,0.15)',
                          color:
                            order.status === 'COMPLETED' ? '#10B981' :
                            order.status === 'WAITING_FOR_CODE' ? '#F59E0B' :
                            order.status === 'CANCELED' ? '#EF4444' : '#CBD5E1'
                        }}>
                          {order.status}
                        </span>
                      </td>
                      <td style={{ padding: '12px 10px', fontSize: '0.75rem', color: '#94A3B8' }}>
                        {new Date(order.createdAt).toLocaleDateString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: PROVIDER OFFERS & PRICING */}
      {activeTab === 'offers' && (
        <div style={{ background: '#1E293B', borderRadius: 16, border: '1px solid rgba(255,255,255,0.08)', padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <select
                value={offerCountryFilter}
                onChange={e => setOfferCountryFilter(e.target.value)}
                style={{ background: '#0F172A', color: '#F8FAFC', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '8px 12px', fontSize: '0.85rem' }}
              >
                <option value="">كل الدول</option>
                <option value="usa">أمريكا (USA)</option>
                <option value="england">بريطانيا (UK)</option>
                <option value="canada">كندا (Canada)</option>
                <option value="indonesia">إندونيسيا (Indonesia)</option>
                <option value="philippines">الفلبين (Philippines)</option>
                <option value="brazil">البرازيل (Brazil)</option>
                <option value="poland">بولندا (Poland)</option>
                <option value="spain">إسبانيا (Spain)</option>
              </select>

              <select
                value={offerServiceFilter}
                onChange={e => setOfferServiceFilter(e.target.value)}
                style={{ background: '#0F172A', color: '#F8FAFC', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '8px 12px', fontSize: '0.85rem' }}
              >
                <option value="">كل الخدمات</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="google">Google</option>
                <option value="facebook">Facebook</option>
                <option value="instagram">Instagram</option>
                <option value="twitter">Twitter</option>
                <option value="paypal">PayPal</option>
              </select>
            </div>

            <button
              type="button"
              onClick={loadOffers}
              style={{ background: 'rgba(255,255,255,0.08)', color: '#CBD5E1', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '8px 14px', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <RefreshCw size={14} className={loadingOffers ? 'spin' : ''} />
              <span>تحديث العروض</span>
            </button>
          </div>

          {loadingOffers ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#94A3B8' }}>جاري تحميل العروض...</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'right' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#94A3B8' }}>
                    <th style={{ padding: '12px 10px' }}>الدولة</th>
                    <th style={{ padding: '12px 10px' }}>فئة الخدمة</th>
                    <th style={{ padding: '12px 10px' }}>المزود المعتمد</th>
                    <th style={{ padding: '12px 10px' }}>تكلفة المزود ($)</th>
                    <th style={{ padding: '12px 10px' }}>سعر العميل (SDG)</th>
                    <th style={{ padding: '12px 10px' }}>نسبة النجاح</th>
                    <th style={{ padding: '12px 10px' }}>الحالة</th>
                    <th style={{ padding: '12px 10px', textAlign: 'center' }}>إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {offers.map(offer => (
                    <tr key={offer.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '12px 10px', fontWeight: 800 }}>{offer.countryCode.toUpperCase()}</td>
                      <td style={{ padding: '12px 10px', color: '#F59E0B', fontWeight: 800 }}>{offer.serviceCode}</td>
                      <td style={{ padding: '12px 10px' }}>
                        <div style={{ fontWeight: 800, color: '#F8FAFC' }}>{offer.providerName}</div>
                        <code style={{ fontSize: '0.7rem', color: '#94A3B8' }}>{offer.providerId}</code>
                      </td>
                      <td style={{ padding: '12px 10px', color: '#94A3B8' }}>${offer.supplierCost.toFixed(2)}</td>
                      <td style={{ padding: '12px 10px', fontWeight: 900, color: '#10B981', fontSize: '1rem' }}>
                        {offer.customerPriceSdg.toLocaleString()} SDG
                      </td>
                      <td style={{ padding: '12px 10px', color: '#6EE7B7' }}>{offer.deliveryRate}%</td>
                      <td style={{ padding: '12px 10px' }}>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: 10,
                          fontSize: '0.75rem',
                          fontWeight: 800,
                          background: offer.isActive ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                          color: offer.isActive ? '#10B981' : '#EF4444'
                        }}>
                          {offer.isActive ? 'مفعل' : 'معطل'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => handleOpenEditOffer(offer)}
                          style={{
                            background: '#F59E0B',
                            color: '#0B0F19',
                            border: 'none',
                            borderRadius: 6,
                            padding: '6px 14px',
                            fontWeight: 900,
                            fontSize: '0.75rem',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4
                          }}
                        >
                          <Edit2 size={13} />
                          <span>تعديل السعر</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Edit Offer Modal */}
      {editingOffer && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: 16
        }}>
          <div style={{ background: '#1E293B', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 20, padding: 28, maxWidth: 500, width: '100%', direction: 'rtl' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 900, color: '#F8FAFC', margin: '0 0 16px 0' }}>
              تعديل عرض: {editingOffer.providerName}
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#94A3B8', marginBottom: 4 }}>
                  سعر العميل النهائي (Customer Price SDG):
                </label>
                <input
                  type="number"
                  value={editPriceSdg}
                  onChange={e => setEditPriceSdg(e.target.value)}
                  style={{ width: '100%', background: '#0F172A', color: '#F8FAFC', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, padding: '10px 12px', fontSize: '1rem', fontWeight: 900 }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#94A3B8', marginBottom: 4 }}>
                  تكلفة المزود التقريبية بالدولار (Supplier Cost USD):
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={editSupplierCost}
                  onChange={e => setEditSupplierCost(e.target.value)}
                  style={{ width: '100%', background: '#0F172A', color: '#F8FAFC', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, padding: '10px 12px', fontSize: '1rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#94A3B8', marginBottom: 4 }}>
                  نص مهلة وصول الرمز (ETA):
                </label>
                <input
                  type="text"
                  value={editEtaText}
                  onChange={e => setEditEtaText(e.target.value)}
                  style={{ width: '100%', background: '#0F172A', color: '#F8FAFC', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, padding: '10px 12px', fontSize: '0.85rem' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
                <input
                  type="checkbox"
                  id="offerActiveCheck"
                  checked={editIsActive}
                  onChange={e => setEditIsActive(e.target.checked)}
                  style={{ width: 18, height: 18 }}
                />
                <label htmlFor="offerActiveCheck" style={{ fontSize: '0.9rem', color: '#F8FAFC', fontWeight: 700 }}>
                  تفعيل هذا العرض للعملاء
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }}>
              <button
                type="button"
                onClick={() => setEditingOffer(null)}
                style={{ background: 'transparent', color: '#94A3B8', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 18px', fontWeight: 800, cursor: 'pointer' }}
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleSaveOffer}
                disabled={savingOffer}
                style={{ background: '#F59E0B', color: '#0B0F19', border: 'none', borderRadius: 8, padding: '10px 24px', fontWeight: 900, cursor: 'pointer' }}
              >
                {savingOffer ? 'جاري الحفظ...' : 'حفظ التعديلات'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: GENERAL SETTINGS */}
      {activeTab === 'settings' && (
        <div style={{ background: '#1E293B', borderRadius: 16, border: '1px solid rgba(255,255,255,0.08)', padding: 24, maxWidth: 650 }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 900, marginBottom: 20 }}>إعدادات النظام العامة</h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#94A3B8', marginBottom: 6 }}>
                عدد المحاولات المجانية لكل مستخدم (Free Attempts Limit):
              </label>
              <input
                type="number"
                value={settings.free_attempts_limit}
                onChange={e => setSettings({ ...settings, free_attempts_limit: Number(e.target.value) })}
                style={{ width: '100%', background: '#0F172A', color: '#F8FAFC', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '10px 12px', fontSize: '1rem', fontWeight: 900 }}
              />
              <span style={{ fontSize: '0.75rem', color: '#64748B', display: 'block', marginTop: 4 }}>
                * أول 5 محاولات تكون مجانية للعميل ويتم تسجيلها كعرض ترويجي.
              </span>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#94A3B8', marginBottom: 6 }}>
                السعر الافتراضي للمحاولة بعد المجانية (Default Paid Price SDG):
              </label>
              <input
                type="number"
                value={settings.default_paid_price_sdg}
                onChange={e => setSettings({ ...settings, default_paid_price_sdg: Number(e.target.value) })}
                style={{ width: '100%', background: '#0F172A', color: '#F8FAFC', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '10px 12px', fontSize: '1rem', fontWeight: 900 }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
              <input
                type="checkbox"
                id="systemActiveToggle"
                checked={settings.is_system_active}
                onChange={e => setSettings({ ...settings, is_system_active: e.target.checked })}
                style={{ width: 18, height: 18 }}
              />
              <label htmlFor="systemActiveToggle" style={{ fontSize: '0.9rem', color: '#F8FAFC', fontWeight: 700 }}>
                تفعيل خدمة الأرقام الافتراضية في المتجر ككل
              </label>
            </div>

            {settingsSuccess && (
              <div style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid #10B981', color: '#10B981', padding: '10px 16px', borderRadius: 8, fontSize: '0.85rem', fontWeight: 800 }}>
                تم حفظ الإعدادات العامة بنجاح!
              </div>
            )}

            <button
              type="button"
              onClick={handleSaveSettings}
              disabled={savingSettings}
              style={{
                background: '#F59E0B',
                color: '#0B0F19',
                border: 'none',
                borderRadius: 8,
                padding: '12px 24px',
                fontWeight: 900,
                fontSize: '0.95rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                marginTop: 10,
                alignSelf: 'flex-start'
              }}
            >
              <Save size={18} />
              <span>{savingSettings ? 'جاري الحفظ...' : 'حفظ الإعدادات'}</span>
            </button>
          </div>
        </div>
      )}

      {/* TAB 4: 5SIM PROVIDER STATUS */}
      {activeTab === 'provider' && (
        <div style={{ background: '#1E293B', borderRadius: 16, border: '1px solid rgba(255,255,255,0.08)', padding: 24, maxWidth: 650 }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 900, marginBottom: 20 }}>حالة حساب 5SIM الحي</h3>

          {loadingProvider ? (
            <div style={{ color: '#94A3B8' }}>جاري فحص حالة الحساب...</div>
          ) : providerError ? (
            <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid #EF4444', color: '#FCA5A5', padding: 16, borderRadius: 10, fontSize: '0.9rem' }}>
              <AlertTriangle size={20} color="#EF4444" style={{ marginBottom: 6 }} />
              <div>{providerError}</div>
            </div>
          ) : providerProfile ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', background: 'rgba(15,23,42,0.6)', borderRadius: 10 }}>
                <span style={{ color: '#94A3B8' }}>البريد الإلكتروني للحساب:</span>
                <strong style={{ color: '#F8FAFC' }}>{providerProfile.email}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', background: 'rgba(15,23,42,0.6)', borderRadius: 10 }}>
                <span style={{ color: '#94A3B8' }}>رصيد المزود المتاح:</span>
                <strong style={{ color: '#10B981', fontSize: '1.2rem' }}>{providerProfile.balance} RUB</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', background: 'rgba(15,23,42,0.6)', borderRadius: 10 }}>
                <span style={{ color: '#94A3B8' }}>الرصيد المحجوز (Frozen):</span>
                <strong style={{ color: '#F59E0B' }}>{providerProfile.frozenBalance || 0} RUB</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', background: 'rgba(15,23,42,0.6)', borderRadius: 10 }}>
                <span style={{ color: '#94A3B8' }}>تقييم الحساب (Rating):</span>
                <strong style={{ color: '#F8FAFC' }}>{providerProfile.rating}%</strong>
              </div>
            </div>
          ) : (
            <div style={{ color: '#94A3B8' }}>لم يتم العثور على بيانات.</div>
          )}
        </div>
      )}

    </div>
  );
};
