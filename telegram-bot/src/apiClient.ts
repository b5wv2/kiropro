import { config } from './config';

export interface PendingOrder {
  id: string;
  userId: string;
  usdtAmount: string | number;
  cryptoNetwork: string;
  walletAddress: string;
  chargedAmount: string | number;
  chargedCurrency: string;
  exchangeRateUsed: string | number;
  status: string;
  createdAt: string;
  userEmail: string;
  userName: string | null;
  lastNotifiedAt: string | null;
  notificationCount: number;
}

export class BackendApiClient {
  private baseUrl: string;
  private secret: string;

  constructor() {
    this.baseUrl = config.backendUrl;
    this.secret = config.botSecret;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers = {
      'Content-Type': 'application/json',
      'X-Bot-Secret': this.secret,
      ...(options.headers || {})
    };

    const response = await fetch(url, { ...options, headers });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status} from KIROPRO Backend`);
    }

    return data as T;
  }

  async getPendingOrders(): Promise<PendingOrder[]> {
    const result = await this.request<{ orders: PendingOrder[] }>('/api/internal/telegram/pending');
    return result.orders || [];
  }

  async ackOrder(orderId: string): Promise<void> {
    await this.request(`/api/internal/telegram/orders/${orderId}/ack`, {
      method: 'POST'
    });
  }

  async completeOrder(orderId: string, params: { txHash?: string; adminTelegramId?: string; adminName?: string }): Promise<any> {
    return this.request(`/api/internal/telegram/orders/${orderId}/complete`, {
      method: 'POST',
      body: JSON.stringify(params)
    });
  }

  async cancelOrder(orderId: string, params: { reason?: string; adminTelegramId?: string; adminName?: string }): Promise<any> {
    return this.request(`/api/internal/telegram/orders/${orderId}/cancel`, {
      method: 'POST',
      body: JSON.stringify(params)
    });
  }
}

export const backendClient = new BackendApiClient();
