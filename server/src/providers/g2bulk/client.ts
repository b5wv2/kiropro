import https from 'node:https';
import http from 'node:http';
import dns from 'node:dns';
import {
  G2BulkUserResponse,
  G2BulkGamesResponse,
  G2BulkGameFieldsResponse,
  G2BulkGameServersResponse,
  G2BulkCheckPlayerParams,
  G2BulkCheckPlayerResponse,
  G2BulkCatalogueResponse,
  G2BulkCreateOrderParams,
  G2BulkCreateOrderResponse,
  G2BulkOrderStatusResponse
} from './types';

// Force IPv4 first for reliable Windows networking
dns.setDefaultResultOrder('ipv4first');

export interface G2BulkError {
  status: number;
  message: string;
  isRateLimit?: boolean;
  isAuthError?: boolean;
  isTimeout?: boolean;
  raw?: any;
}

const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 10000,
  maxSockets: 20,
  timeout: 30000
});

export class G2BulkClient {
  private readonly baseUrl: string = 'https://api.g2bulk.com/v1';

  public getApiKey(): string {
    const key = (process.env.API_G2BULK || process.env.G2BULK_API_KEY || '').trim();
    return key;
  }

  /**
   * Safe HTTP request executor for G2Bulk API
   * Implements exponential backoff on 429 and guards against loops on 401
   */
  public async request<T = any>(
    path: string,
    options: {
      method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | undefined;
      body?: any;
      requiresAuth?: boolean | undefined;
      idempotencyKey?: string | undefined;
      timeoutMs?: number | undefined;
      retries?: number | undefined;
    } = {}
  ): Promise<T> {
    const {
      method = 'GET',
      body,
      requiresAuth = false,
      idempotencyKey,
      timeoutMs = 25000,
      retries = 1
    } = options;

    const apiKey = this.getApiKey();
    if (requiresAuth && !apiKey) {
      throw {
        status: 401,
        message: 'G2Bulk API key is not configured in environment variables (API_G2BULK).',
        isAuthError: true
      } as G2BulkError;
    }

    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const fullUrl = new URL(`${this.baseUrl}${cleanPath}`);
    const bodyStr = body !== undefined ? JSON.stringify(body) : null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await new Promise<T>((resolve, reject) => {
          const headers: Record<string, string> = {
            'Accept': 'application/json'
          };

          if (requiresAuth && apiKey) {
            headers['X-API-Key'] = apiKey;
          }

          if (idempotencyKey) {
            // Strictly require 36-character UUID per G2Bulk API docs
            if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
              headers['X-Idempotency-Key'] = idempotencyKey;
            } else {
              console.warn('[G2BulkClient] Warning: Invalid idempotency key format, skipping header:', idempotencyKey);
            }
          }

          if (bodyStr) {
            headers['Content-Type'] = 'application/json';
            headers['Content-Length'] = Buffer.byteLength(bodyStr).toString();
          }

          const req = https.request({
            protocol: fullUrl.protocol,
            hostname: fullUrl.hostname,
            port: fullUrl.port || 443,
            path: fullUrl.pathname + fullUrl.search,
            method,
            headers,
            agent: httpsAgent,
            timeout: timeoutMs
          }, (res) => {
            let rawData = '';
            res.setEncoding('utf8');

            res.on('data', chunk => {
              rawData += chunk;
            });

            res.on('end', () => {
              let parsed: any;
              try {
                parsed = rawData ? JSON.parse(rawData) : {};
              } catch {
                parsed = { raw: rawData };
              }

              const status = res.statusCode || 200;

              if (status >= 400) {
                const isRateLimit = status === 429;
                const isAuthError = status === 401;
                const errMsg = parsed?.message || parsed?.detail?.message || `G2Bulk error (${status})`;

                return reject({
                  status,
                  message: errMsg,
                  isRateLimit,
                  isAuthError,
                  raw: parsed
                } as G2BulkError);
              }

              resolve(parsed as T);
            });
          });

          req.on('timeout', () => {
            req.destroy();
            reject({
              status: 504,
              message: `G2Bulk request timed out after ${timeoutMs}ms.`,
              isTimeout: true
            } as G2BulkError);
          });

          req.on('error', (err) => {
            reject({
              status: 502,
              message: `Network error connecting to G2Bulk: ${err.message}`,
              raw: err
            } as G2BulkError);
          });

          if (bodyStr) {
            req.write(bodyStr);
          }
          req.end();
        });

        return response;
      } catch (err: any) {
        // Strict guard against looping on 401 (Prevent IP ban)
        if (err.isAuthError) {
          console.error('[G2BulkClient] 401 Authentication failure from G2Bulk. Halting retries immediately to protect IP.');
          throw err;
        }

        // Handle 429 Rate Limit with exponential backoff
        if (err.isRateLimit && attempt < retries) {
          const delay = (attempt + 1) * 2000;
          console.warn(`[G2BulkClient] 429 Rate limited. Backing off for ${delay}ms before retry...`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }

        // On final attempt, re-throw error
        if (attempt === retries) {
          throw err;
        }
      }
    }

    throw new Error('Unexpected request completion in G2BulkClient');
  }

  /**
   * GET /v1/getMe
   * Returns current wallet balance and user profile
   */
  public async getMe(): Promise<G2BulkUserResponse> {
    return this.request<G2BulkUserResponse>('/getMe', {
      method: 'GET',
      requiresAuth: true
    });
  }

  /**
   * GET /v1/games
   * Returns list of supported direct top-up games
   */
  public async getGames(): Promise<G2BulkGamesResponse> {
    return this.request<G2BulkGamesResponse>('/games', {
      method: 'GET',
      requiresAuth: false
    });
  }

  /**
   * POST /v1/games/fields
   * Returns required fields for a title (e.g. userid, serverid, charname)
   */
  public async getGameFields(gameCode: string): Promise<G2BulkGameFieldsResponse> {
    return this.request<G2BulkGameFieldsResponse>('/games/fields', {
      method: 'POST',
      body: { game: gameCode },
      requiresAuth: false
    });
  }

  /**
   * POST /v1/games/servers
   * Returns supported game servers
   */
  public async getGameServers(gameCode: string): Promise<G2BulkGameServersResponse> {
    return this.request<G2BulkGameServersResponse>('/games/servers', {
      method: 'POST',
      body: { game: gameCode },
      requiresAuth: false
    });
  }

  /**
   * POST /v1/games/checkPlayerId
   * Validates player account and returns in-game player name
   */
  public async checkPlayerId(params: G2BulkCheckPlayerParams): Promise<G2BulkCheckPlayerResponse> {
    return this.request<G2BulkCheckPlayerResponse>('/games/checkPlayerId', {
      method: 'POST',
      body: params,
      requiresAuth: false
    });
  }

  /**
   * GET /v1/games/:code/catalogue
   * Returns denominations and live prices
   */
  public async getCatalogue(gameCode: string): Promise<G2BulkCatalogueResponse> {
    return this.request<G2BulkCatalogueResponse>(`/games/${encodeURIComponent(gameCode)}/catalogue`, {
      method: 'GET',
      requiresAuth: false
    });
  }

  /**
   * POST /v1/games/:code/order
   * Places a top-up order
   */
  public async createTopupOrder(
    gameCode: string,
    params: G2BulkCreateOrderParams,
    idempotencyKey?: string
  ): Promise<G2BulkCreateOrderResponse> {
    return this.request<G2BulkCreateOrderResponse>(`/games/${encodeURIComponent(gameCode)}/order`, {
      method: 'POST',
      body: params,
      requiresAuth: true,
      idempotencyKey
    });
  }

  /**
   * POST /v1/games/order/status
   * Checks top-up order status
   */
  public async getOrderStatus(orderId: number | string): Promise<G2BulkOrderStatusResponse> {
    return this.request<G2BulkOrderStatusResponse>('/games/order/status', {
      method: 'POST',
      body: { order_id: Number(orderId) },
      requiresAuth: true
    });
  }

  /**
   * GET /v1/orders/:id/delivery
   * Delivery polling endpoint
   */
  public async getDelivery(orderId: number | string): Promise<any> {
    return this.request<any>(`/orders/${orderId}/delivery`, {
      method: 'GET',
      requiresAuth: true
    });
  }
}

export const g2BulkClient = new G2BulkClient();
