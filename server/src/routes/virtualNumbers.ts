import { Router, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth, AuthRequest } from '../middlewares/authMiddleware';
import {
  virtualNumberService,
  ALLOWED_COUNTRIES,
  ALLOWED_SERVICES
} from '../services/virtualNumberService';
import pool from '../db';

const router = Router();

// Rate limiters
const createOrderLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'تم تجاوز الحد المسموح لإنشاء طلبات الأرقام مؤقتاً. يرجى الانتظار دقيقة واحدة.' }
});

const pollOrderLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120, // 2 requests per second per IP
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * 1. Public / Authenticated: Get Virtual Numbers Catalog (Allowed Countries & Services Categories)
 */
router.get('/catalog', async (_req, res: Response) => {
  try {
    const settings = await virtualNumberService.getSettings();

    // Query active offers count per service category
    const statsRes = await pool.query(
      `SELECT country_code, service_code, count(*) as providers_count, min(customer_price_sdg) as min_price
       FROM virtual_number_offers 
       WHERE is_active = true 
       GROUP BY country_code, service_code`
    );

    res.json({
      settings: {
        isSystemActive: settings.is_system_active,
        freeAttemptsLimit: settings.free_attempts_limit,
        defaultPaidPriceSdg: settings.default_paid_price_sdg
      },
      allowedCountries: Object.values(ALLOWED_COUNTRIES),
      allowedServices: Object.values(ALLOWED_SERVICES),
      serviceStats: statsRes.rows
    });
  } catch (err: any) {
    console.error('[VirtualNumbersRoute] Error fetching catalog:', err.message);
    res.status(500).json({ error: 'تعذر جلب قائمة خدمات الأرقام الافتراضية حالياً.' });
  }
});

/**
 * 2. Public / Authenticated: Get Providers / Offers for a selected Country + Service Category
 * Flow: Country -> Service Category -> Providers List
 */
router.get('/providers', async (req, res: Response) => {
  try {
    const countryCode = String(req.query.countryCode || req.query.country || '');
    const serviceCode = String(req.query.serviceCode || req.query.service || '');

    if (!countryCode || !serviceCode) {
      return res.status(400).json({ error: 'يرجى تحديد الدولة وفئة الخدمة لعرض المزودين المتاحين.' });
    }

    const providers = await virtualNumberService.getProvidersForService(countryCode, serviceCode);
    res.json(providers);
  } catch (err: any) {
    const msg = err.message || '';
    const cleanMessage = msg.includes(': ') ? msg.split(': ')[1] : msg;
    res.status(400).json({ error: cleanMessage });
  }
});

/**
 * 3. Authenticated: Get User Attempts Status
 */
router.get('/attempts', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const attempts = await virtualNumberService.getUserAttemptsInfo(req.user.id);
    res.json(attempts);
  } catch (err: any) {
    console.error('[VirtualNumbersRoute] Error fetching attempts:', err.message);
    res.status(500).json({ error: 'فشل استعلام حالة المحاولات.' });
  }
});

/**
 * 4. Authenticated: Create Virtual Number Order
 * STRICT VALIDATION: providerId is mandatory and cannot be ANY.
 */
router.post('/orders', createOrderLimiter, requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const { countryCode, serviceCode, providerId, offerId } = req.body;

    if (!countryCode || !serviceCode) {
      return res.status(400).json({ error: 'يرجى تحديد الدولة وفئة الخدمة المطلوبة.' });
    }

    if (!providerId) {
      return res.status(400).json({ error: 'يجب اختيار مزود الرقم أولاً قبل بدء الطلب.' });
    }

    const order = await virtualNumberService.createOrder({
      userId: req.user.id,
      countryCode: String(countryCode),
      serviceCode: String(serviceCode),
      providerId: String(providerId),
      offerId: offerId ? String(offerId) : undefined
    });

    res.status(201).json(order);
  } catch (err: any) {
    const msg = err.message || '';
    if (
      msg.includes('INVALID_COUNTRY') ||
      msg.includes('INVALID_SERVICE') ||
      msg.includes('PROVIDER_REQUIRED') ||
      msg.includes('FORBIDDEN_PROVIDER') ||
      msg.includes('OFFER_NOT_AVAILABLE') ||
      msg.includes('INSUFFICIENT_BALANCE') ||
      msg.includes('DUPLICATE_ORDER') ||
      msg.includes('SYSTEM_INACTIVE') ||
      msg.includes('no free phones') ||
      msg.includes('مزود الخدمة')
    ) {
      const cleanMessage = msg.includes(': ') ? msg.split(': ')[1] : msg;
      return res.status(400).json({ error: cleanMessage });
    }

    console.error('[VirtualNumbersRoute] Create order error:', msg);
    res.status(500).json({ error: 'حدث خطأ أثناء معالجة طلب الرقم الافتراضي.' });
  }
});

/**
 * 5. Authenticated: Get Specific Order Details (with live check tick)
 */
router.get('/orders/:id', pollOrderLimiter, requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const orderId = String(req.params.id);

    const order = await virtualNumberService.getOrderById(orderId, req.user.id);
    if (!order) {
      return res.status(404).json({ error: 'الطلب غير موجود أو غير تابع لحسابك.' });
    }

    // If order is waiting for SMS, perform live tick update
    if (order.status === 'WAITING_FOR_CODE') {
      try {
        const updated = await virtualNumberService.checkAndUpdateOrder(orderId);
        return res.json(updated);
      } catch {
        // Fallback to current DB state
      }
    }

    res.json(order);
  } catch (err: any) {
    console.error('[VirtualNumbersRoute] Fetch order error:', err.message);
    res.status(500).json({ error: 'فشل جلب تفاصيل الطلب.' });
  }
});

/**
 * 6. Authenticated: Cancel Order & Refund
 */
router.post('/orders/:id/cancel', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const orderId = String(req.params.id);

    const canceled = await virtualNumberService.cancelOrder(orderId, req.user.id);
    res.json({
      success: true,
      message: 'تم إلغاء الطلب بنجاح واستعادة الرصيد للمحفظة.',
      order: canceled
    });
  } catch (err: any) {
    const msg = err.message || '';
    if (
      msg.includes('CANNOT_CANCEL') ||
      msg.includes('ORDER_NOT_FOUND') ||
      msg.includes('FORBIDDEN')
    ) {
      const cleanMessage = msg.includes(': ') ? msg.split(': ')[1] : msg;
      return res.status(400).json({ error: cleanMessage });
    }

    console.error('[VirtualNumbersRoute] Cancel order error:', msg);
    res.status(500).json({ error: 'حدث خطأ أثناء محاولة إلغاء الطلب.' });
  }
});

/**
 * 7. Authenticated: Get Current User's Orders ("طلباتي")
 */
router.get('/my-orders', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const orders = await virtualNumberService.getUserOrders(req.user.id);
    res.json(orders);
  } catch (err: any) {
    console.error('[VirtualNumbersRoute] Fetch my orders error:', err.message);
    res.status(500).json({ error: 'فشل جلب سجل طلباتك.' });
  }
});

export default router;
