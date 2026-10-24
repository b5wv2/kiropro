import pool from '../db';
import { randomUUID as uuidv4 } from 'crypto';
import {
  sendSupportAppreciationEmail,
  sendMilitaryPromotionEmail
} from './emailService';

export interface MilitaryRankDefinition {
  level: number;
  name: string;
  badge: string;
  minAmount: number;
  titleArabic: string;
  accentColor: string;
  description: string;
}

export const MILITARY_RANKS_LADDER: MilitaryRankDefinition[] = [
  {
    level: 10,
    name: 'رَئـيـس الـدَّولـة',
    badge: '👑🏛️',
    minAmount: 100000,
    titleArabic: 'رئيس الدولة',
    accentColor: '#F59E0B',
    description: 'أعلى سلطة شرفية وقيادية في المجتمع، القائد الأعلى وراعي المنصة.'
  },
  {
    level: 9,
    name: 'فَـريـق أول',
    badge: '⚔️🦅',
    minAmount: 75000,
    titleArabic: 'فريق أول',
    accentColor: '#EF4444',
    description: 'رتبة القيادة العامة والأركان الحربية العليا للمجتمع.'
  },
  {
    level: 8,
    name: 'عَـمـيـد',
    badge: '🦅⭐⭐',
    minAmount: 50000,
    titleArabic: 'عميد',
    accentColor: '#8B5CF6',
    description: 'قائد اللواء الشرفي وكبار الداعمين الاستراتيجيين للمنصة.'
  },
  {
    level: 7,
    name: 'عَـقـيـد',
    badge: '🦅⭐',
    minAmount: 30000,
    titleArabic: 'عقيد',
    accentColor: '#EC4899',
    description: 'قائد الفوج العسكري، بصمة دعم وتأثير مستمر في استقرار السيرفرات.'
  },
  {
    level: 6,
    name: 'رائـد',
    badge: '🦅',
    minAmount: 18000,
    titleArabic: 'رائد',
    accentColor: '#3B82F6',
    description: 'رتبة التميز العسكري وصقر المنصة المخلص.'
  },
  {
    level: 5,
    name: 'نَـقـيـب',
    badge: '⭐⭐',
    minAmount: 10000,
    titleArabic: 'نقيب',
    accentColor: '#06B6D4',
    description: 'قائد سرية الدعم ونجم مضيء في سماء المتجر.'
  },
  {
    level: 4,
    name: 'مُـلازم',
    badge: '⭐',
    minAmount: 6000,
    titleArabic: 'ملازم',
    accentColor: '#10B981',
    description: 'ضابط ميداني شرفي، أولى رتب الضباط الكرام.'
  },
  {
    level: 3,
    name: 'رَقـيـب',
    badge: '🔰🔰',
    minAmount: 3000,
    titleArabic: 'رقيب',
    accentColor: '#84CC16',
    description: 'رتبة الإشراف الميداني وعلامة فارقة في التضامن والتطوير.'
  },
  {
    level: 2,
    name: 'عَـريـف',
    badge: '🔰',
    minAmount: 1500,
    titleArabic: 'عريف',
    accentColor: '#EAB308',
    description: 'خطوة متقدمة في مسيرة الدعم والتكريم العسكري.'
  },
  {
    level: 1,
    name: 'جُـنـدي',
    badge: '🪖',
    minAmount: 500,
    titleArabic: 'جندي',
    accentColor: '#64748B',
    description: 'أولى مراتب الشرف العسكري، جندي مدافع عن استمرار المنصة.'
  }
];

export const CIVILIAN_RANK: MilitaryRankDefinition = {
  level: 0,
  name: 'مَـدَنـي',
  badge: '👤',
  minAmount: 0,
  titleArabic: 'مدني',
  accentColor: '#94A3B8',
  description: 'مستخدم كريم في بداية رحلة الشرف والمساهمة في دعم السيرفرات.'
};

export interface UserRankProgress {
  currentRank: MilitaryRankDefinition;
  nextRank: MilitaryRankDefinition | null;
  progressPercent: number;
  remainingToNext: number;
  isMaxRank: boolean;
}

/**
 * Calculate user rank, next tier, and progress percentage from total donated amount.
 */
export function calculateRankProgress(totalDonated: number): UserRankProgress {
  const amount = Math.max(0, Number(totalDonated) || 0);

  // Find highest rank achieved
  const currentRank = MILITARY_RANKS_LADDER.find(r => amount >= r.minAmount) || CIVILIAN_RANK;

  // Find next rank
  let nextRank: MilitaryRankDefinition | null = null;
  if (currentRank.level === 0) {
    nextRank = MILITARY_RANKS_LADDER[MILITARY_RANKS_LADDER.length - 1] || null; // Level 1 (جندي)
  } else if (currentRank.level < 10) {
    // Next higher level
    nextRank = MILITARY_RANKS_LADDER.find(r => r.level === currentRank.level + 1) || null;
  }

  const isMaxRank = currentRank.level >= 10 || !nextRank;
  let remainingToNext = 0;
  let progressPercent = 100;

  if (nextRank) {
    remainingToNext = Math.max(0, nextRank.minAmount - amount);
    const rangeStart = currentRank.minAmount;
    const rangeEnd = nextRank.minAmount;
    const rangeSpan = Math.max(1, rangeEnd - rangeStart);
    const currentProgress = amount - rangeStart;
    progressPercent = Math.min(100, Math.max(0, Math.round((currentProgress / rangeSpan) * 100)));
  }

  return {
    currentRank,
    nextRank,
    progressPercent,
    remainingToNext,
    isMaxRank
  };
}

/**
 * Get level number by rank name (handles Arabic variations)
 */
export function getRankLevelByName(rankName?: string | null): number {
  if (!rankName) return 0;
  const clean = rankName.trim();
  const match = MILITARY_RANKS_LADDER.find(
    r => r.name === clean || r.titleArabic === clean || clean.includes(r.titleArabic)
  );
  return match ? match.level : 0;
}

export class DeveloperSupportService {
  /**
   * Fetch current user support status, wallet balance, cumulative total, and rank progress
   */
  async getUserSupportStatus(userId: string) {
    const res = await pool.query(
      `
      SELECT 
        u.id, 
        u.name, 
        u.email, 
        COALESCE(w.balance, u.wallet_balance, 0)::numeric AS "walletBalance",
        COALESCE(u.total_donated_amount, 0)::numeric AS "totalDonatedAmount",
        COALESCE(u.military_rank, 'مدني') AS "militaryRank",
        w.currency
      FROM "User" u
      LEFT JOIN "Wallet" w ON w."userId" = u.id
      WHERE u.id = $1
    `,
      [userId]
    );

    const user = res.rows[0];
    if (!user) {
      throw new Error('المستخدم غير موجود.');
    }

    const totalDonated = Number(user.totalDonatedAmount || 0);
    const progress = calculateRankProgress(totalDonated);

    // Fetch recent support transactions
    const historyRes = await pool.query(
      `
      SELECT id, amount::numeric as amount, previous_rank as "previousRank", new_rank as "newRank", created_at as "createdAt"
      FROM support_transactions
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 20
    `,
      [userId]
    );

    return {
      userId: user.id,
      name: user.name || 'داعم مجهول',
      email: user.email,
      walletBalance: Number(user.walletBalance || 0),
      currency: user.currency || 'SDG',
      totalDonatedAmount: totalDonated,
      militaryRank: progress.currentRank.name,
      rankBadge: progress.currentRank.badge,
      progress,
      history: historyRes.rows.map(r => ({
        id: r.id,
        amount: Number(r.amount),
        previousRank: r.previousRank,
        newRank: r.newRank,
        createdAt: r.createdAt
      }))
    };
  }

  /**
   * Public / Authenticated Leaderboard: Hall of Fame (لوحة شرف الأبطال والداعمين)
   */
  async getHonorBoard(limit: number = 30) {
    const safeLimit = Math.min(100, Math.max(5, limit));

    const res = await pool.query(
      `
      SELECT 
        u.id,
        u.name,
        COALESCE(u.total_donated_amount, 0)::numeric AS "totalDonatedAmount",
        COALESCE(u.military_rank, 'مدني') AS "militaryRank",
        u."createdAt"
      FROM "User" u
      WHERE COALESCE(u.total_donated_amount, 0) > 0
      ORDER BY u.total_donated_amount DESC, u."createdAt" ASC
      LIMIT $1
    `,
      [safeLimit]
    );

    return res.rows.map((row, index) => {
      const total = Number(row.totalDonatedAmount || 0);
      const progress = calculateRankProgress(total);
      
      // Mask name slightly for privacy if desired (e.g. "أحمد م***")
      const rawName = row.name || 'فارس مجهول';
      const displayName = rawName.length > 2 
        ? `${rawName.slice(0, 3)}***` 
        : rawName;

      return {
        rankPosition: index + 1,
        userId: row.id,
        displayName: rawName, // Keep transparent on honor board
        maskedName: displayName,
        totalDonatedAmount: total,
        militaryRank: progress.currentRank.name,
        rankBadge: progress.currentRank.badge,
        rankLevel: progress.currentRank.level,
        accentColor: progress.currentRank.accentColor
      };
    });
  }

  /**
   * All Military Ranks Ladder with full stats
   */
  getRanksLadder(): MilitaryRankDefinition[] {
    return [...MILITARY_RANKS_LADDER].reverse(); // Level 1 to 10
  }

  /**
   * Process a Developer & Platform Support Donation
   * Strict database transaction with FOR UPDATE locks.
   */
  async processDonation(userId: string, amount: number) {
    const donationAmount = Math.floor(Number(amount));

    if (!Number.isFinite(donationAmount) || donationAmount < 1) {
      throw new Error('قيمة الدعم يجب أن تكون 1 جنيه أو أكثر وبدون أرقام سالبة.');
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Lock User row
      const userRes = await client.query(
        `SELECT id, name, email, wallet_balance, total_donated_amount, military_rank 
         FROM "User" 
         WHERE id = $1 
         FOR UPDATE`,
        [userId]
      );

      const user = userRes.rows[0];
      if (!user) {
        throw new Error('المستخدم غير موجود.');
      }

      // 2. Lock Wallet row
      const walletRes = await client.query(
        `SELECT id, balance, currency 
         FROM "Wallet" 
         WHERE "userId" = $1 
         FOR UPDATE`,
        [userId]
      );

      const wallet = walletRes.rows[0];
      if (!wallet) {
        throw new Error('محفظة المستخدم غير مهيأة.');
      }

      const walletBalance = Number(wallet.balance || 0);

      // 2.5 Stealth Daily Limit Check (Max 5 donations per calendar day)
      const dailyCountRes = await client.query(
        `SELECT COUNT(*)::int AS count 
         FROM support_transactions 
         WHERE user_id = $1 AND created_at >= CURRENT_DATE`,
        [userId]
      );
      const donationsToday = dailyCountRes.rows[0]?.count || 0;
      const MAX_DAILY_DONATIONS = 5;

      if (donationsToday >= MAX_DAILY_DONATIONS) {
        const limitErr: any = new Error('DAILY_LIMIT_REACHED');
        limitErr.code = 'DAILY_LIMIT_REACHED';
        limitErr.status = 429;
        limitErr.message = 'تقديراً لدعمك الكبير واكتمال حصتك القتالية لهذا اليوم، نكتفي بهذا القدر تقديراً لك. لا يمكنك تقديم المزيد من الدعم حتى الغد.. نراك غداً لمواصلة تقدمك العسكري!';
        throw limitErr;
      }

      // 3. Security check: Ensure sufficient wallet balance
      if (walletBalance < donationAmount) {
        throw new Error(
          `رصيد محفظتك غير كافٍ لإتمام عملية الدعم. رصيدك الحالي هو ${walletBalance.toLocaleString('en-US')} ج.س بينما المطلوب خصمه هو ${donationAmount.toLocaleString('en-US')} ج.س.`
        );
      }

      // 4. Calculate new amounts and cumulative ranking
      const prevTotal = Number(user.total_donated_amount || 0);
      const newTotal = prevTotal + donationAmount;
      const prevRankName = user.military_rank || 'مدني';
      const prevLevel = getRankLevelByName(prevRankName);

      const newProgress = calculateRankProgress(newTotal);
      const newRankName = newProgress.currentRank.name;
      const newLevel = newProgress.currentRank.level;
      const isPromoted = newLevel > prevLevel;

      const newWalletBalance = walletBalance - donationAmount;

      // 5. Deduct from "Wallet"
      await client.query(
        `UPDATE "Wallet" 
         SET balance = balance - $1, "updatedAt" = CURRENT_TIMESTAMP 
         WHERE id = $2`,
        [donationAmount, wallet.id]
      );

      // 6. Deduct and increment in "User"
      await client.query(
        `UPDATE "User" 
         SET wallet_balance = $1,
             total_donated_amount = COALESCE(total_donated_amount, 0) + $2,
             military_rank = $3,
             "updatedAt" = CURRENT_TIMESTAMP 
         WHERE id = $4`,
        [newWalletBalance, donationAmount, newRankName, userId]
      );

      // 7. Insert into "WalletTransaction"
      const txId = uuidv4();
      await client.query(
        `INSERT INTO "WalletTransaction" (
          id, "walletId", amount, type, description, currency, "balanceBefore", "balanceAfter"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          txId,
          wallet.id,
          donationAmount,
          'PURCHASE',
          `دعم المطورين والمنصة [${newRankName} ${newProgress.currentRank.badge}]`,
          wallet.currency || 'SDG',
          walletBalance,
          newWalletBalance
        ]
      );

      // 8. Insert into support_transactions
      const supportTxId = uuidv4();
      await client.query(
        `INSERT INTO support_transactions (
          id, user_id, amount, previous_rank, new_rank
        ) VALUES ($1, $2, $3, $4, $5)`,
        [supportTxId, userId, donationAmount, prevRankName, newRankName]
      );

      await client.query('COMMIT');

      // 9. Dispatch Email Notification asynchronously
      if (user.email) {
        setImmediate(async () => {
          try {
            if (isPromoted) {
              await sendMilitaryPromotionEmail({
                to: user.email,
                userName: user.name || 'بطل المنصة',
                newRank: newRankName,
                newBadge: newProgress.currentRank.badge,
                newLevel: newLevel,
                amount: donationAmount,
                totalDonated: newTotal
              });
            } else {
              await sendSupportAppreciationEmail({
                to: user.email,
                userName: user.name || 'صديق المنصة',
                amount: donationAmount,
                currentRank: newRankName,
                rankBadge: newProgress.currentRank.badge,
                totalDonated: newTotal,
                remainingToNext: newProgress.remainingToNext,
                ...(newProgress.nextRank?.name ? { nextRankName: newProgress.nextRank.name } : {})
              });
            }
          } catch (emailErr: any) {
            console.error('[DeveloperSupport] Failed to send support email:', emailErr.message);
          }
        });
      }

      return {
        success: true,
        transactionId: supportTxId,
        amount: donationAmount,
        previousRank: prevRankName,
        newRank: newRankName,
        newBadge: newProgress.currentRank.badge,
        isPromoted,
        totalDonatedAmount: newTotal,
        walletBalance: newWalletBalance,
        progress: newProgress,
        message: isPromoted
          ? `🎖️ مبارك ترقيتك إلى رتبة [${newRankName} ${newProgress.currentRank.badge}]! تم تعليق شارتك العسكرية الجديدة.`
          : `شكراً جزيلاً لدعمك المتجر وسيرفراتنا بمبلغ ${donationAmount.toLocaleString('en-US')} ج.س! مساهمتك محل تقدير دائم.`
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Fetch All Donors List for Admin Management
   */
  async getAdminDonorsList() {
    const res = await pool.query(`
      SELECT 
        u.id,
        u.name,
        u.email,
        u."createdAt",
        COALESCE(w.balance, u.wallet_balance, 0)::numeric AS "wallet_balance",
        COALESCE(u.total_donated_amount, 0)::numeric AS "total_donated_amount",
        COALESCE(u.military_rank, 'مدني') AS "military_rank",
        COALESCE(w.currency, 'SDG') AS currency,
        (
          SELECT COUNT(*)::int 
          FROM support_transactions st 
          WHERE st.user_id = u.id AND st.created_at >= CURRENT_DATE
        ) AS "donations_today",
        (
          SELECT COUNT(*)::int 
          FROM support_transactions st 
          WHERE st.user_id = u.id
        ) AS "total_transactions_count",
        (
          SELECT MAX(st.created_at) 
          FROM support_transactions st 
          WHERE st.user_id = u.id
        ) AS "last_donation_at"
      FROM "User" u
      LEFT JOIN "Wallet" w ON w."userId" = u.id
      WHERE u.total_donated_amount > 0 
         OR EXISTS (SELECT 1 FROM support_transactions st WHERE st.user_id = u.id)
      ORDER BY u.total_donated_amount DESC, "last_donation_at" DESC NULLS LAST
    `);

    return res.rows.map(row => {
      const totalDonated = Number(row.total_donated_amount || 0);
      const progress = calculateRankProgress(totalDonated);
      return {
        id: row.id,
        name: row.name || 'مستخدم بدون اسم',
        email: row.email,
        createdAt: row.createdAt,
        wallet_balance: Number(row.wallet_balance || 0),
        total_donated_amount: totalDonated,
        military_rank: row.military_rank || progress.currentRank.name,
        rank_badge: progress.currentRank.badge,
        rank_level: progress.currentRank.level,
        accent_color: progress.currentRank.accentColor,
        currency: row.currency,
        donations_today: Number(row.donations_today || 0),
        total_transactions_count: Number(row.total_transactions_count || 0),
        last_donation_at: row.last_donation_at
      };
    });
  }

  /**
   * Reset / Refund Donor Support & Military Rank
   */
  async resetDonorSupport(userId: string, refundToWallet: boolean, adminUser?: any) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Lock user
      const userRes = await client.query(
        `SELECT id, name, email, wallet_balance, total_donated_amount, military_rank 
         FROM "User" 
         WHERE id = $1 
         FOR UPDATE`,
        [userId]
      );

      const user = userRes.rows[0];
      if (!user) {
        throw new Error('المستخدم غير موجود.');
      }

      // 2. Lock wallet
      const walletRes = await client.query(
        `SELECT id, balance, currency 
         FROM "Wallet" 
         WHERE "userId" = $1 
         FOR UPDATE`,
        [userId]
      );

      const wallet = walletRes.rows[0];
      if (!wallet) {
        throw new Error('محفظة المستخدم غير مهيأة.');
      }

      const currentDonated = Number(user.total_donated_amount || 0);
      const currentBalance = Number(wallet.balance || 0);
      let newBalance = currentBalance;

      // 3. If refund is requested and user has donated funds
      if (refundToWallet && currentDonated > 0) {
        newBalance = currentBalance + currentDonated;

        // Refund to "Wallet"
        await client.query(
          `UPDATE "Wallet" 
           SET balance = balance + $1, "updatedAt" = CURRENT_TIMESTAMP 
           WHERE id = $2`,
          [currentDonated, wallet.id]
        );

        // Update "User" (setting total_donated_amount = 0 and military_rank = 'مدني')
        await client.query(
          `UPDATE "User" 
           SET wallet_balance = $1,
               total_donated_amount = 0,
               military_rank = 'مدني',
               "updatedAt" = CURRENT_TIMESTAMP 
           WHERE id = $2`,
          [newBalance, userId]
        );

        // Record refund in "WalletTransaction"
        const txId = uuidv4();
        await client.query(
          `INSERT INTO "WalletTransaction" (
            id, "walletId", amount, type, description, currency, "balanceBefore", "balanceAfter"
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            txId,
            wallet.id,
            currentDonated,
            'REFUND',
            `استرجاع مبالغ دعم المنصة وإلغاء الرتبة العسكرية بواسطة الإدارة (${adminUser?.email || 'Admin'})`,
            wallet.currency || 'SDG',
            currentBalance,
            newBalance
          ]
        );
      } else {
        // Reset only (no wallet refund)
        await client.query(
          `UPDATE "User" 
           SET total_donated_amount = 0,
               military_rank = 'مدني',
               "updatedAt" = CURRENT_TIMESTAMP 
           WHERE id = $1`,
          [userId]
        );
      }

      await client.query('COMMIT');

      return {
        success: true,
        refunded: refundToWallet && currentDonated > 0,
        refundedAmount: refundToWallet ? currentDonated : 0,
        previousRank: user.military_rank,
        previousTotal: currentDonated,
        newBalance,
        message: refundToWallet && currentDonated > 0
          ? `تم تصفير الدعم والرتبة بنجاح، وإعادة مبلغ ${currentDonated.toLocaleString('en-US')} ج.س إلى محفظة المستخدم.`
          : 'تم تصفير إجمالي مبالغ الدعم والرتبة العسكرية للمستخدم بنجاح دون المساس برصيد المحفظة.'
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

export const developerSupportService = new DeveloperSupportService();
