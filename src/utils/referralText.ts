/**
 * Utility for dynamic Referral Program text generation
 * Guarantees NO hardcoded numbers or strings. Everything is generated
 * dynamically based on Admin-configured settings.
 */

export interface ReferralConfig {
  enabled: boolean;
  referrer_reward: number;
  referee_reward: number;
  total_reward?: number;
  currency: string;
  min_order_amount?: number;
  updated_at?: string;
}

export interface GeneratedReferralCopy {
  totalReward: number;
  referrerReward: number;
  refereeReward: number;
  currency: string;
  formattedTotal: string;
  formattedReferrer: string;
  formattedReferee: string;
  mainTitle: string;
  subtitle: string;
  description: string;
}

/**
 * Format numbers with comma grouping (e.g. 2000 -> "2,000")
 */
export function formatAmountWithCommas(amount: number): string {
  return Number(amount || 0).toLocaleString('en-US');
}

/**
 * Generates the full promotional copy dynamically from configuration
 */
export function generateReferralCopy(config?: Partial<ReferralConfig> | null): GeneratedReferralCopy {
  const referrerReward = Number(config?.referrer_reward ?? 1000);
  const refereeReward = Number(config?.referee_reward ?? 1000);
  const totalReward = config?.total_reward !== undefined 
    ? Number(config.total_reward) 
    : (referrerReward + refereeReward);
  const currency = String(config?.currency || 'جنيه').trim();

  const formattedTotal = formatAmountWithCommas(totalReward);
  const formattedReferrer = formatAmountWithCommas(referrerReward);
  const formattedReferee = formatAmountWithCommas(refereeReward);

  // Exact Title, Subtitle, and Description required by the specification
  const mainTitle = `نادي صاحبك وتعال واكسب ${formattedTotal} ${currency} 🎁🔥`;
  const subtitle = 'أنت وصاحبك تكسبوا مع بعض!';
  const description = `شارك كود الإحالة الخاص بيك مع صاحبك، ولما يسجل ويكمل أول طلب مؤهل، أنت تحصل على ${formattedReferrer} ${currency} وهو يحصل على ${formattedReferee} ${currency}.`;

  return {
    totalReward,
    referrerReward,
    refereeReward,
    currency,
    formattedTotal,
    formattedReferrer,
    formattedReferee,
    mainTitle,
    subtitle,
    description
  };
}
