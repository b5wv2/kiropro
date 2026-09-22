import React, { useEffect, useState } from 'react';
import { 
  Settings, 
  Save, 
  Database, 
  CheckCircle2, 
  Phone,
  DollarSign,
  Gift,
  Flame,
  Users,
  Share2
} from 'lucide-react';
import { api } from '../../lib/api';
import { generateReferralCopy } from '../../utils/referralText';

interface ContactChannelItem {
  id: 'whatsapp' | 'telegram' | 'facebook';
  name: string;
  title: string;
  subtitle: string;
  enabled: boolean;
  url: string;
  order: number;
}

export const AdminSettings: React.FC = () => {
  const [settings, setSettings] = useState({
    storeName: 'KIROPRO Gaming Services',
    supportEmail: 'support@kiropro.com',
    supportPhone: '+966 50 000 0000',
    telegramSupport: '@kiropro_support',
    defaultCurrency: '$ (USD)',
    maintenanceMode: false,
    autoFulfillOrders: false
  });

  const [exchangeSettings, setExchangeSettings] = useState({
    rate: 5000,
    base_currency: 'USD',
    quote_currency: 'SDG',
    min_topup: 1,
    max_topup: 500,
    updated_at: ''
  });

  const [referralSettings, setReferralSettings] = useState({
    enabled: true,
    referrer_reward: 1000,
    referee_reward: 1000,
    currency: 'جنيه',
    min_order_amount: 5000,
    max_referrer_earnings: 10000,
    allow_existing_users_binding: true,
    first_order_only: true,
    allow_crypto_orders: true,
    allow_game_orders: true,
    allow_cards_orders: true,
    updated_at: ''
  });

  const [referralStats, setReferralStats] = useState({
    totalInvitations: 0,
    completedReferrals: 0,
    pendingReferrals: 0,
    totalPayoutCombined: 0
  });

  const [system, setSystem] = useState({
    dbStatus: 'CONNECTED (PostgreSQL)',
    serverUptime: 0,
    nodeVersion: 'Node.js',
    apiVersion: 'v1.4.0'
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [savingRate, setSavingRate] = useState(false);
  const [rateSaveSuccess, setRateSaveSuccess] = useState(false);

  const [savingReferral, setSavingReferral] = useState(false);
  const [referralSaveSuccess, setReferralSaveSuccess] = useState(false);

  const [contactChannels, setContactChannels] = useState<ContactChannelItem[]>([
    { id: 'whatsapp', name: 'WhatsApp', title: 'واتساب', subtitle: 'للدعم والاستفسارات', enabled: true, url: 'https://wa.me/249123456789', order: 1 },
    { id: 'facebook', name: 'Facebook', title: 'فيسبوك', subtitle: 'تابعنا وتواصل معنا', enabled: true, url: 'https://facebook.com/kiropro', order: 2 },
    { id: 'telegram', name: 'Telegram', title: 'تيليجرام', subtitle: 'للتواصل السريع', enabled: true, url: 'https://t.me/kiropro_support', order: 3 },
  ]);
  const [savingChannels, setSavingChannels] = useState(false);
  const [channelsSaveSuccess, setChannelsSaveSuccess] = useState(false);
  const [channelsError, setChannelsError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const [data, rateData, refData, channelsData] = await Promise.all([
          api.get('/api/admin/settings').catch(() => ({})),
          api.get('/api/settings/exchange-rate').catch(() => ({})),
          api.get('/api/referral/admin/settings').catch(() => ({})),
          api.get('/api/admin/contact-channels').catch(() => ({}))
        ]);
        if (data.settings) setSettings(data.settings);
        if (data.system) setSystem(data.system);
        if (channelsData?.channels && Array.isArray(channelsData.channels)) {
          setContactChannels(channelsData.channels);
        }
        if (rateData && rateData.rate) {
          setExchangeSettings({
            rate: rateData.rate,
            base_currency: rateData.base_currency || 'USD',
            quote_currency: rateData.quote_currency || 'SDG',
            min_topup: rateData.min_topup || 1,
            max_topup: rateData.max_topup || 500,
            updated_at: rateData.updated_at || ''
          });
        }
        if (refData && refData.settings) {
          setReferralSettings({
            enabled: Boolean(refData.settings.enabled),
            referrer_reward: Number(refData.settings.referrer_reward ?? 1000),
            referee_reward: Number(refData.settings.referee_reward ?? 1000),
            currency: String(refData.settings.currency || 'جنيه'),
            min_order_amount: Number(refData.settings.min_order_amount ?? 5000),
            max_referrer_earnings: Number(refData.settings.max_referrer_earnings ?? 10000),
            allow_existing_users_binding: Boolean(refData.settings.allow_existing_users_binding ?? true),
            first_order_only: Boolean(refData.settings.first_order_only ?? true),
            allow_crypto_orders: Boolean(refData.settings.allow_crypto_orders ?? true),
            allow_game_orders: Boolean(refData.settings.allow_game_orders ?? true),
            allow_cards_orders: Boolean(refData.settings.allow_cards_orders ?? true),
            updated_at: refData.settings.updated_at || ''
          });
        }
        if (refData && refData.stats) {
          setReferralStats(refData.stats);
        }
      } catch (err) {
        console.error('Failed to load settings', err);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const validateContactUrl = (url: string): string | null => {
    if (!url || !url.trim()) return 'الرابط لا يمكن أن يكون فارغاً.';
    const trimmed = url.trim().toLowerCase();
    if (trimmed.startsWith('javascript:') || trimmed.startsWith('data:') || trimmed.startsWith('vbscript:')) {
      return 'الرابط يحتوي على بروتوكول غير آمن مرفوض (javascript/data).';
    }
    try {
      const toTest = url.trim().startsWith('http://') || url.trim().startsWith('https://') ? url.trim() : `https://${url.trim()}`;
      const parsed = new URL(toTest);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return 'يجب أن يبدأ الرابط بـ https://';
      }
    } catch {
      return 'صيغة الرابط غير صحيحة.';
    }
    return null;
  };

  const handleSaveContactChannels = async () => {
    setSavingChannels(true);
    setChannelsError(null);
    setChannelsSaveSuccess(false);

    for (const ch of contactChannels) {
      if (ch.enabled) {
        const err = validateContactUrl(ch.url);
        if (err) {
          setChannelsError(`خطأ في رابط ${ch.title || ch.name}: ${err}`);
          setSavingChannels(false);
          return;
        }
      }
    }

    try {
      const res = await api.put<{ message: string; channels: ContactChannelItem[] }>('/api/admin/contact-channels', {
        channels: contactChannels
      });
      if (res?.channels) {
        setContactChannels(res.channels);
      }
      setChannelsSaveSuccess(true);
      setTimeout(() => setChannelsSaveSuccess(false), 3500);
    } catch (err: any) {
      setChannelsError(err.message || 'فشل حفظ إعدادات قنوات التواصل');
    } finally {
      setSavingChannels(false);
    }
  };

  const handleSaveExchangeRate = async () => {
    setSavingRate(true);
    setRateSaveSuccess(false);
    try {
      const res = await api.patch('/api/admin/settings/exchange-rate', exchangeSettings);
      setRateSaveSuccess(true);
      if (res.settings) {
        setExchangeSettings(prev => ({ ...prev, ...res.settings, updated_at: new Date().toISOString() }));
      }
      setTimeout(() => setRateSaveSuccess(false), 3500);
    } catch (err: any) {
      console.error('Failed to update exchange rate', err);
      alert(err?.data?.error || err.message || 'فشل تحديث سعر الصرف.');
    } finally {
      setSavingRate(false);
    }
  };

  const handleSaveReferral = async () => {
    setSavingReferral(true);
    setReferralSaveSuccess(false);
    try {
      const res = await api.patch('/api/referral/admin/settings', referralSettings);
      setReferralSaveSuccess(true);
      if (res.settings) {
        setReferralSettings(prev => ({ ...prev, ...res.settings, updated_at: new Date().toISOString() }));
      }
      setTimeout(() => setReferralSaveSuccess(false), 3500);
    } catch (err: any) {
      console.error('Failed to update referral settings', err);
      alert(err?.data?.error || err.message || 'فشل تحديث إعدادات برنامج الإحالة.');
    } finally {
      setSavingReferral(false);
    }
  };

  const referralCopyPreview = generateReferralCopy(referralSettings);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveSuccess(false);

    try {
      await api.put('/api/admin/settings', settings);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to save settings', err);
      alert('حدث خطأ أثناء حفظ الإعدادات');
    } finally {
      setSaving(false);
    }
  };

  const formatUptime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hrs} ساعة و ${mins} دقيقة`;
  };

  if (loading) {
    return (
      <div className="admin-empty-state">
        <div className="admin-skeleton" style={{ width: '100%', height: '300px', borderRadius: '16px' }} />
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Save Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>
            إعدادات النظام والمنصة
          </h2>
          <p style={{ fontSize: '0.825rem', color: '#64748b', margin: '4px 0 0 0' }}>
            تخصيص هوية المتجر، قنوات الدعم الفني، ومراقبة حالة الخوادم
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {saveSuccess && (
            <span style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '6px', 
              color: '#065f46', 
              fontWeight: 700,
              fontSize: '0.875rem' 
            }}>
              <CheckCircle2 size={16} color="#10b981" />
              <span>تم حفظ الإعدادات بنجاح</span>
            </span>
          )}

          <button 
            type="submit" 
            disabled={saving}
            className="admin-btn admin-btn-primary"
          >
            <Save size={16} />
            <span>{saving ? 'جاري الحفظ...' : 'حفظ التعديلات'}</span>
          </button>
        </div>
      </div>

      <div className="admin-grid-2">
        {/* Store Settings Card */}
        <div className="admin-card">
          <div className="admin-card-header">
            <h3 className="admin-card-title">
              <Settings size={18} color="#f59e0b" />
              <span>بيانات المتجر والواجهة</span>
            </h3>
          </div>

          <div className="admin-card-body" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div className="admin-input-group">
              <label className="admin-label">اسم المتجر / المنصة:</label>
              <input
                type="text"
                className="admin-input"
                value={settings.storeName}
                onChange={(e) => setSettings({ ...settings, storeName: e.target.value })}
              />
            </div>

            <div className="admin-input-group">
              <label className="admin-label">العملة الافتراضية:</label>
              <input
                type="text"
                className="admin-input"
                value={settings.defaultCurrency}
                onChange={(e) => setSettings({ ...settings, defaultCurrency: e.target.value })}
              />
            </div>

            <div style={{ 
              padding: '16px', 
              background: '#f8fafc', 
              borderRadius: '12px', 
              border: '1px solid #e2e8f0',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 700, color: '#0f172a' }}>وضع الصيانة (Maintenance Mode)</div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b' }}>إيقاف استقبال طلبات الشحن مؤقتاً للعملاء</div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.maintenanceMode}
                  onChange={(e) => setSettings({ ...settings, maintenanceMode: e.target.checked })}
                  style={{ width: '20px', height: '20px', accentColor: '#f59e0b', cursor: 'pointer' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 700, color: '#0f172a' }}>التنفيذ التلقائي للطلبات عبر API</div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b' }}>إرسال الشحن فوراً للمزود عند الدفع دون مراجعة</div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.autoFulfillOrders}
                  onChange={(e) => setSettings({ ...settings, autoFulfillOrders: e.target.checked })}
                  style={{ width: '20px', height: '20px', accentColor: '#f59e0b', cursor: 'pointer' }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Support & Contacts Card */}
        <div className="admin-card">
          <div className="admin-card-header">
            <h3 className="admin-card-title">
              <Phone size={18} color="#f59e0b" />
              <span>قنوات الدعم والتواصل مع العملاء</span>
            </h3>
          </div>

          <div className="admin-card-body" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div className="admin-input-group">
              <label className="admin-label">البريد الإلكتروني للدعم الفني:</label>
              <input
                type="email"
                className="admin-input"
                value={settings.supportEmail}
                onChange={(e) => setSettings({ ...settings, supportEmail: e.target.value })}
              />
            </div>

            <div className="admin-input-group">
              <label className="admin-label">رقم الواتساب / الهاتف:</label>
              <input
                type="text"
                className="admin-input"
                value={settings.supportPhone}
                onChange={(e) => setSettings({ ...settings, supportPhone: e.target.value })}
              />
            </div>

            <div className="admin-input-group">
              <label className="admin-label">حساب التلغرام (Telegram Handle):</label>
              <input
                type="text"
                className="admin-input"
                value={settings.telegramSupport}
                onChange={(e) => setSettings({ ...settings, telegramSupport: e.target.value })}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Contact Channels Management Card (WhatsApp, Facebook, Telegram) */}
      <div className="admin-card">
        <div className="admin-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <h3 className="admin-card-title">
            <Share2 size={18} color="#25D366" />
            <span>إدارة قنوات التواصل (WhatsApp, Facebook, Telegram)</span>
          </h3>
          {channelsSaveSuccess && (
            <span style={{ fontSize: '0.8rem', color: '#10b981', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <CheckCircle2 size={16} />
              <span>تم حفظ قنوات التواصل بنجاح</span>
            </span>
          )}
        </div>

        <div className="admin-card-body" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <p style={{ margin: 0, fontSize: '0.875rem', color: '#64748b', lineHeight: 1.6 }}>
            تحكم في قنوات التواصل المعتمدة للمتجر: يمكنك تفعيل أو تعطيل أي قناة، وتعديل الرابط، وترتيب ظهورها للعملاء في صفحة الصيانة، بالإضافة إلى تفعيل زر الواتساب العائم في الوضع الطبيعي.
          </p>

          {channelsError && (
            <div style={{ background: '#fef2f2', border: '1px solid #f87171', color: '#b91c1c', padding: '10px 14px', borderRadius: '10px', fontSize: '0.85rem' }}>
              {channelsError}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {contactChannels.map((channel, idx) => {
              const isWhatsapp = channel.id === 'whatsapp';
              const isFacebook = channel.id === 'facebook';

              const themeColor = isWhatsapp ? '#25D366' : isFacebook ? '#1877F2' : '#38BDF8';
              const platformIcon = isWhatsapp ? '💬' : isFacebook ? '📘' : '✈️';

              return (
                <div
                  key={channel.id}
                  style={{
                    padding: '16px',
                    borderRadius: '14px',
                    border: `1.5px solid ${channel.enabled ? themeColor : '#e2e8f0'}`,
                    background: channel.enabled ? `${themeColor}0A` : '#f8fafc',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '1.4rem' }}>{platformIcon}</span>
                      <div>
                        <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '1rem' }}>
                          {channel.title || channel.name} ({channel.id.toUpperCase()})
                        </span>
                        <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                          {isWhatsapp ? 'القناة الأساسية للزر العائم في الوضع الطبيعي' : 'تظهر كبطاقة تواصل في صفحة الصيانة عند التفعيل'}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', color: channel.enabled ? '#059669' : '#64748b' }}>
                        <span>{channel.enabled ? 'مفعّلة (ON)' : 'معطّلة (OFF)'}</span>
                        <input
                          type="checkbox"
                          checked={channel.enabled}
                          onChange={(e) => {
                            const updated = [...contactChannels];
                            updated[idx].enabled = e.target.checked;
                            setContactChannels(updated);
                          }}
                          style={{ width: '20px', height: '20px', accentColor: themeColor, cursor: 'pointer' }}
                        />
                      </label>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                    <div className="admin-input-group" style={{ gridColumn: '1 / -1' }}>
                      <label className="admin-label">رابط القناة الرسمي (URL):</label>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input
                          type="url"
                          className="admin-input"
                          dir="ltr"
                          placeholder={isWhatsapp ? 'https://wa.me/249...' : isFacebook ? 'https://facebook.com/...' : 'https://t.me/...'}
                          value={channel.url}
                          onChange={(e) => {
                            const updated = [...contactChannels];
                            updated[idx].url = e.target.value;
                            setContactChannels(updated);
                          }}
                        />
                        {channel.url && (
                          <a
                            href={channel.url.startsWith('http') ? channel.url : `https://${channel.url}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-secondary btn-sm"
                            style={{ whiteSpace: 'nowrap', padding: '8px 12px', textDecoration: 'none' }}
                          >
                            تجربة الرابط 🔗
                          </a>
                        )}
                      </div>
                    </div>

                    <div className="admin-input-group">
                      <label className="admin-label">اسم القناة الظاهر للمستخدم:</label>
                      <input
                        type="text"
                        className="admin-input"
                        value={channel.title}
                        onChange={(e) => {
                          const updated = [...contactChannels];
                          updated[idx].title = e.target.value;
                          setContactChannels(updated);
                        }}
                      />
                    </div>

                    <div className="admin-input-group">
                      <label className="admin-label">الوصف الفرعي (Subtitle):</label>
                      <input
                        type="text"
                        className="admin-input"
                        value={channel.subtitle}
                        onChange={(e) => {
                          const updated = [...contactChannels];
                          updated[idx].subtitle = e.target.value;
                          setContactChannels(updated);
                        }}
                      />
                    </div>

                    <div className="admin-input-group" style={{ maxWidth: '140px' }}>
                      <label className="admin-label">ترتيب الظهور:</label>
                      <input
                        type="number"
                        className="admin-input"
                        min={1}
                        max={10}
                        value={channel.order}
                        onChange={(e) => {
                          const updated = [...contactChannels];
                          updated[idx].order = Number(e.target.value) || 1;
                          setContactChannels(updated);
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSaveContactChannels}
              disabled={savingChannels}
              style={{ minWidth: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              <Save size={16} />
              <span>{savingChannels ? 'جاري الحفظ...' : 'حفظ قنوات التواصل'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Central Exchange Rate & Payment Architecture Card */}
      <div className="admin-card">
        <div className="admin-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <h3 className="admin-card-title">
            <DollarSign size={18} color="#10b981" />
            <span>نظام سعر الصرف المركزي وإعدادات الشحن (Exchange Rate & Currency)</span>
          </h3>
          {exchangeSettings.updated_at && (
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
              آخر تحديث لسعر الصرف: {new Date(exchangeSettings.updated_at).toLocaleString('ar-EG')}
            </span>
          )}
        </div>

        <div className="admin-card-body" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <p style={{ margin: 0, fontSize: '0.875rem', color: '#64748b', lineHeight: 1.6 }}>
            الرصيد الأساسي لمحفظة KIROPRO هو <strong>بالدولار (USD)</strong> لتسعير الألعاب والمزودين. يتم تحويل قيمة شحن الرصيد إلى <strong>العملة المحلية (SDG)</strong> تلقائياً وفقاً لسعر الصرف المحدد هنا ويتم قفله على كل طلب شحن.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            <div className="admin-input-group">
              <label className="admin-label">العملة الأساسية للنظام (Base Currency):</label>
              <input
                type="text"
                disabled
                className="admin-input"
                value="USD ($)"
                style={{ background: '#f1f5f9', cursor: 'not-allowed', fontWeight: 700 }}
              />
            </div>

            <div className="admin-input-group">
              <label className="admin-label">عملة التحويل المحلي (Quote Currency):</label>
              <input
                type="text"
                className="admin-input"
                value={exchangeSettings.quote_currency}
                onChange={(e) => setExchangeSettings({ ...exchangeSettings, quote_currency: e.target.value.toUpperCase() })}
                placeholder="SDG"
              />
            </div>

            <div className="admin-input-group">
              <label className="admin-label">سعر الصرف (1 USD = كم SDG):</label>
              <input
                type="number"
                min="1"
                step="1"
                className="admin-input"
                value={exchangeSettings.rate}
                onChange={(e) => setExchangeSettings({ ...exchangeSettings, rate: parseFloat(e.target.value) || 0 })}
                style={{ fontWeight: 800, color: '#0f172a', fontSize: '1.05rem' }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            <div className="admin-input-group">
              <label className="admin-label">الحد الأدنى للشحن في المرة الواحدة ($):</label>
              <input
                type="number"
                min="1"
                className="admin-input"
                value={exchangeSettings.min_topup}
                onChange={(e) => setExchangeSettings({ ...exchangeSettings, min_topup: parseFloat(e.target.value) || 1 })}
              />
            </div>

            <div className="admin-input-group">
              <label className="admin-label">الحد الأقصى للشحن في المرة الواحدة ($):</label>
              <input
                type="number"
                min="1"
                className="admin-input"
                value={exchangeSettings.max_topup}
                onChange={(e) => setExchangeSettings({ ...exchangeSettings, max_topup: parseFloat(e.target.value) || 500 })}
              />
            </div>

            <div style={{ 
              background: '#f8fafc', 
              border: '1px dashed #cbd5e1', 
              borderRadius: '8px', 
              padding: '12px 16px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center'
            }}>
              <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>معاينة حية لاحتساب الرصيد:</span>
              <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.95rem', marginTop: '4px' }}>
                شحن $10 = {(10 * (exchangeSettings.rate || 5000)).toLocaleString()} {exchangeSettings.quote_currency}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', alignItems: 'center' }}>
            {rateSaveSuccess && (
              <span style={{ color: '#065f46', fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircle2 size={16} color="#10b981" />
                <span>تم حفظ وتحديث سعر الصرف بنجاح</span>
              </span>
            )}
            <button
              type="button"
              onClick={handleSaveExchangeRate}
              disabled={savingRate}
              className="admin-btn admin-btn-primary admin-btn-sm"
              style={{ background: '#10b981', borderColor: '#10b981' }}
            >
              <Save size={15} />
              <span>{savingRate ? 'جاري الحفظ...' : 'تحديث سعر الصرف وحدود الشحن'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Referral & Invite Friends Management Card */}
      <div className="admin-card">
        <div className="admin-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <h3 className="admin-card-title">
            <Gift size={18} color="#f59e0b" />
            <span>برنامج الإحالة ومكافآت الأصدقاء (Referral & Invite Program)</span>
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '0.8rem', color: referralSettings.enabled ? '#10b981' : '#ef4444', fontWeight: 700 }}>
              {referralSettings.enabled ? '● البرنامج نشط ويعمل' : '○ البرنامج متوقف مؤقتاً'}
            </span>
          </div>
        </div>

        <div className="admin-card-body" style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
          <p style={{ margin: 0, fontSize: '0.875rem', color: '#64748b', lineHeight: 1.6 }}>
            تحكم في قيم المكافآت المالية الممنوحة للداعي والصديق عند التسجيل وإكمال أول طلب. يتم توليد جميع العناوين والنصوص التسويقية <strong>ديناميكياً وتلقائياً</strong> في الواجهة بناءً على هذه الإعدادات بدون أي قيم ثابتة.
          </p>

          {/* Toggle status */}
          <div style={{
            padding: '14px 18px',
            background: '#f8fafc',
            borderRadius: '10px',
            border: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div>
              <div style={{ fontWeight: 800, color: '#0f172a' }}>تفعيل برنامج الإحالة للمستخدمين</div>
              <div style={{ fontSize: '0.8rem', color: '#64748b' }}>إظهار بطاقات الدعوة وكود الإحالة للعملاء ومنح المكافآت</div>
            </div>
            <input
              type="checkbox"
              checked={referralSettings.enabled}
              onChange={(e) => setReferralSettings({ ...referralSettings, enabled: e.target.checked })}
              style={{ width: '22px', height: '22px', accentColor: '#f59e0b', cursor: 'pointer' }}
            />
          </div>

          {/* Inputs Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            <div className="admin-input-group">
              <label className="admin-label">مكافأة صاحب الدعوة (الداعي):</label>
              <input
                type="number"
                min="0"
                step="50"
                className="admin-input"
                value={referralSettings.referrer_reward}
                onChange={(e) => setReferralSettings({ ...referralSettings, referrer_reward: parseFloat(e.target.value) || 0 })}
                style={{ fontWeight: 800, color: '#0f172a', fontSize: '1.05rem' }}
              />
              <span style={{ fontSize: '0.725rem', color: '#64748b', marginTop: 4 }}>المبلغ الذي يضاف لمحفظة الداعي بعد أول طلب مؤهل</span>
            </div>

            <div className="admin-input-group">
              <label className="admin-label">مكافأة الصديق المدعو (الترحيبية):</label>
              <input
                type="number"
                min="0"
                step="50"
                className="admin-input"
                value={referralSettings.referee_reward}
                onChange={(e) => setReferralSettings({ ...referralSettings, referee_reward: parseFloat(e.target.value) || 0 })}
                style={{ fontWeight: 800, color: '#0f172a', fontSize: '1.05rem' }}
              />
              <span style={{ fontSize: '0.725rem', color: '#64748b', marginTop: 4 }}>المبلغ الذي يضاف لمحفظة الصديق فورياً عند ربط الكود</span>
            </div>

            <div className="admin-input-group">
              <label className="admin-label">عملة برنامج الإحالة:</label>
              <input
                type="text"
                className="admin-input"
                value="SDG (الجنيه السوداني)"
                readOnly
                disabled
                style={{ fontWeight: 800, background: '#f8fafc', color: '#059669', cursor: 'not-allowed' }}
              />
              <span style={{ fontSize: '0.725rem', color: '#059669', marginTop: 4, fontWeight: 600 }}>نظام الإحالة موحد بالكامل بالجنيه السوداني فقط (SDG)</span>
            </div>

            <div className="admin-input-group">
              <label className="admin-label">الحد الأدنى للطلب المؤهل:</label>
              <input
                type="number"
                min="0"
                step="500"
                className="admin-input"
                value={referralSettings.min_order_amount}
                onChange={(e) => setReferralSettings({ ...referralSettings, min_order_amount: parseFloat(e.target.value) || 0 })}
              />
              <span style={{ fontSize: '0.725rem', color: '#64748b', marginTop: 4 }}>أقل مبلغ طلب للمدعو ليتم صرف مكافأة الداعي</span>
            </div>

            <div className="admin-input-group">
              <label className="admin-label">سقف أرباح الداعي الإجمالية:</label>
              <input
                type="number"
                min="0"
                step="1000"
                className="admin-input"
                value={referralSettings.max_referrer_earnings}
                onChange={(e) => setReferralSettings({ ...referralSettings, max_referrer_earnings: parseFloat(e.target.value) || 0 })}
              />
              <span style={{ fontSize: '0.725rem', color: '#64748b', marginTop: 4 }}>أقصى مجموع أرباح يمكن للداعي تحقيقها من الإحالات</span>
            </div>
          </div>

          {/* Program Behavior & Category Rules */}
          <div style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '10px',
            padding: '14px 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.875rem' }}>
              قواعد التأهيل وتصنيفات الطلبات المحتسبة:
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: '#334155', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={referralSettings.allow_existing_users_binding}
                  onChange={(e) => setReferralSettings({ ...referralSettings, allow_existing_users_binding: e.target.checked })}
                  style={{ width: '18px', height: '18px', accentColor: '#f59e0b', cursor: 'pointer' }}
                />
                <span>السماح للمستخدمين الحاليين بربط كود إحالة</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: '#334155', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={referralSettings.first_order_only}
                  onChange={(e) => setReferralSettings({ ...referralSettings, first_order_only: e.target.checked })}
                  style={{ width: '18px', height: '18px', accentColor: '#f59e0b', cursor: 'pointer' }}
                />
                <span>مكافأة الداعي على أول طلب مؤهل فقط</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: '#334155', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={referralSettings.allow_crypto_orders}
                  onChange={(e) => setReferralSettings({ ...referralSettings, allow_crypto_orders: e.target.checked })}
                  style={{ width: '18px', height: '18px', accentColor: '#f59e0b', cursor: 'pointer' }}
                />
                <span>احتساب طلبات تحويلات USDT الرقمية</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: '#334155', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={referralSettings.allow_game_orders}
                  onChange={(e) => setReferralSettings({ ...referralSettings, allow_game_orders: e.target.checked })}
                  style={{ width: '18px', height: '18px', accentColor: '#f59e0b', cursor: 'pointer' }}
                />
                <span>احتساب طلبات شحن الألعاب</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: '#334155', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={referralSettings.allow_cards_orders}
                  onChange={(e) => setReferralSettings({ ...referralSettings, allow_cards_orders: e.target.checked })}
                  style={{ width: '18px', height: '18px', accentColor: '#f59e0b', cursor: 'pointer' }}
                />
                <span>احتساب طلبات بطاقات الهدايا الرقمية</span>
              </label>
            </div>
          </div>

          {/* Dynamic Real-time Live Preview Box */}
          <div style={{
            background: 'linear-gradient(145deg, #0B0F19 0%, #1e1b4b 100%)',
            border: '1.5px solid rgba(250, 204, 21, 0.4)',
            borderRadius: '12px',
            padding: '20px 22px',
            color: '#FFFFFF'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#FACC15', fontSize: '0.8rem', fontWeight: 800, marginBottom: 12 }}>
              <Flame size={15} color="#f97316" />
              <span>معاينة حية ومباشرة للواجهة التسويقية المعروضة للعميل (Live Dynamic Preview):</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#FFFFFF' }}>
                {referralCopyPreview.mainTitle}
              </div>
              <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#FACC15' }}>
                {referralCopyPreview.subtitle}
              </div>
              <div style={{ fontSize: '0.9rem', color: '#CBD5E1', lineHeight: 1.6, maxWidth: 680 }}>
                {referralCopyPreview.description}
              </div>
            </div>
          </div>

          {/* Platform Performance Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px 16px' }}>
              <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
                <Users size={14} color="#3b82f6" />
                إجمالي الدعوات المسجلة:
              </span>
              <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#0f172a', marginTop: 4 }}>
                {referralStats.totalInvitations}
              </div>
            </div>

            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px 16px' }}>
              <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
                <CheckCircle2 size={14} color="#10b981" />
                الإحالات المكتملة والمكافأة:
              </span>
              <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#10b981', marginTop: 4 }}>
                {referralStats.completedReferrals}
              </div>
            </div>

            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px 16px' }}>
              <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
                <Gift size={14} color="#f59e0b" />
                إجمالي المكافآت الممنوحة:
              </span>
              <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#f59e0b', marginTop: 4 }}>
                {referralStats.totalPayoutCombined.toLocaleString()} {referralSettings.currency}
              </div>
            </div>
          </div>

          {/* Action Row */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', alignItems: 'center' }}>
            {referralSaveSuccess && (
              <span style={{ color: '#065f46', fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircle2 size={16} color="#10b981" />
                <span>تم حفظ وتحديث إعدادات برنامج الإحالة بنجاح</span>
              </span>
            )}
            <button
              type="button"
              onClick={handleSaveReferral}
              disabled={savingReferral}
              className="admin-btn admin-btn-primary admin-btn-sm"
              style={{ background: '#f59e0b', borderColor: '#f59e0b', color: '#0b0f19', fontWeight: 800 }}
            >
              <Save size={15} />
              <span>{savingReferral ? 'جاري الحفظ...' : 'حفظ إعدادات برنامج الإحالة'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* System Infrastructure Card */}
      <div className="admin-card">
        <div className="admin-card-header">
          <h3 className="admin-card-title">
            <Database size={18} color="#f59e0b" />
            <span>معلومات البنية التحتية والخوادم (System Infrastructure)</span>
          </h3>
        </div>

        <div className="admin-card-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
            <div>
              <div className="admin-label">حالة قاعدة البيانات:</div>
              <div style={{ 
                fontWeight: 800, 
                color: '#10b981', 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px', 
                marginTop: '4px' 
              }}>
                <CheckCircle2 size={16} />
                <span>{system.dbStatus}</span>
              </div>
            </div>

            <div>
              <div className="admin-label">مدة عمل الخادم (Uptime):</div>
              <div style={{ fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>
                {formatUptime(system.serverUptime)}
              </div>
            </div>

            <div>
              <div className="admin-label">بيئة التشغيل (Node Engine):</div>
              <div style={{ fontWeight: 700, color: '#475569', marginTop: '4px' }}>
                {system.nodeVersion}
              </div>
            </div>

            <div>
              <div className="admin-label">إصدار النظام (Release):</div>
              <div style={{ fontWeight: 700, color: '#f59e0b', marginTop: '4px' }}>
                {system.apiVersion} (Production Ready)
              </div>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
};
