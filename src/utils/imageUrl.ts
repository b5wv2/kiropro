import { BASE_URL } from '../lib/api';

export const DEFAULT_PRODUCT_PLACEHOLDER = 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=800&q=80';

/**
 * Returns the effective Backend Base URL for resolving local server assets.
 * Guarantees that in production on kiropro.store, assets are requested from
 * https://api.kiropro.store and NEVER from the frontend host.
 */
export function getBackendAssetBaseUrl(): string {
  if (BASE_URL && BASE_URL.trim() !== '') {
    return BASE_URL.trim().replace(/\/+$/, '');
  }

  // Safety fallback for production environment if VITE_API_URL wasn't injected at build time
  if (typeof window !== 'undefined' && window.location.hostname.includes('kiropro.store')) {
    return 'https://api.kiropro.store';
  }

  return '';
}

/**
 * Resolves a product or category image URL for frontend rendering.
 *
 * Rules:
 * 1. If null, empty, or whitespace -> Returns the default placeholder image.
 * 2. If the URL points to kiropro.store/uploads/ -> Replaces host with backend URL (https://api.kiropro.store).
 * 3. If already an absolute URL (http://, https://, data:) -> Returns as is (e.g. external CDN or already resolved backend URL).
 * 4. If a relative path (e.g. /uploads/products/...) -> Prepends backend base URL (https://api.kiropro.store).
 */
export function getProductImageUrl(url?: string | null): string {
  if (!url || typeof url !== 'string' || !url.trim()) {
    return DEFAULT_PRODUCT_PLACEHOLDER;
  }

  let cleanUrl = url.trim();
  const backendBase = getBackendAssetBaseUrl();

  // If URL mistakenly references kiropro.store/uploads/, fix host to backend
  if (cleanUrl.includes('kiropro.store/uploads/')) {
    return cleanUrl.replace(/https?:\/\/(www\.)?kiropro\.store/i, backendBase || 'https://api.kiropro.store');
  }

  // If already absolute (Backend URL, Unsplash, or data URI)
  if (
    cleanUrl.startsWith('http://') ||
    cleanUrl.startsWith('https://') ||
    cleanUrl.startsWith('data:') ||
    cleanUrl.startsWith('blob:')
  ) {
    return cleanUrl;
  }

  // Relative path starting with /uploads/
  const cleanPath = cleanUrl.startsWith('/') ? cleanUrl : `/${cleanUrl}`;
  return `${backendBase}${cleanPath}`;
}
