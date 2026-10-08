import React, { useEffect, useState } from 'react';
import { 
  Cpu, 
  RefreshCw, 
  CheckCircle2, 
  XCircle,
  Zap,
  X,
  Layers,
  ShieldCheck,
  Gamepad2,
  Power
} from 'lucide-react';
import { api } from '../../lib/api';
import { 
  triggerGamesDropCatalogSync, 
  GamesDropCatalogSyncResult,
  triggerG2BulkCatalogSync,
  G2BulkCatalogSyncResult,
  testG2BulkConnection,
  updateProviderSettings
} from '../../services/api';

interface ProviderInfo {
  id: string;
  provider?: string;
  name: string;
  region: string;
  status: 'ONLINE' | 'OFFLINE';
  connection?: {
    status: 'ONLINE' | 'OFFLINE';
    latency: string;
    latencyMs?: number;
  };
  orders?: {
    enabled: boolean;
  };
  ordersEnabled?: boolean;
  catalog_sync?: {
    enabled: boolean;
  };
  catalogSyncEnabled?: boolean;
  latency: string;
  productsConnected: number;
  lastCheck: string;
  balance?: number;
  draftBalance?: number;
  currency?: string;
  balanceProfile?: string;
  isPostpaid?: boolean;
  partnerId?: number;
  shopId?: number;
  shopName?: string;
  username?: string;
  error?: string;
}

export const AdminProviders: React.FC = () => {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [testingProviderId, setTestingProviderId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // GamesDrop Sync Modal
  const [gdSyncing, setGdSyncing] = useState(false);
  const [gdSyncModalOpen, setGdSyncModalOpen] = useState(false);
  const [gdSyncStats, setGdSyncStats] = useState<GamesDropCatalogSyncResult['stats'] | null>(null);

  // G2Bulk Sync Modal
  const [g2Syncing, setG2Syncing] = useState(false);
  const [g2SyncModalOpen, setG2SyncModalOpen] = useState(false);
  const [g2SyncStats, setG2SyncStats] = useState<G2BulkCatalogSyncResult['stats'] | null>(null);

  // Toggle Orders Receiving State
  const [togglingProviderId, setTogglingProviderId] = useState<string | null>(null);

  const handleToggleOrdersEnabled = async (providerId: string, currentEnabled: boolean) => {
    setTogglingProviderId(providerId);
    setTestResult(null);
    try {
      const nextState = !currentEnabled;
      await updateProviderSettings(providerId, { orders_enabled: nextState });
      setTestResult({
        success: true,
        message: `✓ تم ${nextState ? 'تفعيل' : 'تعطيل'} استقبال الطلبات لمزود (${providerId.toUpperCase()}) بنجاح.`
      });
      await fetchProviders();
    } catch (err: any) {
      setTestResult({
        success: false,
        message: `✕ فشل تعديل حالة استقبال الطلبات: ${err?.response?.data?.error || err.message}`
      });
    } finally {
      setTogglingProviderId(null);
    }
  };

  const fetchProviders = async () => {
    try {
      const data = await api.get('/api/admin/providers');
      setProviders(data);
    } catch (err) {
      console.error('Failed to load providers', err);
    } finally {
      setLoading(false);
      setTestingProviderId(null);
    }
  };

  useEffect(() => {
    fetchProviders();
  }, []);

  const handleTestConnection = async (providerId: string) => {
    setTestingProviderId(providerId);
    setTestResult(null);
    try {
      if (providerId === 'g2bulk') {
        const res = await testG2BulkConnection();
        setTestResult({
          success: true,
          message: `✓ اتصال G2Bulk ناجح (زمن الاستجابة: ${res.latency}) - المستخدم: ${res.username} - الرصيد: $${res.balance}`
        });
      } else {
        const res = await api.post('/api/admin/providers/gamesdrop/test-connection', {});
        setTestResult({
          success: true,
          message: `✓ اتصال GamesDrop ناجح (زمن الاستجابة: ${res.latency}) - الرصيد: $${res.balance}`
        });
      }
      fetchProviders();
    } catch (err: any) {
      setTestResult({
        success: false,
        message: `✕ فشل اختبار الاتصال (${providerId}): ${err?.response?.data?.error || err.message}`
      });
      fetchProviders();
    } finally {
      setTestingProviderId(null);
    }
  };

  const handleGamesDropCatalogSync = async () => {
    setGdSyncing(true);
    try {
      const res = await triggerGamesDropCatalogSync();
      setGdSyncStats(res.stats);
      setGdSyncModalOpen(true);
      fetchProviders();
    } catch (err: any) {
      setTestResult({
        success: false,
        message: `✕ فشلت مزامنة كتالوج GamesDrop: ${err?.message || 'خطأ غير معروف'}`
      });
    } finally {
      setGdSyncing(false);
    }
  };

  const handleG2BulkCatalogSync = async () => {
    setG2Syncing(true);
    try {
      const res = await triggerG2BulkCatalogSync(['pubgm', 'freefire_me']);
      setG2SyncStats(res.stats);
      setG2SyncModalOpen(true);
      fetchProviders();
    } catch (err: any) {
      setTestResult({
        success: false,
        message: `✕ فشلت مزامنة ألعاب G2Bulk: ${err?.message || 'خطأ غير معروف'}`
      });
    } finally {
      setG2Syncing(false);
    }
  };

  if (loading && providers.length === 0) {
    return (
      <div style={{ padding: '60px 20px', textAlign: 'center', color: '#64748b' }}>
        <RefreshCw size={28} className="animate-spin" style={{ margin: '0 auto 12px', color: '#f59e0b' }} />
        <p style={{ fontWeight: 700, fontSize: '1rem' }}>جاري فحص الاتصال وقراءة بيانات المزودين (GamesDrop & G2Bulk)...</p>
      </div>
    );
  }

  return (
    <>
      {/* Header Info */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>
            بوابات ومزودو الخدمة (GamesDrop & G2Bulk)
          </h2>
          <p style={{ fontSize: '0.825rem', color: '#64748b', margin: '4px 0 0 0' }}>
            إدارة الربط المباشر مع مزودي الخدمة B2B، فحص الأرصدة المتوفرة، والتحقق من صحة الاتصال والتنفيذ
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button 
            onClick={() => fetchProviders()}
            disabled={loading}
            className="admin-btn admin-btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            <span>تحديث الحالة</span>
          </button>
        </div>
      </div>

      {/* Test Result Toast Banner */}
      {testResult && (
        <div style={{
          padding: '12px 18px',
          borderRadius: '10px',
          background: testResult.success ? '#ecfdf5' : '#fef2f2',
          border: `1px solid ${testResult.success ? '#a7f3d0' : '#fecaca'}`,
          color: testResult.success ? '#065f46' : '#991b1b',
          fontSize: '0.875rem',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          {testResult.success ? <CheckCircle2 size={18} color="#10b981" /> : <XCircle size={18} color="#ef4444" />}
          <span>{testResult.message}</span>
        </div>
      )}

      {/* Multi-Provider Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '20px' }}>
        {providers.map((p) => {
          const isG2Bulk = p.id === 'g2bulk';
          const isTestingThis = testingProviderId === p.id;
          const isOrdersEnabled = Boolean(p.ordersEnabled ?? p.orders?.enabled);

          return (
            <div key={p.id} className="admin-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div className="admin-card-header" style={{ alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ 
                      width: '44px', 
                      height: '44px', 
                      borderRadius: '12px', 
                      background: isG2Bulk ? '#0284c7' : '#0B0F19',
                      border: isG2Bulk ? '1.5px solid #38bdf8' : '1.5px solid var(--accent-yellow)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: isG2Bulk ? '#ffffff' : 'var(--accent-yellow)'
                    }}>
                      {isG2Bulk ? <Gamepad2 size={24} /> : <Zap size={24} />}
                    </div>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900, color: '#0f172a' }}>
                        {p.name}
                      </h4>
                      <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                        {p.region} • {isG2Bulk ? `حساب: ${p.shopName || 'G2Bulk'}` : `متجر: ${p.shopName || 'KIROPRO'} (ID: ${p.shopId || 70})`}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {/* Connection Status Badge */}
                    <span style={{ 
                      display: 'inline-flex', 
                      alignItems: 'center', 
                      gap: '6px', 
                      padding: '4px 10px', 
                      borderRadius: '8px', 
                      fontWeight: 800, 
                      fontSize: '0.75rem',
                      background: p.status === 'ONLINE' ? '#ecfdf5' : '#fef2f2',
                      color: p.status === 'ONLINE' ? '#059669' : '#dc2626',
                      border: `1px solid ${p.status === 'ONLINE' ? '#a7f3d0' : '#fca5a5'}`
                    }}>
                      <span style={{ 
                        width: '7px', 
                        height: '7px', 
                        borderRadius: '50%', 
                        background: p.status === 'ONLINE' ? '#10b981' : '#ef4444' 
                      }} />
                      الاتصال: {p.status === 'ONLINE' ? 'متصل (Online)' : 'غير متصل (Offline)'}
                    </span>

                    {/* Orders Status Badge */}
                    <span style={{ 
                      display: 'inline-flex', 
                      alignItems: 'center', 
                      gap: '6px', 
                      padding: '4px 10px', 
                      borderRadius: '8px', 
                      fontWeight: 800, 
                      fontSize: '0.75rem',
                      background: isOrdersEnabled ? '#eff6ff' : '#fef3c7',
                      color: isOrdersEnabled ? '#1d4ed8' : '#b45309',
                      border: `1px solid ${isOrdersEnabled ? '#bfdbfe' : '#fde68a'}`
                    }}>
                      <span style={{ 
                        width: '7px', 
                        height: '7px', 
                        borderRadius: '50%', 
                        background: isOrdersEnabled ? '#2563eb' : '#d97706' 
                      }} />
                      الطلبات: {isOrdersEnabled ? 'مفعّلة (ON)' : 'معطّلة (OFF)'}
                    </span>
                  </div>
                </div>

                <div className="admin-card-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {/* Partner Balance Highlight Box */}
                  <div style={{ 
                    background: isG2Bulk 
                      ? 'linear-gradient(135deg, #0f172a 0%, #0369a1 100%)' 
                      : 'linear-gradient(135deg, #0B0F19 0%, #1e293b 100%)', 
                    borderRadius: '12px', 
                    padding: '16px 20px', 
                    color: '#fff',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                    gap: '16px'
                  }}>
                    <div>
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', fontWeight: 600 }}>
                        رصيد المزود المتوفر:
                      </span>
                      <span style={{ fontSize: '1.6rem', fontWeight: 900, color: '#facc15', direction: 'ltr', display: 'inline-block' }}>
                        ${Number(p.balance || 0).toFixed(2)} {p.currency || 'USD'}
                      </span>
                    </div>

                    {!isG2Bulk && (
                      <div>
                        <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', fontWeight: 600 }}>
                          الرصيد المحجوز (Draft):
                        </span>
                        <span style={{ fontSize: '1.2rem', fontWeight: 800, color: '#e2e8f0', direction: 'ltr', display: 'inline-block' }}>
                          ${Number(p.draftBalance || 0).toFixed(2)}
                        </span>
                      </div>
                    )}

                    <div>
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', fontWeight: 600 }}>
                        الباقات والمنتجات المرتبطة:
                      </span>
                      <span style={{ fontSize: '1.2rem', fontWeight: 800, color: '#38bdf8', display: 'inline-block' }}>
                        {p.productsConnected} منتج
                      </span>
                    </div>

                    <div>
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', fontWeight: 600 }}>
                        نوع الحساب:
                      </span>
                      <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#a7f3d0' }}>
                        {p.isPostpaid ? 'آجل الدفع (Postpaid)' : 'مسبق الدفع (Prepaid)'}
                      </span>
                    </div>
                  </div>

                  {/* Status Grid Details */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
                    <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <span style={{ color: '#64748b', fontSize: '0.75rem', display: 'block' }}>استقبال الطلبات (Orders):</span>
                      <span style={{ fontWeight: 800, color: isOrdersEnabled ? '#16a34a' : '#d97706', fontSize: '0.95rem' }}>
                        {isOrdersEnabled ? 'مفعّل (ENABLED)' : 'معطّل (DISABLED)'}
                      </span>
                    </div>

                    <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <span style={{ color: '#64748b', fontSize: '0.75rem', display: 'block' }}>زمن الاستجابة (Latency):</span>
                      <span style={{ fontWeight: 800, color: '#10b981', fontSize: '0.95rem' }}>{p.latency}</span>
                    </div>

                    <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <span style={{ color: '#64748b', fontSize: '0.75rem', display: 'block' }}>طريقة التحقق من اللاعب:</span>
                      <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.85rem' }}>
                        {isG2Bulk ? 'checkPlayerId API' : 'check-game-data API'}
                      </span>
                    </div>

                    <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <span style={{ color: '#64748b', fontSize: '0.75rem', display: 'block' }}>آخر فحص اتصال:</span>
                      <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 700 }}>
                        {p.lastCheck ? new Date(p.lastCheck).toLocaleTimeString('ar-EG') : 'الآن'}
                      </span>
                    </div>
                  </div>

                  {p.error && (
                    <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', color: '#991b1b', fontSize: '0.8rem' }}>
                      <strong>خطأ الاتصال بالمزود:</strong> {p.error}
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons Footer */}
              <div style={{ 
                padding: '16px 20px', 
                borderTop: '1px solid #f1f5f9', 
                background: '#f8fafc',
                display: 'flex', 
                gap: '10px', 
                flexWrap: 'wrap' 
              }}>
                <button
                  onClick={() => handleToggleOrdersEnabled(p.id, isOrdersEnabled)}
                  disabled={togglingProviderId === p.id}
                  className="admin-btn"
                  style={{ 
                    flex: 1.2, 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    gap: '6px', 
                    fontWeight: 800,
                    background: isOrdersEnabled ? '#fff1f2' : '#f0fdf4',
                    color: isOrdersEnabled ? '#e11d48' : '#16a34a',
                    border: `1.5px solid ${isOrdersEnabled ? '#fecdd3' : '#bbf7d0'}`
                  }}
                >
                  <Power size={15} />
                  <span>
                    {togglingProviderId === p.id 
                      ? 'جارٍ التحديث...' 
                      : isOrdersEnabled 
                        ? 'تعطيل استقبال الطلبات' 
                        : 'تفعيل استقبال الطلبات'}
                  </span>
                </button>

                <button
                  onClick={() => handleTestConnection(p.id)}
                  disabled={isTestingThis}
                  className="admin-btn admin-btn-secondary"
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontWeight: 700 }}
                >
                  <RefreshCw size={15} className={isTestingThis ? 'animate-spin' : ''} />
                  <span>{isTestingThis ? 'جارٍ الفحص...' : 'فحص الاتصال (Test)'}</span>
                </button>

                {isG2Bulk ? (
                  <button
                    onClick={handleG2BulkCatalogSync}
                    disabled={g2Syncing}
                    className="admin-btn admin-btn-primary"
                    style={{ flex: 1.1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontWeight: 800, background: '#0284c7' }}
                  >
                    <RefreshCw size={15} className={g2Syncing ? 'animate-spin' : ''} />
                    <span>{g2Syncing ? 'جارٍ المزامنة...' : 'مزامنة ألعاب G2Bulk'}</span>
                  </button>
                ) : (
                  <button
                    onClick={handleGamesDropCatalogSync}
                    disabled={gdSyncing}
                    className="admin-btn admin-btn-primary"
                    style={{ flex: 1.1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontWeight: 800 }}
                  >
                    <RefreshCw size={15} className={gdSyncing ? 'animate-spin' : ''} />
                    <span>{gdSyncing ? 'جارٍ المزامنة...' : 'مزامنة كتالوج GamesDrop'}</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Integration Guide Box */}
      <div className="admin-card" style={{ marginTop: '20px' }}>
        <div className="admin-card-header">
          <h3 className="admin-card-title">
            <Cpu size={18} color="#f59e0b" />
            <span>نظام المزودين المزدوج (GamesDrop + G2Bulk Multi-Provider Routing)</span>
          </h3>
        </div>
        <div className="admin-card-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
            <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ShieldCheck size={16} color="#059669" />
                <span>حماية الشحن المزدوج (Double Fulfillment Prevention)</span>
              </div>
              <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b', lineHeight: 1.6 }}>
                في حال حدوث انقطاع في الشبكة أو تأخر الاستجابة (Timeout)، ينتقل الطلب داخلياً إلى حالة <code>PROVIDER_UNKNOWN</code> فوراً ولا يتم التبديل الاحتياطي التلقائي منعاً لازدواجية الشحن.
              </p>
            </div>

            <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Layers size={16} color="#0284c7" />
                <span>المتابعة التلقائية في الخلفية (Background Polling)</span>
              </div>
              <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b', lineHeight: 1.6 }}>
                السيرفر الخلفي يقوم بمتابعة وفحص الطلبات قيد المعالجة تلقائياً كل <strong>7 ثوانٍ</strong> لكلا المزودين حتى الوصول للحالة النهائية وتسليم المفتاح أو إشعار العميل.
              </p>
            </div>

            <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Zap size={16} color="#d97706" />
                <span>عزل الأسعار وسرية المزود (Merchant Privacy & Independent Pricing)</span>
              </div>
              <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b', lineHeight: 1.6 }}>
                تكلفة الشراء من المزودين مستقلة تماماً عن أسعار بيع العملاء والتجار. تفاصيل المزودين مخفية تماماً عن واجهات الشركاء والمتجر ولا تظهر إلا للأدمن.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* GamesDrop Catalog Sync Results Modal */}
      {gdSyncModalOpen && gdSyncStats && (
        <div className="admin-modal-backdrop" onClick={() => setGdSyncModalOpen(false)}>
          <div className="admin-modal" style={{ maxWidth: '620px' }} onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3 className="admin-modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <RefreshCw size={20} color="#10b981" />
                <span>تقرير نتائج مزامنة الكتالوج (GamesDrop Live Sync)</span>
              </h3>
              <button 
                type="button" 
                className="admin-modal-close" 
                onClick={() => setGdSyncModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="admin-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ fontSize: '0.88rem', color: '#475569', lineHeight: 1.6 }}>
                تم الاتصال المباشر مع <strong>GamesDrop Partner API</strong> وسحب كافة عروض المنتجات المستهدفة وتحديث تكاليفها الحالية في قاعدة بيانات KIROPRO بنجاح.
              </div>

              {/* 5 Stats Cards Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700, marginBottom: '4px' }}>العروض المفحوصة</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#0f172a' }}>{gdSyncStats.productsChecked}</div>
                </div>

                <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.75rem', color: '#065f46', fontWeight: 700, marginBottom: '4px' }}>عروض جديدة مضافة</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#059669' }}>+{gdSyncStats.newOffers}</div>
                </div>

                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.75rem', color: '#1e40af', fontWeight: 700, marginBottom: '4px' }}>عروض تم تحديثها</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#2563eb' }}>{gdSyncStats.updatedOffers}</div>
                </div>

                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.75rem', color: '#92400e', fontWeight: 700, marginBottom: '4px' }}>تغيرات في الأسعار</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#d97706' }}>{gdSyncStats.priceChanges}</div>
                </div>

                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.75rem', color: '#991b1b', fontWeight: 700, marginBottom: '4px' }}>عروض نفدت (Out of Stock)</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#dc2626' }}>{gdSyncStats.outOfStock}</div>
                </div>
              </div>

              {/* Category Breakdown */}
              {gdSyncStats.details && (
                <div style={{ background: '#f1f5f9', borderRadius: '10px', padding: '12px 16px', fontSize: '0.85rem' }}>
                  <div style={{ fontWeight: 800, color: '#1e293b', marginBottom: '8px' }}>تفاصيل الفئات المستهدفة:</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                    <span>💎 Likee: <strong>{gdSyncStats.details.likeeOffers} عرض</strong></span>
                    <span>⭐ Telegram Stars: <strong>{gdSyncStats.details.telegramStarsOffers} عرض</strong></span>
                    <span>👑 Telegram Premium: <strong>{gdSyncStats.details.telegramPremiumOffers} عرض</strong></span>
                  </div>
                </div>
              )}

              <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                وقت المزامنة: {new Date(gdSyncStats.lastSyncTime).toLocaleString('ar-EG')}
              </div>

              <div className="admin-modal-footer" style={{ marginTop: '8px', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="admin-btn admin-btn-primary"
                  onClick={() => setGdSyncModalOpen(false)}
                >
                  إغلاق
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* G2Bulk Catalog Sync Results Modal */}
      {g2SyncModalOpen && g2SyncStats && (
        <div className="admin-modal-backdrop" onClick={() => setG2SyncModalOpen(false)}>
          <div className="admin-modal" style={{ maxWidth: '620px' }} onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3 className="admin-modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Gamepad2 size={20} color="#0284c7" />
                <span>تقرير نتائج مزامنة G2Bulk (PUBG & Free Fire Live Sync)</span>
              </h3>
              <button 
                type="button" 
                className="admin-modal-close" 
                onClick={() => setG2SyncModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="admin-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ fontSize: '0.88rem', color: '#475569', lineHeight: 1.6 }}>
                تم الاتصال المباشر مع <strong>G2Bulk API</strong> وفحص كتالوج باقات <strong>PUBG Mobile</strong> و <strong>Free Fire</strong> وربط التكاليف التلقائية في جدول مزودي الخدمة بأمان تام.
              </div>

              {/* 5 Stats Cards Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700, marginBottom: '4px' }}>الألعاب المفحوصة</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#0f172a' }}>{g2SyncStats.gamesChecked}</div>
                </div>

                <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.75rem', color: '#0369a1', fontWeight: 700, marginBottom: '4px' }}>الباقات المتاحة بالمزود</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#0284c7' }}>{g2SyncStats.cataloguesChecked}</div>
                </div>

                <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.75rem', color: '#065f46', fontWeight: 700, marginBottom: '4px' }}>ربط جديد لباقات المنصة</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#059669' }}>+{g2SyncStats.newMappings}</div>
                </div>

                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.75rem', color: '#1e40af', fontWeight: 700, marginBottom: '4px' }}>تحديثات التكلفة</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#2563eb' }}>{g2SyncStats.updatedMappings}</div>
                </div>

                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.75rem', color: '#92400e', fontWeight: 700, marginBottom: '4px' }}>تغيرات في الأسعار</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#d97706' }}>{g2SyncStats.priceChanges}</div>
                </div>
              </div>

              <div style={{ background: '#ecfdf5', padding: '12px 14px', borderRadius: '8px', border: '1px solid #a7f3d0', fontSize: '0.82rem', color: '#065f46', lineHeight: 1.5 }}>
                🔒 <strong>حماية التسعير:</strong> تمت مزامنة تكلفة G2Bulk الداخلية فقط دون التأثير إطلاقاً على أسعار البيع للعملاء أو أسعار الشركاء.
              </div>

              <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                وقت المزامنة: {new Date(g2SyncStats.lastSyncTime).toLocaleString('ar-EG')}
              </div>

              <div className="admin-modal-footer" style={{ marginTop: '8px', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="admin-btn admin-btn-primary"
                  onClick={() => setG2SyncModalOpen(false)}
                >
                  إغلاق
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
