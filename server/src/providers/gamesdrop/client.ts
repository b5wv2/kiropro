import dns from 'node:dns';
// Force IPv4 first for reliable outbound networking on Windows
dns.setDefaultResultOrder('ipv4first');

export interface GamesDropApiError {
  status: number;
  code?: string;
  message: string;
  details?: any;
}

import https from 'node:https';
import http from 'node:http';

const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 10000,
  maxSockets: 20,
  timeout: 30000
});

export class GamesDropClient {
  private baseUrl: string;
  private token: string;
  private authFailureUntil: number = 0;
  private lastFailedToken: string = '';

  constructor() {
    this.baseUrl = (process.env.GAMESDROP_API_URL || 'https://partner.gamesdrop.io').replace(/\/+$/, '');
    this.token = (process.env.GAMESDROP_API_TOKEN || process.env.Game_DR || '').trim();

    if (!this.token) {
      console.warn('[GamesDropClient] Warning: GAMESDROP_API_TOKEN is not configured in process.env');
    }
  }

  public getToken(): string {
    return (process.env.GAMESDROP_API_TOKEN || process.env.Game_DR || this.token || '').trim();
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Reset authentication throttling if token has changed or upon explicit request
   */
  public resetAuthThrottle(): void {
    this.authFailureUntil = 0;
    this.lastFailedToken = '';
  }

  /**
   * Check if circuit breaker is open due to 401 INVALID_TOKEN
   */
  public isCircuitBreakerOpen(): boolean {
    return this.authFailureUntil > Date.now();
  }

  /**
   * Execute authenticated HTTP request to GamesDrop Partner API
   * Uses native node:https for 100% reliable Windows networking without undici socket drops.
   */
  public async request<T = any>(endpoint: string, options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    body?: any;
    headers?: Record<string, string>;
    timeoutMs?: number;
  } = {}): Promise<T> {
    const activeToken = this.getToken();
    if (!activeToken) {
      throw new Error('GAMESDROP_API_TOKEN_MISSING: لم يتم تكوين رمز مصادقة GamesDrop في السيرفر.');
    }

    // Reset circuit breaker if the token has been changed in .env
    if (this.lastFailedToken && activeToken !== this.lastFailedToken) {
      this.resetAuthThrottle();
    }

    const cleanPath = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

    // Throttle repeated calls to balance/status if authentication was rejected with 401 INVALID_TOKEN
    if (this.authFailureUntil > Date.now() && cleanPath.includes('/balance')) {
      const remainingSeconds = Math.ceil((this.authFailureUntil - Date.now()) / 1000);
      throw {
        status: 401,
        code: 'INVALID_TOKEN',
        message: `رمز مصادقة GamesDrop مرفوض من المزود (401 INVALID_TOKEN). تم تعليق محاولات فحص الرصيد مؤقتاً لتجنب تكرار الأخطاء (المتبقي ${remainingSeconds} ثانية). يرجى تحديث GAMESDROP_API_TOKEN لإعادة التفعيل الفوري.`,
        details: { throttled: true, remainingSeconds }
      } as GamesDropApiError;
    }

    const fullUrlStr = endpoint.startsWith('http://') || endpoint.startsWith('https://')
      ? endpoint
      : `${this.baseUrl}${cleanPath}`;

    const url = new URL(fullUrlStr);
    const bodyStr = options.body !== undefined ? JSON.stringify(options.body) : null;
    const timeout = options.timeoutMs || 30000;

    return new Promise<T>((resolve, reject) => {
      const isHttps = url.protocol === 'https:';
      const transport = isHttps ? https : http;

      const headers: Record<string, string> = {
        'Authorization': activeToken,
        'Accept': 'application/json',
        ...(bodyStr ? { 
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyStr).toString()
        } : {}),
        ...(options.headers || {})
      };

      const req = transport.request({
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: options.method || 'GET',
        headers,
        agent: isHttps ? httpsAgent : undefined,
        timeout
      }, (res) => {
        let rawData = '';
        res.setEncoding('utf8');

        res.on('data', chunk => {
          rawData += chunk;
        });

        res.on('end', () => {
          let parsedData: any = null;
          try {
            parsedData = rawData ? JSON.parse(rawData) : {};
          } catch {
            parsedData = { raw: rawData };
          }

          const statusCode = res.statusCode || 200;
          if (statusCode >= 400) {
            const errorCode = parsedData?.error?.code || parsedData?.error || parsedData?.code || (statusCode === 404 ? 'ENDPOINT_NOT_FOUND' : 'API_ERROR');
            const errorMessage = parsedData?.error?.message || parsedData?.message || parsedData?.error || `GamesDrop API returned HTTP ${statusCode}`;
            
            if (statusCode === 401 && (errorCode === 'INVALID_TOKEN' || String(errorMessage).includes('INVALID_TOKEN'))) {
              this.authFailureUntil = Date.now() + 10 * 60 * 1000; // 10 minutes backoff
              this.lastFailedToken = activeToken;
              console.warn(`[GamesDrop Auth] 401 INVALID_TOKEN on ${url.pathname}. Throttling repeated balance calls for 10 minutes to protect server logs.`);
            } else {
              console.error(`[GamesDrop Error] ${options.method || 'GET'} ${url.pathname} -> ${statusCode}:`, errorMessage);
            }
            
            const err: GamesDropApiError = {
              status: statusCode,
              code: errorCode,
              message: errorMessage,
              details: parsedData
            };
            return reject(err);
          }

          resolve(parsedData as T);
        });
      });

      req.on('timeout', () => {
        req.destroy();
        reject({
          status: 504,
          code: 'TIMEOUT',
          message: `انتهت مهلة الاتصال بخدمة التحقق (${timeout}ms).`,
          details: { endpoint: url.pathname }
        });
      });

      req.on('error', (err: any) => {
        console.error(`[GamesDrop Network Exception] ${options.method || 'GET'} ${url.pathname}:`, err.message);
        reject({
          status: 502,
          code: 'NETWORK_ERROR',
          message: err.message || 'فشل الاتصال بالخدمة.',
          details: err
        });
      });

      if (bodyStr) {
        req.write(bodyStr);
      }
      req.end();
    });
  }
}

export const gamesDropClient = new GamesDropClient();
