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

