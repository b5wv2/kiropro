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
 * 1. Public / Authenticated: Get Virtual Numbers Catalog
 */
router.get('/catalog', async (_req, res: Response) => {
  try {
    const settings = await virtualNumberService.getSettings();

    // Query active products from PostgreSQL
    const productsRes = await pool.query(
      `SELECT country_code, service_code, custom_price_sdg, is_active, display_order 
       FROM virtual_number_products 
       ORDER BY display_order ASC`
    );

    const products = productsRes.rows.map(row => ({
      countryCode: row.country_code,
      serviceCode: row.service_code,
      priceSdg: row.custom_price_sdg !== null ? Number(row.custom_price_sdg) : settings.default_paid_price_sdg,
      isActive: Boolean(row.is_active)
    }));

    res.json({
      settings: {
        isSystemActive: settings.is_system_active,
        freeAttemptsLimit: settings.free_attempts_limit,
        defaultPaidPriceSdg: settings.default_paid_price_sdg
      },
      allowedCountries: Object.values(ALLOWED_COUNTRIES),
      allowedServices: Object.values(ALLOWED_SERVICES),
      products
    });
  } catch (err: any) {
    console.error('[VirtualNumbersRoute] Error fetching catalog:', err.message);
    res.status(500).json({ error: 'تعذر جلب قائمة خدمات الأرقام الافتراضية حالياً.' });
  }
});

/**
 * 2. Authenticated: Get User Attempts Status
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
 * 3. Authenticated: Create Virtual Number Order
 */
router.post('/orders', createOrderLimiter, requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const { countryCode, serviceCode } = req.body;
    if (!countryCode || !serviceCode) {
      return res.status(400).json({ error: 'يرجى تحديد الدولة والخدمة المطلوبة.' });
    }

    const order = await virtualNumberService.createOrder({
      userId: req.user.id,
      countryCode: String(countryCode),
      serviceCode: String(serviceCode)
    });

    res.status(201).json(order);
  } catch (err: any) {
    const msg = err.message || '';
    if (
      msg.includes('INVALID_COUNTRY') ||
      msg.includes('INVALID_SERVICE') ||
      msg.includes('INSUFFICIENT_BALANCE') ||
      msg.includes('PRODUCT_DISABLED') ||
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
 * 4. Authenticated: Get Specific Order Details (with fresh check tick)
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
 * 5. Authenticated: Cancel Order & Refund
 */
router.post('/orders/:id/cancel', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const orderId = String(req.params.id);

    const canceled = await virtualNumberService.cancelOrder(orderId, req.user.id);
    res.json({
      success: true,
      message: 'تم إلغاء الطلب واستعادة الرصيد بنجاح.',
      order: canceled
    });
  } catch (err: any) {
    const msg = err.message || '';
    if (msg.includes('CANNOT_CANCEL') || msg.includes('ORDER_NOT_FOUND') || msg.includes('FORBIDDEN')) {
      const cleanMessage = msg.includes(': ') ? msg.split(': ')[1] : msg;
      return res.status(400).json({ error: cleanMessage });
    }

    console.error('[VirtualNumbersRoute] Cancel order error:', msg);
    res.status(500).json({ error: 'فشل إلغاء الطلب.' });
  }
});

/**
 * 6. Authenticated: Get My Virtual Number Orders (For "طلباتي")
 */
router.get('/my-orders', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const orders = await virtualNumberService.getUserOrders(req.user.id);
    res.json(orders);
  } catch (err: any) {
    console.error('[VirtualNumbersRoute] Fetch my-orders error:', err.message);
    res.status(500).json({ error: 'فشل جلب قائمة طلباتك.' });
  }
});

export default router;
