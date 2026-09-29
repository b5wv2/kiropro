import React, { useEffect, useState } from 'react';
import { usePartner } from '../../context/PartnerContext';
import { 
  Wallet, 
  UploadCloud, 
  Copy, 
  Check, 
  Eye, 
  RefreshCw,
  Info,
  Building
} from 'lucide-react';
import { BASE_URL } from '../../lib/api';

interface PaymentMethod {
  id: string;
  name: string;
  accountNumber?: string;
  accountName?: string;
  instructions?: string;
}

interface DepositRecord {
  id: string;
  amountUsd: number;
  exchangeRate: number;
  amountLocal: number;
  localCurrency: string;
  paymentMethod: string;
  referenceNumber?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  adminNotes?: string;
  receiptUrl?: string;
  createdAt: string;
}

export const PartnerDeposits: React.FC = () => {
  const { partnerFetch, refreshProfile } = usePartner();

  const [exchangeRate, setExchangeRate] = useState<number>(2500);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [deposits, setDeposits] = useState<DepositRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [amountUsd, setAmountUsd] = useState<number | ''>(50);
  const [selectedMethod, setSelectedMethod] = useState<string>('');
  const [referenceNumber, setReferenceNumber] = useState<string>('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ success: boolean; msg: string } | null>(null);

  // Copy helper
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Receipt Modal
  const [viewReceiptUrl, setViewReceiptUrl] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      // Exchange rate
      const rateRes = await partnerFetch<{ success: boolean; rate: number }>('/api/partner/exchange-rate');
      if (rateRes?.rate) {
        setExchangeRate(rateRes.rate);
      }

      // Payment methods
      const methodsRes = await partnerFetch<{ success: boolean; methods: PaymentMethod[] }>('/api/partner/payment-methods');
      if (methodsRes?.methods) {
        setPaymentMethods(methodsRes.methods);
        if (methodsRes.methods.length > 0 && !selectedMethod) {
          setSelectedMethod(methodsRes.methods[0].name);
        }
      }

      // Deposits history
      const depRes = await partnerFetch<{ success: boolean; deposits: DepositRecord[] }>('/api/partner/deposits');
      if (depRes?.deposits) {
        setDeposits(depRes.deposits);
      }
    } catch (err) {
      console.error('Failed to load deposits data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setReceiptFile(file);

      const reader = new FileReader();
      reader.onload = () => {
        setReceiptPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const calculatedSdg = amountUsd && Number(amountUsd) > 0 ? (Number(amountUsd) * exchangeRate).toLocaleString() : '0';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitResult(null);

    if (!amountUsd || Number(amountUsd) <= 0) {
      setSubmitResult({ success: false, msg: 'يرجى إدخال مبلغ إيداع صحيح أكبر من 0.' });
      return;
    }

    if (!selectedMethod) {
      setSubmitResult({ success: false, msg: 'يرجى اختيار طريقة الدفع أو البنك.' });
      return;
    }

    if (!receiptFile) {
      setSubmitResult({ success: false, msg: 'يرجى إرفاق صورة إشعار أو إيصال التحويل البنكي.' });
      return;
    }

    try {
      setSubmitting(true);
      const formData = new FormData();
      formData.append('amountUsd', String(amountUsd));
      formData.append('paymentMethod', selectedMethod);
      formData.append('referenceNumber', referenceNumber.trim());
      formData.append('receipt', receiptFile);

      await partnerFetch('/api/partner/deposits', {
        method: 'POST',
        body: formData
      });

      setSubmitResult({
        success: true,
        msg: 'تم إرسال طلب الإيداع بنجاح! سيتم تدقيق التحويل وتغذية محفظتك فورياً من قِبل الإدارة.'
      });

      // Reset form
      setAmountUsd(50);
      setReferenceNumber('');
      setReceiptFile(null);
      setReceiptPreview(null);

      // Refresh list
      fetchData();
      refreshProfile();
    } catch (err: any) {
      setSubmitResult({
        success: false,
        msg: err.message || 'حدث خطأ أثناء إرسال طلب الإيداع'
      });
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: DepositRecord['status']) => {
    switch (status) {
      case 'APPROVED':
        return <span className="badge-status completed">معتمد ومضاف ✓</span>;
      case 'PENDING':
        return <span className="badge-status pending">قيد المراجعة والتدقيق ⏳</span>;
      case 'REJECTED':
        return <span className="badge-status failed">مرفوض ✕</span>;
      default:
        return <span className="badge-status">{status}</span>;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Wallet size={24} color="#10b981" />
            <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900 }}>إيداع وشحن الرصيد المالي</h2>
          </div>
          <p style={{ margin: '4px 0 0 0', color: '#94a3b8', fontSize: '0.88rem' }}>
            قم بالتحويل عبر الحسابات البنكية المعتمدة وارفع الإيصال لتغذية رصيد محفظتك بالدولار (USD)
          </p>
        </div>

        <button
          onClick={fetchData}
          className="btn-partner-secondary"
          title="تحديث البيانات"
        >
          <RefreshCw size={16} className={loading ? 'spin-anim' : ''} />
          <span>تحديث</span>
        </button>
      </div>

      {/* Grid: Left: Calculator & Form, Right: Bank Accounts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 24 }}>
        {/* Form Card */}
        <div className="partner-card">
          <h3 style={{ margin: '0 0 16px 0', fontSize: '1.15rem', fontWeight: 900, color: '#fff' }}>
            طلب إيداع جديد
          </h3>

          {submitResult && (
            <div style={{
              padding: 14,
              borderRadius: 8,
              marginBottom: 16,
              fontSize: '0.88rem',
              fontWeight: 700,
              background: submitResult.success ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
              color: submitResult.success ? '#34d399' : '#fb7185',
              border: `1px solid ${submitResult.success ? '#10b981' : '#f43f5e'}`
            }}>
              {submitResult.msg}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Amount USD */}
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#94a3b8', marginBottom: 6, fontWeight: 700 }}>
                المبلغ المراد إيداعه بالدولار (USD)
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  required
                  value={amountUsd}
                  onChange={(e) => setAmountUsd(e.target.value === '' ? '' : Number(e.target.value))}
                  style={{
                    width: '100%',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: 8,
                    padding: '12px 16px',
                    color: '#10b981',
                    fontSize: '1.25rem',
                    fontWeight: 900,
                    outline: 'none',
                    fontFamily: 'Outfit, sans-serif'
                  }}
                  placeholder="50"
                />
                <span style={{
                  position: 'absolute',
                  left: 14,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#94a3b8',
                  fontWeight: 800
                }}>
                  USD
                </span>
              </div>
            </div>

            {/* Conversion Display */}
            <div style={{
              background: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.25)',
              borderRadius: 8,
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div>
                <span style={{ fontSize: '0.78rem', color: '#94a3b8', display: 'block' }}>المبلغ المطلوب تحويله بالجنيه</span>
                <span style={{ fontSize: '1.25rem', fontWeight: 900, color: '#fbbf24', fontFamily: 'Outfit, sans-serif' }}>
                  {calculatedSdg} SDG
                </span>
              </div>
              <div style={{ textAlign: 'left', fontSize: '0.75rem', color: '#94a3b8' }}>
                سعر الصرف: 1$ = {exchangeRate.toLocaleString()} SDG
              </div>
            </div>

            {/* Payment Method Select */}
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#94a3b8', marginBottom: 6, fontWeight: 700 }}>
                طريقة التحويل / البنك
              </label>
              <select
                value={selectedMethod}
                onChange={(e) => setSelectedMethod(e.target.value)}
                style={{
                  width: '100%',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: 8,
                  padding: '12px 14px',
                  color: '#fff',
                  fontSize: '0.9rem',
                  outline: 'none',
                  fontFamily: 'inherit'
                }}
              >
                {paymentMethods.length > 0 ? (
                  paymentMethods.map((m) => (
                    <option key={m.id} value={m.name} style={{ background: '#0f172a', color: '#fff' }}>
                      {m.name} {m.accountNumber ? `(${m.accountNumber})` : ''}
                    </option>
                  ))
                ) : (
                  <>
                    <option value="بنكك (بنك الخرطوم)" style={{ background: '#0f172a' }}>بنكك (بنك الخرطوم)</option>
                    <option value="فوري (بنك فيصل)" style={{ background: '#0f172a' }}>فوري (بنك فيصل)</option>
                    <option value="أوكاش" style={{ background: '#0f172a' }}>أوكاش</option>
                  </>
                )}
              </select>
            </div>

            {/* Reference Number */}
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#94a3b8', marginBottom: 6, fontWeight: 700 }}>
                رقم العملية البنكية أو الإشعار (اختياري)
              </label>
              <input
                type="text"
                placeholder="مثال: 123456789"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                style={{
                  width: '100%',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: 8,
                  padding: '10px 14px',
                  color: '#fff',
                  fontSize: '0.9rem',
                  outline: 'none'
                }}
              />
            </div>

            {/* Receipt Upload */}
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#94a3b8', marginBottom: 6, fontWeight: 700 }}>
                صورة إشعار التحويل البنكي <span style={{ color: '#f59e0b' }}>*</span>
              </label>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,application/pdf"
                id="receipt-file-input"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
              <label
                htmlFor="receipt-file-input"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  border: '2px dashed rgba(255, 255, 255, 0.15)',
                  borderRadius: 8,
                  padding: 20,
                  cursor: 'pointer',
                  background: 'rgba(255, 255, 255, 0.02)',
                  transition: 'border-color 0.2s'
                }}
              >
                {receiptPreview ? (
                  <div style={{ textAlign: 'center' }}>
                    <img
                      src={receiptPreview}
                      alt="Receipt Preview"
                      style={{ maxHeight: 120, maxWidth: '100%', borderRadius: 6, marginBottom: 8 }}
                    />
                    <div style={{ fontSize: '0.78rem', color: '#10b981', fontWeight: 800 }}>
                      ✓ تم اختيار الملف: {receiptFile?.name} (اضغط للتغيير)
                    </div>
                  </div>
                ) : (
                  <>
                    <UploadCloud size={32} color="#94a3b8" />
                    <span style={{ fontSize: '0.88rem', color: '#cbd5e1', fontWeight: 700 }}>
                      اضغط لاختيار صورة الإشعار (PNG, JPG, PDF)
                    </span>
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      الحد الأقصى للحجم 8 ميجابايت
                    </span>
                  </>
                )}
              </label>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="btn-partner-primary"
              style={{ marginTop: 8 }}
            >
              {submitting ? 'جاري إرسال الطلب...' : 'إرسال طلب الإيداع'}
            </button>
          </form>
        </div>

        {/* Bank Accounts Info Card */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="partner-card" style={{ background: 'rgba(15, 23, 42, 0.9)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Building size={20} color="#f59e0b" />
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900, color: '#fff' }}>
                الحسابات البنكية المعتمدة للتحويل
              </h3>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {paymentMethods.length > 0 ? (
                paymentMethods.map((method) => (
                  <div
                    key={method.id}
                    style={{
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: 10,
                      padding: 16
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontWeight: 900, color: '#fbbf24', fontSize: '1rem' }}>{method.name}</span>
                      {method.accountNumber && (
                        <button
                          onClick={() => handleCopy(method.accountNumber || '', method.id)}
                          style={{
                            background: 'rgba(255,255,255,0.08)',
                            border: 'none',
                            color: copiedId === method.id ? '#10b981' : '#cbd5e1',
                            padding: '4px 8px',
                            borderRadius: 6,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            fontSize: '0.75rem',
                            fontWeight: 700
                          }}
                        >
                          {copiedId === method.id ? <Check size={14} /> : <Copy size={14} />}
                          <span>{copiedId === method.id ? 'تم النسخ' : 'نسخ الحساب'}</span>
                        </button>
                      )}
                    </div>

                    {method.accountNumber && (
                      <div style={{ fontSize: '1rem', color: '#fff', fontFamily: 'Outfit, monospace', fontWeight: 800, marginBottom: 4 }}>
                        {method.accountNumber}
                      </div>
                    )}

                    {method.accountName && (
                      <div style={{ fontSize: '0.82rem', color: '#94a3b8' }}>
                        اسم صاحب الحساب: <span style={{ color: '#e2e8f0', fontWeight: 700 }}>{method.accountName}</span>
                      </div>
                    )}

                    {method.instructions && (
                      <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 6 }}>
                        {method.instructions}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 10,
                  padding: 16
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontWeight: 900, color: '#fbbf24' }}>بنكك (بنك الخرطوم)</span>
                    <button
                      onClick={() => handleCopy('3829104', 'default-bankak')}
                      style={{
                        background: 'rgba(255,255,255,0.08)',
                        border: 'none',
                        color: copiedId === 'default-bankak' ? '#10b981' : '#cbd5e1',
                        padding: '4px 8px',
                        borderRadius: 6,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: '0.75rem',
                        fontWeight: 700
                      }}
                    >
                      {copiedId === 'default-bankak' ? <Check size={14} /> : <Copy size={14} />}
                      <span>{copiedId === 'default-bankak' ? 'تم النسخ' : 'نسخ الحساب'}</span>
                    </button>
                  </div>
                  <div style={{ fontSize: '1.1rem', color: '#fff', fontFamily: 'Outfit, monospace', fontWeight: 800 }}>
                    3829104
                  </div>
                  <div style={{ fontSize: '0.82rem', color: '#94a3b8', marginTop: 4 }}>
                    الاسم: شركة كيرو برو للتجارة والخدمات
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Quick Notice */}
          <div className="partner-card" style={{ background: 'rgba(16, 185, 129, 0.05)', borderColor: 'rgba(16, 185, 129, 0.2)' }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <Info size={20} color="#10b981" style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ fontSize: '0.82rem', color: '#cbd5e1', lineHeight: 1.6 }}>
                <strong>تنويه سرعة الإيداع:</strong> تتم مراجعة الإيداعات وتأكيدها خلال دقائق معدودة من إرسال الإشعار الصحيح. الرصيد المضاف سيكون متاحاً للشحن الفوري فور اعتماده.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Deposits History */}
      <div className="partner-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900 }}>سجل طلبات الإيداع السابقة</h3>
          <span style={{ fontSize: '0.82rem', color: '#94a3b8' }}>إجمالي الطلبات: {deposits.length}</span>
        </div>

        {deposits.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
            لا توجد أي طلبات إيداع سابقة في حسابك.
          </div>
        ) : (
          <div className="partner-table-container">
            <table className="partner-table">
              <thead>
                <tr>
                  <th>المبلغ (USD)</th>
                  <th>المبلغ بالجنيه</th>
                  <th>طريقة التحويل</th>
                  <th>رقم العملية</th>
                  <th>الحالة</th>
                  <th>الإشعار</th>
                  <th>ملاحظات الإدارة</th>
                  <th>التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {deposits.map((dep) => (
                  <tr key={dep.id}>
                    <td style={{ fontWeight: 900, color: '#10b981', fontFamily: 'Outfit, sans-serif' }}>
                      ${Number(dep.amountUsd).toFixed(2)}
                    </td>
                    <td style={{ fontFamily: 'Outfit, sans-serif' }}>
                      {Number(dep.amountLocal).toLocaleString()} {dep.localCurrency}
                    </td>
                    <td style={{ fontWeight: 700 }}>{dep.paymentMethod}</td>
                    <td>
                      {dep.referenceNumber ? (
                        <code style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: 4 }}>
                          {dep.referenceNumber}
                        </code>
                      ) : (
                        <span style={{ color: '#64748b' }}>-</span>
                      )}
                    </td>
                    <td>{getStatusBadge(dep.status)}</td>
                    <td>
                      <button
                        onClick={() => setViewReceiptUrl(`${BASE_URL}/api/partner/deposits/${dep.id}/receipt`)}
                        style={{
                          background: 'rgba(255,255,255,0.06)',
                          border: 'none',
                          color: '#38bdf8',
                          padding: '4px 8px',
                          borderRadius: 6,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: '0.78rem',
                          fontWeight: 700
                        }}
                      >
                        <Eye size={14} />
                        <span>عرض الإيصال</span>
                      </button>
                    </td>
                    <td style={{ fontSize: '0.82rem', color: '#94a3b8' }}>
                      {dep.adminNotes || '-'}
                    </td>
                    <td style={{ fontSize: '0.8rem', color: '#64748b' }}>
                      {new Date(dep.createdAt).toLocaleDateString('ar-SA', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Receipt Viewer Modal */}
      {viewReceiptUrl && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 40000,
          padding: 16
        }}>
          <div className="partner-card" style={{ maxWidth: 600, width: '100%', background: '#0f172a', textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h4 style={{ margin: 0, fontWeight: 900 }}>إشعار التحويل البنكي</h4>
              <button
                onClick={() => setViewReceiptUrl(null)}
                style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '1.2rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>
            <img
              src={viewReceiptUrl}
              alt="Receipt"
              style={{ maxWidth: '100%', maxHeight: '75vh', borderRadius: 8, objectFit: 'contain' }}
              onError={(e) => {
                // If PDF or render failure
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
