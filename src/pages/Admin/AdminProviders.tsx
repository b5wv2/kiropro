import React, { useEffect, useState } from 'react';
import { 
  Cpu, 
  RefreshCw, 
  CheckCircle2, 
  XCircle,
  Zap
} from 'lucide-react';
import { api } from '../../lib/api';

interface ProviderInfo {
  id: string;
  name: string;
  region: string;
  status: 'ONLINE' | 'OFFLINE';
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
  activeTestOffer?: number;
  error?: string;
}

export const AdminProviders: React.FC = () => {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const fetchProviders = async () => {
    try {
      const data = await api.get('/api/admin/providers');
      setProviders(data);
    } catch (err) {
      console.error('Failed to load providers', err);
    } finally {
      setLoading(false);
      setTestingConnection(false);
    }
  };

  useEffect(() => {
    fetchProviders();
  }, []);

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setTestResult(null);
    try {
      const res = await api.post('/api/admin/providers/gamesdrop/test-connection', {});
      setTestResult({
        success: true,
        message: `✓ ${res.message || 'الاتصال ناجح'} (زمن الاستجابة: ${res.latency}) - الرصيد: $${res.balance}`
      });
      fetchProviders();
    } catch (err: any) {
      setTestResult({
        success: false,
        message: `✕ فشل اختبار الاتصال: ${err?.response?.data?.error || err.message}`
      });
      fetchProviders();
    } finally {
      setTestingConnection(false);
    }
  };

  if (loading && providers.length === 0) {
    return (
      <div style={{ padding: '60px 20px', textAlign: 'center', color: '#64748b' }}>
        <RefreshCw size={28} className="animate-spin" style={{ margin: '0 auto 12px', color: '#f59e0b' }} />
        <p style={{ fontWeight: 700, fontSize: '1rem' }}>جاري فحص الاتصال وقراءة بيانات الرصيد من GamesDrop Partner API...</p>
      </div>
    );
  }

  return (
    <>
      {/* Header Info */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>
            بوابات ومزودو الخدمة (GamesDrop Partner API)
          </h2>
          <p style={{ fontSize: '0.825rem', color: '#64748b', margin: '4px 0 0 0' }}>
            إدارة الربط المباشر مع شبكة GamesDrop، الرصيد B2B، وصحة الاتصال والتنفيذ
          </p>
        </div>

        <button 
          onClick={handleTestConnection}
          disabled={testingConnection}
          className="admin-btn admin-btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800 }}
        >
          <RefreshCw size={16} className={testingConnection ? 'animate-spin' : ''} />
          <span>{testingConnection ? 'جاري فحص الاتصال...' : 'اختبار الاتصال (Test Connection)'}</span>
        </button>
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

      {/* Provider Cards */}
      <div className="admin-grid-3">
        {providers.map((p) => (
          <div key={p.id} className="admin-card" style={{ gridColumn: 'span 2' }}>
            <div className="admin-card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ 
                  width: '44px', 
                  height: '44px', 
                  borderRadius: '12px', 
                  background: '#0B0F19',
                  border: '1.5px solid var(--accent-yellow)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--accent-yellow)'
                }}>
                  <Zap size={24} />
                </div>
                <div>
                  <h4 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900, color: '#0f172a' }}>
                    {p.name}
                  </h4>
                  <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                    {p.region} • متجر: {p.shopName || 'KIROPRO Store'} (Shop ID: {p.shopId || 70})
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ 
                  display: 'inline-flex', 
                  alignItems: 'center', 
                  gap: '6px',
                  padding: '4px 12px', 
                  borderRadius: '12px', 
                  fontWeight: 800, 
                  fontSize: '0.8rem',
                  background: p.status === 'ONLINE' ? '#ecfdf5' : '#fef2f2',
                  color: p.status === 'ONLINE' ? '#059669' : '#dc2626',
                  border: `1px solid ${p.status === 'ONLINE' ? '#a7f3d0' : '#fca5a5'}`
                }}>
                  <span style={{ 
                    width: '8px', 
                    height: '8px', 
                    borderRadius: '50%', 
                    background: p.status === 'ONLINE' ? '#10b981' : '#ef4444' 
                  }} />
                  {p.status === 'ONLINE' ? 'متصل (Connected)' : 'فشل الاتصال (Failed)'}
                </span>
              </div>
            </div>

            <div className="admin-card-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Partner Balance Highlight Box */}
              <div style={{ 
                background: 'linear-gradient(135deg, #0B0F19 0%, #1e293b 100%)', 
                borderRadius: '12px', 
                padding: '16px 20px', 
                color: '#fff',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: '16px'
              }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', fontWeight: 600 }}>
                    رصيد المزود المتوفر (Available Balance):
                  </span>
                  <span style={{ fontSize: '1.6rem', fontWeight: 900, color: '#facc15', direction: 'ltr', display: 'inline-block' }}>
                    ${Number(p.balance || 0).toFixed(2)} {p.currency || 'USD'}
                  </span>
                </div>

                <div>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', fontWeight: 600 }}>
                    الرصيد المحجوز (Draft Balance):
                  </span>
                  <span style={{ fontSize: '1.2rem', fontWeight: 800, color: '#e2e8f0', direction: 'ltr', display: 'inline-block' }}>
                    ${Number(p.draftBalance || 0).toFixed(2)}
                  </span>
                </div>

                <div>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', fontWeight: 600 }}>
                    بروفايل الرصيد (Balance Profile):
                  </span>
                  <span style={{ 
                    fontSize: '0.85rem', 
                    fontWeight: 800, 
                    color: '#38bdf8',
                    background: 'rgba(56, 189, 248, 0.15)',
                    padding: '3px 10px',
                    borderRadius: '6px',
                    display: 'inline-block',
                    marginTop: '4px'
                  }}>
                    {p.balanceProfile || 'MIXED'}
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
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <span style={{ color: '#64748b', fontSize: '0.775rem', display: 'block' }}>زمن الاستجابة (Latency):</span>
                  <span style={{ fontWeight: 800, color: '#10b981', fontSize: '0.95rem' }}>{p.latency}</span>
                </div>

                <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <span style={{ color: '#64748b', fontSize: '0.775rem', display: 'block' }}>المنتجات النشطة حالياً:</span>
                  <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.95rem' }}>
                    Offer 999 (Steam US - Test Mode)
                  </span>
                </div>

                <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <span style={{ color: '#64748b', fontSize: '0.775rem', display: 'block' }}>معرّف الشريك (Partner ID):</span>
                  <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.95rem' }}>#{p.partnerId || 207}</span>
                </div>

                <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <span style={{ color: '#64748b', fontSize: '0.775rem', display: 'block' }}>آخر فحص واختبار اتصال:</span>
                  <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 700 }}>
                    {p.lastCheck ? new Date(p.lastCheck).toLocaleTimeString('ar-EG') : 'الآن'}
                  </span>
                </div>
              </div>

              {p.error && (
                <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', color: '#991b1b', fontSize: '0.8rem' }}>
                  <strong>خطأ المزود:</strong> {p.error}
                </div>
              )}

              <div style={{ 
                padding: '12px 14px', 
                background: '#eff6ff', 
                borderRadius: '8px', 
                border: '1px solid #bfdbfe',
                fontSize: '0.8rem',
                color: '#1e40af',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <CheckCircle2 size={18} color="#3b82f6" />
                <span>
                  نظام التتبع التلقائي يفحص الطلبات قيد المعالجة كل <strong>7 ثوانٍ</strong> من خلال السيرفر الخلفي بدون استخدام Webhook.
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Integration Guide Box */}
      <div className="admin-card">
        <div className="admin-card-header">
          <h3 className="admin-card-title">
            <Cpu size={18} color="#f59e0b" />
            <span>قواعد مرحلة الاختبار والتنفيذ (GamesDrop Test Rules)</span>
          </h3>
        </div>
        <div className="admin-card-body">
          <ul style={{ margin: 0, paddingRight: '20px', fontSize: '0.875rem', color: '#475569', lineHeight: 1.8 }}>
            <li><strong>المنتج المتاح للاختبار:</strong> Test Offer ID 999 (Steam US - TEST OFFER GROUP). جميع المنتجات الوهمية تم حذفها من المتجر.</li>
            <li><strong>تسعير فوري (Dynamic Pricing):</strong> يتم استدعاء <code>POST /api/v1/offers/find-one</code> للحصول على السعر المحدث لحظياً قبل إنشاء أي طلب تجريبي.</li>
            <li><strong>نظام المتابعة (Polling):</strong> يتم فحص حالة الطلب عبر <code>POST /api/v1/offers/order-status</code> كل 7 ثوانٍ على مستوى السيرفر بشكل آمن وبدون تكرار.</li>
            <li><strong>تسليم المفتاح (Key Delivery):</strong> عند وصول الحالة إلى <code>COMPLETED</code> يتم حفظ مفتاح التفعيل وعرضه فوراً في صفحة حساب العميل مع زر نسخ.</li>
          </ul>
        </div>
      </div>
    </>
  );
};
