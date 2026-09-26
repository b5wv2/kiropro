import React, { useState, useEffect } from 'react';
import {
  fetchAdminVirtualNumberOrders,
  fetchAdminVirtualNumberSettings,
  updateAdminVirtualNumberSettings,
  fetchAdminVirtualNumberProducts,
  updateAdminVirtualNumberProduct,
  fetchAdminProviderStatus,
  VirtualNumberOrder
} from '../../services/virtualNumberApi';
import {
  RefreshCw,
  Save,
  Check,
  AlertTriangle
} from 'lucide-react';

export const AdminVirtualNumbers: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'orders' | 'pricing' | 'provider'>('orders');

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

  // Products State
  const [products, setProducts] = useState<any[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [productCustomPrice, setProductCustomPrice] = useState<string>('');

  // Provider State
  const [providerProfile, setProviderProfile] = useState<any>(null);
  const [loadingProvider, setLoadingProvider] = useState(false);
  const [providerError, setProviderError] = useState<string | null>(null);

  useEffect(() => {
    if (activeTab === 'orders') {
      loadOrders();
    } else if (activeTab === 'pricing') {
      loadSettings();
      loadProducts();
    } else if (activeTab === 'provider') {
      loadProviderStatus();
    }
  }, [activeTab, statusFilter, countryFilter, serviceFilter]);

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

  const loadProducts = async () => {
    setLoadingProducts(true);
    try {
      const res = await fetchAdminVirtualNumberProducts();
      setProducts(res);
    } catch (err) {
      console.error('Failed to load products:', err);
    } finally {
      setLoadingProducts(false);
    }
  };

  const loadProviderStatus = async () => {
    setLoadingProvider(true);
    setProviderError(null);
    try {
      const res = await fetchAdminProviderStatus();
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

  const handleUpdateProduct = async (id: string, customPrice: number | null, isActive: boolean) => {
    try {
      await updateAdminVirtualNumberProduct(id, {
        customPriceSdg: customPrice,
        isActive
      });
      loadProducts();
      setEditingProductId(null);
    } catch (err: any) {
      alert(err.message || 'فشل تحديث المنتج.');
    }
  };

  return (
    <div className="admin-page" dir="rtl" style={{ padding: '24px' }}>
      {/* Title & Tabs Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '24px',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>إدارة الأرقام الافتراضية (5SIM)</span>
          </h2>
          <p style={{ fontSize: '0.875rem', color: '#64748B', marginTop: 4 }}>
            مراقبة الطلبات، إدارة محاولات العملاء المجانية، والتحكم بالأسعار حسب الدولة والخدمة.
          </p>
        </div>

        {/* Tab Controls */}
        <div style={{ display: 'flex', gap: '8px', background: '#E2E8F0', padding: '4px', borderRadius: '10px' }}>
          <button
            type="button"
            onClick={() => setActiveTab('orders')}
            style={{
              background: activeTab === 'orders' ? '#0F172A' : 'transparent',
              color: activeTab === 'orders' ? '#F59E0B' : '#475569',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 16px',
              fontWeight: 800,
              fontSize: '0.85rem',
              cursor: 'pointer'
            }}
          >
            مراقبة الطلبات ({totalOrders})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('pricing')}
            style={{
              background: activeTab === 'pricing' ? '#0F172A' : 'transparent',
              color: activeTab === 'pricing' ? '#F59E0B' : '#475569',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 16px',
              fontWeight: 800,
              fontSize: '0.85rem',
              cursor: 'pointer'
            }}
          >
            إعدادات الأسعار والمحاولات
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('provider')}
            style={{
              background: activeTab === 'provider' ? '#0F172A' : 'transparent',
              color: activeTab === 'provider' ? '#F59E0B' : '#475569',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 16px',
              fontWeight: 800,
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
        <div style={{ background: '#FFFFFF', borderRadius: 16, border: '1px solid #E2E8F0', padding: 20 }}>
          {/* Filters Bar */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                border: '1px solid #CBD5E1',
                fontSize: '0.85rem',
                fontWeight: 700
              }}
            >
              <option value="">جميع الحالات</option>
              <option value="COMPLETED">مكتمل (وصل الرمز)</option>
              <option value="WAITING_FOR_CODE">في انتظار الرمز</option>
              <option value="WAITING_FOR_NUMBER">جاري حجز الرقم</option>
              <option value="CANCELED">ملغي</option>
              <option value="EXPIRED">منتهي الصلاحية</option>
              <option value="FAILED">فاشل</option>
            </select>

            <select
              value={countryFilter}
              onChange={e => setCountryFilter(e.target.value)}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                border: '1px solid #CBD5E1',
                fontSize: '0.85rem',
                fontWeight: 700
              }}
            >
              <option value="">جميع الدول</option>
              <option value="usa">أمريكا</option>
              <option value="england">بريطانيا</option>
              <option value="canada">كندا</option>
              <option value="indonesia">إندونيسيا</option>
              <option value="philippines">الفلبين</option>
              <option value="brazil">البرازيل</option>
              <option value="poland">بولندا</option>
              <option value="spain">إسبانيا</option>
            </select>

            <select
              value={serviceFilter}
              onChange={e => setServiceFilter(e.target.value)}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                border: '1px solid #CBD5E1',
                fontSize: '0.85rem',
                fontWeight: 700
              }}
            >
              <option value="">جميع الخدمات</option>
              <option value="google">Google</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="facebook">Facebook</option>
              <option value="instagram">Instagram</option>
              <option value="twitter">Twitter</option>
              <option value="paypal">PayPal</option>
            </select>

            <button
              type="button"
              onClick={loadOrders}
              style={{
                background: '#F1F5F9',
                border: '1px solid #CBD5E1',
                borderRadius: 8,
                padding: '8px 14px',
                fontSize: '0.85rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <RefreshCw size={14} className={loadingOrders ? 'spin' : ''} />
              <span>تحديث</span>
            </button>
          </div>

          {/* Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0' }}>
                  <th style={{ padding: '12px 14px' }}>رقم الطلب</th>
                  <th style={{ padding: '12px 14px' }}>العميل</th>
                  <th style={{ padding: '12px 14px' }}>الدولة والخدمة</th>
                  <th style={{ padding: '12px 14px' }}>الرقم الافتراضي</th>
                  <th style={{ padding: '12px 14px' }}>رمز التحقق (OTP)</th>
                  <th style={{ padding: '12px 14px' }}>الحالة</th>
                  <th style={{ padding: '12px 14px' }}>السعر</th>
                  <th style={{ padding: '12px 14px' }}>التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>
                      {loadingOrders ? 'جاري تحميل الطلبات...' : 'لا توجد طلبات مطابقة للفلاتر المحددة.'}
                    </td>
                  </tr>
                ) : (
                  orders.map(o => (
                    <tr key={o.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontWeight: 800 }}>
                        #{o.id.slice(0, 8)}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 800 }}>{o.userName || 'عميل'}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{o.userEmail}</div>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{ fontWeight: 800 }}>{o.serviceNameAr}</span>
                        <span style={{ fontSize: '0.75rem', color: '#64748B', display: 'block' }}>{o.countryNameAr}</span>
                      </td>
                      <td style={{ padding: '12px 14px', direction: 'ltr', textAlign: 'right', fontFamily: 'monospace', fontWeight: 800 }}>
                        {o.phoneNumber || '—'}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        {o.smsCode ? (
                          <span style={{
                            background: '#DCFCE7',
                            color: '#15803D',
                            padding: '4px 10px',
                            borderRadius: 6,
                            fontWeight: 900,
                            fontFamily: 'monospace'
                          }}>
                            {o.smsCode}
                          </span>
                        ) : (
                          <span style={{ color: '#94A3B8' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{
                          padding: '4px 10px',
                          borderRadius: 9999,
                          fontSize: '0.75rem',
                          fontWeight: 800,
                          background:
                            o.status === 'COMPLETED' ? '#DCFCE7' :
                            o.status === 'CANCELED' || o.status === 'REFUNDED' ? '#FEE2E2' :
                            o.status === 'EXPIRED' ? '#F1F5F9' :
                            '#FEF3C7',
                          color:
                            o.status === 'COMPLETED' ? '#166534' :
                            o.status === 'CANCELED' || o.status === 'REFUNDED' ? '#991B1B' :
                            o.status === 'EXPIRED' ? '#475569' :
                            '#92400E'
                        }}>
                          {o.status === 'COMPLETED' ? 'مكتمل ✅' :
                           o.status === 'WAITING_FOR_CODE' ? 'في انتظار الرمز' :
                           o.status === 'WAITING_FOR_NUMBER' ? 'جاري الحجز' :
                           o.status === 'CANCELED' ? 'ملغي' :
                           o.status === 'EXPIRED' ? 'منتهي' : o.status}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px', fontWeight: 800 }}>
                        {o.isFreeAttempt ? (
                          <span style={{ color: '#16A34A' }}>مجانية (0)</span>
                        ) : (
                          <span>{o.chargedAmount} {o.chargedCurrency}</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: '0.75rem', color: '#64748B' }}>
                        {new Date(o.createdAt).toLocaleString('ar-EG')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: PRICING & ATTEMPTS CONFIGURATION */}
      {activeTab === 'pricing' && (
        <div style={{ display: 'grid', gap: 24 }}>
          {/* General Settings Card */}
          <div style={{ background: '#FFFFFF', borderRadius: 16, border: '1px solid #E2E8F0', padding: 24 }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 900, marginBottom: 16 }}>
              الإعدادات العامة لنظام المحاولات
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20, marginBottom: 20 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 800, color: '#334155', marginBottom: 6 }}>
                  عدد المحاولات المجانية لكل مستخدم:
                </label>
                <input
                  type="number"
                  min="0"
                  value={settings.free_attempts_limit}
                  onChange={e => setSettings({ ...settings, free_attempts_limit: Number(e.target.value) })}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: '1px solid #CBD5E1',
                    fontSize: '0.9rem',
                    fontWeight: 700
                  }}
                />
                <span style={{ fontSize: '0.75rem', color: '#64748B', display: 'block', marginTop: 4 }}>
                  الافتراضي: 5 محاولات مجانية لكل حساب.
                </span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 800, color: '#334155', marginBottom: 6 }}>
                  سعر المحاولة بعد المجانية (بالجنيه السوداني SDG):
                </label>
                <input
                  type="number"
                  min="0"
                  step="50"
                  value={settings.default_paid_price_sdg}
                  onChange={e => setSettings({ ...settings, default_paid_price_sdg: Number(e.target.value) })}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: '1px solid #CBD5E1',
                    fontSize: '0.9rem',
                    fontWeight: 700
                  }}
                />
                <span style={{ fontSize: '0.75rem', color: '#64748B', display: 'block', marginTop: 4 }}>
                  السعر الافتراضي بعد استهلاك الـ 5 محاولات (الافتراضي 800 SDG).
                </span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 800, color: '#334155', marginBottom: 6 }}>
                  حالة الخدمة العامة:
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginTop: 10 }}>
                  <input
                    type="checkbox"
                    checked={settings.is_system_active}
                    onChange={e => setSettings({ ...settings, is_system_active: e.target.checked })}
                    style={{ width: 18, height: 18 }}
                  />
                  <span style={{ fontWeight: 800, fontSize: '0.9rem' }}>
                    {settings.is_system_active ? 'الخدمة مفعلة ومتاحة للعملاء' : 'الخدمة معطلة مؤقتاً'}
                  </span>
                </label>
              </div>
            </div>

            <button
              type="button"
              disabled={savingSettings}
              onClick={handleSaveSettings}
              style={{
                background: settingsSuccess ? '#22C55E' : '#0F172A',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: 8,
                padding: '10px 24px',
                fontWeight: 800,
                fontSize: '0.9rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              {settingsSuccess ? <Check size={18} /> : <Save size={18} />}
              <span>{settingsSuccess ? 'تم الحفظ بنجاح!' : 'حفظ الإعدادات'}</span>
            </button>
          </div>

          {/* Matrix Pricing Card */}
          <div style={{ background: '#FFFFFF', borderRadius: 16, border: '1px solid #E2E8F0', padding: 24 }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 900, marginBottom: 8 }}>
              تخصيص أسعار الدول والخدمات المسموحة (48 منتج معتمد)
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#64748B', marginBottom: 16 }}>
              إذا تم ترك السعر المخصص فارغاً، سيتم تطبيق السعر العام ({settings.default_paid_price_sdg} SDG).
            </p>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0' }}>
                    <th style={{ padding: '10px 14px' }}>الدولة</th>
                    <th style={{ padding: '10px 14px' }}>الخدمة</th>
                    <th style={{ padding: '10px 14px' }}>السعر المخصص (SDG)</th>
                    <th style={{ padding: '10px 14px' }}>السعر الفعلي المطبق</th>
                    <th style={{ padding: '10px 14px' }}>الحالة</th>
                    <th style={{ padding: '10px 14px' }}>إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingProducts ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: 24, color: '#64748B' }}>
                        جاري تحميل المنتجات...
                      </td>
                    </tr>
                  ) : products.map(p => {
                    const isEditing = editingProductId === p.id;
                    const effectivePrice = p.custom_price_sdg !== null ? `${p.custom_price_sdg} SDG` : `${settings.default_paid_price_sdg} SDG (تلقائي)`;

                    return (
                      <tr key={p.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 800 }}>
                          {p.country_name_ar}
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: 800 }}>
                          {p.service_name_ar}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          {isEditing ? (
                            <input
                              type="number"
                              placeholder="تلقائي"
                              value={productCustomPrice}
                              onChange={e => setProductCustomPrice(e.target.value)}
                              style={{ width: 100, padding: '4px 8px', borderRadius: 6, border: '1px solid #CBD5E1' }}
                            />
                          ) : (
                            <span>{p.custom_price_sdg !== null ? `${p.custom_price_sdg} SDG` : 'تلقائي'}</span>
                          )}
                        </td>
                        <td style={{ padding: '10px 14px', color: '#D97706', fontWeight: 800 }}>
                          {effectivePrice}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{
                            padding: '3px 8px',
                            borderRadius: 6,
                            fontSize: '0.75rem',
                            fontWeight: 800,
                            background: p.is_active ? '#DCFCE7' : '#FEE2E2',
                            color: p.is_active ? '#166534' : '#991B1B'
                          }}>
                            {p.is_active ? 'نشط' : 'معطل'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          {isEditing ? (
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                type="button"
                                onClick={() => {
                                  const val = productCustomPrice.trim() === '' ? null : Number(productCustomPrice);
                                  handleUpdateProduct(p.id, val, p.is_active);
                                }}
                                style={{ background: '#0F172A', color: '#FFF', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer' }}
                              >
                                حفظ
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingProductId(null)}
                                style={{ background: '#CBD5E1', border: 'none', borderRadius: 4, padding: '4px 8px', cursor: 'pointer' }}
                              >
                                إلغاء
                              </button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingProductId(p.id);
                                  setProductCustomPrice(p.custom_price_sdg !== null ? String(p.custom_price_sdg) : '');
                                }}
                                style={{ background: '#F1F5F9', border: '1px solid #CBD5E1', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontWeight: 700 }}
                              >
                                تعديل السعر
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateProduct(p.id, p.custom_price_sdg, !p.is_active)}
                                style={{
                                  background: p.is_active ? '#FEE2E2' : '#DCFCE7',
                                  color: p.is_active ? '#991B1B' : '#166534',
                                  border: 'none',
                                  borderRadius: 4,
                                  padding: '4px 8px',
                                  cursor: 'pointer',
                                  fontWeight: 700
                                }}
                              >
                                {p.is_active ? 'تعطيل' : 'تفعيل'}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: PROVIDER 5SIM HEALTH & BALANCE */}
      {activeTab === 'provider' && (
        <div style={{ background: '#FFFFFF', borderRadius: 16, border: '1px solid #E2E8F0', padding: 24, maxWidth: 640 }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 900, marginBottom: 16 }}>
            معلومات حساب مزود الخدمة (5SIM API)
          </h3>

          {providerError ? (
            <div style={{
              background: '#FEE2E2',
              border: '1px solid #FCA5A5',
              color: '#991B1B',
              borderRadius: 8,
              padding: 16,
              marginBottom: 16
            }}>
              <AlertTriangle size={20} style={{ marginBottom: 6 }} />
              <div>{providerError}</div>
              <div style={{ fontSize: '0.8rem', marginTop: 4 }}>
                تأكد من إدخال رمز FIVESIM_API_TOKEN بشكل صحيح في ملف .env في السيرفر.
              </div>
            </div>
          ) : providerProfile ? (
            <div style={{ display: 'grid', gap: 16 }}>
              <div style={{ background: '#F8FAFC', borderRadius: 12, padding: 16, border: '1px solid #E2E8F0' }}>
                <div style={{ fontSize: '0.85rem', color: '#64748B' }}>البريد المسجل لدى 5SIM:</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0F172A' }}>{providerProfile.email}</div>
              </div>

              <div style={{ background: '#F8FAFC', borderRadius: 12, padding: 16, border: '1px solid #E2E8F0' }}>
                <div style={{ fontSize: '0.85rem', color: '#64748B' }}>الرصيد المتاح (Balance):</div>
                <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#16A34A' }}>
                  {providerProfile.balance} RUB / $
                </div>
              </div>

              <div style={{ background: '#F8FAFC', borderRadius: 12, padding: 16, border: '1px solid #E2E8F0' }}>
                <div style={{ fontSize: '0.85rem', color: '#64748B' }}>التقييم (Rating):</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#D97706' }}>{providerProfile.rating}%</div>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 30, color: '#64748B' }}>
              جاري فحص حالة المزود...
            </div>
          )}

          <button
            type="button"
            onClick={loadProviderStatus}
            style={{
              marginTop: 20,
              background: '#0F172A',
              color: '#FFF',
              border: 'none',
              borderRadius: 8,
              padding: '10px 20px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            <RefreshCw size={16} className={loadingProvider ? 'spin' : ''} />
            <span>إعادة فحص الاتصال</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default AdminVirtualNumbers;
