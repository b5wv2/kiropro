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
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: (isProduction ? 'none' : 'lax') as 'none' | 'lax',
    path: '/'
  };
};
