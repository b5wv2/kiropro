import { Request, Response } from 'express';
import crypto from 'crypto';
import { getAuthCookieOptions } from '../config';

export interface ClientInfo {
  ip: string;
  deviceId: string;
  userAgent: string;
  browser: string;
  browserVersion: string;
  os: string;
  osVersion: string;
  deviceType: 'Desktop' | 'Mobile' | 'Tablet' | 'Unknown';
  language: string;
  timezone: string;
}

const DEVICE_COOKIE_NAME = 'kiro_dvc';

/**
 * Generate a cryptographically random KIROPRO Device ID.
 * Example: dvc_a8f3b9c02d1e4567890abcdef
 * IMPORTANT: No MAC, IMEI, or hardware serial numbers are ever collected or used.
 */
export function generateDeviceId(): string {
  return `dvc_${crypto.randomBytes(16).toString('hex')}`;
}

/**
 * Validate format of KIROPRO Device ID.
 */
export function isValidDeviceId(id?: string | null): boolean {
  if (!id || typeof id !== 'string') return false;
  return /^dvc_[a-zA-Z0-9_-]{12,64}$/.test(id);
}

/**
 * Mask Device ID for safe UI display (e.g. dvc_8f2...91a)
 */
export function maskDeviceId(deviceId?: string | null): string {
  if (!deviceId || typeof deviceId !== 'string') return 'Unknown';
  if (deviceId.length <= 10) return deviceId;
  return `${deviceId.substring(0, 7)}...${deviceId.substring(deviceId.length - 4)}`;
}

/**
 * Clean and normalize client IP address behind Railway/Cloudflare proxy.
 */
export function extractClientIp(req: Request): string {
  const forwardedHeader = req.headers['x-forwarded-for'];
  let rawIp = req.ip || (typeof forwardedHeader === 'string' ? forwardedHeader.split(',')[0]?.trim() : undefined) || req.socket?.remoteAddress || '127.0.0.1';
  
  let ip = String(rawIp || '127.0.0.1');

  // Normalize IPv6-mapped IPv4 (e.g. ::ffff:192.168.1.1)
  if (ip.startsWith('::ffff:')) {
    ip = ip.substring(7);
  }
  
  // Localhost aliases
  if (ip === '::1') {
    ip = '127.0.0.1';
  }
  
  return ip.substring(0, 45); // Max IPv6 length
}

/**
 * Get or create KIROPRO Device ID from request cookies or headers.
 * If creating, optionally set the HttpOnly cookie on response.
 */
export function getOrCreateDeviceId(req: Request, res?: Response): string {
  let deviceId: string | undefined = req.cookies?.[DEVICE_COOKIE_NAME];

  if (!isValidDeviceId(deviceId)) {
    // Check optional header (for non-browser or mobile clients)
    const headerDevId = req.headers['x-device-id'];
    if (typeof headerDevId === 'string' && isValidDeviceId(headerDevId)) {
      deviceId = headerDevId;
    } else {
      deviceId = generateDeviceId();
    }
  }

  const validDeviceId = deviceId || generateDeviceId();

  if (res && (!req.cookies?.[DEVICE_COOKIE_NAME] || req.cookies[DEVICE_COOKIE_NAME] !== validDeviceId)) {
    // Persist in secure cookie for 2 years
    res.cookie(DEVICE_COOKIE_NAME, validDeviceId, {
      ...getAuthCookieOptions(),
      maxAge: 2 * 365 * 24 * 60 * 60 * 1000 // 2 years
    });
  }

  return validDeviceId;
}

/**
 * Parse browser name and version from User-Agent string.
 */
export function parseBrowser(ua: string): { name: string; version: string } {
  if (!ua) return { name: 'Unknown', version: '' };

  let match: RegExpMatchArray | null;

  // Edge
  if ((match = ua.match(/Edg(?:e)?\/([0-9.]+)/))) {
    return { name: 'Edge', version: match[1] || '' };
  }
  // Opera
  if ((match = ua.match(/OPR\/([0-9.]+)/))) {
    return { name: 'Opera', version: match[1] || '' };
  }
  // Samsung Browser
  if ((match = ua.match(/SamsungBrowser\/([0-9.]+)/))) {
    return { name: 'Samsung Internet', version: match[1] || '' };
  }
  // Chrome
  if ((match = ua.match(/Chrome\/([0-9.]+)/))) {
    return { name: 'Chrome', version: match[1] || '' };
  }
  // Firefox
  if ((match = ua.match(/Firefox\/([0-9.]+)/))) {
    return { name: 'Firefox', version: match[1] || '' };
  }
  // Safari (must check after Chrome)
  if ((match = ua.match(/Version\/([0-9.]+).*Safari/))) {
    return { name: 'Safari', version: match[1] || '' };
  }

  return { name: 'Other', version: '' };
}

/**
 * Parse Operating System name and version from User-Agent string.
 */
export function parseOS(ua: string): { name: string; version: string } {
  if (!ua) return { name: 'Unknown', version: '' };

  let match: RegExpMatchArray | null;

  // Windows
  if ((match = ua.match(/Windows NT ([0-9.]+)/))) {
    const ntVersion = match[1] || '';
    let friendly = 'Windows';
    if (ntVersion === '10.0') friendly = 'Windows 10/11';
    else if (ntVersion === '6.3') friendly = 'Windows 8.1';
    else if (ntVersion === '6.2') friendly = 'Windows 8';
    else if (ntVersion === '6.1') friendly = 'Windows 7';
    return { name: friendly, version: ntVersion };
  }

  // iOS
  if ((match = ua.match(/(?:iPhone|iPad|iPod).*?OS ([0-9_]+)/))) {
    return { name: 'iOS', version: (match[1] || '').replace(/_/g, '.') };
  }

  // macOS
  if ((match = ua.match(/Mac OS X ([0-9_]+)/))) {
    return { name: 'macOS', version: (match[1] || '').replace(/_/g, '.') };
  }

  // Android
  if ((match = ua.match(/Android ([0-9.]+)/))) {
    return { name: 'Android', version: match[1] || '' };
  }

  // Linux
  if (/Linux/i.test(ua)) {
    return { name: 'Linux', version: '' };
  }

  return { name: 'Other', version: '' };
}

/**
 * Determine device type (Desktop, Mobile, Tablet).
 */
export function parseDeviceType(ua: string): 'Desktop' | 'Mobile' | 'Tablet' | 'Unknown' {
  if (!ua) return 'Unknown';
  if (/iPad|Tablet/i.test(ua)) return 'Tablet';
  if (/Mobile|Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) return 'Mobile';
  return 'Desktop';
}

/**
 * Extract complete client info object from Express request.
 */
export function extractClientInfo(req: Request, res?: Response): ClientInfo {
  const ip = extractClientIp(req);
  const deviceId = getOrCreateDeviceId(req, res);
  const userAgent = (req.headers['user-agent'] as string) || '';

  const { name: browser, version: browserVersion } = parseBrowser(userAgent);
  const { name: os, version: osVersion } = parseOS(userAgent);
  const deviceType = parseDeviceType(userAgent);

  const langHeader = req.headers['x-client-language'] || req.headers['accept-language'];
  const language = (
    typeof langHeader === 'string'
      ? langHeader.split(',')[0]?.split(';')[0]?.trim() || 'ar'
      : 'ar'
  ).substring(0, 32);

  const tzHeader = req.headers['x-client-timezone'];
  const timezone = (
    typeof tzHeader === 'string' && tzHeader.trim() ? tzHeader.trim() : 'UTC'
  ).substring(0, 64);

  return {
    ip,
    deviceId,
    userAgent,
    browser,
    browserVersion,
    os,
    osVersion,
    deviceType,
    language,
    timezone
  };
}
