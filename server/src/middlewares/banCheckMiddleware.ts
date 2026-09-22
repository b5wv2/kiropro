import { Response, NextFunction } from 'express';
import { AuthRequest } from './authMiddleware';
import { extractClientInfo } from '../services/clientInfoService';
import { checkBan } from '../services/banService';
import { logSecurityEvent } from '../services/securityEventService';

/**
 * Middleware that checks if current IP, Device ID, or Authenticated Account is banned.
 * If banned, halts the request and returns a generic, safe Arabic error message.
 */
export async function banCheckMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const clientInfo = extractClientInfo(req, res);
    const userId = req.user?.id || null;

    const banResult = await checkBan({
      userId,
      ip: clientInfo.ip,
      deviceId: clientInfo.deviceId
    });

    if (banResult.isBanned) {
      await logSecurityEvent({
        userId,
        eventType: 'LOGIN_FAILED',
        ipAddress: clientInfo.ip,
        deviceId: clientInfo.deviceId,
        userAgent: clientInfo.userAgent,
        metadata: {
          blocked_by_ban: true,
          matched_scope: banResult.matchedScope,
          path: req.path
        }
      });

      return res.status(403).json({
        error: 'لا يمكن إتمام هذه العملية. تم تقييد الوصول مؤقتاً لأسباب أمنية.'
      });
    }

    next();
  } catch (err: any) {
    console.error('[BanCheckMiddleware] Error:', err?.message || err);
    // Fail open or closed depending on criticality; for general APIs continue, for login handled in auth
    next();
  }
}
