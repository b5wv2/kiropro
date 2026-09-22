import 'dotenv/config';
import './config';
import dns from 'node:dns';
// Force IPv4 first to prevent Node.js fetch from hanging/failing on unrouted IPv6 networks
dns.setDefaultResultOrder('ipv4first');

import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/auth';
import walletRoutes from './routes/wallet';
import ordersRoutes from './routes/orders';
import adminRoutes, { getGeneralSettings, getContactChannels, DEFAULT_CONTACT_CHANNELS, updateContactChannelsHandler } from './routes/admin';
import { requireAdmin } from './middlewares/authMiddleware';
import { banCheckMiddleware } from './middlewares/banCheckMiddleware';
import topupRoutes from './routes/topup';
import promoRoutes from './routes/promo';
import productsRoutes from './routes/products';
import cashbackRoutes from './routes/cashback';
import reviewsRoutes from './routes/reviews';
import receiptsRoutes from './routes/receipts';
import cryptoRoutes from './routes/crypto';
import adminCryptoRoutes from './routes/adminCrypto';
import internalTelegramRoutes from './routes/internalTelegram';
import referralRoutes from './routes/referral';
import { orderPollingService } from './services/orderPollingService';
import { telegramBotService } from './services/telegramBotService';
import { catalogSyncService } from './services/catalogSyncService';
import pool from './db';
import path from 'path';
import fs from 'fs';

const app = express();

// 1. Trust proxy: Required for Railway, Render, Cloudflare, and SSL terminating reverse proxies.
// Enables req.secure and proper handling of Secure HttpOnly cookies behind Railway proxies.
app.set('trust proxy', 1);

// Security Headers: Protection against clickjacking, MIME sniffing, and insecure transport
app.use(helmet({
  contentSecurityPolicy: false, // Managed at gateway level; avoids blocking legitimate game banner assets
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allows uploaded product images to load on frontend
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  frameguard: { action: 'deny' }, // Protects against iframe clickjacking
  hsts: process.env.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true } : false,
  noSniff: true, // X-Content-Type-Options: nosniff
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

// 2. Parse Frontend Origins strictly from FRONTEND_URL environment variable
// Supports comma-separated list of origins and strips trailing slashes
const envFrontendUrls = (process.env.FRONTEND_URL || '')
  .split(',')
  .map(u => u.trim().replace(/\/+$/, ''))
  .filter(Boolean);

// Production and Development allowed origins
const allowedOrigins = [
  'https://kiropro.store',
  'https://www.kiropro.store',
  ...envFrontendUrls,
  ...(process.env.NODE_ENV !== 'production'
    ? ['http://localhost:5173', 'http://localhost:5174', 'http://127.0.0.1:5173', 'http://127.0.0.1:5174']
    : [])
];

if (process.env.NODE_ENV === 'production' && envFrontendUrls.length === 0) {
  console.log('[CORS] Defaulting to trusted production domain https://kiropro.store (FRONTEND_URL not set in env).');
}

app.use(cors({
  origin: (origin, callback) => {
    // allow requests with no origin (like mobile apps, server-to-server, curl, health checks)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "x-client-timezone",
    "x-client-language",
    "X-Requested-With",
    "Accept",
    "Origin"
  ],
  optionsSuccessStatus: 200
}));
app.use(express.json());
app.use(cookieParser());

// 1. Public Uploads: Dedicated, secure serving for product & category images
const UPLOADS_PRODUCTS_DIR = path.resolve(__dirname, '../uploads/products');
if (!fs.existsSync(UPLOADS_PRODUCTS_DIR)) {
  fs.mkdirSync(UPLOADS_PRODUCTS_DIR, { recursive: true });
}

const MIME_TYPES: Record<string, string> = {
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

// Auto-restore any missing persistent images from PostgreSQL UploadedAsset table to local disk cache
async function restoreAssetsFromDatabase() {
  try {
    const assets = await pool.query('SELECT "filename", "dataBase64" FROM "UploadedAsset"');
    let restoredCount = 0;
    for (const asset of assets.rows) {
      const filePath = path.join(UPLOADS_PRODUCTS_DIR, asset.filename);
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, Buffer.from(asset.dataBase64, 'base64'));
        restoredCount++;
      }
    }
    if (restoredCount > 0) {
      console.log(`[AssetServer] Restored ${restoredCount} persistent images from database to disk cache.`);
    }
  } catch (err: any) {
    console.warn('[AssetServer] Notice: asset auto-restore deferred:', err.message);
  }
}
restoreAssetsFromDatabase();

app.get('/uploads/products/:filename', async (req: Request, res: Response) => {
  const filename = Array.isArray(req.params.filename) ? req.params.filename[0] : String(req.params.filename || '');

  // Strict Whitelist Filename Validation (Prevents Path Traversal, Null Bytes, Directory Browsing)
  if (!filename || !/^[a-zA-Z0-9_-]+\.(webp|png|jpg|jpeg|svg)$/i.test(filename)) {
    return res.status(400).json({ error: 'اسم الملف غير صالح.' });
  }

  const safeFilePath = path.join(UPLOADS_PRODUCTS_DIR, filename);

  // Strict Boundary Check: Guarantee file is strictly inside UPLOADS_PRODUCTS_DIR
  if (!safeFilePath.startsWith(UPLOADS_PRODUCTS_DIR)) {
    return res.status(403).json({ error: 'غير مصرح بالوصول إلى هذا المسار.' });
  }

  const ext = path.extname(filename).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  // Check File Existence on local disk
  if (!fs.existsSync(safeFilePath)) {
    // 1. Look up in persistent database storage (PostgreSQL UploadedAsset)
    try {
      const assetRes = await pool.query(
        'SELECT "mimeType", "dataBase64" FROM "UploadedAsset" WHERE "filename" = $1 LIMIT 1',
        [filename]
      );
      if (assetRes.rows.length > 0) {
        const row = assetRes.rows[0];
        const buffer = Buffer.from(row.dataBase64, 'base64');
        // Cache to local disk for future requests
        try { fs.writeFileSync(safeFilePath, buffer); } catch {}
        res.setHeader('Content-Type', row.mimeType || contentType);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
        return res.send(buffer);
      }
    } catch (dbErr: any) {
      console.warn('[AssetServer] Database asset lookup warning:', dbErr.message);
    }

    // 2. Graceful fallback to default placeholder image if present on disk
    const defaultPlaceholder = path.join(UPLOADS_PRODUCTS_DIR, 'default.webp');
    if (fs.existsSync(defaultPlaceholder)) {
      res.setHeader('Content-Type', 'image/webp');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.sendFile(defaultPlaceholder);
    }
    return res.status(404).json({ error: 'الصورة غير موجودة.' });
  }

  // File exists on disk cache -> serve immediately
  res.setHeader('Content-Type', contentType);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');

  return res.sendFile(safeFilePath);
});

// 2. Private Financial Documents: Bank Transfer Receipts (Authenticated & Authorized Only)
app.use('/uploads/receipts', receiptsRoutes);

// 1. Dedicated Public Read Products Limiter (High capacity for customer catalog browsing)
const productsReadLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 1000, // 1000 requests per 5 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'تم تجاوز الحد الأقصى لتصفح المنتجات مؤقتاً. يرجى المحاولة بعد قليل.' }
});

// 2. General API Limiter (for mutations, wallet, orders, etc.)
const generalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1500, // 1500 requests per 15 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'تم تجاوز الحد المسموح من الطلبات. يرجى المحاولة لاحقاً.' },
  skip: (req) => {
    // Skip public GET product catalog browsing (governed by productsReadLimiter)
    return req.method === 'GET' && (req.path === '/products' || req.path.startsWith('/products/'));
  }
});

app.use('/api/', generalApiLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/wallet', banCheckMiddleware, walletRoutes);
app.use('/api/orders', banCheckMiddleware, ordersRoutes);
app.use('/api/products', productsReadLimiter, productsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', banCheckMiddleware, topupRoutes);
app.use('/api/promo-codes', promoRoutes);
app.use('/api/cashback', cashbackRoutes);
app.use('/api/reviews', reviewsRoutes);
app.use('/api/crypto/usdt', banCheckMiddleware, cryptoRoutes);
app.use('/api/admin/crypto', adminCryptoRoutes);
app.use('/api/internal/telegram', internalTelegramRoutes);
app.use('/api/referral', banCheckMiddleware, referralRoutes);

// Public platform settings & maintenance check endpoints
app.get('/api/settings/public', async (_req: Request, res: Response) => {
  try {
    const [settings, contactChannels] = await Promise.all([
      getGeneralSettings(),
      getContactChannels()
    ]);
    const activeChannels = contactChannels.filter(c => c.enabled);
    const primaryWhatsapp = contactChannels.find(c => c.id === 'whatsapp' && c.enabled) || null;

    res.json({
      maintenanceMode: settings.maintenanceMode,
      storeName: settings.storeName,
      supportEmail: settings.supportEmail,
      telegramSupport: settings.telegramSupport,
      contactChannels: activeChannels,
      primaryWhatsapp
    });
  } catch {
    res.json({
      maintenanceMode: true,
      storeName: 'KIROPRO',
      contactChannels: DEFAULT_CONTACT_CHANNELS,
      primaryWhatsapp: DEFAULT_CONTACT_CHANNELS[0]
    });
  }
});

app.get('/api/contact-channels', async (_req: Request, res: Response) => {
  try {
    const all = await getContactChannels();
    const enabled = all.filter(c => c.enabled);
    const primaryWhatsapp = all.find(c => c.id === 'whatsapp' && c.enabled) || null;
    res.json({
      channels: enabled,
      primaryWhatsapp
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch contact channels' });
  }
});

// Admin contact-channels routes (direct fallback on app to ensure compatibility with all proxy rules)
app.put('/api/admin/contact-channels', requireAdmin, updateContactChannelsHandler);
app.patch('/api/admin/contact-channels', requireAdmin, updateContactChannelsHandler);
app.get('/api/admin/contact-channels', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const channels = await getContactChannels();
    res.json({ channels });
  } catch {
    res.status(500).json({ error: 'Failed to fetch contact channels' });
  }
});

app.get('/api/settings/maintenance', async (_req: Request, res: Response) => {
  try {
    const settings = await getGeneralSettings();
    res.json({ maintenanceMode: settings.maintenanceMode });
  } catch {
    res.json({ maintenanceMode: true });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'kiropro-backend' });
});

// Centralized Production Error Handling Middleware (prevents internal stack trace leakage)
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err?.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'غير مصرح بالوصول عبر سياسة مشاركة الموارد (CORS).' });
  }
  console.error('[Unhandled Server Error]', err?.message || err);
  return res.status(500).json({
    error: 'حدث خطأ غير متوقع في معالجة الطلب. يرجى المحاولة لاحقاً.'
  });
});

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, async () => {
  console.log(`Server running on http://localhost:${PORT}`);
  // Start background order polling service (7-second interval)
  orderPollingService.start();

  // Start embedded Telegram Bot service with error isolation
  try {
    await telegramBotService.start();
  } catch (botErr: any) {
    console.error('[TelegramBot] Failed to start bot service on server startup:', botErr.message);
  }

  // Rate-safe Scheduled Catalog Sync (every 30 minutes)
  const SYNC_INTERVAL_MS = 30 * 60 * 1000;
  setInterval(async () => {
    try {
      console.log('[ScheduledSync] Executing 30-minute background catalog sync...');
      await catalogSyncService.syncTargetedProducts();
    } catch (syncErr: any) {
      console.warn('[ScheduledSync] Background catalog sync notice:', syncErr.message);
    }
  }, SYNC_INTERVAL_MS).unref();
});

function gracefulShutdown(signal: string) {
  console.log(`[Server] Received ${signal}. Starting graceful shutdown...`);
  try {
    orderPollingService.stop();
  } catch (err: any) {
    console.warn('[Server] Error stopping orderPollingService:', err.message);
  }

  try {
    telegramBotService.stop();
  } catch (err: any) {
    console.warn('[Server] Error stopping telegramBotService:', err.message);
  }

  server.close(() => {
    console.log('[Server] HTTP server closed.');
    process.exit(0);
  });

  // Force shutdown after 10 seconds if hanging
  setTimeout(() => {
    console.error('[Server] Forced shutdown after timeout.');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
