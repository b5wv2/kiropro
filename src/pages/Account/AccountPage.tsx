import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useWallet } from '../../context/WalletContext';
import { BASE_URL, api } from '../../lib/api';
import { formatCurrency } from '../../lib/formatters';
import { 
  Clock, 
  CheckCircle2, 
  XCircle, 
  ArrowDownCircle, 
  FileText,
  Copy,
  Check,
  Zap,
  Key,
  Coins,
  History,
  Star
} from 'lucide-react';
import { PromoRedemptionCard } from '../../components/Promo/PromoRedemptionCard';
import { ReferralCard } from '../../components/Referral/ReferralCard';
import { ReviewModal } from '../../components/Modal/ReviewModal';
import { fetchMyOrders, fetchOrderById } from '../../services/api';
import { Order, WalletTransaction } from '../../types';

export const AccountPage: React.FC = () => {
  const { user, logout, navigateTo } = useAuth();
  const { 
    currency,
    formattedBalance, 
    pendingBalance, 
    formattedPendingBalance, 
    openDepositModal, 
    topupRequests 
  } = useWallet();

  const [activeAccountTab, setActiveAccountTab] = useState<'orders' | 'topups' | 'transactions' | 'cashback' | 'reviews'>('orders');
  const [selectedReceiptUrl, setSelectedReceiptUrl] = useState<string | null>(null);
  const [userOrders, setUserOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [userReviews, setUserReviews] = useState<any[]>([]);
  const [loadingUserReviews, setLoadingUserReviews] = useState(false);
  const [reviewModalOrder, setReviewModalOrder] = useState<{ id: string; packageName: string } | null>(null);
  const [cashbackSummary, setCashbackSummary] = useState<{ totalEarned: number; redemptionCount: number; redemptions: any[] }>({
    totalEarned: 0,
    redemptionCount: 0,
    redemptions: []
  });
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);

  // Dynamic Polling Controls
  const pollingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPollingRef = useRef<boolean>(false);

  const isNonTerminalStatus = (status?: string | null): boolean => {
    const s = (status || '').toUpperCase();
    return ['SUBMITTED', 'PROCESSING', 'PENDING'].includes(s);
  };

  const stopPolling = useCallback(() => {
    if (pollingTimerRef.current) {
      clearTimeout(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
    if (isPollingRef.current) {
      isPollingRef.current = false;
      if (import.meta.env.DEV) {
        console.log('[OrderPolling] stopped');
      }
    }
  }, []);

  const pollOrders = useCallback(async (isInitial = false) => {
    if (isInitial) {
      setLoadingOrders(true);
    }

    try {
      const orders = await fetchMyOrders();
      setUserOrders(orders || []);

      const activeOrders = (orders || []).filter(o => isNonTerminalStatus(o.status));

      if (activeOrders.length === 0) {
        // No active orders: stop polling completely
        if (isPollingRef.current) {
          if (import.meta.env.DEV) {
            console.log('[OrderPolling] order completed');
          }
          stopPolling();
        }
        return;
      }

      // Active orders exist
      if (!isPollingRef.current) {
        isPollingRef.current = true;
        if (import.meta.env.DEV) {
          console.log('[OrderPolling] started');
        }
      }

      if (import.meta.env.DEV) {
        console.log(`[OrderPolling] activeOrders = ${activeOrders.length}`);
      }

      // Clear any pending timeout before scheduling next tick
      if (pollingTimerRef.current) {
        clearTimeout(pollingTimerRef.current);
      }

      pollingTimerRef.current = setTimeout(async () => {
        // If exactly 1 order is active, use lightweight order-specific endpoint
        if (activeOrders.length === 1) {
          const singleOrderId = activeOrders[0].id;
          try {
            const singleOrder = await fetchOrderById(singleOrderId);
            if (singleOrder) {
              setUserOrders(prev => prev.map(o => o.id === singleOrderId ? { ...o, ...singleOrder } : o));

              if (!isNonTerminalStatus(singleOrder.status)) {
                // Order reached terminal state!
                if (import.meta.env.DEV) {
                  console.log('[OrderPolling] order completed');
                }
                stopPolling();
                return;
              }
            }
          } catch (err) {
            console.error('[OrderPolling] Failed to poll single order:', err);
          }
          // If still active, continue polling cycle
          pollOrders(false);
        } else {
          // Multiple active orders: poll full order list
          pollOrders(false);
        }
      }, 7000);

    } catch (err) {
      console.error('Failed to load user orders:', err);
      stopPolling();
    } finally {
      if (isInitial) {
        setLoadingOrders(false);
      }
    }
  }, [stopPolling]);

  const loadOrders = useCallback(() => {
    pollOrders(true);
  }, [pollOrders]);

  const loadCashbackSummary = async () => {
    try {
      const data = await api.get<{ totalEarned: number; redemptionCount: number; redemptions: any[] }>('/api/cashback/summary');
      if (data) {
        setCashbackSummary(data);
      }
    } catch (err) {
      console.error('Failed to load cashback summary', err);
    }
  };

  const loadTransactions = async () => {
    setLoadingTransactions(true);
    try {
      const data = await api.get<WalletTransaction[]>('/api/wallet/transactions');
      setTransactions(data || []);
    } catch (err) {
      console.error('Failed to load transactions', err);
    } finally {
      setLoadingTransactions(false);
    }
  };

  const loadUserReviews = async () => {
    setLoadingUserReviews(true);
    try {
      const data = await api.get<any[]>('/api/reviews/my');
      setUserReviews(data || []);
    } catch (err) {
      console.error('Failed to load user reviews:', err);
    } finally {
      setLoadingUserReviews(false);
    }
  };

  useEffect(() => {
    loadCashbackSummary();
    loadUserReviews();
  }, []);

  useEffect(() => {
    if (activeAccountTab === 'orders') {
      pollOrders(true);

      return () => {
        stopPolling();
      };
    } else {
      stopPolling();
      if (activeAccountTab === 'transactions') {
        loadTransactions();
      } else if (activeAccountTab === 'cashback') {
        loadCashbackSummary();
      } else if (activeAccountTab === 'reviews') {
        loadUserReviews();
      }
    }
  }, [activeAccountTab, pollOrders, stopPolling]);

  const handleCopyKey = (orderId: string, keyText: string) => {
    navigator.clipboard.writeText(keyText);
    setCopiedKeyId(orderId);
    setTimeout(() => setCopiedKeyId(null), 2500);
  };

  if (!user) {
    navigateTo('login');
    return null;
  }

  const getFullReceiptUrl = (url: string) => {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    return `${BASE_URL}${url}`;
  };

  return (
    <div className="container" style={{ paddingBlock: 'clamp(28px, 5vw, 60px)' }} dir="rtl">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 28, maxWidth: 920, marginInline: 'auto' }}>
        
        {/* Top Profile & Balances Card */}
        <div style={{ 
          background: '#FFFFFF', 
          border: '1px solid var(--border-subtle)', 
          borderRadius: 'var(--radius-xl)', 
          padding: 'clamp(24px, 4vw, 36px)', 
          boxShadow: 'var(--shadow-sm)' 
        }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            flexWrap: 'wrap', 
            gap: 20 
          }}>
            {/* User Info */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ 
                width: 56, 
                height: 56, 
                borderRadius: '50%', 
                background: '#0B0F19', 
                color: 'var(--accent-yellow)', 
                fontSize: '1.4rem', 
                fontWeight: 900, 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center' 
              }}>
                {user.name.charAt(0)}
              </div>
              <div>
                <h1 style={{ fontSize: '1.4rem', fontWeight: 900, color: '#0B0F19', margin: '0 0 2px 0' }}>
                  مرحباً، {user.name}
                </h1>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{user.email}</span>
              </div>
            </div>

            {/* Balances Display & Top-up Button */}
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
              {/* Available Balance */}
              <div style={{ 
                background: '#f8fafc', 
                border: '1.5px solid #e2e8f0', 
                borderRadius: 'var(--radius-lg)', 
                padding: '10px 20px', 
                textAlign: 'center' 
              }}>
                <span style={{ fontSize: '0.775rem', color: '#64748b', display: 'block', fontWeight: 700 }}>
                  الرصيد المتاح (Available):
                </span>
                <span style={{ 
                  fontFamily: 'var(--font-latin)', 
                  fontSize: '1.45rem', 
                  fontWeight: 900, 
                  color: '#059669', 
                  direction: 'ltr' 
                }}>
                  {formattedBalance}
                </span>
              </div>

              {/* Cashback Earned Badge */}
              <div style={{ 
                background: '#f0fdf4', 
                border: '1.5px solid #86efac', 
                borderRadius: 'var(--radius-lg)', 
                padding: '10px 16px', 
                textAlign: 'center' 
              }}>
                <span style={{ fontSize: '0.75rem', color: '#166534', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontWeight: 700 }}>
                  <Coins size={13} />
                  كاش باك مكتسب:
                </span>
                <span style={{ 
                  fontFamily: 'var(--font-latin)', 
                  fontSize: '1.3rem', 
                  fontWeight: 900, 
                  color: '#15803d', 
                  direction: 'ltr' 
                }}>
                  +{formatCurrency(cashbackSummary.totalEarned, user.currency || currency)}
                </span>
              </div>

              {/* Pending Balance Badge */}
              {pendingBalance > 0 && (
                <div style={{ 
                  background: '#fefce8', 
                  border: '1.5px solid #fde047', 
                  borderRadius: 'var(--radius-lg)', 
                  padding: '10px 16px', 
                  textAlign: 'center' 
                }}>
                  <span style={{ fontSize: '0.75rem', color: '#854d0e', display: 'block', fontWeight: 700 }}>
                    قيد المراجعة (Pending):
                  </span>
                  <span style={{ 
                    fontFamily: 'var(--font-latin)', 
                    fontSize: '1.3rem', 
                    fontWeight: 900, 
                    color: '#ca8a04', 
                    direction: 'ltr' 
                  }}>
                    {formattedPendingBalance}
                  </span>
                </div>
              )}

              <button className="btn btn-primary btn-sm" onClick={openDepositModal} type="button" style={{ padding: '12px 18px', fontWeight: 800 }}>
                <span>شحن الرصيد</span>
              </button>
            </div>
          </div>

          {/* Notice Banner when user has pending top-ups */}
          {pendingBalance > 0 && (
            <div style={{ 
              marginTop: '20px', 
              background: '#fffbeb', 
              border: '1px solid #fcd34d', 
              borderRadius: '8px', 
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontSize: '0.85rem',
              color: '#92400e'
            }}>
              <Clock size={18} color="#d97706" />
              <span>
                لديك طلب شحن بقيمة <strong>{formattedPendingBalance}</strong> قيد المراجعة والتدقيق من قبل الإدارة. لا يعتبر هذا المبلغ جزءاً من رصيدك المتاح حتى تتم الموافقة عليه.
              </span>
            </div>
          )}
        </div>

        {/* Referral Program Dynamic Reward Card */}
        <ReferralCard />

        {/* Promo & Gift Code Redemption Card */}
        <PromoRedemptionCard />

        {/* Tabbed Activity & History Section */}
        <div style={{ 
          background: '#FFFFFF', 
          border: '1px solid var(--border-subtle)', 
          borderRadius: 'var(--radius-xl)', 
          padding: 'clamp(20px, 4vw, 32px)', 
          boxShadow: 'var(--shadow-sm)' 
        }}>
          {/* Tabs */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            borderBottom: '1.5px solid #e2e8f0', 
            paddingBottom: '12px',
            marginBottom: '20px',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setActiveAccountTab('orders')}
                style={{
                  background: activeAccountTab === 'orders' ? '#0B0F19' : 'transparent',
                  color: activeAccountTab === 'orders' ? '#facc15' : '#64748b',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 14px',
                  fontWeight: 800,
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span>شحنات الألعاب والطلبات</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveAccountTab('topups')}
                style={{
                  background: activeAccountTab === 'topups' ? '#0B0F19' : 'transparent',
                  color: activeAccountTab === 'topups' ? '#facc15' : '#64748b',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 14px',
                  fontWeight: 800,
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <ArrowDownCircle size={15} />
                <span>شحن المحفظة ({topupRequests.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveAccountTab('transactions')}
                style={{
                  background: activeAccountTab === 'transactions' ? '#0B0F19' : 'transparent',
                  color: activeAccountTab === 'transactions' ? '#facc15' : '#64748b',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 14px',
                  fontWeight: 800,
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <History size={15} />
                <span>كشف الحساب والعمليات</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveAccountTab('cashback')}
                style={{
                  background: activeAccountTab === 'cashback' ? '#0B0F19' : 'transparent',
                  color: activeAccountTab === 'cashback' ? '#facc15' : '#64748b',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 14px',
                  fontWeight: 800,
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Coins size={15} />
                <span>سجل الكاش باك ({cashbackSummary.redemptionCount})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveAccountTab('reviews')}
                style={{
                  background: activeAccountTab === 'reviews' ? '#0B0F19' : 'transparent',
                  color: activeAccountTab === 'reviews' ? '#facc15' : '#64748b',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 14px',
                  fontWeight: 800,
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Star size={15} />
                <span>تقييماتي ({userReviews.length})</span>
              </button>
            </div>

            {activeAccountTab === 'topups' && (
              <button className="btn btn-secondary btn-sm" onClick={openDepositModal} type="button">
                <span>+ طلب شحن جديد</span>
              </button>
            )}
          </div>

          {/* TOP-UP REQUESTS CONTENT */}
          {activeAccountTab === 'topups' && (
            <div>
              {topupRequests.length === 0 ? (
                <div style={{ padding: '40px 16px', textAlign: 'center', color: '#64748b' }}>
                  <ArrowDownCircle size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                  <p style={{ margin: 0, fontWeight: 700 }}>لم تقم بإنشاء أي طلبات شحن بعد.</p>
                  <button 
                    className="btn btn-primary btn-sm" 
                    onClick={openDepositModal} 
                    style={{ marginTop: '14px' }}
                  >
                    شحن الرصيد الآن
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {topupRequests.map((t) => (
                    <div 
                      key={t.id} 
                      style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center', 
                        padding: '16px 20px', 
                        background: '#f8fafc', 
                        borderRadius: '12px', 
                        border: '1px solid #e2e8f0', 
                        flexWrap: 'wrap', 
                        gap: 14 
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                          <span style={{ fontWeight: 900, color: '#0B0F19', fontSize: '1.05rem', fontFamily: 'var(--font-latin)' }}>
                            ${parseFloat(t.amount_usd).toFixed(2)} USD
                          </span>

                          {t.status === 'PENDING' && (
                            <span style={{ 
                              fontSize: '0.75rem', 
                              color: '#854d0e', 
                              background: '#fef9c3', 
                              border: '1px solid #fde047',
                              padding: '2px 10px', 
                              borderRadius: '12px', 
                              fontWeight: 800,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}>
                              <Clock size={12} />
                              قيد المراجعة
                            </span>
                          )}

                          {t.status === 'APPROVED' && (
                            <span style={{ 
                              fontSize: '0.75rem', 
                              color: '#065f46', 
                              background: '#d1fae5', 
                              border: '1px solid #a7f3d0',
                              padding: '2px 10px', 
                              borderRadius: '12px', 
                              fontWeight: 800,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}>
                              <CheckCircle2 size={12} />
                              تمت الموافقة وإيداع الرصيد
                            </span>
                          )}

                          {t.status === 'REJECTED' && (
                            <span style={{ 
                              fontSize: '0.75rem', 
                              color: '#991b1b', 
                              background: '#fee2e2', 
                              border: '1px solid #fca5a5',
                              padding: '2px 10px', 
                              borderRadius: '12px', 
                              fontWeight: 800,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}>
                              <XCircle size={12} />
                              مرفوض
                            </span>
                          )}
                        </div>

                        <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                          المبلغ المطلوب: <strong>{Number(t.amount_sdg).toLocaleString()} ج.س</strong> (سعر الصرف المقفل: 1$ = {Number(t.exchange_rate).toLocaleString()} SDG)
                        </div>

                        <div style={{ fontSize: '0.775rem', color: '#94a3b8', marginTop: 2 }}>
                          طريقة الدفع: {t.payment_method_name || 'تحويل بنكي'} • {new Date(t.created_at).toLocaleString('ar-EG')}
                        </div>

                        {/* Rejection Reason Notice */}
                        {t.status === 'REJECTED' && t.rejection_reason && (
                          <div style={{ 
                            marginTop: 8, 
                            padding: '6px 10px', 
                            background: '#fef2f2', 
                            borderRadius: 6, 
                            color: '#b91c1c', 
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            border: '1px dashed #f87171'
                          }}>
                            سبب الرفض من الإدارة: {t.rejection_reason}
                          </div>
                        )}
                      </div>

                      {/* Receipt preview trigger */}
                      {t.receipt_url && (
                        <div>
                          <button
                            type="button"
                            onClick={() => setSelectedReceiptUrl(getFullReceiptUrl(t.receipt_url))}
                            style={{
                              background: '#fff',
                              border: '1px solid #cbd5e1',
                              borderRadius: '6px',
                              padding: '6px 12px',
                              fontSize: '0.8rem',
                              fontWeight: 700,
                              color: '#0369a1',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px'
                            }}
                          >
                            <FileText size={14} />
                            <span>عرض الإيصال المرفق</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* GAME ORDERS CONTENT */}
          {activeAccountTab === 'orders' && (
            <div>
              {loadingOrders && userOrders.length === 0 ? (
                <div style={{ padding: '40px 16px', textAlign: 'center', color: '#64748b' }}>
                  <p style={{ margin: 0, fontWeight: 700 }}>جاري جلب سجل طلباتك من السيرفر...</p>
                </div>
              ) : userOrders.length === 0 ? (
                <div style={{ padding: '40px 16px', textAlign: 'center', color: '#64748b' }}>
                  <p style={{ margin: 0, fontWeight: 700 }}>لم تقم بطلب أي باقات أو أكواد بعد.</p>
                  <button 
                    className="btn btn-primary btn-sm" 
                    onClick={() => navigateTo('home')} 
                    style={{ marginTop: '14px', fontWeight: 800 }}
                  >
                    تصفح ألعاب وبطاقات المتجر
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {userOrders.map((ord) => {
                    const isCompleted = ord.status === 'COMPLETED' || ord.status === 'completed';
                    const isProcessing = ord.status === 'PROCESSING' || ord.status === 'processing';
                    const isFailed = ord.status === 'FAILED' || ord.status === 'failed';
                    const isRefunded = ord.status === 'REFUNDED';
                    const fulfillmentKey = ord.fulfillmentKey || ord.key;

                    return (
                      <div 
                        key={ord.id} 
                        style={{ 
                          padding: '16px 20px', 
                          background: '#f8fafc', 
                          borderRadius: '12px', 
                          border: '1px solid #e2e8f0',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 12
                        }}
                      >
                        {/* Order Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 900, color: '#0B0F19', fontSize: '1rem' }}>
                                {ord.packageName || 'بطاقة ستيم الرقمية (Steam US)'}
                              </span>

                              {/* Status Badge */}
                              {isCompleted && (
                                <>
                                  <span style={{ fontSize: '0.75rem', color: '#059669', background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '2px 10px', borderRadius: 12, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                    <CheckCircle2 size={12} />
                                    مكتمل (COMPLETED)
                                  </span>

                                  <button
                                    type="button"
                                    onClick={() => setReviewModalOrder({ id: ord.id, packageName: ord.packageName || 'طلب ألعاب' })}
                                    style={{
                                      backgroundColor: '#FEF3C7',
                                      border: '1px solid #FDE68A',
                                      color: '#92400E',
                                      padding: '2px 10px',
                                      borderRadius: 12,
                                      fontWeight: 800,
                                      fontSize: '0.75rem',
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 4
                                    }}
                                  >
                                    <Star size={11} fill="#F59E0B" color="#F59E0B" />
                                    <span>قيّم تجربتك</span>
                                  </button>
                                </>
                              )}

                              {isProcessing && (
                                <span style={{ fontSize: '0.75rem', color: '#0284c7', background: '#e0f2fe', border: '1px solid #bae6fd', padding: '2px 10px', borderRadius: 12, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                  <Zap size={12} className="animate-spin" />
                                  جاري التنفيذ التلقائي (PROCESSING ⚡)
                                </span>
                              )}

                              {isFailed && (
                                <span style={{ fontSize: '0.75rem', color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', padding: '2px 10px', borderRadius: 12, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                  <XCircle size={12} />
                                  فشل التنفيذ (FAILED)
                                </span>
                              )}

                              {isRefunded && (
                                <span style={{ fontSize: '0.75rem', color: '#7c3aed', background: '#f5f3ff', border: '1px solid #ddd6fe', padding: '2px 10px', borderRadius: 12, fontWeight: 800 }}>
                                  تم استرجاع الرصيد (REFUNDED)
                                </span>
                              )}

                              {ord.cashbackAmount && Number(ord.cashbackAmount) > 0 && (
                                <span style={{ fontSize: '0.75rem', color: '#15803d', background: '#f0fdf4', border: '1px solid #86efac', padding: '2px 10px', borderRadius: 12, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                  <Coins size={12} />
                                  كاش باك: +{formatCurrency(Number(ord.cashbackAmount), ord.currency || user.currency)}
                                </span>
                              )}
                            </div>

                              <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 4 }}>
                                معرّف الاستلام / الحساب: <strong>{ord.playerId}</strong> • {new Date(ord.createdAt).toLocaleString('ar-EG')}
                              </div>
                            </div>

                            <div style={{ textAlign: 'left' }}>
                              <span style={{ fontFamily: 'var(--font-latin)', fontWeight: 900, fontSize: '1.2rem', color: '#0B0F19', direction: 'ltr' }}>
                                {formatCurrency(Number(ord.amount), ord.currency || user.currency)}
                              </span>
                              <span style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', direction: 'ltr' }}>
                                رقم الطلب: {ord.id.substring(0, 13)}...
                              </span>
                            </div>
                          </div>

                        {/* KEY DELIVERY CARD (When COMPLETED & Key Present) */}
                        {isCompleted && fulfillmentKey && (
                          <div style={{ 
                            background: '#0B0F19', 
                            borderRadius: '10px', 
                            padding: '12px 16px', 
                            border: '1.5px solid var(--accent-yellow)',
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center', 
                            flexWrap: 'wrap', 
                            gap: 12 
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div style={{ 
                                width: 32, 
                                height: 32, 
                                borderRadius: 6, 
                                background: 'rgba(250, 204, 21, 0.15)', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center', 
                                color: 'var(--accent-yellow)' 
                              }}>
                                <Key size={18} />
                              </div>
                              <div>
                                <span style={{ fontSize: '0.725rem', color: '#94a3b8', display: 'block', fontWeight: 600 }}>
                                  كود التفعيل الرقمي (Digital Activation Key):
                                </span>
                                <code style={{ 
                                  fontFamily: 'monospace', 
                                  fontSize: '1.05rem', 
                                  fontWeight: 900, 
                                  color: '#facc15', 
                                  letterSpacing: '1px' 
                                }}>
                                  {fulfillmentKey}
                                </code>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleCopyKey(ord.id, fulfillmentKey)}
                              style={{
                                background: copiedKeyId === ord.id ? '#10b981' : 'var(--accent-yellow)',
                                color: copiedKeyId === ord.id ? '#ffffff' : '#0B0F19',
                                border: 'none',
                                borderRadius: '6px',
                                padding: '8px 14px',
                                fontSize: '0.8rem',
                                fontWeight: 900,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                transition: 'all 0.2s ease'
                              }}
                            >
                              {copiedKeyId === ord.id ? <Check size={14} /> : <Copy size={14} />}
                              <span>{copiedKeyId === ord.id ? 'تم النسخ ✓' : 'نسخ المفتاح (Copy Key)'}</span>
                            </button>
                          </div>
                        )}

                        {/* Processing Notification */}
                        {isProcessing && (
                          <div style={{ 
                            background: '#f0f9ff', 
                            border: '1px dashed #7dd3fc', 
                            borderRadius: '8px', 
                            padding: '8px 12px', 
                            fontSize: '0.8rem', 
                            color: '#0369a1',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                          }}>
                            <Zap size={14} color="#0284c7" />
                            <span>طلبك قيد المعالجة والتنفيذ التلقائي. يتم تحديث الحالة تلقائياً كل 7 ثوانٍ وسيظهر المفتاح هنا فور اكتمال الطلب.</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TRANSACTIONS AUDIT / HISTORY */}
          {activeAccountTab === 'transactions' && (
            <div>
              {loadingTransactions ? (
                <div style={{ padding: '40px 16px', textAlign: 'center', color: '#64748b' }}>
                  <History size={36} className="animate-spin" style={{ margin: '0 auto 12px', opacity: 0.5 }} />
                  <p style={{ margin: 0, fontWeight: 700 }}>جاري تحميل كشف الحساب والعمليات...</p>
                </div>
              ) : transactions.length === 0 ? (
                <div style={{ padding: '40px 16px', textAlign: 'center', color: '#64748b' }}>
                  <History size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                  <p style={{ margin: 0, fontWeight: 700 }}>لا توجد أي حركات مالية مسجلة في محفظتك حتى الآن.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {transactions.map((tx) => {
                    const isCredit = ['TOPUP_CREDIT', 'ORDER_REFUND', 'CASHBACK', 'PROMO_CREDIT'].includes(tx.type) || Number(tx.amount) > 0;
                    const typeLabel = 
                      tx.type === 'TOPUP_CREDIT' ? 'شحن رصيد' :
                      tx.type === 'ORDER_PAYMENT' ? 'دفع طلب' :
                      tx.type === 'ORDER_REFUND' ? 'استرجاع رصيد' :
                      tx.type === 'CASHBACK' ? 'مكافأة كاش باك' :
                      tx.type === 'PROMO_CREDIT' ? 'شحن بكود هدية' :
                      tx.type === 'ADMIN_ADJUSTMENT' ? 'تعديل إداري' : tx.type;

                    const badgeBg = 
                      tx.type === 'CASHBACK' ? '#f0fdf4' :
                      tx.type === 'TOPUP_CREDIT' ? '#ecfdf5' :
                      tx.type === 'ORDER_REFUND' ? '#eff6ff' :
                      tx.type === 'PROMO_CREDIT' ? '#faf5ff' : '#fef2f2';

                    const badgeColor = 
                      tx.type === 'CASHBACK' ? '#15803d' :
                      tx.type === 'TOPUP_CREDIT' ? '#059669' :
                      tx.type === 'ORDER_REFUND' ? '#2563eb' :
                      tx.type === 'PROMO_CREDIT' ? '#7e22ce' : '#dc2626';

                    return (
                      <div
                        key={tx.id}
                        style={{
                          padding: '14px 18px',
                          background: '#f8fafc',
                          borderRadius: '12px',
                          border: '1px solid #e2e8f0',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: 12
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span style={{
                              background: badgeBg,
                              color: badgeColor,
                              fontSize: '0.75rem',
                              fontWeight: 800,
                              padding: '2px 8px',
                              borderRadius: 6
                            }}>
                              {typeLabel}
                            </span>
                            <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0B0F19' }}>
                              {tx.description || typeLabel}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            {new Date(tx.createdAt || Date.now()).toLocaleString('ar-EG')} • الرصيد بعد العملية: <strong>{formatCurrency(Number(tx.balanceAfter || 0), tx.currency || user.currency)}</strong>
                          </div>
                        </div>

                        <div style={{ textAlign: 'left' }}>
                          <span style={{
                            fontFamily: 'var(--font-latin)',
                            fontWeight: 900,
                            fontSize: '1.15rem',
                            color: isCredit ? '#15803d' : '#dc2626',
                            direction: 'ltr'
                          }}>
                            {isCredit ? '+' : '-'}{formatCurrency(Math.abs(Number(tx.amount)), tx.currency || user.currency)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* CASHBACK REWARDS & ACTIVITY */}
          {activeAccountTab === 'cashback' && (
            <div>
              {/* Cashback Stats Card */}
              <div style={{
                background: 'linear-gradient(135deg, #0B0F19 0%, #1e293b 100%)',
                borderRadius: '14px',
                padding: '20px 24px',
                color: '#fff',
                marginBottom: 20,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 16
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#facc15', fontSize: '0.85rem', fontWeight: 800, marginBottom: 4 }}>
                    <Coins size={18} />
                    <span>برنامج مكافآت KIROPRO Cashback</span>
                  </div>
                  <h3 style={{ fontSize: '1.4rem', fontWeight: 900, margin: '0 0 4px 0' }}>
                    +{formatCurrency(cashbackSummary.totalEarned, user.currency || currency)}
                  </h3>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: '#94a3b8' }}>
                    إجمالي الكاش باك المكتسب الذي أضيف مباشرة إلى رصيد محفظتك المتاح
                  </p>
                </div>

                <div style={{
                  background: 'rgba(255,255,255,0.08)',
                  borderRadius: '10px',
                  padding: '10px 18px',
                  textAlign: 'center',
                  border: '1px solid rgba(255,255,255,0.12)'
                }}>
                  <span style={{ fontSize: '0.75rem', color: '#cbd5e1', display: 'block', fontWeight: 600 }}>عدد المكافآت</span>
                  <strong style={{ fontSize: '1.25rem', color: '#facc15' }}>{cashbackSummary.redemptionCount}</strong>
                </div>
              </div>

              {cashbackSummary.redemptions.length === 0 ? (
                <div style={{ padding: '40px 16px', textAlign: 'center', color: '#64748b' }}>
                  <Coins size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                  <p style={{ margin: 0, fontWeight: 700 }}>لم تكتسب أي كاش باك بعد.</p>
                  <p style={{ margin: '6px 0 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>
                    قم بشحن ألعابك وبطاقاتك وسيرجع الكاش باك إلى محفظتك فور اكتمال الطلب تلقائياً!
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {cashbackSummary.redemptions.map((r, idx) => (
                    <div
                      key={r.id || idx}
                      style={{
                        padding: '14px 18px',
                        background: '#f0fdf4',
                        borderRadius: '12px',
                        border: '1px solid #bbf7d0',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: 12
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{
                            background: '#15803d',
                            color: '#fff',
                            fontSize: '0.725rem',
                            fontWeight: 800,
                            padding: '2px 8px',
                            borderRadius: 6
                          }}>
                            +{r.percentage}% كاش باك
                          </span>
                          <strong style={{ fontSize: '0.9rem', color: '#0f172a' }}>
                            {r.rule_name || 'مكافأة إتمام الطلب'}
                          </strong>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                          رقم الطلب: {r.order_id?.substring(0, 13)}... • {new Date(r.created_at).toLocaleString('ar-EG')}
                        </div>
                      </div>

                      <div style={{ textAlign: 'left' }}>
                        <span style={{
                          fontFamily: 'var(--font-latin)',
                          fontWeight: 900,
                          fontSize: '1.15rem',
                          color: '#15803d',
                          direction: 'ltr'
                        }}>
                          +{formatCurrency(Number(r.amount_credited), r.currency || user.currency)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* USER REVIEWS CONTENT */}
          {activeAccountTab === 'reviews' && (
            <div>
              {loadingUserReviews ? (
                <div style={{ padding: '40px 16px', textAlign: 'center', color: '#64748b' }}>
                  <p style={{ margin: 0, fontWeight: 700 }}>جاري جلب تقييماتك...</p>
                </div>
              ) : userReviews.length === 0 ? (
                <div style={{ padding: '40px 16px', textAlign: 'center', color: '#64748b' }}>
                  <Star size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                  <p style={{ margin: 0, fontWeight: 700 }}>لم تقم بتقييم أي طلبات بعد.</p>
                  <p style={{ margin: '6px 0 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>
                    يمكنك تقييم أي طلب مكتمل مباشرة بالضغط على "قيّم تجربتك" في تبويب الطلبات.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {userReviews.map((rev) => (
                    <div
                      key={rev.id}
                      style={{
                        padding: '16px 20px',
                        background: '#f8fafc',
                        borderRadius: '12px',
                        border: '1px solid #e2e8f0',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 10
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <strong style={{ fontSize: '0.95rem', color: '#0f172a' }}>
                            {rev.productName}
                          </strong>
                          <span style={{
                            fontSize: '0.75rem',
                            fontWeight: 800,
                            padding: '2px 8px',
                            borderRadius: 6,
                            backgroundColor: rev.status === 'APPROVED' ? '#dcfce7' : '#fef3c7',
                            color: rev.status === 'APPROVED' ? '#166534' : '#92400e'
                          }}>
                            {rev.statusLabel}
                          </span>
                        </div>

                        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                          {new Date(rev.createdAt).toLocaleDateString('ar-EG')}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ display: 'inline-flex', gap: 2, direction: 'ltr' }}>
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Star
                              key={s}
                              size={15}
                              fill={s <= rev.rating ? '#F59E0B' : 'transparent'}
                              color={s <= rev.rating ? '#F59E0B' : '#94a3b8'}
                            />
                          ))}
                        </div>
                        <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#b45309' }}>
                          ({rev.rating} من 5)
                        </span>
                      </div>

                      {rev.comment && (
                        <p style={{ margin: 0, fontSize: '0.85rem', color: '#475569', lineHeight: 1.6 }}>
                          "{rev.comment}"
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => navigateTo('home')} type="button">
            <span>العودة للرئيسية</span>
          </button>
          <button
            onClick={logout}
            style={{ color: '#EF4444', fontWeight: 800, fontSize: '0.9rem', background: 'none', border: 'none', cursor: 'pointer' }}
            type="button"
          >
            تسجيل الخروج من الحساب
          </button>
        </div>
      </div>

      {/* User Receipt Preview Modal */}
      {selectedReceiptUrl && (
        <div 
          className="admin-modal-backdrop" 
          style={{ zIndex: 12000 }} 
          onClick={() => setSelectedReceiptUrl(null)}
        >
          <div 
            style={{ 
              maxWidth: '90vw', 
              maxHeight: '90vh', 
              position: 'relative', 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center' 
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSelectedReceiptUrl(null)}
              style={{
                position: 'absolute',
                top: '-40px',
                right: '0',
                background: '#fff',
                border: 'none',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                cursor: 'pointer',
                fontWeight: 900,
                fontSize: '1.2rem'
              }}
            >
              &times;
            </button>
            {selectedReceiptUrl.toLowerCase().endsWith('.pdf') ? (
              <div style={{ background: '#fff', padding: '30px', borderRadius: '12px', textAlign: 'center' }}>
                <FileText size={48} color="#dc2626" style={{ margin: '0 auto 12px' }} />
                <p style={{ fontWeight: 800, margin: '0 0 16px 0' }}>مستند PDF لإشعار التحويل</p>
                <a 
                  href={selectedReceiptUrl} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="btn btn-primary btn-sm"
                >
                  فتح المستند في نافذة جديدة
                </a>
              </div>
            ) : (
              <img 
                src={selectedReceiptUrl} 
                alt="Receipt" 
                style={{ 
                  maxHeight: '85vh', 
                  maxWidth: '90vw', 
                  objectFit: 'contain', 
                  borderRadius: '12px',
                  boxShadow: '0 8px 30px rgba(0,0,0,0.5)'
                }} 
              />
            )}
          </div>
        </div>
      )}

      {/* Review Modal for Completed Orders */}
      {reviewModalOrder && (
        <ReviewModal
          isOpen={!!reviewModalOrder}
          onClose={() => setReviewModalOrder(null)}
          orderId={reviewModalOrder.id}
          packageName={reviewModalOrder.packageName}
          onSuccess={() => {
            loadOrders();
            loadUserReviews();
          }}
        />
      )}
    </div>
  );
};
