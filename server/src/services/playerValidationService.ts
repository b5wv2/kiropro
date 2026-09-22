import pool from '../db';
import { gamesDropProvider } from '../providers/gamesdrop';
import { mapGamesDropErrorMessage } from '../providers/gamesdrop/mapper';

// In-memory sliding-window rate limiter: 5 requests per 10 minutes (600,000 ms)
const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = 5;

// Key -> Array of timestamps
const rateLimitMap = new Map<string, number[]>();

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - WINDOW_MS;
  for (const [key, timestamps] of rateLimitMap.entries()) {
    const fresh = timestamps.filter(t => t > cutoff);
    if (fresh.length === 0) {
      rateLimitMap.delete(key);
    } else {
      rateLimitMap.set(key, fresh);
    }
  }
}, 5 * 60 * 1000);

/**
 * Check and enforce rate limit for player ID validation
 * Exactly 5 requests per 10 minutes per user/IP
 */
export function checkPlayerValidationRateLimit(key: string): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  
  const timestamps = (rateLimitMap.get(key) || []).filter(t => t > cutoff);
  
  if (timestamps.length >= MAX_REQUESTS) {
    const oldest = timestamps[0] ?? now;
    const retryAfterMs = oldest + WINDOW_MS - now;
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000))
    };
  }

  timestamps.push(now);
  rateLimitMap.set(key, timestamps);
  return { allowed: true };
}

export interface PlayerValidationResult {
  valid: boolean;
  playerName?: string;
  telegramUserId?: number;
  message?: string;
}

/**
 * Validates a Player ID against GamesDrop Partner API
 * @param productId KIROPRO product ID (UUID or local ID)
 * @param gameUserId The Player's ID / user ID in the game
 * @param gameServerId Optional game server ID if required
 */
export async function validatePlayerAccount(params: {
  productId: string;
  gameUserId: string;
  gameServerId?: string | undefined;
  userId?: string | undefined;
  ip?: string | undefined;
}): Promise<PlayerValidationResult> {
  const { productId, gameUserId, gameServerId, userId, ip } = params;

  // Rate Limiting check: 5 requests per 10 minutes
  const rateLimitKey = userId ? `user_${userId}` : `ip_${ip || 'unknown'}`;
  const rateCheck = checkPlayerValidationRateLimit(rateLimitKey);
  if (!rateCheck.allowed) {
    return {
      valid: false,
      message: 'تم تجاوز الحد المسموح لعمليات التحقق. حاول مرة أخرى بعد قليل.'
    };
  }

  if (userId && ip) {
    const ipCheck = checkPlayerValidationRateLimit(`ip_${ip}`);
    if (!ipCheck.allowed) {
      return {
        valid: false,
        message: 'تم تجاوز الحد المسموح لعمليات التحقق. حاول مرة أخرى بعد قليل.'
      };
    }
  }

  if (!gameUserId || typeof gameUserId !== 'string' || !gameUserId.trim()) {
    return {
      valid: false,
      message: 'يرجى إدخال معرّف اللاعب أولاً.'
    };
  }

  const cleanUserId = gameUserId.trim();
  const cleanServerId = gameServerId ? String(gameServerId).trim() : undefined;

  // 1. Load authoritative product from PostgreSQL
  const prodRes = await pool.query(
    `SELECT id, "productName", "offerName", "providerOfferId", "gameCategoryId",
            "requiresGameUserId", "requiresGameServerId", "isActive"
     FROM "Product" 
     WHERE (id::text = $1 OR "productId"::text = $1 OR "providerOfferId"::text = $1)
     LIMIT 1`,
    [productId]
  );

  if (prodRes.rows.length === 0) {
    return {
      valid: false,
      message: 'المنتج المحدد غير متاح حالياً.'
    };
  }

  const product = prodRes.rows[0];
  const isTelegramProduct = 
    (product.productName || '').toLowerCase().includes('telegram') ||
    (product.gameCategoryId || '').toLowerCase().includes('telegram');

  // Telegram Special Handling: Username resolution (@username -> numeric ID)
  if (isTelegramProduct) {
    if (/^\d+$/.test(cleanUserId)) {
      // Direct numeric Telegram ID
      return {
        valid: true,
        playerName: `معرف رقمي: ${cleanUserId}`,
        telegramUserId: Number(cleanUserId),
        message: 'تم قبول معرّف تيليجرام بنجاح.'
      };
    }

    // Resolving @username
    const tgRes = await gamesDropProvider.resolveTelegramUser(cleanUserId);
    if (tgRes.valid && tgRes.userId) {
      return {
        valid: true,
        playerName: tgRes.firstName ? `${tgRes.firstName} (@${tgRes.username})` : `@${tgRes.username}`,
        telegramUserId: tgRes.userId,
        message: tgRes.message || 'تم التحقق من حساب تيليجرام بنجاح.'
      };
    }

    return {
      valid: false,
      message: tgRes.message || 'تعذر التحقق من معرّف تيليجرام. يرجى إدخال المعرف الرقمي (User ID) مباشرة.'
    };
  }

  // 2. Extract numeric GamesDrop offerGroupId (Rule 10)
  const numericOfferId = Number(product.providerOfferId);
  if (!numericOfferId || isNaN(numericOfferId) || numericOfferId <= 0) {
    return {
      valid: false,
      message: 'خدمة التحقق غير متاحة لهذا المنتج حالياً.'
    };
  }

  // 3. Server ID validation strictly based on product.requiresGameServerId
  let validatedServerId: string | undefined = undefined;

  if (product.requiresGameServerId) {
    if (!cleanServerId) {
      return {
        valid: false,
        message: 'يرجى تحديد خادم اللعبة (Server ID).'
      };
    }

    try {
      const serversResponse = await gamesDropProvider.getServers(numericOfferId);
      if (serversResponse && typeof serversResponse === 'object') {
        const allowedKeys = Object.keys(serversResponse);
        const allowedValues = Object.values(serversResponse);
        const isValidServer = allowedKeys.includes(cleanServerId) || allowedValues.includes(cleanServerId);
        
        if (!isValidServer && allowedKeys.length > 0) {
          return {
            valid: false,
            message: 'خادم اللعبة المحدد غير صالح.'
          };
        }
      }
    } catch (serverErr: any) {
      console.warn('[PlayerValidation] Server list check warning:', serverErr.message);
    }
    validatedServerId = cleanServerId;
  } else {
    // If product does NOT require server ID, ignore any submitted serverId and do NOT send to upstream
    validatedServerId = undefined;
  }

  // 4. Call GamesDrop check-game-data API (for Likee and other direct top-ups)
  try {
    const gdResult = await gamesDropProvider.checkGameData({
      offerId: numericOfferId,
      gameUserId: cleanUserId,
      ...(validatedServerId ? { gameServerId: validatedServerId } : {})
    });

    if (gdResult && gdResult.status === 'VALID') {
      return {
        valid: true,
        playerName: gdResult.gameUserLogin || cleanUserId
      };
    } else {
      return {
        valid: false,
        message: 'تعذر التحقق من معرّف الحساب. تأكد من الرقم وحاول مرة أخرى.'
      };
    }
  } catch (err: any) {
    console.error('[PlayerValidation] GamesDrop API error:', err.message);
    const friendly = mapGamesDropErrorMessage(err.errorCode || err.message);
    return {
      valid: false,
      message: friendly || 'تعذر التحقق من معرّف الحساب. تأكد من الرقم وحاول مرة أخرى.'
    };
  }
}
