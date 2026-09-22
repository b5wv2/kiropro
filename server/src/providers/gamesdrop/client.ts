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

    const fullUrlStr = endpoint.startsWith('http://') || endpoint.startsWith('https://')
      ? endpoint
      : `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

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
            
            console.error(`[GamesDrop Error] ${options.method || 'GET'} ${url.pathname} -> ${statusCode}:`, errorMessage);
            
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
          message: `انتهت مهلة الاتصال بـ GamesDrop (${timeout}ms).`,
          details: { endpoint: url.pathname }
        });
      });

      req.on('error', (err: any) => {
        console.error(`[GamesDrop Network Exception] ${options.method || 'GET'} ${url.pathname}:`, err.message);
        reject({
          status: 502,
          code: 'NETWORK_ERROR',
          message: err.message || 'فشل الاتصال بمزود الألعاب GamesDrop.',
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
