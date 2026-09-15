import dns from 'node:dns';
// Force IPv4 first for reliable outbound networking on Windows
dns.setDefaultResultOrder('ipv4first');

export interface GamesDropApiError {
  status: number;
  code?: string;
  message: string;
  details?: any;
}

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
    return this.token || (process.env.GAMESDROP_API_TOKEN || process.env.Game_DR || '').trim();
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Execute authenticated HTTP request to GamesDrop Partner API
   */
  public async request<T = any>(endpoint: string, options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    body?: any;
    headers?: Record<string, string>;
  } = {}): Promise<T> {
    const activeToken = this.getToken();
    if (!activeToken) {
      throw new Error('GAMESDROP_API_TOKEN_MISSING: لم يتم تكوين رمز مصادقة GamesDrop في السيرفر.');
    }

    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${this.baseUrl}${cleanEndpoint}`;

    const headers: Record<string, string> = {
      'Authorization': activeToken,
      'Accept': 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    };

    const fetchOptions: RequestInit = {
      method: options.method || 'GET',
      headers,
      signal: AbortSignal.timeout(20000), // Strict 20s network timeout to prevent thread starvation
      ...(options.body ? { body: JSON.stringify(options.body) } : {})
    };

    try {
      const response = await fetch(url, fetchOptions);
      const text = await response.text();

      let data: any = null;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { raw: text };
      }

      if (!response.ok) {
        const errorCode = data?.error || data?.code || (response.status === 404 ? 'ENDPOINT_NOT_FOUND' : 'API_ERROR');
        const errorMessage = data?.message || data?.error || `GamesDrop API returned HTTP ${response.status}`;
        
        console.error(`[GamesDrop Error] ${options.method || 'GET'} ${cleanEndpoint} -> ${response.status}:`, errorMessage);
        
        const err: GamesDropApiError = {
          status: response.status,
          code: errorCode,
          message: errorMessage,
          details: data
        };
        throw err;
      }

      return data as T;
    } catch (error: any) {
      if (error.status) {
        throw error;
      }
      console.error(`[GamesDrop Network Exception] ${options.method || 'GET'} ${cleanEndpoint}:`, error?.message || error);
      throw {
        status: 502,
        code: 'NETWORK_ERROR',
        message: error?.message || 'فشل الاتصال بمزود الألعاب GamesDrop.',
        details: error
      };
    }
  }
}

export const gamesDropClient = new GamesDropClient();
