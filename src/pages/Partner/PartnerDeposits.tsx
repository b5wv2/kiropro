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
  Building,
  CheckCircle,
  AlertCircle,
  Phone,
  CreditCard
} from 'lucide-react';
import { BASE_URL } from '../../lib/api';

interface PaymentMethod {
  id: string;
  name: string;
  type?: string;
  currency?: string;
  account_name?: string;
  account_number?: string;
  bank_name?: string;
  phone_number?: string;
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

  const [exchangeRate, setExchangeRate] = useState<number>(3500);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [deposits, setDeposits] = useState<DepositRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [amountUsd, setAmountUsd] = useState<number | ''>(50);
  const [amountLocal, setAmountLocal] = useState<number | ''>('');
  const [selectedMethodId, setSelectedMethodId] = useState<string>('');
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
      // 1. Exchange rate
      const rateRes = await partnerFetch<{ success: boolean; rate: number }>('/api/partner/exchange-rate');
      if (rateRes?.rate) {
        setExchangeRate(rateRes.rate);
        setAmountLocal(50 * rateRes.rate);
      }

      // 2. Dynamic Payment Methods (No Hardcoded values)
      const methodsRes = await partnerFetch<any>('/api/partner/payment-methods');
      const methodsList: PaymentMethod[] = Array.isArray(methodsRes) 
        ? methodsRes 
        : (methodsRes?.methods || methodsRes?.data || []);

      setPaymentMethods(methodsList);
      if (methodsList.length > 0 && !selectedMethodId) {
        setSelectedMethodId(methodsList[0].id);
      }

      // 3. Deposits history
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

  const currentMethod = paymentMethods.find(m => m.id === selectedMethodId) || paymentMethods[0];

  const handleUsdChange = (val: string) => {
    if (val === '') {
      setAmountUsd('');
      setAmountLocal('');
      return;
    }
    const num = parseFloat(val);
    setAmountUsd(isNaN(num) ? '' : num);
    setAmountLocal(isNaN(num) || exchangeRate <= 0 ? '' : Math.round(num * exchangeRate));
  };

  const handleLocalChange = (val: string) => {
    if (val === '') {
      setAmountLocal('');
      setAmountUsd('');
      return;
    }
    const num = parseFloat(val);
    setAmountLocal(isNaN(num) ? '' : num);
    setAmountUsd(isNaN(num) || exchangeRate <= 0 ? '' : Math.round((num / exchangeRate) * 100) / 100);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitResult(null);

    if (!amountUsd || Number(amountUsd) <= 0) {
      setSubmitResult({ success: false, msg: 'يرجى إدخال مبلغ إيداع صحيح أكبر من 0.' });
      return;
    }

    if (!currentMethod) {
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
      formData.append('paymentMethod', currentMethod.name);
      formData.append('paymentMethodId', currentMethod.id);
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
      setAmountLocal(50 * exchangeRate);
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Wallet size={22} color="#10b981" />
            <h2 style={{ fontSize: '1.35rem', fontWeight: 900 }}>إيداع وشحن الرصيد المالي</h2>
          </div>
          <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
            قم بالتحويل عبر الحسابات الرسمية المعتمدة أدناه وارفع الإيصال لتغذية رصيد محفظتك بالدولار (USD)
          </p>
        </div>

        <button
          onClick={fetchData}
          className="btn-partner-secondary"
          title="تحديث البيانات"
        >
          <RefreshCw size={15} className={loading ? 'spin-anim' : ''} />
          <span>تحديث</span>
        </button>
      </div>

      {/* Grid: Left: Calculator & Form, Right: Bank Accounts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 20 }}>
        {/* Form Card */}
        <div className="partner-card">
          <h3 style={{ margin: '0 0 14px 0', fontSize: '1.1rem', fontWeight: 900, color: '#fff' }}>
            طلب إيداع جديد
          </h3>

          {submitResult && (
            <div className={`partner-alert ${submitResult.success ? 'success' : 'error'}`} style={{ marginBottom: 14 }}>
              {submitResult.success ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
              <span>{submitResult.msg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Two-Way Amounts Inputs (USD & SDG) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
              <div>
                <label className="partner-label">
                  الرصيد المضاف (USD)
                </label>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  required
                  value={amountUsd}
                  onChange={(e) => handleUsdChange(e.target.value)}
                  className="partner-input"
                  style={{
                    fontSize: '1.15rem',
                    fontFamily: 'Outfit, monospace',
                    fontWeight: 800,
                    color: '#10b981'
                  }}
                  placeholder="50.00"
                />
              </div>

              <div>
                <label className="partner-label">
                  المبلغ بالعملة المحلية (SDG)
                </label>
                <input
                  type="number"
                  min="1"
                  value={amountLocal}
                  onChange={(e) => handleLocalChange(e.target.value)}
                  className="partner-input"
                  style={{
                    fontSize: '1.15rem',
                    fontFamily: 'Outfit, monospace',
                    fontWeight: 800,
                    color: '#fbbf24'
                  }}
                  placeholder="175,000"
                />
              </div>
            </div>

            {/* Currency Breakdown Box */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 8,
              padding: 14,
              fontSize: '0.85rem',
              display: 'flex',
              flexDirection: 'column',
              gap: 8
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}>
                <span>أنت تدفع:</span>
                <span className="partner-currency" style={{ fontWeight: 900, color: '#fff', fontSize: '1.05rem' }}>
                  {amountLocal ? Number(amountLocal).toLocaleString() : '0'} SDG
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}>
                <span>سعر الصرف:</span>
                <span className="partner-currency" style={{ fontWeight: 800, color: '#fbbf24' }}>
                  1 USD = {exchangeRate.toLocaleString()} SDG
                </span>
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                color: '#94a3b8',
                borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                paddingTop: 8,
                marginTop: 2
              }}>
                <span style={{ fontWeight: 700, color: '#cbd5e1' }}>سيضاف لمحفظتك:</span>
                <span className="partner-currency" style={{ fontWeight: 900, color: '#10b981', fontSize: '1.15rem' }}>
                  +${amountUsd ? Number(amountUsd).toFixed(2) : '0.00'} USD
                </span>
              </div>
            </div>

            {/* Payment Method Selector (100% Dynamic from API) */}
            <div>
              <label className="partner-label">
                طريقة الدفع أو الحساب المحول إليه
              </label>
              <select
                value={selectedMethodId}
                onChange={(e) => setSelectedMethodId(e.target.value)}
                className="partner-select"
              >
                {paymentMethods.length > 0 ? (
                  paymentMethods.map((m) => (
                    <option key={m.id} value={m.id} style={{ background: '#0f172a', color: '#fff' }}>
                      {m.name} {m.account_number ? `(${m.account_number})` : ''}
                    </option>
                  ))
                ) : (
                  <option value="" disabled style={{ background: '#0f172a' }}>
                    لا توجد طرق دفع مفعلة حالياً
                  </option>
                )}
              </select>
            </div>

            {/* Reference Number */}
            <div>
              <label className="partner-label">
                رقم العملية البنكية أو الإشعار (اختياري)
              </label>
              <input
                type="text"
                placeholder="مثال: 123456789"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                className="partner-input"
              />
            </div>

            {/* Receipt Upload */}
            <div>
              <label className="partner-label">
                <span>صورة إشعار أو إيصال التحويل البنكي</span>
                <span style={{ color: '#f59e0b', marginRight: 4 }}>*</span>
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
                  border: '2px dashed var(--partner-border)',
                  borderRadius: 8,
                  padding: 16,
                  cursor: 'pointer',
                  background: 'rgba(255, 255, 255, 0.02)',
                  transition: 'border-color 0.2s'
                }}
              >
                {receiptPreview ? (
                  <div style={{ textAlign: 'center' }}>
                    <img
                      src={receiptPreview}
                      alt="معاينة الإشعار"
                      style={{ maxHeight: 110, maxWidth: '100%', borderRadius: 6, objectFit: 'contain' }}
                    />
                    <div style={{ fontSize: '0.75rem', color: '#10b981', marginTop: 6, fontWeight: 700 }}>
                      ✓ تم اختيار الإشعار — اضغط للتغيير
                    </div>
                  </div>
                ) : (
                  <>
                    <UploadCloud size={24} color="#94a3b8" />
                    <div style={{ fontSize: '0.82rem', color: '#cbd5e1', fontWeight: 700 }}>
                      اضغط لاختيار صورة الإشعار (JPG, PNG, PDF)
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                      الحد الأقصى لحجم الملف: 5 ميغابايت
                    </div>
                  </>
                )}
              </label>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting || paymentMethods.length === 0}
              className="btn-partner-primary"
              style={{ width: '100%', padding: '12px', marginTop: 4 }}
            >
              {submitting ? (
                <>
                  <RefreshCw size={16} className="spin-anim" />
                  <span>جاري إرسال طلب الإيداع...</span>
                </>
              ) : (
                <>
                  <Wallet size={16} />
                  <span>تأكيد وإرسال طلب الإيداع</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Right Column: Bank Accounts Info (Dynamic from API) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="partner-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <Building size={18} color="#f59e0b" />
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900, color: '#fff' }}>
                الحسابات الرسمية المعتمدة للتحويل
              </h3>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {paymentMethods.length > 0 ? (
                paymentMethods.map((method) => (
                  <div
                    key={method.id}
                    style={{
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: 8,
                      padding: 14
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontWeight: 900, color: '#fbbf24', fontSize: '0.95rem' }}>
                        {method.name}
                      </span>
                      {method.account_number && (
                        <button
                          onClick={() => handleCopy(method.account_number || '', method.id)}
                          style={{
                            background: 'rgba(255,255,255,0.08)',
                            border: 'none',
                            color: copiedId === method.id ? '#10b981' : '#cbd5e1',
                            padding: '3px 8px',
                            borderRadius: 4,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            fontSize: '0.72rem',
                            fontWeight: 700
                          }}
                        >
                          {copiedId === method.id ? <Check size={12} /> : <Copy size={12} />}
                          <span>{copiedId === method.id ? 'تم النسخ' : 'نسخ الحساب'}</span>
                        </button>
                      )}
                    </div>

                    {method.bank_name && (
                      <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginBottom: 2 }}>
                        البنك / الجهة: <strong style={{ color: '#fff' }}>{method.bank_name}</strong>
                      </div>
                    )}

                    {method.account_number && (
                      <div className="partner-num" style={{ fontSize: '1.05rem', color: '#fff', fontWeight: 800, marginBottom: 2 }}>
                        {method.account_number}
                      </div>
                    )}

                    {method.phone_number && (
                      <div style={{ fontSize: '0.8rem', color: '#38bdf8', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Phone size={13} />
                        <span>رقم المحفظة / الهاتف: {method.phone_number}</span>
                      </div>
                    )}

                    {method.account_name && (
                      <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                        اسم صاحب الحساب: <span style={{ color: '#e2e8f0', fontWeight: 700 }}>{method.account_name}</span>
                      </div>
                    )}

                    {method.instructions && (
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 4, lineHeight: 1.4 }}>
                        {method.instructions}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div style={{ textAlign: 'center', padding: 24, color: '#94a3b8', fontSize: '0.85rem' }}>
                  لا توجد حسابات إيداع مفعلة حالياً في النظام.
                </div>
              )}
            </div>
          </div>

          {/* Quick Notice */}
          <div className="partner-card" style={{ background: 'rgba(16, 185, 129, 0.05)', borderColor: 'rgba(16, 185, 129, 0.2)', padding: 14 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <Info size={18} color="#10b981" style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ fontSize: '0.78rem', color: '#cbd5e1', lineHeight: 1.5 }}>
                <strong>تنويه سرعة الإيداع:</strong> تتم مراجعة الإيداعات وتأكيدها خلال دقائق معدودة من إرسال الإشعار. الرصيد المضاف يظهر تلقائياً في محفظتك ويكون متاحاً للشحن الفوري.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Deposits History */}
      <div className="partner-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900 }}>سجل طلبات الإيداع السابقة</h3>
          <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>إجمالي الطلبات: {deposits.length}</span>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}>
            جاري مزامنة سجل الإيداعات...
          </div>
        ) : deposits.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 30, color: '#94a3b8', fontSize: '0.85rem' }}>
            لم تقم بتقديم أي طلبات إيداع حتى الآن.
          </div>
        ) : (
          <div className="partner-table-container">
            <table className="partner-table">
              <thead>
                <tr>
                  <th>رقم العملية</th>
                  <th>المبلغ بالدولار</th>
                  <th>سعر الصرف</th>
                  <th>المبلغ المحلي</th>
                  <th>طريقة الدفع</th>
                  <th>الحالة</th>
                  <th>التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {deposits.map((dep) => (
                  <tr key={dep.id}>
                    <td>
                      <span className="partner-num" style={{ fontWeight: 800, color: '#fff' }}>
                        #{dep.id.slice(0, 8).toUpperCase()}
                      </span>
                    </td>
                    <td>
                      <span className="partner-currency" style={{ fontWeight: 900, color: '#10b981' }}>
                        ${Number(dep.amountUsd).toFixed(2)} USD
                      </span>
                    </td>
                    <td>
                      <span className="partner-currency" style={{ color: '#fbbf24', fontSize: '0.82rem' }}>
                        {Number(dep.exchangeRate).toLocaleString()} SDG
                      </span>
                    </td>
                    <td>
                      <span className="partner-currency" style={{ color: '#cbd5e1' }}>
                        {Number(dep.amountLocal).toLocaleString()} {dep.localCurrency}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.82rem', color: '#94a3b8' }}>{dep.paymentMethod}</span>
                    </td>
                    <td>{getStatusBadge(dep.status)}</td>
                    <td style={{ fontSize: '0.78rem', color: '#64748b', whiteSpace: 'nowrap' }}>
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
    </div>
  );
};
