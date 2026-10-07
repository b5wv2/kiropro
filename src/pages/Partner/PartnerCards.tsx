import React, { useEffect, useState, useRef } from 'react';
import { usePartner } from '../../context/PartnerContext';
import { 
  CreditCard, 
  ShieldCheck, 
  Copy, 
  Eye, 
  EyeOff, 
  Check, 
  RefreshCw, 
  Zap, 
  AlertCircle, 
  ShoppingBag
} from 'lucide-react';

interface CardInfo {
  productId: string;
  name: string;
  arabicName: string;
  retailPriceUsd: number;
  partnerPriceUsd: number;
  availableCount: number;
  walletBalance: number;
  canAfford: boolean;
}

interface IssuedCard {
  id: string;
  cardLast4: string;
  expDate: string;
  balance: number;
  assignedAt: string;
  orderNumber?: string;
  orderStatus?: string;
}

interface CardCredentials {
  id: string;
  cardNumber: string;
  cvv: string;
  expDate: string;
  last4: string;
  balance: number;
}

export const PartnerCards: React.FC = () => {
  const { wallet, refreshProfile, partnerFetch } = usePartner();

  const [cardInfo, setCardInfo] = useState<CardInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [myCards, setMyCards] = useState<IssuedCard[]>([]);
  const [loadingCards, setLoadingCards] = useState(false);

  // Issuance State
  const [issuing, setIssuing] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [newlyIssuedCard, setNewlyIssuedCard] = useState<{
    orderNumber: string;
    card: { id: string; last4: string; expDate: string; balance: number; assignedAt: string };
  } | null>(null);

  // Reveal Modal State
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<CardCredentials | null>(null);
  const [loadingCredentials, setLoadingCredentials] = useState(false);
  const [credentialsError, setCredentialsError] = useState<string | null>(null);
  const [showPan, setShowPan] = useState(false);
  const [showCvv, setShowCvv] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Prevent double click ref
  const isSubmittingRef = useRef(false);

  const loadCardInfo = async () => {
    try {
      setLoadingInfo(true);
      const res = await partnerFetch<{ success: boolean; card: CardInfo }>('/api/partner/kiropro-cards/info');
      if (res?.card) {
        setCardInfo(res.card);
      }
    } catch (err: any) {
      console.error('Failed to load card info', err);
    } finally {
      setLoadingInfo(false);
    }
  };

  const loadMyCards = async () => {
    try {
      setLoadingCards(true);
      const res = await partnerFetch<{ success: boolean; cards: IssuedCard[] }>('/api/partner/kiropro-cards/my-cards');
      if (res?.cards) {
        setMyCards(res.cards);
      }
    } catch (err: any) {
      console.error('Failed to load issued cards', err);
    } finally {
      setLoadingCards(false);
    }
  };

  useEffect(() => {
    loadCardInfo();
    loadMyCards();
  }, []);

  const handleIssueCard = async () => {
    if (isSubmittingRef.current || issuing) return;
    setIssueError(null);

    const partnerPrice = cardInfo?.partnerPriceUsd ?? 1.13;
    const currentBalance = Number(wallet?.balance ?? 0);

    if (currentBalance < partnerPrice) {
      setIssueError(`رصيدك الحالي ($${currentBalance.toFixed(2)}) غير كافٍ. سعر إصدار البطاقة للشريك هو $${partnerPrice.toFixed(2)} USD.`);
      return;
    }

    try {
      isSubmittingRef.current = true;
      setIssuing(true);

      // Generate client idempotency key to prevent double-billing
      const idempotencyKey = `pkc_${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36)}`;

      const res = await partnerFetch<{
        success: boolean;
        message: string;
        orderNumber: string;
        card: { id: string; last4: string; expDate: string; balance: number; assignedAt: string };
      }>('/api/partner/kiropro-cards/issue', {
        method: 'POST',
        body: JSON.stringify({ idempotencyKey })
      });

      if (res.success && res.card) {
        setNewlyIssuedCard({
          orderNumber: res.orderNumber,
          card: res.card
        });
        await refreshProfile();
        await loadCardInfo();
        await loadMyCards();
      }
    } catch (err: any) {
      setIssueError(err.message || 'فشل إصدار البطاقة. يرجى المحاولة مرة أخرى.');
    } finally {
      setIssuing(false);
      isSubmittingRef.current = false;
    }
  };

  const handleViewCredentials = async (cardId: string) => {
    setSelectedCardId(cardId);
    setCredentials(null);
    setCredentialsError(null);
    setShowPan(false);
    setShowCvv(false);

    try {
      setLoadingCredentials(true);
      const res = await partnerFetch<{
        success: boolean;
        credentials: CardCredentials;
      }>(`/api/partner/kiropro-cards/${cardId}/credentials`);

      if (res.credentials) {
        setCredentials(res.credentials);
      }
    } catch (err: any) {
      setCredentialsError(err.message || 'تعذر جلب بيانات البطاقة الحساسة.');
    } finally {
      setLoadingCredentials(false);
    }
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const partnerPrice = cardInfo?.partnerPriceUsd ?? 1.13;
  const retailPrice = cardInfo?.retailPriceUsd ?? 2.00;
  const estimatedProfit = retailPrice - partnerPrice;
  const availableStock = cardInfo?.availableCount ?? 0;
  const currentWalletBalance = Number(wallet?.balance ?? 0);
  const canAfford = currentWalletBalance >= partnerPrice;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, direction: 'rtl' }}>
      
      {/* Header Banner */}
      <div className="partner-card partner-card-glow" style={{
        background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.85) 100%)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 20
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: 'linear-gradient(135deg, #F59E0B, #B45309)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#0B0F19'
            }}>
              <CreditCard size={24} />
            </span>
            <div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fff', margin: 0 }}>
                بطاقات ماستركارد الافتراضية (KiroPro Card)
              </h2>
              <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                إصدار فوري ومباشر لبطاقات Mastercard Virtual العالمية مع خصم خاص للشركاء
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={() => { loadCardInfo(); loadMyCards(); }}
          className="btn-partner-secondary"
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px' }}
        >
          <RefreshCw size={16} className={loadingInfo || loadingCards ? 'spin-anim' : ''} />
          <span>تحديث</span>
        </button>
      </div>

      {/* Main Issue Card & Stats Section */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
        
        {/* Card Visual Preview */}
        <div className="partner-card" style={{
          background: 'linear-gradient(135deg, #181E29 0%, #0F131C 100%)',
          border: '1px solid rgba(245, 158, 11, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          minHeight: 280,
          position: 'relative',
          overflow: 'hidden',
          padding: 24
        }}>
          {/* Card Metallic Glow Elements */}
          <div style={{
            position: 'absolute',
            top: -40,
            right: -40,
            width: 140,
            height: 140,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(245, 158, 11, 0.18) 0%, transparent 70%)',
            pointerEvents: 'none'
          }} />

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  color: '#F59E0B',
                  fontWeight: 900,
                  fontSize: '1.2rem',
                  letterSpacing: '1px'
                }}>
                  KIROPRO
                </span>
                <span style={{
                  background: 'rgba(245, 158, 11, 0.15)',
                  color: '#F59E0B',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  padding: '2px 8px',
                  borderRadius: 6,
                  fontSize: '0.72rem',
                  fontWeight: 800
                }}>
                  PARTNER EDITION
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: -6 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#EB001B', opacity: 0.9 }} />
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#F79E1B', opacity: 0.9, marginLeft: -12 }} />
              </div>
            </div>

            {/* Chip & Contactless */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
              <div style={{
                width: 38,
                height: 28,
                borderRadius: 5,
                background: 'linear-gradient(135deg, #d4af37, #f6e27a, #aa771c)',
                boxShadow: 'inset 0 0 4px rgba(0,0,0,0.4)',
                border: '1px solid #997523'
              }} />
              <div style={{ color: '#64748B', fontSize: '1.1rem', transform: 'rotate(90deg)' }}>
                )))
              </div>
            </div>

            {/* Masked Card Number Preview */}
            <div style={{
              fontFamily: 'monospace',
              fontSize: '1.25rem',
              letterSpacing: '3px',
              color: '#F1F5F9',
              fontWeight: 700,
              marginBottom: 16
            }}>
              •••• •••• •••• 3933
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
              <div style={{ fontSize: '0.7rem', color: '#64748B', textTransform: 'uppercase' }}>Card Holder</div>
              <div style={{ fontSize: '0.9rem', color: '#CBD5E1', fontWeight: 700 }}>VALUED PARTNER</div>
            </div>
            <div>
              <div style={{ fontSize: '0.7rem', color: '#64748B', textTransform: 'uppercase' }}>Balance</div>
              <div style={{ fontSize: '1rem', color: '#10B981', fontWeight: 900 }}>$1.00 USD</div>
            </div>
          </div>
        </div>

        {/* Pricing & Issue Action Box */}
        <div className="partner-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#fff' }}>
                تسعير وإصدار البطاقة
              </h3>
              <span style={{
                padding: '4px 10px',
                borderRadius: 8,
                fontSize: '0.78rem',
                fontWeight: 800,
                background: availableStock > 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                color: availableStock > 0 ? '#10B981' : '#EF4444',
                border: `1px solid ${availableStock > 0 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
              }}>
                {availableStock > 0 ? `المتوفر: ${availableStock} بطاقة` : 'نفذت الكمية مؤقتاً'}
              </span>
            </div>

            {/* Price breakdown */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 10,
              marginBottom: 16
            }}>
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 10, textAlign: 'center', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: 4 }}>سعر الشريك</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#F59E0B' }}>
                  ${partnerPrice.toFixed(2)}
                </div>
                <div style={{ fontSize: '0.7rem', color: '#64748B' }}>USD</div>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 10, textAlign: 'center', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: 4 }}>سعر الزبائن</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#CBD5E1' }}>
                  ${retailPrice.toFixed(2)}
                </div>
                <div style={{ fontSize: '0.7rem', color: '#64748B' }}>USD</div>
              </div>

              <div style={{ background: 'rgba(16, 185, 129, 0.08)', padding: 12, borderRadius: 10, textAlign: 'center', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                <div style={{ fontSize: '0.75rem', color: '#6EE7B7', marginBottom: 4 }}>ربح الشريك</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#10B981' }}>
                  +${estimatedProfit.toFixed(2)}
                </div>
                <div style={{ fontSize: '0.7rem', color: '#34D399' }}>43.5%</div>
              </div>
            </div>

            <div style={{
              background: 'rgba(245, 158, 11, 0.06)',
              border: '1px solid rgba(245, 158, 11, 0.15)',
              borderRadius: 10,
              padding: 12,
              marginBottom: 16,
              fontSize: '0.85rem',
              color: '#FDE68A',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <span>رصيد محفظتك الحالي:</span>
              <strong style={{ fontSize: '1rem', color: currentWalletBalance >= partnerPrice ? '#10B981' : '#EF4444' }}>
                ${currentWalletBalance.toFixed(2)} USD
              </strong>
            </div>

            {issueError && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: 8,
                padding: '10px 14px',
                color: '#FCA5A5',
                fontSize: '0.85rem',
                marginBottom: 14,
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}>
                <AlertCircle size={16} />
                <span>{issueError}</span>
              </div>
            )}
          </div>

          <button
            onClick={handleIssueCard}
            disabled={issuing || availableStock <= 0 || !canAfford}
            className="btn-partner-primary"
            style={{
              width: '100%',
              padding: '14px 20px',
              fontSize: '1.05rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              cursor: (issuing || availableStock <= 0 || !canAfford) ? 'not-allowed' : 'pointer',
              opacity: (availableStock <= 0 || !canAfford) ? 0.6 : 1
            }}
          >
            {issuing ? (
              <>
                <RefreshCw size={18} className="spin-anim" />
                <span>جارٍ المعالجة والخصم بأمان...</span>
              </>
            ) : availableStock <= 0 ? (
              <span>المخزون غير متوفر حالياً</span>
            ) : !canAfford ? (
              <span>الرصيد غير كافٍ للشراء</span>
            ) : (
              <>
                <Zap size={18} />
                <span>إصدار بطاقة ماستركارد الآن (${partnerPrice.toFixed(2)} USD)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Newly Issued Card Modal Banner */}
      {newlyIssuedCard && (
        <div className="partner-card" style={{
          background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(5, 150, 105, 0.1) 100%)',
          border: '1px solid rgba(16, 185, 129, 0.4)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              background: '#10B981',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#0B0F19'
            }}>
              <Check size={24} />
            </span>
            <div>
              <div style={{ color: '#6EE7B7', fontWeight: 900, fontSize: '1.1rem' }}>
                تم إصدار بطاقة ماستركارد بنجاح!
              </div>
              <div style={{ color: '#D1FAE5', fontSize: '0.85rem' }}>
                رقم الطلب: <strong>{newlyIssuedCard.orderNumber}</strong> • البطاقة تنتهي بـ: <strong>{newlyIssuedCard.card.last4}</strong>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => handleViewCredentials(newlyIssuedCard.card.id)}
              className="btn-partner-primary"
              style={{ padding: '8px 16px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Eye size={16} />
              <span>عرض بيانات البطاقة (PAN / CVV)</span>
            </button>
            <button
              onClick={() => setNewlyIssuedCard(null)}
              className="btn-partner-secondary"
              style={{ padding: '8px 14px', fontSize: '0.85rem' }}
            >
              إغلاق
            </button>
          </div>
        </div>
      )}

      {/* Issued Cards History */}
      <div className="partner-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShoppingBag size={18} color="#F59E0B" />
            <span>البطاقات المصدرة لهذا الحساب ({myCards.length})</span>
          </h3>
          <span style={{ fontSize: '0.82rem', color: '#94a3b8' }}>
            يمكنك الوصول إلى تفاصيل أي بطاقة تم شراؤها في أي وقت
          </span>
        </div>

        {loadingCards ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
            <RefreshCw size={24} className="spin-anim" style={{ margin: '0 auto 10px auto' }} />
            <div>جارٍ تحميل بطاقاتك...</div>
          </div>
        ) : myCards.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>
            <CreditCard size={40} style={{ margin: '0 auto 12px auto', opacity: 0.4 }} />
            <div style={{ fontWeight: 700, color: '#94a3b8', marginBottom: 6 }}>لم تقم بإصدار أي بطاقات ماستركارد بعد</div>
            <div style={{ fontSize: '0.85rem' }}>اضغط على "إصدار بطاقة ماستركارد الآن" في الأعلى لبدء البيع لعملائك.</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8', fontSize: '0.82rem' }}>
                  <th style={{ padding: 12 }}>البطاقة</th>
                  <th style={{ padding: 12 }}>الرصيد الأصلي</th>
                  <th style={{ padding: 12 }}>تاريخ الانتهاء</th>
                  <th style={{ padding: 12 }}>تاريخ الإصدار</th>
                  <th style={{ padding: 12 }}>رقم الطلب</th>
                  <th style={{ padding: 12, textAlign: 'center' }}>الإجراء</th>
                </tr>
              </thead>
              <tbody>
                {myCards.map((c) => (
                  <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '0.9rem' }}>
                    <td style={{ padding: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: '#F59E0B' }}>
                          <CreditCard size={18} />
                        </span>
                        <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#F1F5F9' }}>
                          •••• •••• •••• {c.cardLast4}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: 12, fontWeight: 800, color: '#10B981' }}>
                      ${Number(c.balance).toFixed(2)} USD
                    </td>
                    <td style={{ padding: 12, color: '#CBD5E1', fontFamily: 'monospace' }}>
                      {c.expDate}
                    </td>
                    <td style={{ padding: 12, color: '#94a3b8', fontSize: '0.82rem' }}>
                      {new Date(c.assignedAt).toLocaleString('ar-EG')}
                    </td>
                    <td style={{ padding: 12, color: '#94a3b8', fontSize: '0.82rem', fontFamily: 'monospace' }}>
                      {c.orderNumber || '-'}
                    </td>
                    <td style={{ padding: 12, textAlign: 'center' }}>
                      <button
                        onClick={() => handleViewCredentials(c.id)}
                        className="btn-partner-secondary"
                        style={{
                          padding: '6px 14px',
                          fontSize: '0.82rem',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6
                        }}
                      >
                        <Eye size={14} />
                        <span>عرض البيانات</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Sensitive Credentials Reveal Modal */}
      {selectedCardId && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: 20
        }}>
          <div className="partner-card" style={{
            maxWidth: 520,
            width: '100%',
            background: '#0F172A',
            border: '1px solid rgba(245, 158, 11, 0.4)',
            borderRadius: 16,
            padding: 24,
            boxShadow: '0 20px 40px rgba(0,0,0,0.6)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: 'rgba(245, 158, 11, 0.15)',
                  color: '#F59E0B',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <ShieldCheck size={20} />
                </span>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900, color: '#fff' }}>
                  بيانات البطاقة الآمنة
                </h3>
              </div>

              <button
                onClick={() => setSelectedCardId(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '1.2rem',
                  cursor: 'pointer'
                }}
              >
                ✕
              </button>
            </div>

            {loadingCredentials ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                <RefreshCw size={24} className="spin-anim" style={{ margin: '0 auto 10px auto' }} />
                <div>جارٍ فك التشفير بأمان تام...</div>
              </div>
            ) : credentialsError ? (
              <div style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: 8,
                padding: 16,
                color: '#FCA5A5',
                fontSize: '0.9rem'
              }}>
                {credentialsError}
              </div>
            ) : credentials ? (
              <div>
                {/* Visual Card Face */}
                <div style={{
                  background: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)',
                  borderRadius: 12,
                  padding: 20,
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  marginBottom: 20
                }}>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: 6 }}>رقم البطاقة (PAN)</div>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'rgba(0,0,0,0.3)',
                    padding: '8px 12px',
                    borderRadius: 8,
                    marginBottom: 14
                  }}>
                    <span style={{
                      fontFamily: 'monospace',
                      fontSize: '1.15rem',
                      fontWeight: 800,
                      color: '#F1F5F9',
                      letterSpacing: '2px'
                    }}>
                      {showPan ? credentials.cardNumber : `•••• •••• •••• ${credentials.last4}`}
                    </span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => setShowPan(!showPan)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#94a3b8',
                          cursor: 'pointer',
                          padding: 4
                        }}
                        title={showPan ? 'إخفاء' : 'إظهار'}
                      >
                        {showPan ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                      <button
                        onClick={() => copyToClipboard(credentials.cardNumber, 'pan')}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: copiedField === 'pan' ? '#10B981' : '#F59E0B',
                          cursor: 'pointer',
                          padding: 4
                        }}
                        title="نسخ رقم البطاقة"
                      >
                        {copiedField === 'pan' ? <Check size={16} /> : <Copy size={16} />}
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: 4 }}>تاريخ الانتهاء</div>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: 'rgba(0,0,0,0.3)',
                        padding: '8px 12px',
                        borderRadius: 8
                      }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#F1F5F9' }}>
                          {credentials.expDate}
                        </span>
                        <button
                          onClick={() => copyToClipboard(credentials.expDate, 'exp')}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: copiedField === 'exp' ? '#10B981' : '#F59E0B',
                            cursor: 'pointer',
                            padding: 2
                          }}
                        >
                          {copiedField === 'exp' ? <Check size={14} /> : <Copy size={14} />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: 4 }}>رمز الأمان (CVV)</div>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: 'rgba(0,0,0,0.3)',
                        padding: '8px 12px',
                        borderRadius: 8
                      }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#F1F5F9' }}>
                          {showCvv ? credentials.cvv : '•••'}
                        </span>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button
                            onClick={() => setShowCvv(!showCvv)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#94a3b8',
                              cursor: 'pointer',
                              padding: 2
                            }}
                          >
                            {showCvv ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                          <button
                            onClick={() => copyToClipboard(credentials.cvv, 'cvv')}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: copiedField === 'cvv' ? '#10B981' : '#F59E0B',
                              cursor: 'pointer',
                              padding: 2
                            }}
                          >
                            {copiedField === 'cvv' ? <Check size={14} /> : <Copy size={14} />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{
                  fontSize: '0.8rem',
                  color: '#94a3b8',
                  background: 'rgba(255,255,255,0.03)',
                  padding: 10,
                  borderRadius: 8,
                  marginBottom: 16
                }}>
                  🔒 يتم فك تشفير هذه البيانات محلياً عبر اتصال آمن ولا يتم تسجيلها في سجلات الخادم.
                </div>

                <button
                  onClick={() => setSelectedCardId(null)}
                  className="btn-partner-primary"
                  style={{ width: '100%', padding: '12px' }}
                >
                  إغلاق
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};
