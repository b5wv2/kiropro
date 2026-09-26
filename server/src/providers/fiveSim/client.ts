import dns from 'node:dns';
import https from 'node:https';
import http from 'node:http';
import {
  FiveSimProfile,
  FiveSimOrderResponse,
  FiveSimPricesResponse,
  FiveSimProductsResponse
} from './types';

// Ensure IPv4 first on Windows
dns.setDefaultResultOrder('ipv4first');

const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 10000,
  maxSockets: 20,
  timeout: 30000
});

export class FiveSimClient {
  private baseUrl: string;
  private token: string;

  constructor() {
    this.baseUrl = (process.env.FIVESIM_API_URL || 'https://5sim.net').replace(/\/+$/, '');
    this.token = (process.env.FIVESIM_API_TOKEN || '').trim();
  }

  public getToken(): string {
    return (process.env.FIVESIM_API_TOKEN || this.token || '').trim();
  }

  public isConfigured(): boolean {
    return Boolean(this.getToken());
  }

  /**
   * Execute authenticated HTTP request to 5SIM API
   */
  public async request<T = any>(endpoint: string, options: {
    method?: 'GET' | 'POST' | 'DELETE';
    body?: any;
    headers?: Record<string, string>;
    timeoutMs?: number;
    requiresAuth?: boolean;
  } = {}): Promise<T> {
    const requiresAuth = options.requiresAuth !== false;
    const token = this.getToken();

    if (requiresAuth && !token) {
      throw new Error('FIVESIM_TOKEN_MISSING: رمز مصادقة 5SIM غير مهيأ في السيرفر (FIVESIM_API_TOKEN).');
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
        'Accept': 'application/json',
        ...(requiresAuth && token ? { 'Authorization': `Bearer ${token}` } : {}),
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
          const trimmed = rawData.trim();
          let parsedData: any = null;

          try {
            parsedData = trimmed ? JSON.parse(trimmed) : null;
          } catch {
            // 5SIM sometimes returns plain string responses, e.g. "no free phones"
            parsedData = trimmed;
          }

          const statusCode = res.statusCode || 500;

          // Special 5SIM behavior: 200 with "no free phones" text
          if (statusCode === 200 && typeof parsedData === 'string' && parsedData.toLowerCase().includes('no free phones')) {
            return reject({
              status: 200,
              code: 'NO_FREE_PHONES',
              message: 'لا تتوفر أرقام شاغرة لهذه الخدمة أو الدولة حالياً لدى المزود (no free phones).'
            });
          }

          if (statusCode >= 200 && statusCode < 300) {
            return resolve(parsedData as T);
          }

          // Error handling
          let errorMessage = 'فشل الاتصال بمزود الأرقام الافتراضية.';
          if (typeof parsedData === 'string') {
            errorMessage = parsedData;
          } else if (parsedData && typeof parsedData === 'object' && parsedData.message) {
            errorMessage = parsedData.message;
          }

          return reject({
            status: statusCode,
            code: typeof parsedData === 'string' ? parsedData : (parsedData?.code || `HTTP_${statusCode}`),
            message: errorMessage,
            raw: parsedData
          });
        });
      });

      req.on('timeout', () => {
        req.destroy();
        reject({
          status: 408,
          code: 'FIVESIM_TIMEOUT',
          message: 'انتهت مهلة الاتصال بمزود 5SIM.'
        });
      });

      req.on('error', (err) => {
        reject({
          status: 500,
          code: 'FIVESIM_NETWORK_ERROR',
          message: err.message || 'حدث خطأ في شبكة الاتصال بـ 5SIM.'
        });
      });

      if (bodyStr) {
        req.write(bodyStr);
      }
      req.end();
    });
  }

  /**
   * 1. GET /v1/user/profile
   */
  public async getProfile(): Promise<FiveSimProfile> {
    return this.request<FiveSimProfile>('/v1/user/profile');
  }

  /**
   * 2. GET /v1/guest/prices?country=$country&product=$product
   */
  public async getPrices(country?: string, product?: string): Promise<FiveSimPricesResponse> {
    const params = new URLSearchParams();
    if (country) params.append('country', country);
    if (product) params.append('product', product);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.request<FiveSimPricesResponse>(`/v1/guest/prices${qs}`, { requiresAuth: false });
  }

  /**
   * 3. GET /v1/guest/products/$country/$operator
   */
  public async getProducts(country: string, operator = 'any'): Promise<FiveSimProductsResponse> {
    return this.request<FiveSimProductsResponse>(`/v1/guest/products/${encodeURIComponent(country)}/${encodeURIComponent(operator)}`, { requiresAuth: false });
  }

  /**
   * 4. GET /v1/user/buy/activation/$country/$operator/$product
   * Purchase an activation number
   */
  public async buyActivation(country: string, operator = 'any', product: string, maxPrice?: number): Promise<FiveSimOrderResponse> {
    const params = new URLSearchParams();
    if (maxPrice !== undefined && Number.isFinite(maxPrice)) {
      params.append('maxPrice', String(maxPrice));
    }
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.request<FiveSimOrderResponse>(`/v1/user/buy/activation/${encodeURIComponent(country)}/${encodeURIComponent(operator)}/${encodeURIComponent(product)}${qs}`);
  }

  /**
   * 5. GET /v1/user/check/$id
   * Check order status and get incoming SMS
   */
  public async checkOrder(orderId: number | string): Promise<FiveSimOrderResponse> {
    return this.request<FiveSimOrderResponse>(`/v1/user/check/${encodeURIComponent(orderId)}`);
  }

  /**
   * 6. GET /v1/user/finish/$id
   * Finish order after receiving SMS
   */
  public async finishOrder(orderId: number | string): Promise<FiveSimOrderResponse> {
    return this.request<FiveSimOrderResponse>(`/v1/user/finish/${encodeURIComponent(orderId)}`);
  }

  /**
   * 7. GET /v1/user/cancel/$id
   * Cancel order and release balance
   */
  public async cancelOrder(orderId: number | string): Promise<FiveSimOrderResponse> {
    return this.request<FiveSimOrderResponse>(`/v1/user/cancel/${encodeURIComponent(orderId)}`);
  }

  /**
   * 8. GET /v1/user/ban/$id
   * Ban order if number is already blocked or invalid
   */
  public async banOrder(orderId: number | string): Promise<FiveSimOrderResponse> {
    return this.request<FiveSimOrderResponse>(`/v1/user/ban/${encodeURIComponent(orderId)}`);
  }
}

export const fiveSimClient = new FiveSimClient();
