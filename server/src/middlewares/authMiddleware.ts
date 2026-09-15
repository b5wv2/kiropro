import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import pool from '../db';
import { JWT_SECRET } from '../config';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
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
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; email: string; role: string; iat?: number };

    // Invalidate session if password was changed after token issuance
    if (decoded.id && decoded.iat) {
      const userRes = await pool.query('SELECT "passwordChangedAt" FROM "User" WHERE id = $1', [decoded.id]);
      const pwdChangedAt = userRes.rows[0]?.passwordChangedAt;
      if (pwdChangedAt) {
        const pwdChangedSec = Math.floor(new Date(pwdChangedAt).getTime() / 1000);
        if (decoded.iat < pwdChangedSec) {
          res.clearCookie('token', { path: '/' });
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
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; email: string; role: string; iat?: number };
    
    // Strict DB verification for admin actions
    const userRes = await pool.query('SELECT role, "passwordChangedAt" FROM "User" WHERE id = $1', [decoded.id]);
    const user = userRes.rows[0];

    if (!user || user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }

    if (user.passwordChangedAt && decoded.iat) {
      const pwdChangedSec = Math.floor(new Date(user.passwordChangedAt).getTime() / 1000);
      if (decoded.iat < pwdChangedSec) {
        res.clearCookie('token', { path: '/' });
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
      const decoded = jwt.verify(token, JWT_SECRET) as { id: string; email: string; role: string };
      req.user = decoded;
    } catch {
      // Ignored for optional auth
    }
  }
  next();
};

