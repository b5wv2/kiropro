import 'dotenv/config';
import './config';
import dns from 'node:dns';
// Force IPv4 first to prevent Node.js fetch from hanging/failing on unrouted IPv6 networks
dns.setDefaultResultOrder('ipv4first');

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/auth';
import walletRoutes from './routes/wallet';
import ordersRoutes from './routes/orders';
import adminRoutes from './routes/admin';
import topupRoutes from './routes/topup';
import promoRoutes from './routes/promo';
import productsRoutes from './routes/products';
import cashbackRoutes from './routes/cashback';
import reviewsRoutes from './routes/reviews';
import receiptsRoutes from './routes/receipts';
import { orderPollingService } from './services/orderPollingService';
import path from 'path';

const app = express();

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

const allowedOrigins = [
  'http://localhost:5174',
  'http://localhost:5173',
  process.env.FRONTEND_URL
].filter(Boolean) as string[];

app.use(cors({
  origin: (origin, callback) => {
    // allow requests with no origin (like mobile apps or curl)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json());
app.use(cookieParser());

// 1. Public Uploads: Product & Category Images Only (Publicly Accessible)
app.use('/uploads/products', express.static(path.join(__dirname, '../uploads/products'), {
  maxAge: '1d',
  setHeaders: (res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  }
}));

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
app.use('/api/wallet', walletRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/products', productsReadLimiter, productsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', topupRoutes);
app.use('/api/promo-codes', promoRoutes);
app.use('/api/cashback', cashbackRoutes);
app.use('/api/reviews', reviewsRoutes);

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

app.listen(PORT, async () => {
  console.log(`Server running on http://localhost:${PORT}`);
  // Start background order polling service (7-second interval)
  orderPollingService.start();
});

process.on('SIGTERM', () => {
  orderPollingService.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  orderPollingService.stop();
  process.exit(0);
});
