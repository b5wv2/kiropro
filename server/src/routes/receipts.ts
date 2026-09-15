import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import pool from '../db';
import { JWT_SECRET } from '../config';

const router = Router();

const UPLOADS_RECEIPTS_DIR = path.join(__dirname, '../../uploads/receipts');

/**
 * SECURE RECEIPT ACCESS
 * GET /uploads/receipts/:filename
 * 
 * Rules:
 * 1. Financial document protection: NOT public.
 * 2. Authenticated: Must present valid JWT via Cookie, Authorization header, or signed ?token=.
 * 3. Authorized:
 *    - Admin can view any receipt for verification/auditing.
 *    - Customers can ONLY view receipts associated with their own topup requests.
 * 4. Directory traversal guarded via path.basename.
 */
router.get('/:filename', async (req: Request, res: Response) => {
  try {
    const rawFilename = String(req.params.filename || '');
    if (!rawFilename) {
      return res.status(400).json({ error: 'اسم المستند مطلوب.' });
    }

    // Guard against path traversal attacks
    const filename = path.basename(rawFilename);

    // 1. Extract Token from Cookies, Header, or Query Parameter
    let token: string | undefined;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    } else if (req.cookies?.token) {
      token = req.cookies.token;
    } else if (req.cookies?.admin_token) {
      token = req.cookies.admin_token;
    } else if (typeof req.query.token === 'string' && req.query.token.trim()) {
      token = req.query.token.trim();
    }

    if (!token) {
      return res.status(401).json({ error: 'يرجى تسجيل الدخول للوصول إلى مستند الإيصال.' });
    }

    // 2. Verify JWT Authenticity
    let decoded: { id: string; email: string; role: string };
    try {
      decoded = jwt.verify(token, JWT_SECRET) as { id: string; email: string; role: string };
    } catch {
      return res.status(401).json({ error: 'جلسة غير صالحة أو منتهية. يرجى إعادة تسجيل الدخول.' });
    }

    // 3. Authorization Check
    if (decoded.role === 'ADMIN') {
      // Admin is authorized to inspect any topup transfer receipt
    } else {
      // Customer: Must be the owner of the topup request that uploaded this receipt
      // Use strict exact equality match to completely prevent SQL wildcard (% and _) injection
      const expectedReceiptPath = `/uploads/receipts/${filename}`;
      const ownerCheck = await pool.query(
        'SELECT id FROM "topup_requests" WHERE user_id = $1 AND (receipt_url = $2 OR receipt_url = $3) LIMIT 1',
        [decoded.id, expectedReceiptPath, filename]
      );

      if (ownerCheck.rows.length === 0) {
        return res.status(403).json({ error: 'غير مصرح: ليس لديك صلاحية لعرض هذا الإيصال.' });
      }
    }

    // 4. File Existence & Safe Delivery
    const filePath = path.join(UPLOADS_RECEIPTS_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'ملف الإيصال غير موجود.' });
    }

    // Set strict privacy and cache headers
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    return res.sendFile(filePath);
  } catch (err: any) {
    console.error('Error serving receipt:', err);
    return res.status(500).json({ error: 'حدث خطأ أثناء عرض الإيصال.' });
  }
});

export default router;
