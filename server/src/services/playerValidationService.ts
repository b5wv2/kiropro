import pool from '../db';
import { gamesDropProvider } from '../providers/gamesdrop';
import { mapGamesDropErrorMessage } from '../providers/gamesdrop/mapper';
import { providerRouter } from '../providers/router';
import { g2BulkClient } from '../providers/g2bulk/client';
import { generateCorrelationId, logProviderDiagnostic } from '../utils/providerErrorHandler';

export interface PlayerValidationResult {
  valid: boolean;
  playerName?: string | undefined;
  telegramUserId?: number | undefined;
  message?: string | undefined;
  rateLimited?: boolean | undefined;
  retryAfterSeconds?: number | undefined;
  cached?: boolean | undefined;
  provider?: string | undefined;
  isUnavailable?: boolean | undefined;
  correlationId?: string | undefined;
}

/**
 * Atomic PostgreSQL-backed rate limiter for Player ID validation
 * Strictly enforces 5 requests per hour (3600 seconds) per rate key.
 * Works atomically across all server instances and restarts.
 */
export async function checkAtomicPlayerRateLimit(rateKey: string): Promise<{
  allowed: boolean;
  retryAfterSeconds?: number;
  attemptCount: number;
}> {
  const query = `
    INSERT INTO "player_validation_rate_limits" ("rate_key", "window_start", "attempt_count", "updated_at")
    VALUES ($1, CURRENT_TIMESTAMP, 1, CURRENT_TIMESTAMP)
    ON CONFLICT ("rate_key") DO UPDATE
    SET
      attempt_count = CASE 
        WHEN "player_validation_rate_limits"."window_start" < CURRENT_TIMESTAMP - INTERVAL '1 hour' THEN 1
        ELSE "player_validation_rate_limits"."attempt_count" + 1
      END,
      window_start = CASE
        WHEN "player_validation_rate_limits"."window_start" < CURRENT_TIMESTAMP - INTERVAL '1 hour' THEN CURRENT_TIMESTAMP
        ELSE "player_validation_rate_limits"."window_start"
      END,
      updated_at = CURRENT_TIMESTAMP
    RETURNING attempt_count, window_start,
      GREATEST(1, CEIL(EXTRACT(EPOCH FROM (
        CASE 
          WHEN "window_start" < CURRENT_TIMESTAMP - INTERVAL '1 hour' THEN CURRENT_TIMESTAMP + INTERVAL '1 hour' - CURRENT_TIMESTAMP
          ELSE "window_start" + INTERVAL '1 hour' - CURRENT_TIMESTAMP
        END
      ))))::int AS retry_after_seconds;
  `;

  try {
    const res = await pool.query(query, [rateKey]);
    const row = res.rows[0];
    const attemptCount = Number(row?.attempt_count || 1);
    const retryAfterSeconds = Number(row?.retry_after_seconds || 3600);

    if (attemptCount > 5) {
      return {
        allowed: false,
        retryAfterSeconds,
        attemptCount
      };
    }

    return {
      allowed: true,
      retryAfterSeconds: 0,
      attemptCount
    };
  } catch (err: any) {
    console.error('[RateLimit] PostgreSQL rate limit query error:', err.message);
    // Fail-open for minor DB hiccups on rate limit, but log prominently
    return { allowed: true, attemptCount: 1 };
  }
}

/**
 * Validates a Player ID with persistent DB caching, 5 attempts/hour rate limiting,
 * and automatic GamesDrop -> G2Bulk fallback.
 */
export async function validatePlayerAccount(params: {
  productId: string;
  gameUserId: string;
  gameServerId?: string | undefined;
  userId?: string | undefined;
  ip?: string | undefined;
}): Promise<PlayerValidationResult> {
  const { productId, gameUserId, gameServerId, userId, ip } = params;

  if (!gameUserId || typeof gameUserId !== 'string' || !gameUserId.trim()) {
    return {
      valid: false,
      message: 'يرجى إدخال معرّف اللاعب أولاً.'
    };
  }

  const cleanUserId = gameUserId.trim();
  const cleanServerId = gameServerId ? String(gameServerId).trim() : '';

  // 1. Load authoritative product from PostgreSQL
  const prodRes = await pool.query(
    `SELECT id, "productName", "offerName", "providerOfferId", "gameCategoryId",
            "requiresGameUserId", "requiresGameServerId", "isActive",
            "primaryProvider", "fallbackProvider", "fallbackEnabled"
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
  const gameKey = (product.gameCategoryId || 'freefire').toLowerCase().trim();

  // 2. Strict Rate Limiting: Max 5 attempts per hour per User and per Player ID
  // A. Check user rate limit if authenticated
  if (userId) {
    const userRateKey = `user:${userId}`;
    const userCheck = await checkAtomicPlayerRateLimit(userRateKey);
    if (!userCheck.allowed) {
      return {
        valid: false,
        rateLimited: true,
        retryAfterSeconds: userCheck.retryAfterSeconds,
        message: `تم تجاوز الحد المسموح لمحاولات فحص معرّف اللاعب (5 محاولات في الساعة). يرجى الانتظار ${userCheck.retryAfterSeconds} ثانية.`
      };
    }
  } else if (ip) {
    // Unauthenticated rate limiting by IP
    const ipRateKey = `ip:${ip.trim()}`;
    const ipCheck = await checkAtomicPlayerRateLimit(ipRateKey);
    if (!ipCheck.allowed) {
      return {
        valid: false,
        rateLimited: true,
        retryAfterSeconds: ipCheck.retryAfterSeconds,
        message: `تم تجاوز الحد المسموح لمحاولات فحص معرّف اللاعب (5 محاولات في الساعة). يرجى الانتظار ${ipCheck.retryAfterSeconds} ثانية.`
      };
    }
  }

  // B. Check rate limit per Player ID (composite: game:playerId:serverId)
  const playerRateKey = `player:${gameKey}:${cleanUserId.toLowerCase()}:${cleanServerId.toLowerCase()}`;
  const playerCheck = await checkAtomicPlayerRateLimit(playerRateKey);
  if (!playerCheck.allowed) {
    return {
      valid: false,
      rateLimited: true,
      retryAfterSeconds: playerCheck.retryAfterSeconds,
      message: `تم تجاوز الحد المسموح لمحاولات فحص هذا الحساب (5 محاولات في الساعة). يرجى الانتظار ${playerCheck.retryAfterSeconds} ثانية.`
    };
  }

  // 3. Telegram Special Handling: Username resolution (@username -> numeric ID)
  const isTelegramProduct = 
    (product.productName || '').toLowerCase().includes('telegram') ||
    (product.gameCategoryId || '').toLowerCase().includes('telegram');

  if (isTelegramProduct) {
    if (/^\d+$/.test(cleanUserId)) {
      return {
        valid: true,
        playerName: `معرف رقمي: ${cleanUserId}`,
        telegramUserId: Number(cleanUserId),
        message: 'تم قبول معرّف تيليجرام بنجاح.'
      };
    }

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

  // 4. Server ID validation strictly based on product.requiresGameServerId
  let validatedServerId: string | undefined = undefined;
  if (product.requiresGameServerId) {
    if (!cleanServerId) {
      return {
        valid: false,
        message: 'يرجى تحديد خادم اللعبة (Server ID).'
      };
    }
    validatedServerId = cleanServerId;
  }

  // 5. Check Persistent Player ID Cache (Valid within 24 hours TTL)
  try {
    const cacheRes = await pool.query(`
      SELECT player_name, provider, is_valid, expires_at
      FROM "player_validation_cache"
      WHERE game_key = $1 
        AND player_id_normalized = $2 
        AND server_id = $3
        AND expires_at > CURRENT_TIMESTAMP
        AND is_valid = true
      LIMIT 1
    `, [gameKey, cleanUserId.toLowerCase(), cleanServerId]);

    if (cacheRes.rows.length > 0) {
      const cached = cacheRes.rows[0];
      return {
        valid: true,
        playerName: cached.player_name,
        message: 'تم التحقق من الحساب بنجاح.',
        cached: true,
        provider: cached.provider
      };
    }
  } catch (cErr: any) {
    console.warn('[PlayerValidation] Cache read warning:', cErr.message);
  }

  // 6. Resolve Provider Routing for Product
  let routing;
  try {
    routing = await providerRouter.resolveProductProviders(product.id);
  } catch (rErr: any) {
    console.warn('[PlayerValidation] Provider resolution fallback:', rErr.message);
  }

  // 7. Resolve Provider & Game Code
  const correlationId = generateCorrelationId();
  let validationResult: PlayerValidationResult = {
    valid: false,
    message: 'تعذر التحقق من معرّف اللاعب.',
    correlationId
  };

  const primaryProvider = routing?.primaryProviderName || 'GAMESDROP';
  let primaryAttemptFailed = false;
  let primaryConfirmedInvalid = false;

  // Determine G2Bulk game code accurately
  let g2bGameCode = routing?.primaryProviderName === 'G2BULK' 
    ? routing?.primaryMetadata?.gameCode 
    : (routing?.fallbackMetadata?.gameCode || null);

  if (!g2bGameCode) {
    if (gameKey.includes('pubg')) {
      g2bGameCode = 'pubgm';
    } else if (gameKey.includes('test')) {
      g2bGameCode = 'test';
    } else if (gameKey.includes('freefire')) {
      g2bGameCode = 'freefire_me';
    }
  }

  // Special Handling for Test Top-up Product: Mock acceptance of test player IDs
  if (g2bGameCode === 'test' || gameKey.includes('test')) {
    return {
      valid: true,
      playerName: `[حساب اختباري] ID: ${cleanUserId}`,
      provider: 'G2BULK',
      message: 'تم قبول معرّف الحساب التجريبي بنجاح.',
      correlationId
    };
  }

  // A. Primary Provider Execution: GAMESDROP
  if (primaryProvider === 'GAMESDROP' && routing?.primaryOrdersEnabled) {
    const numericOfferId = Number(routing?.primaryProductId || product.providerOfferId);
    if (numericOfferId && numericOfferId > 0) {
      try {
        const gdResult = await gamesDropProvider.checkGameData({
          offerId: numericOfferId,
          gameUserId: cleanUserId,
          ...(validatedServerId ? { gameServerId: validatedServerId } : {})
        });

        if (gdResult && gdResult.status === 'VALID') {
          validationResult = {
            valid: true,
            playerName: gdResult.gameUserLogin || cleanUserId,
            provider: 'GAMESDROP',
            message: 'تم التحقق من الحساب بنجاح',
            correlationId
          };
        } else if (gdResult && (gdResult.status === 'INVALID' || (gdResult.status as string) === 'NOT_FOUND')) {
          primaryConfirmedInvalid = true;
          primaryAttemptFailed = true;
        } else {
          primaryAttemptFailed = true;
        }
      } catch (gdErr: any) {
        logProviderDiagnostic({
          provider: 'GAMESDROP',
          operation: 'checkGameData',
          error: gdErr,
          correlationId,
          context: { productId: product.id, cleanUserId, validatedServerId }
        });
        primaryAttemptFailed = true;
      }
    } else {
      primaryAttemptFailed = true;
    }
  } else if (primaryProvider === 'G2BULK' && routing?.primaryOrdersEnabled && g2bGameCode) {
    // Primary Provider Execution: G2BULK
    try {
      console.log(`[PlayerValidation][${correlationId}] Executing primary G2Bulk checkPlayerId (${g2bGameCode}) for player: ${cleanUserId}...`);
      const g2bRes = await g2BulkClient.checkPlayerId({
        game: g2bGameCode,
        user_id: cleanUserId,
        ...(validatedServerId ? { server_id: validatedServerId } : {})
      });

      if (g2bRes.valid === 'valid' && Boolean(g2bRes.name)) {
        validationResult = {
          valid: true,
          playerName: g2bRes.name || cleanUserId,
          provider: 'G2BULK',
          message: 'تم التحقق من الحساب بنجاح',
          correlationId
        };
      } else if (g2bRes.valid === 'invalid' || (g2bRes.valid as any) === false) {
        primaryConfirmedInvalid = true;
        primaryAttemptFailed = true;
      } else {
        primaryAttemptFailed = true;
      }
    } catch (g2bErr: any) {
      logProviderDiagnostic({
        provider: 'G2BULK',
        operation: 'checkPlayerId',
        error: g2bErr,
        correlationId,
        context: { productId: product.id, cleanUserId, validatedServerId }
      });
      if (g2bErr.status === 400 && g2bErr.raw && (g2bErr.raw.valid === 'invalid' || g2bErr.raw.valid === false)) {
        primaryConfirmedInvalid = true;
      }
      primaryAttemptFailed = true;
    }
  } else {
    primaryAttemptFailed = true;
  }

  // B. Fallback to G2Bulk if primary failed or GamesDrop is disabled/unauthenticated
  if (!validationResult.valid && primaryProvider !== 'G2BULK') {
    const isG2BulkEligible = (routing?.fallbackProviderName === 'G2BULK' || 
                              product.fallbackProvider === 'G2BULK' || 
                              gameKey.includes('freefire') ||
                              gameKey.includes('pubg')) && Boolean(g2bGameCode);

    let fallbackAttempted = false;
    let fallbackConfirmedInvalid = false;

    if (isG2BulkEligible && g2bGameCode) {
      fallbackAttempted = true;
      try {
        console.log(`[PlayerValidation][${correlationId}] Executing fallback checkPlayerId (${g2bGameCode}) for player: ${cleanUserId}...`);

        const g2bRes = await g2BulkClient.checkPlayerId({
          game: g2bGameCode,
          user_id: cleanUserId,
          ...(validatedServerId ? { server_id: validatedServerId } : {})
        });

        if (g2bRes.valid === 'valid' && Boolean(g2bRes.name)) {
          validationResult = {
            valid: true,
            playerName: g2bRes.name || cleanUserId,
            provider: 'G2BULK',
            message: 'تم التحقق من الحساب بنجاح',
            correlationId
          };
        } else if (g2bRes.valid === 'invalid' || (g2bRes.valid as any) === false) {
          fallbackConfirmedInvalid = true;
        }
      } catch (g2bErr: any) {
        logProviderDiagnostic({
          provider: 'G2BULK',
          operation: 'checkPlayerId',
          error: g2bErr,
          correlationId,
          context: { productId: product.id, cleanUserId, validatedServerId }
        });

        if (g2bErr.status === 400 && g2bErr.raw && (g2bErr.raw.valid === 'invalid' || g2bErr.raw.valid === false)) {
          fallbackConfirmedInvalid = true;
        }
      }
    }

    if (!validationResult.valid) {
      const isConfirmedInvalid = fallbackAttempted ? fallbackConfirmedInvalid : primaryConfirmedInvalid;

      validationResult = {
        valid: false,
        isUnavailable: !isConfirmedInvalid,
        message: isConfirmedInvalid
          ? 'تعذّر التحقق من معرّف اللاعب. تأكد من صحة المعرّف وحاول مرة أخرى.'
          : 'خدمة التحقق غير متاحة حالياً، يرجى المحاولة لاحقاً.',
        correlationId
      };
    }
  }

  // 8. If validated successfully, persist in player_validation_cache (TTL: 24 hours)
  if (validationResult.valid && validationResult.playerName) {
    try {
      await pool.query(`
        INSERT INTO "player_validation_cache" (
          id, game_key, player_id_normalized, server_id, provider, player_name, is_valid, created_at, expires_at
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, true, NOW(), NOW() + INTERVAL '24 hours'
        )
        ON CONFLICT ("game_key", "player_id_normalized", "server_id") DO UPDATE SET
          player_name = EXCLUDED.player_name,
          provider = EXCLUDED.provider,
          is_valid = true,
          created_at = NOW(),
          expires_at = NOW() + INTERVAL '24 hours'
      `, [
        gameKey,
        cleanUserId.toLowerCase(),
        cleanServerId,
        validationResult.provider || 'UNKNOWN',
        validationResult.playerName
      ]);
    } catch (saveErr: any) {
      console.warn('[PlayerValidation] Warning saving to cache:', saveErr.message);
    }
  }

  return validationResult;
}
