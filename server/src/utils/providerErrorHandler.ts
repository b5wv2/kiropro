import { randomUUID } from 'crypto';

/**
 * Provider Error Handling and Customer Privacy Layer
 * 
 * Guarantees:
 * 1. Zero provider identity leak (G2Bulk, GamesDrop, etc.) in customer APIs, UI, and messages.
 * 2. Rich diagnostics preserved in internal server logs with correlation IDs.
 * 3. Strict differentiation between Invalid Player ID vs Service Outage vs Rate Limiting.
 * 4. Secrets, API keys, and sensitive tokens are strictly masked from logs.
 */

export interface ProviderDiagnosticOptions {
  provider: string;
  operation: string;
  error: any;
  correlationId?: string;
  context?: Record<string, any>;
}

export interface SanitizedPlayerValidationOutput {
  valid: boolean;
  playerName?: string;
  telegramUserId?: number;
  message: string;
  httpStatus: number;
  rateLimited?: boolean;
  retryAfterSeconds?: number;
  isUnavailable?: boolean;
  correlationId?: string;
}

const SENSITIVE_KEY_REGEX = /(?:api[_-]?key|token|secret|password|authorization|bearer|auth|whsec)/i;
const PROVIDER_NAME_REGEX = /(g2bulk|gamesdrop|fivesim|5sim|provider|المزود|مزود|مورد)/i;

/**
 * Generates a compact, unique correlation ID for tracking customer issues in server logs
 */
export function generateCorrelationId(): string {
  return `req_${randomUUID().replace(/-/g, '').slice(0, 10)}`;
}

/**
 * Recursively masks sensitive fields (API keys, secrets, passwords)
 */
export function maskSensitiveData(obj: any, depth = 0): any {
  if (!obj || depth > 4) return obj;

  if (typeof obj === 'string') {
    // Mask potential token strings
    if (obj.startsWith('whsec_') || (obj.length > 25 && /^[a-zA-Z0-9_\-\.]{25,}$/.test(obj))) {
      return `${obj.slice(0, 4)}***${obj.slice(-4)}`;
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => maskSensitiveData(item, depth + 1));
  }

  if (typeof obj === 'object') {
    const masked: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (SENSITIVE_KEY_REGEX.test(key)) {
        masked[key] = '***MASKED***';
      } else {
        masked[key] = maskSensitiveData(value, depth + 1);
      }
    }
    return masked;
  }

  return obj;
}

/**
 * Logs comprehensive diagnostic details to internal server logs ONLY
 */
export function logProviderDiagnostic(options: ProviderDiagnosticOptions): string {
  const correlationId = options.correlationId || generateCorrelationId();
  const safeContext = options.context ? maskSensitiveData(options.context) : {};
  const rawErr = options.error;

  const status = rawErr?.status || rawErr?.statusCode || rawErr?.response?.status;
  const rawMsg = rawErr?.message || rawErr?.response?.data?.message || String(rawErr);
  const safeDetails = rawErr?.raw || rawErr?.details || rawErr?.response?.data;

  console.error(
    `[ProviderDiagnostic][${correlationId}] [${options.provider}] ${options.operation} Failed:`,
    {
      status,
      message: rawMsg,
      details: maskSensitiveData(safeDetails),
      context: safeContext
    }
  );

  return correlationId;
}

/**
 * Accurately maps and sanitizes player validation errors:
 * - Differentiates between invalid player ID vs service outage vs rate limit
 * - Strictly NEVER leaks provider names or HTTP error codes to customer
 */
export function resolvePlayerValidationError(options: {
  isInvalidPlayer?: boolean;
  isServiceUnavailable?: boolean;
  isRateLimit?: boolean;
  retryAfterSeconds?: number;
  rawError?: any;
  provider?: string;
  correlationId?: string;
}): SanitizedPlayerValidationOutput {
  const correlationId = options.correlationId || generateCorrelationId();

  // 1. Rate Limit
  if (options.isRateLimit) {
    const retryAfter = options.retryAfterSeconds || 60;
    return {
      valid: false,
      rateLimited: true,
      retryAfterSeconds: retryAfter,
      message: `تم تجاوز الحد المسموح لمحاولات فحص معرّف اللاعب (5 محاولات في الساعة). يرجى الانتظار ${retryAfter} ثانية.`,
      httpStatus: 429,
      correlationId
    };
  }

  // 2. Confirmed Invalid Player ID
  if (options.isInvalidPlayer) {
    return {
      valid: false,
      message: 'تعذّر التحقق من معرّف اللاعب. تأكد من صحة المعرّف وحاول مرة أخرى.',
      httpStatus: 400,
      correlationId
    };
  }

  // 3. Service Outage / Connection Error / Provider Failure
  return {
    valid: false,
    isUnavailable: true,
    message: 'خدمة التحقق غير متاحة حالياً، يرجى المحاولة لاحقاً.',
    httpStatus: 503,
    correlationId
  };
}

/**
 * Strips any provider names and raw technical jargon from customer-facing text
 */
export function sanitizeCustomerErrorMessage(rawError: any, defaultMessage = 'تعذر استكمال العملية حالياً. يرجى المحاولة لاحقاً.'): string {
  if (!rawError) return defaultMessage;

  const text = typeof rawError === 'string' ? rawError : (rawError?.message || rawError?.error || defaultMessage);

  // If text contains internal provider names or status codes like "G2Bulk error (400)" or "401 INVALID_TOKEN"
  if (PROVIDER_NAME_REGEX.test(text) || /\b(400|401|403|500|502|503|504)\b/.test(text) || /error|exception|fail|timeout/i.test(text)) {
    // Map to safe Arabic messages based on keywords
    const lower = text.toLowerCase();
    if (lower.includes('balance') || lower.includes('الرصيد')) {
      return 'رصيد المحفظة غير كافٍ لإتمام العملية.';
    }
    if (lower.includes('player') || lower.includes('user_id') || lower.includes('اللاعب') || lower.includes('معرف')) {
      return 'تعذّر التحقق من معرّف اللاعب. تأكد من صحة المعرّف وحاول مرة أخرى.';
    }
    if (lower.includes('price') || lower.includes('السعر')) {
      return 'تغير سعر المنتج. يرجى تحديث الصفحة والمحاولة بالسعر المحدث.';
    }
    if (lower.includes('rate') || lower.includes('حد') || lower.includes('429')) {
      return 'تم تجاوز الحد المسموح من المحاولات. يرجى الانتظار والمحاولة لاحقاً.';
    }
    return defaultMessage;
  }

  return text.trim();
}

/**
 * Sanitizes an Order object for customer consumption:
 * Strictly removes provider internal IDs, costs, raw failure reasons, and internal provider names.
 */
export function sanitizeCustomerOrderDto<T extends Record<string, any>>(order: T): Partial<T> {
  if (!order) return order;

  const sanitized: Record<string, any> = { ...order };

  // Remove internal provider fields
  delete sanitized.provider;
  delete sanitized.providerOrderId;
  delete sanitized.providerOfferId;
  delete sanitized.providerPrice;
  delete sanitized.providerCurrency;
  delete sanitized.providerCostUsd;
  delete sanitized.providerStatus;

  // Mask orderType
  if (typeof sanitized.orderType === 'string') {
    if (sanitized.orderType.includes('VOUCHER')) {
      sanitized.orderType = 'DIGITAL_VOUCHER';
    } else if (sanitized.orderType.includes('G2BULK') || sanitized.orderType.includes('GAMESDROP')) {
      sanitized.orderType = 'DIRECT_TOPUP';
    }
  }

  // Sanitize failureReason if present
  if (sanitized.failureReason && typeof sanitized.failureReason === 'string') {
    if (PROVIDER_NAME_REGEX.test(sanitized.failureReason) || /\b(400|401|403|500|502|503|504)\b/.test(sanitized.failureReason)) {
      sanitized.failureReason = 'تعذر استكمال الطلب تلقائياً، وتم رد المبلغ لمحفظتك.';
    }
  }

  return sanitized as Partial<T>;
}
