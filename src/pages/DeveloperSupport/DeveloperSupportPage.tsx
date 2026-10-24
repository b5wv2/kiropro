import React, { useState, useEffect } from 'react';
import styles from './DeveloperSupportPage.module.css';
import { useAuth } from '../../context/AuthContext';
import { useWallet } from '../../context/WalletContext';
import { api } from '../../lib/api';

export interface MilitaryRank {
  level: number;
  name: string;
  badge: string;
  minAmount: number;
  titleArabic: string;
  accentColor: string;
  description: string;
}

export interface RankProgress {
  currentRank: MilitaryRank;
  nextRank: MilitaryRank | null;
  progressPercent: number;
  remainingToNext: number;
  isMaxRank: boolean;
}

export interface SupportStatus {
  userId: string;
  name: string;
  email: string;
  walletBalance: number;
  currency: string;
  totalDonatedAmount: number;
  militaryRank: string;
  rankBadge: string;
  progress: RankProgress;
  history: Array<{
    id: string;
    amount: number;
    previousRank: string;
    newRank: string;
    createdAt: string;
  }>;
}

export interface HonorSupporter {
  rankPosition: number;
  userId: string;
  displayName: string;
  maskedName: string;
  totalDonatedAmount: number;
  militaryRank: string;
  rankBadge: string;
  rankLevel: number;
  accentColor: string;
}

const QUICK_AMOUNTS = [500, 1000, 1500, 2000, 5000, 10000];

export const DeveloperSupportPage: React.FC = () => {
  const { user, isAuthenticated, navigateTo } = useAuth();
  const { balance: walletContextBalance, openDepositModal, refreshBalance } = useWallet();

  const [activeTab, setActiveTab] = useState<'support' | 'ladder' | 'honor' | 'history'>('support');
  const [status, setStatus] = useState<SupportStatus | null>(null);
  const [ranks, setRanks] = useState<MilitaryRank[]>([]);
  const [leaderboard, setLeaderboard] = useState<HonorSupporter[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Donation form state
  const [selectedAmount, setSelectedAmount] = useState<number>(500);
  const [customAmount, setCustomAmount] = useState<string>('');

  // Celebration Modal
  const [successResult, setSuccessResult] = useState<any | null>(null);

  // Stealth Daily Limit (Max 5 donations per day)
  const [showDailyLimitModal, setShowDailyLimitModal] = useState<boolean>(false);
  const [isDailyLimitReached, setIsDailyLimitReached] = useState<boolean>(false);

  // Fetch initial data
  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load public ranks ladder
      const ranksRes = await api.get<{ ranks: MilitaryRank[] }>('/api/developer-support/ranks').catch(() => null);
      if (ranksRes?.ranks) {
        setRanks(ranksRes.ranks);
      }

      // Load leaderboard
      const leadRes = await api.get<{ leaderboard: HonorSupporter[] }>('/api/developer-support/leaderboard').catch(() => null);
      if (leadRes?.leaderboard) {
        setLeaderboard(leadRes.leaderboard);
      }

      // If user is authenticated, load personal status and refresh wallet
      if (isAuthenticated) {
        const [statusRes] = await Promise.all([
          api.get<SupportStatus>('/api/developer-support/my-status').catch(() => null),
          refreshBalance().catch(() => {})
        ]);
        if (statusRes) {
          setStatus(statusRes);
        }
      }
    } catch (err: any) {
      console.error('Failed to load developer support data:', err);
      setError('تعذر تحميل بيانات دعم المطورين، يرجى إعادة المحاولة.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [isAuthenticated]);

  // Current effective amount
  const effectiveAmount = customAmount ? Math.max(0, parseInt(customAmount, 10) || 0) : selectedAmount;

  // Real user balance resolution:
  // Evaluates status.walletBalance (from API), walletContextBalance (real-time from WalletContext),
  // and user.balance / user.wallet_balance (from AuthContext).
  // Strictly parses as Float/Number to ensure zero type coercion or comparison issues.
  const apiBalance = status?.walletBalance !== undefined && status.walletBalance !== null ? parseFloat(String(status.walletBalance)) : NaN;
  const ctxBalance = walletContextBalance !== undefined && walletContextBalance !== null ? parseFloat(String(walletContextBalance)) : NaN;
  const userBalance = user?.balance !== undefined && user?.balance !== null
    ? parseFloat(String(user.balance))
    : (user?.wallet_balance !== undefined && user?.wallet_balance !== null ? parseFloat(String(user.wallet_balance)) : NaN);

  // If any source provides a positive balance, prioritize it so a zero from an uninitialized source doesn't override real funds:
  const validBalances = [apiBalance, ctxBalance, userBalance].filter(b => !isNaN(b) && isFinite(b));
  const positiveBalance = validBalances.find(b => b > 0);
  const currentWalletBalance = positiveBalance !== undefined ? positiveBalance : (validBalances[0] ?? 0);

  const currentTotalDonated = Number(status?.totalDonatedAmount ?? user?.total_donated_amount ?? 0);
  const projectedTotal = currentTotalDonated + effectiveAmount;

  // Projected rank calculation
  const projectedRank = ranks.slice().reverse().find(r => projectedTotal >= r.minAmount);
  const currentRankLevel = status?.progress?.currentRank?.level ?? 0;
  const willPromote = projectedRank && projectedRank.level > currentRankLevel;

  // Crucial: Only insufficient when user is logged in, effectiveAmount > 0, and currentWalletBalance < effectiveAmount
  const isBalanceInsufficient = Boolean(
    isAuthenticated &&
    effectiveAmount > 0 &&
    currentWalletBalance < effectiveAmount
  );

  // Quick select handler
  const handleQuickSelect = (amt: number) => {
    setSelectedAmount(amt);
    setCustomAmount('');
    setError(null);
  };

  // Custom amount change handler
  const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9]/g, '');
    setCustomAmount(val);
    if (val) {
      setSelectedAmount(0);
    } else {
      setSelectedAmount(500);
    }
    setError(null);
  };

  // Process donation
  const handleDonate = async () => {
    if (!isAuthenticated) {
      navigateTo('login');
      return;
    }

    if (effectiveAmount < 1) {
      setError('يرجى تحديد مبلغ 1 جنيه أو أكثر للدعم.');
      return;
    }

    if (isBalanceInsufficient) {
      setError('رصيد محفظتك غير كافٍ. يرجى شحن الرصيد أولاً.');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const res = await api.post<any>('/api/developer-support/donate', {
        amount: effectiveAmount
      });

      setSuccessResult(res);
      // Reload status and wallet balance to get updated values
      await Promise.all([
        loadData(),
        refreshBalance().catch(() => {})
      ]);
    } catch (err: any) {
      console.error('Donation failed:', err);
      const isDailyLimit = 
        err?.status === 429 ||
        err?.code === 'DAILY_LIMIT_REACHED' ||
        err?.data?.code === 'DAILY_LIMIT_REACHED' ||
        err?.data?.error === 'DAILY_LIMIT_REACHED' ||
        err?.data?.status === 'DAILY_LIMIT_REACHED' ||
        err?.message?.includes('DAILY_LIMIT_REACHED');

      if (isDailyLimit) {
        setShowDailyLimitModal(true);
        setIsDailyLimitReached(true);
        setError(null);
      } else {
        setError(err?.data?.error || err.message || 'فشلت عملية الدعم.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !status && ranks.length === 0) {
    return (
      <div className={styles.container}>
        <div style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', border: '3px solid rgba(245, 158, 11, 0.2)', borderTopColor: '#F59E0B', animation: 'spin 0.8s linear infinite' }} />
          <span style={{ color: '#94A3B8', fontSize: 15, fontWeight: 700 }}>جارٍ تجهيز سجل الشرف والرتب العسكرية...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.inner}>
        {/* Hero Section */}
        <div className={styles.heroSection}>
          <div className={styles.heroTag}>
            <span>🎖️ مجتمع الأبطال والدعم العسكري</span>
          </div>
          <h1 className={styles.heroTitle}>دعم المطورين والمنصة</h1>
          <p className={styles.heroSubtitle}>
            ساهم في استمرار وتطوير سيرفرات KIROPRO عبر رصيد محفظتك، وارتقِ في سلم الرتب العسكرية الشرفية لتحصل على شارات المجد ومرسوم الترقية الرسمي.
          </p>
        </div>

        {/* Page Sub-Tabs */}
        <div className={styles.pageTabs}>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === 'support' ? styles.activeTabBtn : ''}`}
            onClick={() => setActiveTab('support')}
          >
            <span>💖 لوحة الدعم والترقية</span>
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === 'ladder' ? styles.activeTabBtn : ''}`}
            onClick={() => setActiveTab('ladder')}
          >
            <span>📜 سلم الرتب الـ 10</span>
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === 'honor' ? styles.activeTabBtn : ''}`}
            onClick={() => setActiveTab('honor')}
          >
            <span>👑 لوحة الشرف</span>
          </button>
          {isAuthenticated && (
            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === 'history' ? styles.activeTabBtn : ''}`}
              onClick={() => setActiveTab('history')}
            >
              <span>📑 سجل مساهماتك</span>
            </button>
          )}
        </div>

        {/* TAB 1: Support & Profile Card */}
        {activeTab === 'support' && (
          <div className={styles.mainGrid}>
            {/* Left Column: Profile Badge Card */}
            <div className={styles.profileCard}>
              <div className={styles.badgeHeader}>
                <div className={styles.badgeAvatarBox}>
                  <span>{status?.rankBadge || '👤'}</span>
                </div>
                <div className={styles.badgeUserMeta}>
                  <div className={styles.userNameLabel}>
                    {isAuthenticated ? 'المستخدم المقاتل' : 'زائر كريم'}
                  </div>
                  <div className={styles.userHonorTitle}>
                    {isAuthenticated ? (
                      <>
                        <span className={styles.militaryRankBadge}>
                          {status?.militaryRank || 'مَـدَنـي'} {status?.rankBadge || '👤'}
                        </span>
                        <span>{user?.name}</span>
                      </>
                    ) : (
                      <span>[ ضيف شرف ] مرحباً بك</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Wallet and Total Donated Row */}
              <div className={styles.statsRow}>
                <div className={styles.statBox}>
                  <div className={styles.statLabel}>رصيد محفظتك الحالي</div>
                  <div className={`${styles.statValue} ${styles.statValueEmerald}`}>
                    {isAuthenticated ? `${currentWalletBalance.toLocaleString('en-US')} ج.س` : 'سجّل الدخول'}
                  </div>
                </div>
                <div className={styles.statBox}>
                  <div className={styles.statLabel}>إجمالي مساهماتك</div>
                  <div className={`${styles.statValue} ${styles.statValueGold}`}>
                    {`${currentTotalDonated.toLocaleString('en-US')} ج.س`}
                  </div>
                </div>
              </div>

              {/* XP Progress Bar */}
              <div className={styles.progressSection}>
                <div className={styles.progressHeader}>
                  <span style={{ fontWeight: 700, color: '#e2e8f0' }}>
                    المستوى الحالي: {status?.progress?.currentRank?.level || 0}
                  </span>
                  <span className={styles.progressNextRank}>
                    {status?.progress?.nextRank
                      ? `الهدف القادم: [${status.progress.nextRank.name} ${status.progress.nextRank.badge}]`
                      : '👑 رتبة رئيس الدولة القصوى'}
                  </span>
                </div>

                <div className={styles.progressTrack}>
                  <div
                    className={styles.progressBarFill}
                    style={{
                      width: `${status?.progress?.progressPercent || 0}%`
                    }}
                  />
                </div>

                <div className={styles.progressMeta}>
                  <span>نسبة التقدم: {status?.progress?.progressPercent || 0}%</span>
                  <span>
                    {status?.progress?.nextRank
                      ? `المتبقي للترقية: ${status.progress.remainingToNext.toLocaleString('en-US')} ج.س`
                      : 'أعلى رتبة شرفية مكتملة'}
                  </span>
                </div>
              </div>

              {!isAuthenticated && (
                <div style={{ marginTop: 24, textAlign: 'center' }}>
                  <button
                    type="button"
                    onClick={() => navigateTo('login')}
                    className={styles.submitBtn}
                    style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)', boxShadow: 'none' }}
                  >
                    تسجيل الدخول لبدء المسيرة العسكرية 🎖️
                  </button>
                </div>
              )}
            </div>

            {/* Right Column: Donation Action Card */}
            <div className={styles.donationCard}>
              <h2 className={styles.cardHeading}>
                <span>⚔️ تقديم الدعم والترقية العسكرية</span>
              </h2>
              <p className={styles.cardSubtitle}>
                يتم الخصم مباشرة من رصيد محفظتك الداخلية في بيئة معاملات آمنة ومحمية، مع إرسال مرسوم الترقية فورا إلى بريدك الإلكتروني.
              </p>

              {/* Quick Select Buttons */}
              <div className={styles.quickSelectGrid}>
                {QUICK_AMOUNTS.map(amt => (
                  <button
                    key={amt}
                    type="button"
                    className={`${styles.quickBtn} ${selectedAmount === amt && !customAmount ? styles.activeQuickBtn : ''}`}
                    onClick={() => handleQuickSelect(amt)}
                  >
                    {amt.toLocaleString('en-US')} ج.س
                  </button>
                ))}
              </div>

              {/* Custom Input */}
              <div className={styles.inputGroup}>
                <label className={styles.inputLabel}>
                  أو أدخل مبلغاً مخصصاً (الحد الأدنى 1 جنيه):
                </label>
                <div className={styles.inputWrapper}>
                  <input
                    type="text"
                    value={customAmount}
                    onChange={handleCustomChange}
                    placeholder="مثال: 2500"
                    className={styles.customInput}
                  />
                  <span className={styles.currencySuffix}>ج.س</span>
                </div>
              </div>

              {/* Simulation Banner */}
              {effectiveAmount > 0 && (
                <div className={`${styles.simulationBox} ${willPromote ? styles.simulationBoxGold : ''}`}>
                  <span style={{ fontSize: 20 }}>{willPromote ? '🎖️' : '💡'}</span>
                  <div>
                    {willPromote ? (
                      <span>
                        <strong>ترقية مرتقبة: </strong> بهذا المبلغ سيصل إجماليك إلى{' '}
                        <strong>{projectedTotal.toLocaleString('en-US')} ج.س</strong> وستترقى فورياً إلى رتبة{' '}
                        <strong>[{projectedRank?.name} {projectedRank?.badge}]</strong>!
                      </span>
                    ) : (
                      <span>
                        بهذا المبلغ سيصل إجماليك إلى{' '}
                        <strong>{projectedTotal.toLocaleString('en-US')} ج.س</strong> وتقترب أكثر من الرتبة القادمة.
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Insufficient Balance Alert */}
              {isAuthenticated && isBalanceInsufficient && effectiveAmount > 0 && (
                <div className={styles.balanceAlert}>
                  <div>
                    ⚠️ <strong>رصيد المحفظة لا يكفي:</strong> تحتاج إلى{' '}
                    <strong>{(effectiveAmount - currentWalletBalance).toLocaleString('en-US')} ج.س</strong> إضافية لإتمام هذه العملية.
                  </div>
                  <button
                    type="button"
                    className={styles.topupLinkBtn}
                    onClick={() => {
                      if (openDepositModal) {
                        openDepositModal();
                      } else {
                        navigateTo('account');
                      }
                    }}
                  >
                    شحن رصيد المحفظة الآن ⚡
                  </button>
                </div>
              )}

              {/* Error Message */}
              {error && (
                <div className={styles.balanceAlert} style={{ borderColor: '#ef4444' }}>
                  {error}
                </div>
              )}

              {/* Action Button */}
              <button
                type="button"
                className={styles.submitBtn}
                disabled={submitting || isDailyLimitReached || (isAuthenticated && isBalanceInsufficient) || effectiveAmount < 1}
                onClick={handleDonate}
              >
                {isDailyLimitReached ? (
                  <span>اكتملت حصة الدعم لهذا اليوم (نراك غداً) 🫡</span>
                ) : submitting ? (
                  <span>جارٍ معالجة الدعم والترقية...</span>
                ) : (
                  <>
                    <span>تأكيد الدعم وخصم {effectiveAmount.toLocaleString('en-US')} ج.س من المحفظة</span>
                    <span>🎖️</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: Full Ranks Ladder */}
        {activeTab === 'ladder' && (
          <div className={styles.ladderContainer}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 24, fontWeight: 900, color: '#fbbf24', margin: '0 0 8px' }}>
                سلم الرتب العسكرية الرسمي (10 مستويات)
              </h2>
              <p style={{ color: '#94a3b8', fontSize: 14 }}>
                كل قرش تقدمه في دعم المنصة يُحسب تراكمياً في رصيدك الشرفي، ولا ينقص ولا يُصفّر أبداً.
              </p>
            </div>

            <div className={styles.ladderGrid}>
              {ranks.map(rank => {
                const isCurrent = status?.progress?.currentRank?.level === rank.level;
                const isAchieved = (status?.progress?.currentRank?.level || 0) >= rank.level;

                let cardClass = styles.rankCard;
                if (isCurrent) cardClass += ` ${styles.rankCardCurrent}`;
                else if (isAchieved) cardClass += ` ${styles.rankCardAchieved}`;

                return (
                  <div key={rank.level} className={cardClass}>
                    <div className={styles.rankHeader}>
                      <span className={styles.rankBadgeIcon}>{rank.badge}</span>
                      <span
                        className={`${styles.rankStatusPill} ${
                          isCurrent
                            ? styles.statusCurrent
                            : isAchieved
                            ? styles.statusAchieved
                            : styles.statusLocked
                        }`}
                      >
                        {isCurrent ? 'رتبتك الحالية 📍' : isAchieved ? 'تمت الترقية ✓' : 'مقفلة 🔒'}
                      </span>
                    </div>
                    <div className={styles.rankCardName}>
                      المستوى {rank.level}: {rank.name}
                    </div>
                    <div className={styles.rankCardAmount}>
                      {rank.minAmount.toLocaleString('en-US')} ج.س كحد أدنى
                    </div>
                    <div className={styles.rankCardDesc}>{rank.description}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 3: Honor Board */}
        {activeTab === 'honor' && (
          <div className={styles.honorTableWrapper}>
            <div style={{ padding: '24px 24px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#fbbf24' }}>
                👑 لوحة شرف القادة والداعمين (Hall of Fame)
              </h2>
              <p style={{ margin: '6px 0 0', color: '#94a3b8', fontSize: 13 }}>
                أسماء كبار الداعمين الذين ساهموا في حماية واستقرار وتوسيع منصة KIROPRO.
              </p>
            </div>

            {leaderboard.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94a3b8' }}>
                كن أول بطل يسجل اسمه في لوحة الشرف العسكرية! 🎖️
              </div>
            ) : (
              <table className={styles.honorTable}>
                <thead>
                  <tr>
                    <th style={{ width: 60 }}>#</th>
                    <th>اسم البطل</th>
                    <th>الرتبة العسكرية</th>
                    <th>الشارة</th>
                    <th>إجمالي الدعم</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map(item => {
                    let pillClass = styles.posPill;
                    if (item.rankPosition === 1) pillClass += ` ${styles.posPillGold}`;
                    else if (item.rankPosition === 2) pillClass += ` ${styles.posPillSilver}`;
                    else if (item.rankPosition === 3) pillClass += ` ${styles.posPillBronze}`;

                    return (
                      <tr key={item.userId}>
                        <td>
                          <span className={pillClass}>{item.rankPosition}</span>
                        </td>
                        <td style={{ fontWeight: 800 }}>{item.displayName}</td>
                        <td style={{ color: item.accentColor, fontWeight: 800 }}>
                          {item.militaryRank}
                        </td>
                        <td style={{ fontSize: 24 }}>{item.rankBadge}</td>
                        <td style={{ fontWeight: 900, color: '#fbbf24' }}>
                          {item.totalDonatedAmount.toLocaleString('en-US')} ج.س
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* TAB 4: Support History */}
        {activeTab === 'history' && isAuthenticated && (
          <div className={styles.ladderContainer}>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: '#ffffff', margin: '0 0 16px' }}>
              📑 سجل عمليات الدعم الخاصة بك
            </h2>
            {status?.history && status.history.length > 0 ? (
              <div className={styles.historyList}>
                {status.history.map(tx => (
                  <div key={tx.id} className={styles.historyItem}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: '#10b981' }}>
                        + {tx.amount.toLocaleString('en-US')} ج.س
                      </div>
                      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                        من رتبة [{tx.previousRank}] إلى [{tx.newRank}]
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                      {new Date(tx.createdAt).toLocaleDateString('ar-EG', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '30px 0', color: '#94a3b8' }}>
                لم تقم بأي عمليات دعم سابقة حتى الآن.
              </div>
            )}
          </div>
        )}

        {/* SUCCESS / CELEBRATION MODAL */}
        {successResult && (
          <div className={styles.modalOverlay} onClick={() => setSuccessResult(null)}>
            <div className={styles.modalCard} onClick={e => e.stopPropagation()}>
              <div className={styles.modalEmblem}>
                <span>{successResult.newBadge || '🎖️'}</span>
              </div>
              <h3 className={styles.modalTitle}>
                {successResult.isPromoted ? '🎖️ مرسوم ترقية عسكرية رسمي!' : '💖 شكراً لدعمك المتجر وسيرفراتنا!'}
              </h3>
              <div className={styles.modalSubtitle}>
                رتبتك الحالية: [{successResult.newRank} {successResult.newBadge}]
              </div>

              <div className={styles.modalDecreeBox}>
                {successResult.isPromoted ? (
                  <>
                    <strong>تحية عسكرية يا بطل ({user?.name || ''})!</strong><br />
                    تقديراً لمواقفك ودعمك المستمر للمتجر، صدر أمر ترقيتك رسمياً إلى رتبة{' '}
                    <strong>[{successResult.newRank} {successResult.newBadge}]</strong>.<br />
                    تم تعليق شارتك العسكرية الجديدة في ملفك الشخصي لتظهر أمام الجميع. شكراً لأنك من أعمدة هذا المجتمع!
                  </>
                ) : (
                  <>
                    شكراً جزيلاً يا <strong>{user?.name || ''}</strong>! تم استلام دعمك الكريم بمبلغ{' '}
                    <strong>{successResult.amount?.toLocaleString('en-US')} ج.س</strong> بنجاح. مساهمتك تضمن استمرار سيرفراتنا وتطوير المنصة.
                  </>
                )}
              </div>

              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => setSuccessResult(null)}
              >
                استلام الشارة والعودة للمتجر 🫡
              </button>
            </div>
          </div>
        )}

        {/* STEALTH DAILY LIMIT MODAL (Max 5 donations reached) */}
        {showDailyLimitModal && (
          <div className={styles.modalOverlay} onClick={() => setShowDailyLimitModal(false)}>
            <div 
              className={styles.modalCard} 
              onClick={e => e.stopPropagation()}
              style={{ border: '1.5px solid #F59E0B', boxShadow: '0 0 35px rgba(245, 158, 11, 0.25)' }}
            >
              <div className={styles.modalEmblem} style={{ background: 'rgba(245, 158, 11, 0.15)', borderColor: '#F59E0B' }}>
                <span style={{ fontSize: 36 }}>🫡❤️</span>
              </div>
              <h3 className={styles.modalTitle} style={{ color: '#FDE047', fontSize: 22 }}>
                شكراً لكرمك الزائد وعطائك الأسطوري! 🫡❤️
              </h3>
              <div className={styles.modalSubtitle} style={{ color: '#94A3B8', fontSize: 13 }}>
                وسام التقدير العسكري اليومي
              </div>

              <div className={styles.modalDecreeBox} style={{ background: 'rgba(15, 23, 42, 0.85)', borderColor: 'rgba(245, 158, 11, 0.3)' }}>
                تقديراً لدعمك الكبير واكتمال حصتك القتالية لهذا اليوم، نكتفي بهذا القدر تقديراً لك. لا يمكنك تقديم المزيد من الدعم حتى الغد.. نراك غداً لمواصلة تقدمك العسكري!
              </div>

              <button
                type="button"
                className={styles.modalCloseBtn}
                style={{ background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)', color: '#0F172A', fontWeight: 900 }}
                onClick={() => setShowDailyLimitModal(false)}
              >
                حاضر، أراك غداً بكل فخر 🤝
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DeveloperSupportPage;
