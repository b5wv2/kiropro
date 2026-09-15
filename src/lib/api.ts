export const BASE_URL = (((import.meta as any).env?.VITE_API_URL as string) || 'http://localhost:5000').replace(/\/$/, '');

export const TOKEN_STORAGE_KEY = 'token';

/**
 * Access tokens are managed exclusively via HttpOnly Secure Cookies.
 * Tokens are never persisted to localStorage or sessionStorage.
 */
export function getToken(): string | null {
  return null;
}

export function setToken(_token?: string): void {
  try {
    // Purge any legacy stored token to ensure localStorage remains empty
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {}
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {}
}

export interface ApiRequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
  _retryCount?: number;
}

export class ApiError extends Error {
  status: number;
  data: any;

  constructor(status: number, message: string, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

async function request<T = any>(endpoint: string, options: ApiRequestOptions = {}): Promise<T> {
  const { params, headers = {}, _retryCount = 0, ...customConfig } = options;

  let url = endpoint.startsWith('http') ? endpoint : `${BASE_URL}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        searchParams.append(key, String(value));
      }
    });
    const queryString = searchParams.toString();
    if (queryString) {
      url += (url.includes('?') ? '&' : '?') + queryString;
    }
  }

  const token = getToken();
  const reqHeaders: Record<string, string> = {
    ...(headers as Record<string, string>),
  };

  if (!(customConfig.body instanceof FormData)) {
    reqHeaders['Content-Type'] = 'application/json';
  }

  if (token) {
    reqHeaders['Authorization'] = `Bearer ${token}`;
  }

  const config: RequestInit = {
    ...customConfig,
    headers: reqHeaders,
    credentials: 'include',
  };

  let response: Response;
  try {
    response = await fetch(url, config);
  } catch (networkError: any) {
    throw new ApiError(0, networkError?.message || 'Network connection error');
  }

  let data: any = null;
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  } else {
    try {
      data = await response.text();
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    if (response.status === 401) {
      // Clear token if token is invalid or expired
      clearToken();
    }

    // Controlled 429 Too Many Requests Handling (No tight loops, max 1 retry with backoff for GET)
    if (response.status === 429) {
      const isGet = !customConfig.method || customConfig.method.toUpperCase() === 'GET';
      if (isGet && _retryCount < 1) {
        const retryAfterHeader = response.headers.get('retry-after');
        let backoffMs = 2000;
        if (retryAfterHeader) {
          const parsedSec = parseInt(retryAfterHeader, 10);
          if (!isNaN(parsedSec) && parsedSec > 0) {
            backoffMs = Math.min(parsedSec * 1000, 5000);
          }
        }
        console.warn(`[API] 429 rate limited on ${url}. Backing off for ${backoffMs}ms before single retry...`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        return request<T>(endpoint, { ...options, _retryCount: _retryCount + 1 });
      }

      const errorMessage = data?.error || 'تم تجاوز الحد المسموح من الطلبات مؤقتاً. يرجى الانتظار قليلاً.';
      throw new ApiError(429, errorMessage, data);
    }

    const errorMessage = data?.error || data?.message || `Request failed with status ${response.status}`;
    throw new ApiError(response.status, errorMessage, data);
  }

  return data as T;
}

export const api = {
  get: <T = any>(endpoint: string, options?: ApiRequestOptions) =>
    request<T>(endpoint, { ...options, method: 'GET' }),

  post: <T = any>(endpoint: string, body?: any, options?: ApiRequestOptions) =>
    request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    }),

  put: <T = any>(endpoint: string, body?: any, options?: ApiRequestOptions) =>
    request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    }),

  patch: <T = any>(endpoint: string, body?: any, options?: ApiRequestOptions) =>
    request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    }),

  delete: <T = any>(endpoint: string, options?: ApiRequestOptions) =>
    request<T>(endpoint, { ...options, method: 'DELETE' }),

  upload: <T = any>(endpoint: string, formData: FormData, options?: ApiRequestOptions) =>
    request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: formData,
    }),
};

export default api;
