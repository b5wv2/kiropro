import { Router, Response } from 'express';
import { requireAdmin, AuthRequest } from '../middlewares/authMiddleware';
import { virtualNumberService } from '../services/virtualNumberService';
import { fiveSimClient } from '../providers/fiveSim';

const router = Router();

// All routes require ADMIN role
router.use(requireAdmin);

/**
 * 1. Admin: Get Orders List with filters & pagination
 */
router.get('/orders', async (req: AuthRequest, res: Response) => {
  try {
    const status = req.query.status ? String(req.query.status) : undefined;
    const countryCode = req.query.countryCode ? String(req.query.countryCode) : undefined;
    const serviceCode = req.query.serviceCode ? String(req.query.serviceCode) : undefined;
    const limit = req.query.limit ? Math.min(100, Math.max(1, Number(req.query.limit))) : 50;
    const offset = req.query.offset ? Math.max(0, Number(req.query.offset)) : 0;

    const result = await virtualNumberService.getAdminOrders({
      status,
      countryCode,
      serviceCode,
      limit,
      offset
    });

    res.json(result);
  } catch (err: any) {
    console.error('[AdminVirtualNumbers] Orders list error:', err.message);
    res.status(500).json({ error: 'فشل استعلام طلبات الأرقام الافتراضية.' });
  }
});

/**
 * 2. Admin: Get Settings & Provider Health
 */
router.get('/settings', async (_req: AuthRequest, res: Response) => {
  try {
    const settings = await virtualNumberService.getSettings();

    let providerInfo: any = null;
    let providerError: string | null = null;

    if (fiveSimClient.isConfigured()) {
      try {
        const profile = await fiveSimClient.getProfile();
        providerInfo = {
          email: profile.email,
          balance: profile.balance,
          frozenBalance: profile.frozen_balance,
          rating: profile.rating,
          isConfigured: true
        };
      } catch (pErr: any) {
        providerError = pErr.message || 'تعذر الاتصال بـ 5SIM';
      }
    } else {
      providerInfo = {
        isConfigured: false,
        message: 'FIVESIM_API_TOKEN غير مهيأ في .env'
      };
    }

    res.json({
      settings,
      provider: providerInfo,
      providerError
    });
  } catch (err: any) {
    console.error('[AdminVirtualNumbers] Settings error:', err.message);
    res.status(500).json({ error: 'فشل جلب إعدادات الأرقام الافتراضية.' });
  }
});

/**
 * 3. Admin: Update General Settings
 */
router.put('/settings', async (req: AuthRequest, res: Response) => {
  try {
    const { freeAttemptsLimit, defaultPaidPriceSdg, isSystemActive } = req.body;

    if (freeAttemptsLimit !== undefined && (isNaN(freeAttemptsLimit) || freeAttemptsLimit < 0)) {
      return res.status(400).json({ error: 'عدد المحاولات المجانية يجب أن يكون رقماً صحيحاً موجب أو صفر.' });
    }

    if (defaultPaidPriceSdg !== undefined && (isNaN(defaultPaidPriceSdg) || defaultPaidPriceSdg < 0)) {
      return res.status(400).json({ error: 'سعر المحاولة يجب أن يكون رقماً موجباً.' });
    }

    const updated = await virtualNumberService.updateSettings({
      freeAttemptsLimit: freeAttemptsLimit !== undefined ? Number(freeAttemptsLimit) : undefined,
      defaultPaidPriceSdg: defaultPaidPriceSdg !== undefined ? Number(defaultPaidPriceSdg) : undefined,
      isSystemActive: isSystemActive !== undefined ? Boolean(isSystemActive) : undefined
    });

    res.json({
      message: 'تم تحديث إعدادات الأرقام الافتراضية بنجاح.',
      settings: updated
    });
  } catch (err: any) {
    console.error('[AdminVirtualNumbers] Update settings error:', err.message);
    res.status(500).json({ error: 'فشل حفظ الإعدادات.' });
  }
});

/**
 * 4. Admin: Get Offers List (with Country & Service filter)
 */
router.get('/offers', async (req: AuthRequest, res: Response) => {
  try {
    const countryCode = req.query.countryCode ? String(req.query.countryCode) : undefined;
    const serviceCode = req.query.serviceCode ? String(req.query.serviceCode) : undefined;
    const offers = await virtualNumberService.getAdminOffers({ countryCode, serviceCode });
    res.json(offers);
  } catch (err: any) {
    console.error('[AdminVirtualNumbers] Offers list error:', err.message);
    res.status(500).json({ error: 'فشل جلب قائمة عروض المزودين.' });
  }
});

/**
 * 5. Admin: Update Specific Offer
 */
router.put('/offers/:id', async (req: AuthRequest, res: Response) => {
  try {
    const offerId = String(req.params.id);
    const { customerPriceSdg, supplierCost, providerName, isActive, deliveryRate, etaText } = req.body;

    const updated = await virtualNumberService.updateAdminOffer(offerId, {
      customerPriceSdg: customerPriceSdg !== undefined ? Number(customerPriceSdg) : undefined,
      supplierCost: supplierCost !== undefined ? Number(supplierCost) : undefined,
      providerName: providerName !== undefined ? String(providerName) : undefined,
      isActive: isActive !== undefined ? Boolean(isActive) : undefined,
      deliveryRate: deliveryRate !== undefined ? Number(deliveryRate) : undefined,
      etaText: etaText !== undefined ? String(etaText) : undefined
    });

    res.json({
      message: 'تم تحديث عرض المزود بنجاح.',
      offer: updated
    });
  } catch (err: any) {
    console.error('[AdminVirtualNumbers] Update offer error:', err.message);
    res.status(500).json({ error: 'فشل تحديث العرض.' });
  }
});

/**
 * 6. Admin: Create New Provider Offer
 */
router.post('/offers', async (req: AuthRequest, res: Response) => {
  try {
    const { countryCode, serviceCode, providerId, providerName, supplierCost, customerPriceSdg, deliveryRate, etaText } = req.body;

    if (!countryCode || !serviceCode || !providerId || !providerName || customerPriceSdg === undefined) {
      return res.status(400).json({ error: 'جميع الحقول الأساسية مطلوبة (الدولة، الخدمة، معرف المزود، اسم المزود، وسعر العميل).' });
    }

    const created = await virtualNumberService.createAdminOffer({
      countryCode: String(countryCode),
      serviceCode: String(serviceCode),
      providerId: String(providerId),
      providerName: String(providerName),
      supplierCost: Number(supplierCost) || 0,
      customerPriceSdg: Number(customerPriceSdg),
      deliveryRate: deliveryRate !== undefined ? Number(deliveryRate) : undefined,
      etaText: etaText ? String(etaText) : undefined
    });

    res.status(201).json({
      message: 'تم إنشاء عرض المزود بنجاح.',
      offer: created
    });
  } catch (err: any) {
    console.error('[AdminVirtualNumbers] Create offer error:', err.message);
    res.status(400).json({ error: err.message || 'فشل إنشاء العرض.' });
  }
});

/**
 * 6. Admin: Live Provider Profile & Balance
 */
router.get('/provider-status', async (_req: AuthRequest, res: Response) => {
  try {
    if (!fiveSimClient.isConfigured()) {
      return res.status(400).json({
        configured: false,
        error: 'لم يتم إدخال مفتاح FIVESIM_API_TOKEN في ملف البيئة .env'
      });
    }

    const profile = await fiveSimClient.getProfile();
    res.json({
      configured: true,
      profile: {
        id: profile.id,
        email: profile.email,
        balance: profile.balance,
        frozenBalance: profile.frozen_balance,
        rating: profile.rating,
        vendor: profile.vendor
      }
    });
  } catch (err: any) {
    res.status(500).json({
      configured: true,
      error: err.message || 'تعذر جلب رصيد المزود'
    });
  }
});

export default router;
