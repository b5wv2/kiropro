import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import pool from '../db';
import { JWT_SECRET, getAuthCookieOptions } from '../config';
import { validateSession, touchSession } from '../services/sessionService';
import { checkBan, formatBanResponse } from '../services/banService';
import { extractClientIp } from '../services/clientInfoService';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    sessionId?: string;
    balance?: number;
  };
}

export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  let token: string | undefined;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.cookies?.token) {
    token = req.cookies.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      id: string;
      email: string;
      role: string;
      sessionId?: string;
      iat?: number;
    };

    // 1. Session verification (if session ID is present in token)
    if (decoded.sessionId) {
      const sessionCheck = await validateSession(decoded.sessionId);
      if (!sessionCheck.valid) {
        res.clearCookie('token', getAuthCookieOptions());
        return res.status(401).json({ error: sessionCheck.error || 'الجلسة غير صالحة أو تم إبطالها.' });
      }

      // Background throttled touch
      const clientIp = extractClientIp(req);
      touchSession(decoded.sessionId, clientIp).catch(() => {});
    }

    // 2. Check if the account has an active ban
    if (decoded.id) {
      const banResult = await checkBan({ userId: decoded.id });
      if (banResult.isBanned) {
        res.clearCookie('token', getAuthCookieOptions());
        return res.status(403).json(formatBanResponse(banResult, 'operation'));
      }
    }

    // 3. Invalidate session if password was changed after token issuance
    if (decoded.id && decoded.iat) {
      const userRes = await pool.query('SELECT "passwordChangedAt" FROM "User" WHERE id = $1', [decoded.id]);
      const pwdChangedAt = userRes.rows[0]?.passwordChangedAt;
      if (pwdChangedAt) {
        const pwdChangedSec = Math.floor(new Date(pwdChangedAt).getTime() / 1000);
        if (decoded.iat < pwdChangedSec) {
          res.clearCookie('token', getAuthCookieOptions());
          return res.status(401).json({ error: 'تم تغيير كلمة المرور مؤخراً. يرجى تسجيل الدخول مجدداً.' });
        }
      }
    }

    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

export const requireAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  let token: string | undefined;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.cookies?.token) {
    token = req.cookies.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      id: string;
      email: string;
      role: string;
      sessionId?: string;
      iat?: number;
    };
    
    // Strict DB verification for admin actions
    const userRes = await pool.query('SELECT role, "passwordChangedAt" FROM "User" WHERE id = $1', [decoded.id]);
    const user = userRes.rows[0];

    if (!user || user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }

    // 1. Session verification
    if (decoded.sessionId) {
      const sessionCheck = await validateSession(decoded.sessionId);
      if (!sessionCheck.valid) {
        res.clearCookie('token', getAuthCookieOptions());
        return res.status(401).json({ error: sessionCheck.error || 'الجلسة غير صالحة أو تم إبطالها.' });
      }

      const clientIp = extractClientIp(req);
      touchSession(decoded.sessionId, clientIp).catch(() => {});
    }

    if (user.passwordChangedAt && decoded.iat) {
      const pwdChangedSec = Math.floor(new Date(user.passwordChangedAt).getTime() / 1000);
      if (decoded.iat < pwdChangedSec) {
        res.clearCookie('token', getAuthCookieOptions());
        return res.status(401).json({ error: 'تم تغيير كلمة المرور مؤخراً. يرجى تسجيل الدخول مجدداً.' });
      }
    }

    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

export const optionalAuth = (req: AuthRequest, _res: Response, next: NextFunction) => {
  let token: string | undefined;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.cookies?.token) {
    token = req.cookies.token;
  }

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as {
        id: string;
        email: string;
        role: string;
        sessionId?: string;
      };
      req.user = decoded;
    } catch {
      // Ignored for optional auth
    }
  }
  next();
};

export interface PartnerAuthRequest extends AuthRequest {
  partner?: {
    id: string;
    userId: string;
    businessName: string | null;
    status: string;
    mustChangePassword: boolean;
    levelId: string | null;
  };
}

export const requirePartner = async (req: PartnerAuthRequest, res: Response, next: NextFunction) => {
  let token: string | undefined;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.cookies?.partner_token) {
    token = req.cookies.partner_token;
  } else if (req.cookies?.token) {
    token = req.cookies.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'يرجى تسجيل الدخول كتاجر للمتابعة.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      id: string;
      email: string;
      role: string;
      sessionId?: string;
      iat?: number;
    };

    // Strict role check: Must be PARTNER or ADMIN
    if (decoded.role !== 'PARTNER' && decoded.role !== 'ADMIN') {
      return res.status(403).json({ error: 'غير مصرح: هذا القسم مخصص للتجار المعتمدين فقط.' });
    }

    // Strict DB verification
    const partnerRes = await pool.query(
      `SELECT 
        u.id as user_id, u.email, u.name, u.role, u."passwordChangedAt",
        p.id as partner_id, p.business_name, p.status, p.must_change_password, p.level_id
       FROM "User" u
       LEFT JOIN partner_profiles p ON p.user_id = u.id
       WHERE u.id = $1`,
      [decoded.id]
    );

    const row = partnerRes.rows[0];
    if (!row) {
      return res.status(401).json({ error: 'المستخدم غير موجود.' });
    }

    // If ADMIN is accessing, check if partner profile exists or let admin act as partner
    if (row.role === 'ADMIN' && !row.partner_id) {
      return res.status(403).json({ error: 'لم يتم ربط حساب المسؤول بملف تاجر.' });
    }

    if (row.status === 'SUSPENDED') {
      return res.status(403).json({ error: 'تم إيقاف حسابك التجاري مؤقتاً من قبل الإدارة. يرجى التواصل مع الدعم.' });
    }

    // 1. Session verification
    if (decoded.sessionId) {
      const sessionCheck = await validateSession(decoded.sessionId);
      if (!sessionCheck.valid) {
        res.clearCookie('token', getAuthCookieOptions());
        res.clearCookie('partner_token', getAuthCookieOptions());
        return res.status(401).json({ error: sessionCheck.error || 'الجلسة غير صالحة أو تم إبطالها.' });
      }

      const clientIp = extractClientIp(req);
      touchSession(decoded.sessionId, clientIp).catch(() => {});
    }

    // 2. Active ban check
    const banResult = await checkBan({ userId: decoded.id });
    if (banResult.isBanned) {
      res.clearCookie('token', getAuthCookieOptions());
      res.clearCookie('partner_token', getAuthCookieOptions());
      return res.status(403).json(formatBanResponse(banResult, 'operation'));
    }

    // 3. Password changed check
    if (row.passwordChangedAt && decoded.iat) {
      const pwdChangedSec = Math.floor(new Date(row.passwordChangedAt).getTime() / 1000);
      if (decoded.iat < pwdChangedSec) {
        res.clearCookie('token', getAuthCookieOptions());
        res.clearCookie('partner_token', getAuthCookieOptions());
        return res.status(401).json({ error: 'تم تغيير كلمة المرور مؤخراً. يرجى تسجيل الدخول مجدداً.' });
      }
    }

    req.user = decoded;
    req.partner = {
      id: row.partner_id,
      userId: row.user_id,
      businessName: row.business_name,
      status: row.status,
      mustChangePassword: !!row.must_change_password,
      levelId: row.level_id
    };

    next();
  } catch (err) {
    return res.status(401).json({ error: 'رمز الجلسة غير صالح أو منتهي الصلاحية.' });
  }
};


