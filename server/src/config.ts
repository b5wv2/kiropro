import 'dotenv/config';

if (!process.env.JWT_SECRET || !process.env.JWT_SECRET.trim()) {
  throw new Error('FATAL: JWT_SECRET is required. Cannot start application without a configured JWT secret.');
}

export const JWT_SECRET: string = process.env.JWT_SECRET.trim();

/**
 * Cookie configuration compatible with Frontend and Backend deployed
 * on separate domains/subdomains (such as Railway Monorepo or custom domains).
 * 
 * In Production:
 * - httpOnly: true (prevents client-side JS/XSS access)
 * - secure: true (requires HTTPS)
 * - sameSite: 'none' (mandatory for cross-site cookie transmission across distinct Railway domains)
 * - path: '/'
 * 
 * In Development:
 * - secure: false (allows plain HTTP on localhost)
 * - sameSite: 'lax' (standard local development behavior)
 */
export const getAuthCookieOptions = () => {
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Allow explicit override via COOKIE_DOMAIN (e.g. '.kiropro.store')
  let cookieDomain = process.env.COOKIE_DOMAIN?.trim();
  if (!cookieDomain && isProduction) {
    const frontendUrl = process.env.FRONTEND_URL || '';
    const apiUrl = process.env.API_URL || process.env.BACKEND_URL || '';
    // If running under kiropro.store domain, share cookies across subdomains (kiropro.store & api.kiropro.store)
    if (frontendUrl.includes('kiropro.store') || apiUrl.includes('kiropro.store') || !process.env.FRONTEND_URL) {
      cookieDomain = '.kiropro.store';
    }
  }

  // When domain is .kiropro.store, frontend and api are same-site (eTLD+1).
  // SameSite='lax' ensures the cookie is sent on all same-site requests (subdomain to subdomain)
  // and is NEVER blocked by third-party cookie deprecation in Chrome, Safari (ITP), or Brave.
  // If no common domain is available (e.g. separate railway.app subdomains), sameSite='none' is used.
  const sameSiteMode = cookieDomain ? 'lax' : (isProduction ? 'none' : 'lax');

  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: sameSiteMode as 'none' | 'lax',
    path: '/',
    ...(cookieDomain ? { domain: cookieDomain } : {})
  };
};
