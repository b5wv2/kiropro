import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import pool from '../src/db';

interface CuratedDefinition {
  providerOfferId: number;
  productName: string;
  offerName: string;
  arabicName: string;
  description: string;
  subCategory: string;
  productType: string;
  displayOrder: number;
  imageUrl?: string;
}

const PUBG_COVER_IMAGE = 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=800&q=80';
const FREEFIRE_COVER_IMAGE = 'https://images.unsplash.com/photo-1563089145-599997674d42?auto=format&fit=crop&w=800&q=80';

const CURATED_OFFERS: CuratedDefinition[] = [
  // ==========================================
  // FREE FIRE MIDDLE EAST (14 OFFERS)
  // ==========================================
  {
    providerOfferId: 396,
    productName: 'Freefire Middle East',
    offerName: 'Freefire ME 110 Diamonds',
    arabicName: '110 جوهرة',
    description: 'اشحن 110 جوهرة في Free Fire سيرفر الشرق الأوسط عبر معرّف اللاعب (Player ID) لتصل إلى حسابك فوراً.',
    subCategory: 'DIAMONDS',
    productType: 'DIAMONDS',
    displayOrder: 1,
    imageUrl: FREEFIRE_COVER_IMAGE
  },
  {
    providerOfferId: 397,
    productName: 'Freefire Middle East',
    offerName: 'Freefire ME 231 Diamonds',
    arabicName: '231 جوهرة',
    description: 'اشحن 231 جوهرة في Free Fire سيرفر الشرق الأوسط عبر معرّف اللاعب (Player ID) لتصل إلى حسابك فوراً.',
    subCategory: 'DIAMONDS',
    productType: 'DIAMONDS',
    displayOrder: 2,
    imageUrl: FREEFIRE_COVER_IMAGE
  },
  {
    providerOfferId: 398,
    productName: 'Freefire Middle East',
    offerName: 'Freefire ME 583 Diamonds',
    arabicName: '583 جوهرة',
    description: 'اشحن 583 جوهرة في Free Fire سيرفر الشرق الأوسط عبر معرّف اللاعب (Player ID) لتصل إلى حسابك فوراً.',
    subCategory: 'DIAMONDS',
    productType: 'DIAMONDS',
    displayOrder: 3,
    imageUrl: FREEFIRE_COVER_IMAGE
  },
  {
    providerOfferId: 399,
    productName: 'Freefire Middle East',
    offerName: 'Freefire ME 1188 Diamonds',
    arabicName: '1,188 جوهرة',
    description: 'اشحن 1,188 جوهرة في Free Fire سيرفر الشرق الأوسط عبر معرّف اللاعب (Player ID) لتصل إلى حسابك فوراً.',
    subCategory: 'DIAMONDS',
    productType: 'DIAMONDS',
    displayOrder: 4,
    imageUrl: FREEFIRE_COVER_IMAGE
  },
  {
    providerOfferId: 400,
    productName: 'Freefire Middle East',
    offerName: 'Freefire ME 2420 Diamonds',
    arabicName: '2,420 جوهرة',
    description: 'اشحن 2,420 جوهرة في Free Fire سيرفر الشرق الأوسط عبر معرّف اللاعب (Player ID) لتصل إلى حسابك فوراً.',
    subCategory: 'DIAMONDS',
    productType: 'DIAMONDS',
    displayOrder: 5,
    imageUrl: FREEFIRE_COVER_IMAGE
  },
  {
    providerOfferId: 61358,
    productName: 'Freefire Middle East',
    offerName: 'Freefire ME Booyah Pass',
    arabicName: 'بطاقة بويا باس (Booyah Pass)',
    description: 'افتح بطاقة Booyah Pass لموسم Free Fire الحالي للحصول على مكافآت ومظاهر حصرية عبر معرّف اللاعب.',
    subCategory: 'BOOYAH_PASS',
    productType: 'ROYALE_PASS',
    displayOrder: 6,
    imageUrl: FREEFIRE_COVER_IMAGE
  },
  {
    providerOfferId: 61366,
    productName: 'Freefire Middle East',
    offerName: 'Freefire ME Weekly Membership',
    arabicName: 'العضوية الأسبوعية (Weekly Membership)',
    description: 'اشتراك أسبوعي في Free Fire يمنحك جواهر فورية ومكافآت تسجيل دخول يومية طوال الأسبوع.',
    subCategory: 'MEMBERSHIP',
    productType: 'SUBSCRIPTION',
    displayOrder: 7,
    imageUrl: FREEFIRE_COVER_IMAGE
  },
  {
    providerOfferId: 61365,
    productName: 'Freefire Middle East',
    offerName: 'Freefire ME Monthly Membership',
    arabicName: 'العضوية الشهرية (Monthly Membership)',
    description: 'اشتراك شهري في Free Fire يمنحك رصيد جواهر مميز ومكافآت يومية طوال الشهر.',
    subCategory: 'MEMBERSHIP',
    productType: 'SUBSCRIPTION',
    displayOrder: 8,
    imageUrl: FREEFIRE_COVER_IMAGE
  },
  {
    providerOfferId: 61364,
    productName: 'Freefire Middle East',
    offerName: 'Freefire ME Level Up Package - Level 6',
    arabicName: 'حزمة الترقية — المستوى 6',
    description: 'حزمة ترقية الحساب للمستوى 6 في Free Fire مع مكافآت فورية.',
    subCategory: 'LEVEL_UP',
    productType: 'PACK',
    displayOrder: 9,
    imageUrl: FREEFIRE_COVER_IMAGE
  },
  {
    providerOfferId: 61359,
    productName: 'Freefire Middle East',
    offerName: 'Freefire ME Level Up Package - Level 10',
    arabicName: 'حزمة الترقية — المستوى 10',
    description: 'حزمة ترقية الحساب للمستوى 10 في Free Fire مع مكافآت فورية.',
    subCategory: 'LEVEL_UP',
    productType: 'PACK',
    displayOrder: 10,
    imageUrl: FREEFIRE_COVER_IMAGE
  },
  {
    providerOfferId: 61360,
    productName: 'Freefire Middle East',
    offerName: 'Freefire ME Level Up Package - Level 15',
    arabicName: 'حزمة الترقية — المستوى 15',
    description: 'حزمة ترقية الحساب للمستوى 15 في Free Fire مع مكافآت فورية.',
    subCategory: 'LEVEL_UP',
    productType: 'PACK',
    displayOrder: 11,
    imageUrl: FREEFIRE_COVER_IMAGE
  },
  {
    providerOfferId: 61361,
    productName: 'Freefire Middle East',
    offerName: 'Freefire ME Level Up Package - Level 20',
    arabicName: 'حزمة الترقية — المستوى 20',
    description: 'حزمة ترقية الحساب للمستوى 20 في Free Fire مع مكافآت فورية.',
    subCategory: 'LEVEL_UP',
    productType: 'PACK',
    displayOrder: 12,
    imageUrl: FREEFIRE_COVER_IMAGE
  },
  {
    providerOfferId: 61362,
    productName: 'Freefire Middle East',
    offerName: 'Freefire ME Level Up Package - Level 25',
    arabicName: 'حزمة الترقية — المستوى 25',
    description: 'حزمة ترقية الحساب للمستوى 25 في Free Fire مع مكافآت فورية.',
    subCategory: 'LEVEL_UP',
    productType: 'PACK',
    displayOrder: 13,
    imageUrl: FREEFIRE_COVER_IMAGE
  },
  {
    providerOfferId: 61363,
    productName: 'Freefire Middle East',
    offerName: 'Freefire ME Level Up Package - Level 30',
    arabicName: 'حزمة الترقية — المستوى 30',
    description: 'حزمة ترقية الحساب للمستوى 30 في Free Fire مع مكافآت فورية.',
    subCategory: 'LEVEL_UP',
    productType: 'PACK',
    displayOrder: 14,
    imageUrl: FREEFIRE_COVER_IMAGE
  },

  // ==========================================
  // PUBG MOBILE — UC (6 OFFERS)
  // ==========================================
  {
    providerOfferId: 371,
    productName: 'PUBG Mobile',
    offerName: 'PUBG Mobile 60 UC',
    arabicName: '60 شدة UC',
    description: 'اشحن 60 UC إلى حسابك في PUBG Mobile بسرعة وسهولة عبر معرّف اللاعب.',
    subCategory: 'UC',
    productType: 'UC',
    displayOrder: 101,
    imageUrl: PUBG_COVER_IMAGE
  },
  {
    providerOfferId: 125,
    productName: 'PUBG Mobile',
    offerName: 'PUBG Mobile 325 UC',
    arabicName: '325 شدة UC',
    description: 'اشحن 325 UC إلى حسابك في PUBG Mobile بسرعة وسهولة عبر معرّف اللاعب.',
    subCategory: 'UC',
    productType: 'UC',
    displayOrder: 102,
    imageUrl: PUBG_COVER_IMAGE
  },
  {
    providerOfferId: 126,
    productName: 'PUBG Mobile',
    offerName: 'PUBG Mobile 660 UC',
    arabicName: '660 شدة UC',
    description: 'اشحن 660 UC إلى حسابك في PUBG Mobile بسرعة وسهولة عبر معرّف اللاعب.',
    subCategory: 'UC',
    productType: 'UC',
    displayOrder: 103,
    imageUrl: PUBG_COVER_IMAGE
  },
  {
    providerOfferId: 127,
    productName: 'PUBG Mobile',
    offerName: 'PUBG Mobile 1800 UC',
    arabicName: '1,800 شدة UC',
    description: 'اشحن 1,800 UC إلى حسابك في PUBG Mobile بسرعة وسهولة عبر معرّف اللاعب.',
    subCategory: 'UC',
    productType: 'UC',
    displayOrder: 104,
    imageUrl: PUBG_COVER_IMAGE
  },
  {
    providerOfferId: 128,
    productName: 'PUBG Mobile',
    offerName: 'PUBG Mobile 3850 UC',
    arabicName: '3,850 شدة UC',
    description: 'اشحن 3,850 UC إلى حسابك في PUBG Mobile بسرعة وسهولة عبر معرّف اللاعب.',
    subCategory: 'UC',
    productType: 'UC',
    displayOrder: 105,
    imageUrl: PUBG_COVER_IMAGE
  },
  {
    providerOfferId: 129,
    productName: 'PUBG Mobile',
    offerName: 'PUBG Mobile 8100 UC',
    arabicName: '8,100 شدة UC',
    description: 'اشحن 8,100 UC إلى حسابك في PUBG Mobile بسرعة وسهولة عبر معرّف اللاعب.',
    subCategory: 'UC',
    productType: 'UC',
    displayOrder: 106,
    imageUrl: PUBG_COVER_IMAGE
  },

  // ==========================================
  // PUBG MOBILE — PRIME (4 OFFERS)
  // ==========================================
  {
    providerOfferId: 1008,
    productName: 'PUBG Mobile',
    offerName: 'PUBG Mobile Prime (1 Month) UC',
    arabicName: 'اشتراك برايم — شهر',
    description: 'اشترك في PUBG Mobile Prime لمدة شهر واستفد من المكافآت الفورية واليومية داخل اللعبة. يشمل الاشتراك مكافآت UC وعناصر إضافية تُستلم داخل اللعبة.',
    subCategory: 'PRIME',
    productType: 'SUBSCRIPTION',
    displayOrder: 201,
    imageUrl: PUBG_COVER_IMAGE
  },
  {
    providerOfferId: 1010,
    productName: 'PUBG Mobile',
    offerName: 'PUBG Mobile Prime (3 Months) UC',
    arabicName: 'اشتراك برايم — 3 أشهر',
    description: 'اشترك في PUBG Mobile Prime لمدة 3 أشهر واستفد من المكافآت الفورية واليومية داخل اللعبة. يشمل الاشتراك مكافآت UC وعناصر إضافية تُستلم داخل اللعبة.',
    subCategory: 'PRIME',
    productType: 'SUBSCRIPTION',
    displayOrder: 202,
    imageUrl: PUBG_COVER_IMAGE
  },
  {
    providerOfferId: 1011,
    productName: 'PUBG Mobile',
    offerName: 'PUBG Mobile Prime (6 Months) UC',
    arabicName: 'اشتراك برايم — 6 أشهر',
    description: 'اشترك في PUBG Mobile Prime لمدة 6 أشهر واستفد من المكافآت الفورية واليومية داخل اللعبة. يشمل الاشتراك مكافآت UC وعناصر إضافية تُستلم داخل اللعبة.',
    subCategory: 'PRIME',
    productType: 'SUBSCRIPTION',
    displayOrder: 203,
    imageUrl: PUBG_COVER_IMAGE
  },
  {
    providerOfferId: 1009,
    productName: 'PUBG Mobile',
    offerName: 'PUBG Mobile Prime (12 Months) UC',
    arabicName: 'اشتراك برايم — 12 شهرًا',
    description: 'اشترك في PUBG Mobile Prime لمدة 12 شهرًا واستفد من المكافآت الفورية واليومية داخل اللعبة. يشمل الاشتراك مكافآت UC وعناصر إضافية تُستلم داخل اللعبة.',
    subCategory: 'PRIME',
    productType: 'SUBSCRIPTION',
    displayOrder: 204,
    imageUrl: PUBG_COVER_IMAGE
  },

  // ==========================================
  // PUBG MOBILE — PRIME PLUS (4 OFFERS)
  // ==========================================
  {
    providerOfferId: 1012,
    productName: 'PUBG Mobile',
    offerName: 'PUBG Mobile Prime Plus (1 Month) UC',
    arabicName: 'اشتراك برايم بلس — شهر',
    description: 'ارفع مستوى مزايا اشتراكك مع PUBG Mobile Prime Plus، واستفد من مكافآت UC ومكافآت RP ومزايا يومية داخل اللعبة.',
    subCategory: 'PRIME_PLUS',
    productType: 'SUBSCRIPTION',
    displayOrder: 301,
    imageUrl: PUBG_COVER_IMAGE
  },
  {
    providerOfferId: 1014,
    productName: 'PUBG Mobile',
    offerName: 'PUBG Mobile Prime Plus (3 Months) UC',
    arabicName: 'اشتراك برايم بلس — 3 أشهر',
    description: 'ارفع مستوى مزايا اشتراكك مع PUBG Mobile Prime Plus، واستفد من مكافآت UC ومكافآت RP ومزايا يومية داخل اللعبة.',
    subCategory: 'PRIME_PLUS',
    productType: 'SUBSCRIPTION',
    displayOrder: 302,
    imageUrl: PUBG_COVER_IMAGE
  },
  {
    providerOfferId: 1015,
    productName: 'PUBG Mobile',
    offerName: 'PUBG Mobile Prime Plus (6 Months) UC',
    arabicName: 'اشتراك برايم بلس — 6 أشهر',
    description: 'ارفع مستوى مزايا اشتراكك مع PUBG Mobile Prime Plus، واستفد من مكافآت UC ومكافآت RP ومزايا يومية داخل اللعبة.',
    subCategory: 'PRIME_PLUS',
    productType: 'SUBSCRIPTION',
    displayOrder: 303,
    imageUrl: PUBG_COVER_IMAGE
  },
  {
    providerOfferId: 1013,
    productName: 'PUBG Mobile',
    offerName: 'PUBG Mobile Prime Plus (12 Months) UC',
    arabicName: 'اشتراك برايم بلس — 12 شهرًا',
    description: 'ارفع مستوى مزايا اشتراكك مع PUBG Mobile Prime Plus، واستفد من مكافآت UC ومكافآت RP ومزايا يومية داخل اللعبة.',
    subCategory: 'PRIME_PLUS',
    productType: 'SUBSCRIPTION',
    displayOrder: 304,
    imageUrl: PUBG_COVER_IMAGE
  },

  // ==========================================
  // PUBG MOBILE — ROYALE PASS / ELITE PASS (3 OFFERS)
  // ==========================================
  {
    providerOfferId: 1004,
    productName: 'PUBG Mobile',
    offerName: 'PUBG Mobile Elite Pass LV1-50 UC',
    arabicName: 'رويال باس Elite — من المستوى 1 إلى 50',
    description: 'افتح مزايا Elite Pass واستفد من مكافآت Royale Pass ومهام Elite للمساعدة على التقدم وفتح المزيد من المكافآت حتى المستوى المحدد.',
    subCategory: 'ROYALE_PASS',
    productType: 'ROYALE_PASS',
    displayOrder: 401,
    imageUrl: PUBG_COVER_IMAGE
  },
  {
    providerOfferId: 1003,
    productName: 'PUBG Mobile',
    offerName: 'PUBG Mobile Elite Pass LV1-100 UC',
    arabicName: 'رويال باس Elite — من المستوى 1 إلى 100',
    description: 'احصل على Elite Pass الكامل للمستويات 1–100 واستفد من مكافآت Royale Pass ومهام Elite والتقدم الأسرع داخل الموسم.',
    subCategory: 'ROYALE_PASS',
    productType: 'ROYALE_PASS',
    displayOrder: 402,
    imageUrl: PUBG_COVER_IMAGE
  },
  {
    providerOfferId: 1005,
    productName: 'PUBG Mobile',
    offerName: 'PUBG Mobile Elite Pass Plus LV1-100 UC',
    arabicName: 'رويال باس Elite Plus — من المستوى 1 إلى 100',
    description: 'احصل على Elite Pass Plus للمستويات 1–100، مع مزايا Elite Pass ومكافآت إضافية وترقيات فورية للمستويات بحسب الإصدار الحالي.',
    subCategory: 'ROYALE_PASS',
    productType: 'ROYALE_PASS',
    displayOrder: 403,
    imageUrl: PUBG_COVER_IMAGE
  },

  // ==========================================
  // PUBG MOBILE — PACKS (6 OFFERS)
  // ==========================================
  {
    providerOfferId: 1006,
    productName: 'PUBG Mobile',
    offerName: 'PUBG Mobile First Purchase Pack UC',
    arabicName: 'حزمة الشراء الأول',
    description: 'حزمة مخصصة للشراء الأول في PUBG Mobile، وتقدم مكافآت إضافية مرتبطة بأول عملية شراء على الحساب. تحقق من أهلية الحساب قبل الشراء.',
    subCategory: 'PACKS',
    productType: 'PACK',
    displayOrder: 501,
    imageUrl: PUBG_COVER_IMAGE
  },
  {
    providerOfferId: 1016,
    productName: 'PUBG Mobile',
    offerName: 'PUBG Mobile Upgradable Firearm Materials Pack UC',
    arabicName: 'حزمة مواد تطوير الأسلحة',
    description: 'حزمة مخصصة للحصول على موارد ومواد تساعدك في تطوير الأسلحة القابلة للترقية داخل PUBG Mobile.',
    subCategory: 'PACKS',
    productType: 'PACK',
    displayOrder: 502,
    imageUrl: PUBG_COVER_IMAGE
  },
  {
    providerOfferId: 1007,
    productName: 'PUBG Mobile',
    offerName: 'PUBG Mobile Mythic Emblem Pack UC',
    arabicName: 'حزمة الشعار الأسطوري',
    description: 'حزمة PUBG Mobile مخصصة للحصول على موارد ومكافآت مرتبطة بنظام الشارات/العناصر الأسطورية داخل اللعبة.',
    subCategory: 'PACKS',
    productType: 'PACK',
    displayOrder: 503,
    imageUrl: PUBG_COVER_IMAGE
  },
  {
    providerOfferId: 1019,
    productName: 'PUBG Mobile',
    offerName: 'PUBG Mobile Weekly Mythic Emblem Value Pack UC',
    arabicName: 'حزمة قيمة الشعار الأسطوري الأسبوعية',
    description: 'حزمة أسبوعية توفر مجموعة من المكافآت المرتبطة بنظام الشعار الأسطوري بقيمة أفضل داخل اللعبة.',
    subCategory: 'PACKS',
    productType: 'PACK',
    displayOrder: 504,
    imageUrl: PUBG_COVER_IMAGE
  },
  {
    providerOfferId: 1017,
    productName: 'PUBG Mobile',
    offerName: 'PUBG Mobile Weekly Deal Pack 1 UC',
    arabicName: 'العرض الأسبوعي 1',
    description: 'حزمة أسبوعية من PUBG Mobile تقدم مجموعة من المكافآت والعناصر ضمن عرض دوري داخل اللعبة.',
    subCategory: 'PACKS',
    productType: 'PACK',
    displayOrder: 505,
    imageUrl: PUBG_COVER_IMAGE
  },
  {
    providerOfferId: 1018,
    productName: 'PUBG Mobile',
    offerName: 'PUBG Mobile Weekly Deal Pack 2 UC',
    arabicName: 'العرض الأسبوعي 2',
    description: 'حزمة أسبوعية من PUBG Mobile تقدم مجموعة من المكافآت والعناصر ضمن عرض دوري داخل اللعبة.',
    subCategory: 'PACKS',
    displayOrder: 506,
    productType: 'PACK',
    imageUrl: PUBG_COVER_IMAGE
  },

  // ==========================================
  // PUBG MOBILE — WOW COINS (6 OFFERS)
  // ==========================================
  {
    providerOfferId: 61389,
    productName: 'PUBG Mobile',
    offerName: 'PUBG Mobile 60 WOW Coins',
    arabicName: '60 عملة WOW',
    description: 'اشحن 60 عملة WOW Coins في PUBG Mobile لاستخدامها في أوضاع عالم العجائب عبر معرّف اللاعب.',
    subCategory: 'WOW_COINS',
    productType: 'WOW_COINS',
    displayOrder: 601,
    imageUrl: PUBG_COVER_IMAGE
  },
  {
    providerOfferId: 61387,
    productName: 'PUBG Mobile',
    offerName: 'PUBG Mobile 325 WOW Coins',
    arabicName: '325 عملة WOW',
    description: 'اشحن 325 عملة WOW Coins في PUBG Mobile لاستخدامها في أوضاع عالم العجائب عبر معرّف اللاعب.',
    subCategory: 'WOW_COINS',
    productType: 'WOW_COINS',
    displayOrder: 602,
    imageUrl: PUBG_COVER_IMAGE
  },
  {
    providerOfferId: 61390,
    productName: 'PUBG Mobile',
    offerName: 'PUBG Mobile 660 WOW Coins',
    arabicName: '660 عملة WOW',
    description: 'اشحن 660 عملة WOW Coins في PUBG Mobile لاستخدامها في أوضاع عالم العجائب عبر معرّف اللاعب.',
    subCategory: 'WOW_COINS',
    productType: 'WOW_COINS',
    displayOrder: 603,
    imageUrl: PUBG_COVER_IMAGE
  },
  {
    providerOfferId: 61386,
    productName: 'PUBG Mobile',
    offerName: 'PUBG Mobile 1800 WOW Coins',
    arabicName: '1,800 عملة WOW',
    description: 'اشحن 1,800 عملة WOW Coins في PUBG Mobile لاستخدامها في أوضاع عالم العجائب عبر معرّف اللاعب.',
    subCategory: 'WOW_COINS',
    productType: 'WOW_COINS',
    displayOrder: 604,
    imageUrl: PUBG_COVER_IMAGE
  },
  {
    providerOfferId: 61388,
    productName: 'PUBG Mobile',
    offerName: 'PUBG Mobile 3850 WOW Coins',
    arabicName: '3,850 عملة WOW',
    description: 'اشحن 3,850 عملة WOW Coins في PUBG Mobile لاستخدامها في أوضاع عالم العجائب عبر معرّف اللاعب.',
    subCategory: 'WOW_COINS',
    productType: 'WOW_COINS',
    displayOrder: 605,
    imageUrl: PUBG_COVER_IMAGE
  },
  {
    providerOfferId: 61391,
    productName: 'PUBG Mobile',
    offerName: 'PUBG Mobile 8100 WOW Coins',
    arabicName: '8,100 عملة WOW',
    description: 'اشحن 8,100 عملة WOW Coins في PUBG Mobile لاستخدامها في أوضاع عالم العجائب عبر معرّف اللاعب.',
    subCategory: 'WOW_COINS',
    productType: 'WOW_COINS',
    displayOrder: 606,
    imageUrl: PUBG_COVER_IMAGE
  }
];

async function applyCuratedCatalog() {
  console.log('================================================================');
  console.log('  KIROPRO — DEFINITIVE CATALOG REORGANIZATION & ACTIVATION');
  console.log('================================================================');

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Deactivate ALL products in the catalog
    console.log('[Curator] Deactivating all catalog products in database...');
    const deactRes = await client.query('UPDATE "Product" SET "isActive" = false');
    console.log(`[Curator] Set isActive = false for ${deactRes.rowCount} products.`);

    // 2. Activate and update curated products
    console.log(`[Curator] Activating ${CURATED_OFFERS.length} curated products...`);
    let activatedCount = 0;

    for (const def of CURATED_OFFERS) {
      const res = await client.query(`
        UPDATE "Product"
        SET 
          "isActive" = true,
          "arabicName" = $1,
          "description" = $2,
          "subCategory" = $3,
          "productType" = $4,
          "displayOrder" = $5,
          "imageUrl" = COALESCE($6, "imageUrl"),
          "updatedAt" = NOW()
        WHERE "providerOfferId" = $7
        RETURNING id, "productName", "offerName", "arabicName", "customerPriceUsd"
      `, [
        def.arabicName,
        def.description,
        def.subCategory,
        def.productType,
        def.displayOrder,
        def.imageUrl || null,
        def.providerOfferId
      ]);

      if (res.rows.length > 0) {
        activatedCount++;
        const row = res.rows[0];
        console.log(`[Activated] OfferId: ${def.providerOfferId} | ${def.productName} -> "${row.arabicName}" (SalePrice: $${row.customerPriceUsd || 'null'})`);
      } else {
        console.warn(`[WARNING] OfferId ${def.providerOfferId} was not found in Product table!`);
      }
    }

    await client.query('COMMIT');

    console.log('\n================================================================');
    console.log('  CURATION SUMMARY');
    console.log('================================================================');
    console.log(`Total Curated Target: ${CURATED_OFFERS.length}`);
    console.log(`Successfully Activated: ${activatedCount}`);
    console.log('All other products remain in database as isActive = false.');
    console.log('================================================================\n');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Curator Error]:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

applyCuratedCatalog().catch(err => {
  console.error(err);
  process.exit(1);
});
