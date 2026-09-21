import { Router, Response, Request } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db';
import { requireAuth, AuthRequest } from '../middlewares/authMiddleware';
import { sendVerificationOtpEmail, sendPasswordResetOtpEmail } from '../services/emailService';
import { JWT_SECRET, getAuthCookieOptions } from '../config';
import { generateReferralCode, bindReferralCode } from '../services/referralService';

const router = Router();

// Strict Auth Rate Limiter (10 requests / 15 mins per IP)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'تم تجاوز الحد الأقصى للمحاولات. يرجى المحاولة بعد 15 دقيقة.' }
});

// Password Reset Request Rate Limiter (25 requests / 15 mins per IP, higher in test)
const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1000 : 25,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'تم تجاوز الحد الأقصى لطلبات استعادة كلمة المرور. يرجى المحاولة بعد 15 دقيقة.' }
});

// OTP Verification Rate Limiter (50 attempts / 15 mins per IP, higher in test)
const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1000 : 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'تم تجاوز الحد الأقصى لمحاولات التحقق. يرجى المحاولة لاحقاً.' }
});

const generateToken = (id: string, email: string, role: string) => {
  return jwt.sign({ id, email, role }, JWT_SECRET, { expiresIn: '7d' });
};

const getCookieOptions = getAuthCookieOptions;

const setTokenCookie = (res: Response, token: string) => {
  res.cookie('token', token, {
    ...getCookieOptions(),
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });
};

function generateSecureOtp(): string {
  // Cryptographically secure 6-digit number between 100000 and 999999
  return crypto.randomInt(100000, 1000000).toString();
}

// ==========================================
// 1. REGISTER (ISSUES 6-DIGIT EMAIL OTP)
// ==========================================
router.post('/register', authLimiter, async (req: Request, res: Response) => {
  const { name, email, password, preferred_currency, referral_code } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: 'البريد الإلكتروني وكلمة المرور حقول مطلوبة.' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return res.status(400).json({ error: 'يرجى إدخال بريد إلكتروني صحيح.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'كلمة المرور يجب ألا تقل عن 6 أحرف.' });
  }

  // Strictly enforce SDG: all customer accounts and wallets are exclusively SDG
  const userCurrency = 'SDG';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check if user already exists
    const existingUserRes = await client.query('SELECT * FROM "User" WHERE email = $1', [normalizedEmail]);
    const existingUser = existingUserRes.rows[0];

    let userId: string;

    if (existingUser) {
      if (existingUser.role === 'ADMIN' || existingUser.emailVerified) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'هذا البريد الإلكتروني مسجل مسبقاً. يرجى تسجيل الدخول.' });
      }

      // User exists but has not verified email yet: update password hash, name, and preferred_currency
      userId = existingUser.id;
      const passwordHash = await bcrypt.hash(password, 10);
      await client.query(
        'UPDATE "User" SET name = COALESCE($1, name), "passwordHash" = $2, "preferred_currency" = $3, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $4',
        [name ? name.trim() : null, passwordHash, userCurrency, userId]
      );
      await client.query(
        'UPDATE "Wallet" SET currency = $1 WHERE "userId" = $2',
        [userCurrency, userId]
      );
    } else {
      // Create new user with emailVerified = false and preferred_currency
      userId = uuidv4();
      const walletId = uuidv4();
      const passwordHash = await bcrypt.hash(password, 10);
      const userRefCode = generateReferralCode();

      await client.query(
        'INSERT INTO "User" (id, email, name, "passwordHash", role, "emailVerified", "preferred_currency", "referral_code") VALUES ($1, $2, $3, $4, $5, false, $6, $7)',
        [userId, normalizedEmail, name ? name.trim() : 'مستخدم جديد', passwordHash, 'CUSTOMER', userCurrency, userRefCode]
      );

      await client.query(
        'INSERT INTO "Wallet" (id, "userId", balance, currency) VALUES ($1, $2, $3, $4)',
        [walletId, userId, 0, userCurrency]
      );

      // Link referral and immediately award referee bonus if provided
      if (referral_code && typeof referral_code === 'string' && referral_code.trim()) {
        try {
          await bindReferralCode(userId, referral_code.trim(), client, false);
        } catch (refErr: any) {
          console.warn('[Register] Referral binding skipped:', refErr.message);
        }
      }
    }

    // Check resend cooldown (60 seconds)
    const latestOtpRes = await client.query(
      'SELECT created_at FROM "email_verification_otps" WHERE email = $1 ORDER BY created_at DESC LIMIT 1',
      [normalizedEmail]
    );
    if (latestOtpRes.rows.length > 0) {
      const elapsedSec = Math.floor((Date.now() - new Date(latestOtpRes.rows[0].created_at).getTime()) / 1000);
      if (elapsedSec < 60) {
        await client.query('ROLLBACK');
        return res.status(429).json({ 
          error: `يرجى الانتظار ${60 - elapsedSec} ثانية قبل طلب رمز تحقق جديد.`,
          cooldownRemaining: 60 - elapsedSec
        });
      }
    }

    // Invalidate any old unverified OTPs
    await client.query(
      'UPDATE "email_verification_otps" SET verified_at = CURRENT_TIMESTAMP WHERE email = $1 AND verified_at IS NULL',
      [normalizedEmail]
    );

    // Generate secure 6-digit OTP & Hash
    const otp = generateSecureOtp();
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry

    await client.query(
      `INSERT INTO "email_verification_otps" (user_id, email, otp_hash, expires_at, attempts)
       VALUES ($1, $2, $3, $4, 0)`,
      [userId, normalizedEmail, otpHash, expiresAt]
    );

    // Send verification email via Resend
    const emailResult = await sendVerificationOtpEmail({
      to: normalizedEmail,
      otp,
      name: name ? name.trim() : undefined
    });

    if (!emailResult.success) {
      await client.query('ROLLBACK');
      return res.status(500).json({ error: emailResult.error || 'فشل إرسال بريد التحقق.' });
    }

    await client.query('COMMIT');

    res.status(200).json({
      success: true,
      requiresVerification: true,
      email: normalizedEmail,
      message: 'تم إنشاء الحساب وإرسال رمز التحقق إلى بريدك الإلكتروني.'
    });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('Registration error:', err);
    res.status(500).json({ error: 'حدث خطأ أثناء إنشاء الحساب، يرجى المحاولة لاحقاً.' });
  } finally {
    client.release();
  }
});

// ==========================================
// 2. VERIFY EMAIL OTP
// ==========================================
router.post('/verify-email', authLimiter, async (req: Request, res: Response) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ error: 'البريد الإلكتروني ورمز التحقق حقول مطلوبة.' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const cleanOtp = String(otp).trim();

  if (!/^\d{6}$/.test(cleanOtp)) {
    return res.status(400).json({ error: 'رمز التحقق يجب أن يتكون من 6 أرقام.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Find latest active OTP for this email
    const otpRes = await client.query(
      `SELECT * FROM "email_verification_otps" 
       WHERE email = $1 AND verified_at IS NULL 
       ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [normalizedEmail]
    );

    const otpRecord = otpRes.rows[0];

    if (!otpRecord) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'لا يوجد رمز تحقق نشط لهذا البريد. يرجى طلب رمز جديد.' });
    }

    // Check maximum attempts (5 attempts limit)
    if (otpRecord.attempts >= 5) {
      await client.query(
        'UPDATE "email_verification_otps" SET verified_at = CURRENT_TIMESTAMP WHERE id = $1',
        [otpRecord.id]
      );
      await client.query('COMMIT');
      return res.status(400).json({ 
        error: 'تم استنفاد الحد الأقصى للمحاولات (5 محاولات). يرجى طلب رمز جديد.',
        expired: true 
      });
    }

    // Check expiration (10 minutes)
    if (new Date() > new Date(otpRecord.expires_at)) {
      await client.query(
        'UPDATE "email_verification_otps" SET verified_at = CURRENT_TIMESTAMP WHERE id = $1',
        [otpRecord.id]
      );
      await client.query('COMMIT');
      return res.status(400).json({ 
        error: 'انتهت صلاحية رمز التحقق (10 دقائق). يرجى طلب رمز جديد.',
        expired: true 
      });
    }

    // Verify OTP Hash with bcrypt
    const isValid = await bcrypt.compare(cleanOtp, otpRecord.otp_hash);

    if (!isValid) {
      const nextAttempts = otpRecord.attempts + 1;
      await client.query(
        'UPDATE "email_verification_otps" SET attempts = $1 WHERE id = $2',
        [nextAttempts, otpRecord.id]
      );
      await client.query('COMMIT');
      const remainingAttempts = Math.max(0, 5 - nextAttempts);
      return res.status(400).json({ 
        error: `رمز التحقق غير صحيح. تبقى لديك ${remainingAttempts} محاولات.`,
        remainingAttempts 
      });
    }

    // Success: Mark OTP verified
    await client.query(
      'UPDATE "email_verification_otps" SET verified_at = CURRENT_TIMESTAMP WHERE id = $1',
      [otpRecord.id]
    );

    // Update User as verified
    const userUpdateRes = await client.query(
      `UPDATE "User" SET "emailVerified" = true, "updatedAt" = CURRENT_TIMESTAMP 
       WHERE email = $1 RETURNING id, email, name, role, "emailVerified", "preferred_currency"`,
      [normalizedEmail]
    );
    const user = userUpdateRes.rows[0];

    if (!user) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'المستخدم غير موجود في النظام.' });
    }

    // Fetch user wallet
    const walletRes = await client.query('SELECT balance, currency FROM "Wallet" WHERE "userId" = $1', [user.id]);
    const balance = walletRes.rows[0]?.balance || 0;
    const currency = walletRes.rows[0]?.currency || user.preferred_currency || 'SDG';

    await client.query('COMMIT');

    // Issue JWT Token for instant login
    const token = generateToken(user.id, user.email, user.role);
    setTokenCookie(res, token);

    res.json({
      success: true,
      message: 'تم تأكيد بريدك الإلكتروني بنجاح!',
      user: { ...user, balance, currency, preferred_currency: user.preferred_currency || currency },
      token
    });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('Error verifying email OTP:', err);
    res.status(500).json({ error: 'فشل التحقق من الرمز، يرجى المحاولة مرة أخرى.' });
  } finally {
    client.release();
  }
});

// ==========================================
// 3. RESEND OTP
// ==========================================
router.post('/resend-otp', authLimiter, async (req: Request, res: Response) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'البريد الإلكتروني مطلوب.' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check user exists
    const userRes = await client.query('SELECT id, name, "emailVerified" FROM "User" WHERE email = $1', [normalizedEmail]);
    const user = userRes.rows[0];

    if (!user) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'لم يتم العثور على حساب مسجل بهذا البريد الإلكتروني.' });
    }

    if (user.emailVerified) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'هذا الحساب مفعل بالفعل. يرجى تسجيل الدخول.' });
    }

    // Check cooldown (60 seconds)
    const latestOtpRes = await client.query(
      'SELECT created_at FROM "email_verification_otps" WHERE email = $1 ORDER BY created_at DESC LIMIT 1',
      [normalizedEmail]
    );

    if (latestOtpRes.rows.length > 0) {
      const elapsedSec = Math.floor((Date.now() - new Date(latestOtpRes.rows[0].created_at).getTime()) / 1000);
      if (elapsedSec < 60) {
        await client.query('ROLLBACK');
        return res.status(429).json({ 
          error: `يرجى الانتظار ${60 - elapsedSec} ثانية قبل إعادة إرسال الرمز.`,
          cooldownRemaining: 60 - elapsedSec
        });
      }
    }

    // Invalidate existing active OTPs
    await client.query(
      'UPDATE "email_verification_otps" SET verified_at = CURRENT_TIMESTAMP WHERE email = $1 AND verified_at IS NULL',
      [normalizedEmail]
    );

    // Generate new secure OTP
    const otp = generateSecureOtp();
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await client.query(
      `INSERT INTO "email_verification_otps" (user_id, email, otp_hash, expires_at, attempts)
       VALUES ($1, $2, $3, $4, 0)`,
      [user.id, normalizedEmail, otpHash, expiresAt]
    );

    // Send email with Resend
    const emailResult = await sendVerificationOtpEmail({
      to: normalizedEmail,
      otp,
      name: user.name || undefined
    });

    if (!emailResult.success) {
      await client.query('ROLLBACK');
      return res.status(500).json({ error: emailResult.error || 'فشل إرسال رمز التحقق.' });
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'تم إرسال رمز تحقق جديد إلى بريدك الإلكتروني بنجاح.'
    });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('Error resending OTP:', err);
    res.status(500).json({ error: 'فشل إعادة إرسال رمز التحقق.' });
  } finally {
    client.release();
  }
});

// ==========================================
// 4. VERIFICATION STATUS
// ==========================================
router.get('/verification-status', async (req: Request, res: Response) => {
  const email = typeof req.query.email === 'string' ? req.query.email.trim().toLowerCase() : '';

  if (!email) {
    return res.status(400).json({ error: 'Email query parameter is required' });
  }

  try {
    const userRes = await pool.query('SELECT "emailVerified" FROM "User" WHERE email = $1', [email]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const latestOtpRes = await pool.query(
      'SELECT created_at FROM "email_verification_otps" WHERE email = $1 ORDER BY created_at DESC LIMIT 1',
      [email]
    );

    let canResendIn = 0;
    if (latestOtpRes.rows.length > 0) {
      const elapsedSec = Math.floor((Date.now() - new Date(latestOtpRes.rows[0].created_at).getTime()) / 1000);
      if (elapsedSec < 60) {
        canResendIn = 60 - elapsedSec;
      }
    }

    res.json({
      email,
      verified: !!userRes.rows[0].emailVerified,
      canResendIn
    });
  } catch (err) {
    console.error('Verification status check error:', err);
    res.status(500).json({ error: 'Failed to check verification status' });
  }
});

// ==========================================
// 5. LOGIN (PROTECTED: CHECKS EMAIL VERIFICATION)
// ==========================================
router.post('/login', authLimiter, async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'البريد الإلكتروني وكلمة المرور حقول مطلوبة.' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    const userRes = await pool.query('SELECT * FROM "User" WHERE email = $1', [normalizedEmail]);
    const user = userRes.rows[0];
    
    if (!user) {
      return res.status(400).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' });
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      return res.status(400).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' });
    }

    // If user is CUSTOMER and not verified, prompt them to verify
    if (user.role !== 'ADMIN' && !user.emailVerified) {
      return res.status(403).json({
        error: 'يرجى تأكيد بريدك الإلكتروني أولاً لتفعيل حسابك.',
        requiresVerification: true,
        email: user.email
      });
    }

    const walletRes = await pool.query('SELECT balance, currency FROM "Wallet" WHERE "userId" = $1', [user.id]);
    const balance = walletRes.rows[0]?.balance || 0;
    const currency = walletRes.rows[0]?.currency || user.preferred_currency || 'SDG';

    const token = generateToken(user.id, user.email, user.role);
    setTokenCookie(res, token);

    const safeUser = { 
      id: user.id, 
      email: user.email, 
      name: user.name, 
      role: user.role, 
      balance,
      currency,
      preferred_currency: user.preferred_currency || currency,
      emailVerified: !!user.emailVerified
    };

    res.json({ user: safeUser, token });
  } catch (err: any) {
    console.error('Error during login:', err.message, err.stack);
    res.status(500).json({ error: 'فشل تسجيل الدخول.' });
  }
});

// ==========================================
// 6. LOGOUT
// ==========================================
router.post('/logout', (req: Request, res: Response) => {
  res.cookie('token', '', {
    ...getCookieOptions(),
    expires: new Date(0),
    maxAge: 0
  });
  res.cookie('admin_token', '', {
    ...getCookieOptions(),
    expires: new Date(0),
    maxAge: 0
  });
  res.json({ message: 'Logged out successfully' });
});

// ==========================================
// 6.1. CHECK ADMIN SESSION STATUS (DEVICE/BROWSER SCOPED)
// ==========================================
router.get('/session-status', async (req: Request, res: Response) => {
  let token: string | undefined;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.cookies?.token) {
    token = req.cookies.token;
  }

  if (!token) {
    return res.json({ hasValidAdminSession: false });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; email: string; role: string; iat?: number };
    if (!decoded || !decoded.id) {
      return res.json({ hasValidAdminSession: false });
    }

    const userRes = await pool.query('SELECT id, email, role, "passwordChangedAt" FROM "User" WHERE id = $1', [decoded.id]);
    const user = userRes.rows[0];

    if (!user || user.role !== 'ADMIN') {
      return res.json({ hasValidAdminSession: false });
    }

    // Invalidate session if password was changed after token issuance
    if (decoded.iat && user.passwordChangedAt) {
      const pwdChangedSec = Math.floor(new Date(user.passwordChangedAt).getTime() / 1000);
      if (decoded.iat < pwdChangedSec) {
        return res.json({ hasValidAdminSession: false });
      }
    }

    return res.json({
      hasValidAdminSession: true,
      email: user.email
    });
  } catch {
    return res.json({ hasValidAdminSession: false });
  }
});

// ==========================================
// 6.2. QUICK LOGIN (REQUIRES PRE-EXISTING VALID ADMIN SESSION ON THIS BROWSER)
// ==========================================
router.post('/quick-login', authLimiter, async (req: Request, res: Response) => {
  let token: string | undefined;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.cookies?.token) {
    token = req.cookies.token;
  }

  if (!token) {
    return res.status(401).json({
      error: 'لا توجد جلسة نشطة على هذا المتصفح. يرجى تسجيل الدخول باستخدام البريد وكلمة المرور أولاً.'
    });
  }

  let decoded: { id: string; email: string; role: string; iat?: number };
  try {
    decoded = jwt.verify(token, JWT_SECRET) as { id: string; email: string; role: string; iat?: number };
  } catch {
    return res.status(401).json({
      error: 'انتهت صلاحية الجلسة السابقة. يرجى تسجيل الدخول مجدداً بكلمة المرور.'
    });
  }

  try {
    const userRes = await pool.query(
      'SELECT id, email, name, role, "emailVerified", "preferred_currency", "passwordChangedAt" FROM "User" WHERE id = $1',
      [decoded.id]
    );
    const user = userRes.rows[0];

    if (!user) {
      return res.status(401).json({ error: 'الحساب المرتبط بهذه الجلسة غير موجود.' });
    }

    // Strict Role Check: Quick Login is exclusively for verified ADMIN sessions
    if (user.role !== 'ADMIN') {
      return res.status(403).json({
        error: 'غير مصرح: ميزة الدخول السريع مخصصة لمسؤولي النظام فقط ولا يمكن ترقية حسابات العملاء.'
      });
    }

    // Strict Session Invalidation: Check if password was changed after token issuance
    if (decoded.iat && user.passwordChangedAt) {
      const pwdChangedSec = Math.floor(new Date(user.passwordChangedAt).getTime() / 1000);
      if (decoded.iat < pwdChangedSec) {
        res.clearCookie('token', getAuthCookieOptions());
        return res.status(401).json({
          error: 'تم تغيير كلمة المرور مؤخراً. يرجى تسجيل الدخول مجدداً بكلمة المرور الجديدة.'
        });
      }
    }

    const walletRes = await pool.query('SELECT balance, currency FROM "Wallet" WHERE "userId" = $1', [user.id]);
    const balance = walletRes.rows[0]?.balance || 0;
    const currency = walletRes.rows[0]?.currency || user.preferred_currency || 'SDG';

    // Issue refreshed token
    const freshToken = generateToken(user.id, user.email, user.role);
    setTokenCookie(res, freshToken);

    const safeUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      balance,
      currency,
      preferred_currency: user.preferred_currency || currency,
      emailVerified: !!user.emailVerified
    };

    res.json({
      success: true,
      message: 'تم التحقق من الجلسة وتجديد الدخول بنجاح.',
      user: safeUser,
      token: freshToken
    });
  } catch (err: any) {
    console.error('Quick login error:', err);
    res.status(500).json({ error: 'فشل استعادة الجلسة. يرجى تسجيل الدخول يدوياً.' });
  }
});

// ==========================================
// 7. CURRENT USER (GET /me)
// ==========================================
router.get('/me', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    
    const userRes = await pool.query('SELECT id, email, name, role, "emailVerified", "preferred_currency", "referral_code" FROM "User" WHERE id = $1', [req.user.id]);
    let user = userRes.rows[0];
    
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (!user.referral_code) {
      const generatedCode = generateReferralCode();
      await pool.query('UPDATE "User" SET "referral_code" = $1 WHERE id = $2', [generatedCode, user.id]);
      user.referral_code = generatedCode;
    }
    
    const walletRes = await pool.query('SELECT balance, currency FROM "Wallet" WHERE "userId" = $1', [user.id]);
    const balance = walletRes.rows[0]?.balance || 0;
    const currency = walletRes.rows[0]?.currency || user.preferred_currency || 'SDG';
    
    res.json({ user: { ...user, balance, currency, preferred_currency: user.preferred_currency || currency } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// ==========================================
// 8. UPDATE PREFERRED CURRENCY (FIXED TO SDG ONLY)
// ==========================================
router.patch('/currency', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const { currency } = req.body;

    const cleanCur = String(currency || '').trim().toUpperCase();
    if (cleanCur && cleanCur !== 'SDG') {
      return res.status(400).json({ error: 'العملة التشغيلية المعتمدة لجميع حسابات العملاء هي الجنيه السوداني (SDG) فقط.' });
    }

    res.json({ success: true, message: 'عملة الحساب هي الجنيه السوداني (SDG).', currency: 'SDG' });
  } catch (err: any) {
    console.error('Error updating preferred currency:', err);
    res.status(500).json({ error: 'فشل معالجة الطلب.' });
  }
});

// ==========================================
// 8. FORGOT PASSWORD (ISSUES 6-DIGIT RESET OTP)
// ==========================================
router.post('/forgot-password', passwordResetLimiter, async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'البريد الإلكتروني مطلوب.' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return res.status(400).json({ error: 'يرجى إدخال بريد إلكتروني صحيح.' });
  }

  const genericSuccessMessage = 'إذا كان البريد مرتبطًا بحساب، فستصلك رسالة تحتوي على رمز التحقق.';

  try {
    const userRes = await pool.query(
      'SELECT id, name, email, role FROM "User" WHERE email = $1',
      [normalizedEmail]
    );
    const user = userRes.rows[0];

    if (!user) {
      // Anti-email-enumeration: Constant time dummy operation
      await bcrypt.hash(normalizedEmail, 10);
      return res.status(200).json({
        success: true,
        message: genericSuccessMessage
      });
    }

    // Check 60-second cooldown on last created OTP for this email
    const lastOtpRes = await pool.query(
      'SELECT created_at FROM "password_reset_otps" WHERE email = $1 ORDER BY created_at DESC LIMIT 1',
      [normalizedEmail]
    );
    if (lastOtpRes.rows.length > 0) {
      const elapsedSec = Math.floor((Date.now() - new Date(lastOtpRes.rows[0].created_at).getTime()) / 1000);
      if (elapsedSec < 60) {
        return res.status(429).json({
          error: `يرجى الانتظار ${60 - elapsedSec} ثانية قبل طلب رمز تحقق جديد.`,
          cooldownRemaining: 60 - elapsedSec
        });
      }
    }

    // Invalidate existing active unverified reset OTPs for this email
    await pool.query(
      'UPDATE "password_reset_otps" SET invalidated_at = CURRENT_TIMESTAMP WHERE email = $1 AND verified_at IS NULL AND invalidated_at IS NULL',
      [normalizedEmail]
    );

    // Generate secure 6-digit OTP & Hash
    const otp = generateSecureOtp();
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry

    await pool.query(
      `INSERT INTO "password_reset_otps" (user_id, email, otp_hash, expires_at, attempts)
       VALUES ($1, $2, $3, $4, 0)`,
      [user.id, normalizedEmail, otpHash, expiresAt]
    );

    // Send email via Resend (never log OTP)
    const emailResult = await sendPasswordResetOtpEmail({
      to: normalizedEmail,
      otp,
      name: user.name || undefined,
      userId: user.id
    });

    if (!emailResult.success) {
      console.error('[ForgotPassword Error] Failed to send email via Resend:', emailResult.error);
      return res.status(500).json({ error: 'تعذر إرسال رمز التحقق حاليًا. حاول مرة أخرى لاحقاً.' });
    }

    return res.status(200).json({
      success: true,
      message: genericSuccessMessage
    });
  } catch (err: any) {
    console.error('Forgot password error:', err);
    return res.status(500).json({ error: 'حدث خطأ في معالجة الطلب، يرجى المحاولة لاحقاً.' });
  }
});

// ==========================================
// 9. RESEND PASSWORD RESET OTP
// ==========================================
router.post('/password-reset/resend-otp', passwordResetLimiter, async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'البريد الإلكتروني مطلوب.' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return res.status(400).json({ error: 'يرجى إدخال بريد إلكتروني صحيح.' });
  }

  const genericSuccessMessage = 'إذا كان البريد مرتبطًا بحساب، فستصلك رسالة تحتوي على رمز التحقق.';

  try {
    const userRes = await pool.query(
      'SELECT id, name, email, role FROM "User" WHERE email = $1',
      [normalizedEmail]
    );
    const user = userRes.rows[0];

    if (!user) {
      await bcrypt.hash(normalizedEmail, 10);
      return res.status(200).json({
        success: true,
        message: genericSuccessMessage
      });
    }

    // Check 60-second cooldown
    const lastOtpRes = await pool.query(
      'SELECT created_at FROM "password_reset_otps" WHERE email = $1 ORDER BY created_at DESC LIMIT 1',
      [normalizedEmail]
    );
    if (lastOtpRes.rows.length > 0) {
      const elapsedSec = Math.floor((Date.now() - new Date(lastOtpRes.rows[0].created_at).getTime()) / 1000);
      if (elapsedSec < 60) {
        return res.status(429).json({
          error: `يرجى الانتظار ${60 - elapsedSec} ثانية قبل إعادة إرسال الرمز.`,
          cooldownRemaining: 60 - elapsedSec
        });
      }
    }

    // Invalidate previous unverified OTPs
    await pool.query(
      'UPDATE "password_reset_otps" SET invalidated_at = CURRENT_TIMESTAMP WHERE email = $1 AND verified_at IS NULL AND invalidated_at IS NULL',
      [normalizedEmail]
    );

    const otp = generateSecureOtp();
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await pool.query(
      `INSERT INTO "password_reset_otps" (user_id, email, otp_hash, expires_at, attempts)
       VALUES ($1, $2, $3, $4, 0)`,
      [user.id, normalizedEmail, otpHash, expiresAt]
    );

    const emailResult = await sendPasswordResetOtpEmail({
      to: normalizedEmail,
      otp,
      name: user.name || undefined,
      userId: user.id
    });

    if (!emailResult.success) {
      console.error('[ResendResetOtp Error] Failed to send email via Resend:', emailResult.error);
      return res.status(500).json({ error: 'تعذر إرسال رمز التحقق حاليًا. حاول مرة أخرى لاحقاً.' });
    }

    return res.status(200).json({
      success: true,
      message: genericSuccessMessage
    });
  } catch (err: any) {
    console.error('Resend reset OTP error:', err);
    return res.status(500).json({ error: 'حدث خطأ في إعادة إرسال الرمز، يرجى المحاولة لاحقاً.' });
  }
});

// ==========================================
// 10. VERIFY PASSWORD RESET OTP
// ==========================================
router.post('/password-reset/verify-otp', otpVerifyLimiter, async (req: Request, res: Response) => {
  const { email, otp } = req.body;
  if (!email || !otp) {
    return res.status(400).json({ error: 'البريد الإلكتروني ورمز التحقق حقول مطلوبة.' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const cleanOtp = String(otp).trim();

  if (!/^\d{6}$/.test(cleanOtp)) {
    return res.status(400).json({ error: 'رمز التحقق يجب أن يتكون من 6 أرقام.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Find active unverified reset OTP
    const otpRes = await client.query(
      `SELECT * FROM "password_reset_otps"
       WHERE email = $1 AND verified_at IS NULL AND invalidated_at IS NULL
       ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [normalizedEmail]
    );

    const record = otpRes.rows[0];
    if (!record) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'رمز التحقق غير صالح أو لم يتم طلبه.' });
    }

    // Check expiry (10 minutes)
    if (new Date() > new Date(record.expires_at)) {
      await client.query(
        'UPDATE "password_reset_otps" SET invalidated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [record.id]
      );
      await client.query('COMMIT');
      return res.status(400).json({ error: 'انتهت صلاحية رمز التحقق (أكثر من 10 دقائق). يرجى طلب رمز جديد.' });
    }

    // Check max attempts (5)
    if (record.attempts >= 5) {
      await client.query(
        'UPDATE "password_reset_otps" SET invalidated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [record.id]
      );
      await client.query('COMMIT');
      return res.status(400).json({ error: 'تم تجاوز الحد الأقصى للمحاولات (5 محاولات). تم إبطال الرمز، يرجى طلب رمز جديد.' });
    }

    // Compare OTP hash
    const isValid = await bcrypt.compare(cleanOtp, record.otp_hash);
    if (!isValid) {
      const nextAttempts = record.attempts + 1;
      if (nextAttempts >= 5) {
        await client.query(
          'UPDATE "password_reset_otps" SET attempts = $1, invalidated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [nextAttempts, record.id]
        );
        await client.query('COMMIT');
        return res.status(400).json({ error: 'تم تجاوز الحد الأقصى للمحاولات. يرجى طلب رمز جديد.' });
      }

      await client.query(
        'UPDATE "password_reset_otps" SET attempts = $1 WHERE id = $2',
        [nextAttempts, record.id]
      );
      await client.query('COMMIT');
      return res.status(400).json({
        error: `رمز التحقق غير صحيح. متبقي ${5 - nextAttempts} محاولات.`
      });
    }

    // OTP is valid: generate random 32-byte hex reset token, hash with SHA-256
    const rawResetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto.createHash('sha256').update(rawResetToken).digest('hex');
    const resetTokenExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes to set new password

    await client.query(
      `UPDATE "password_reset_otps"
       SET verified_at = CURRENT_TIMESTAMP,
           reset_token_hash = $1,
           reset_token_expires_at = $2
       WHERE id = $3`,
      [resetTokenHash, resetTokenExpiresAt, record.id]
    );

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      resetToken: rawResetToken,
      message: 'تم التحقق من الرمز بنجاح. يمكنك الآن تعيين كلمة المرور الجديدة.'
    });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('Verify reset OTP error:', err);
    return res.status(500).json({ error: 'حدث خطأ أثناء التحقق من الرمز، يرجى المحاولة لاحقاً.' });
  } finally {
    client.release();
  }
});

// ==========================================
// 11. EXECUTE PASSWORD RESET
// ==========================================
router.post('/password-reset', passwordResetLimiter, async (req: Request, res: Response) => {
  const { resetToken, newPassword } = req.body;
  if (!resetToken || !newPassword) {
    return res.status(400).json({ error: 'رمز إعادة التعيين وكلمة المرور الجديدة حقول مطلوبة.' });
  }

  if (typeof newPassword !== 'string' || newPassword.length < 6) {
    return res.status(400).json({ error: 'كلمة المرور الجديدة يجب ألا تقل عن 6 أحرف.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const cleanToken = String(resetToken).trim();
    const tokenHash = crypto.createHash('sha256').update(cleanToken).digest('hex');

    // Find valid verified reset token that has not been used or invalidated
    const recordRes = await client.query(
      `SELECT * FROM "password_reset_otps"
       WHERE reset_token_hash = $1
         AND verified_at IS NOT NULL
         AND used_at IS NULL
         AND invalidated_at IS NULL
         AND reset_token_expires_at > CURRENT_TIMESTAMP
       LIMIT 1 FOR UPDATE`,
      [tokenHash]
    );

    const record = recordRes.rows[0];
    if (!record) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'رمز إعادة التعيين غير صالح أو منتهي الصلاحية. يرجى بدء العملية مجدداً.' });
    }

    // Verify user exists and load role
    const userRes = await client.query(
      'SELECT id, role, email FROM "User" WHERE id = $1',
      [record.user_id]
    );
    const user = userRes.rows[0];
    if (!user) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'المستخدم المرتبط بهذا الطلب غير موجود.' });
    }

    // Hash new password with bcrypt
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Update password while strictly preserving role!
    await client.query(
      `UPDATE "User"
       SET "passwordHash" = $1,
           "passwordChangedAt" = CURRENT_TIMESTAMP,
           "updatedAt" = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [passwordHash, user.id]
    );

    // Mark current reset record as used
    await client.query(
      'UPDATE "password_reset_otps" SET used_at = CURRENT_TIMESTAMP WHERE id = $1',
      [record.id]
    );

    // Invalidate all other reset tokens/OTPs for this user
    await client.query(
      'UPDATE "password_reset_otps" SET invalidated_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND id != $2 AND invalidated_at IS NULL',
      [user.id, record.id]
    );

    await client.query('COMMIT');

    // Clear any token cookies on client to ensure old sessions are invalidated
    res.clearCookie('token', getAuthCookieOptions());

    return res.status(200).json({
      success: true,
      message: 'تم تغيير كلمة المرور بنجاح. يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة.'
    });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('Password reset execution error:', err);
    return res.status(500).json({ error: 'حدث خطأ أثناء حفظ كلمة المرور، يرجى المحاولة لاحقاً.' });
  } finally {
    client.release();
  }
});

// ==========================================
// 12. AUTHENTICATED CHANGE PASSWORD
// Strictly allows an authenticated user/admin to change ONLY their own password
// ==========================================
const changePasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'تم تجاوز الحد الأقصى لمحاولات تغيير كلمة المرور. يرجى المحاولة لاحقاً.' }
});

router.post('/change-password', changePasswordLimiter, requireAuth, async (req: AuthRequest, res: Response) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'كلمة المرور الحالية وكلمة المرور الجديدة حقول مطلوبة.' });
  }

  if (typeof newPassword !== 'string' || newPassword.length < 6) {
    return res.status(400).json({ error: 'كلمة المرور الجديدة يجب ألا تقل عن 6 أحرف.' });
  }

  if (currentPassword === newPassword) {
    return res.status(400).json({ error: 'كلمة المرور الجديدة يجب أن تكون مختلفة عن كلمة المرور الحالية.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Strictly fetch ONLY the authenticated user record
    const userRes = await client.query(
      'SELECT id, email, role, "passwordHash" FROM "User" WHERE id = $1 FOR UPDATE',
      [req.user.id]
    );
    const user = userRes.rows[0];

    if (!user) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'الحساب غير موجود.' });
    }

    // Verify current password
    const isCurrentValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isCurrentValid) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'كلمة المرور الحالية غير صحيحة.' });
    }

    // Hash new password
    const newHash = await bcrypt.hash(newPassword, 10);

    // Update password and record passwordChangedAt to invalidate old tokens
    await client.query(
      `UPDATE "User"
       SET "passwordHash" = $1,
           "passwordChangedAt" = CURRENT_TIMESTAMP,
           "updatedAt" = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [newHash, user.id]
    );

    // If admin, log to audit log
    if (user.role === 'ADMIN') {
      await client.query(
        `INSERT INTO "AuditLog" (id, "adminId", action, reason)
         VALUES ($1, $2, 'ADMIN_PASSWORD_CHANGE', $3)`,
        [uuidv4(), user.id, 'Admin changed own account password securely']
      );
    }

    await client.query('COMMIT');

    // Issue a fresh token with updated timestamp
    const freshToken = generateToken(user.id, user.email, user.role);
    setTokenCookie(res, freshToken);

    return res.json({
      success: true,
      message: 'تم تغيير كلمة المرور بنجاح.'
    });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[ChangePassword Error]:', err.message);
    return res.status(500).json({ error: 'فشل تغيير كلمة المرور. يرجى المحاولة لاحقاً.' });
  } finally {
    client.release();
  }
});

export default router;
