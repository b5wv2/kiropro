import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { BASE_URL } from '../lib/api';

export interface PartnerProfile {
  id: string;
  userId: string;
  name: string;
  email: string;
  phone?: string;
  businessName?: string;
  status: 'ACTIVE' | 'SUSPENDED';
  mustChangePassword: boolean;
  levelId?: string;
  levelName?: string;
  levelArabicName?: string;
  badgeColor?: string;
  discountPercent?: number;
  totalPoints: number;
  ordersCount: number;
  totalPurchasesUsd: number;
}

export interface PartnerWallet {
  balance: number;
  currency: string;
  updatedAt: string;
}

export interface NextLevelInfo {
  nextLevelName?: string;
  nextLevelArabicName?: string;
  minSpendUsd?: number;
  remainingSpend?: number;
  progressPercent?: number;
}

export type PartnerTab = 'dashboard' | 'buy' | 'cards' | 'deposits' | 'ledger' | 'orders' | 'profile';

const getInitialTab = (): PartnerTab => {
  if (typeof window === 'undefined') return 'dashboard';
  const path = window.location.pathname;
  if (path.includes('/cards') || path.includes('/kiropro-cards')) return 'cards';
  if (path.includes('/buy') || path.includes('/quick-buy')) return 'buy';
  if (path.includes('/deposits')) return 'deposits';
  if (path.includes('/ledger')) return 'ledger';
  if (path.includes('/orders')) return 'orders';
  if (path.includes('/profile')) return 'profile';
  return 'dashboard';
};

interface PartnerContextType {
  partner: PartnerProfile | null;
  wallet: PartnerWallet | null;
  nextLevel: NextLevelInfo | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  activeTab: PartnerTab;
  setActiveTab: (tab: PartnerTab) => void;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  partnerFetch: <T = any>(endpoint: string, options?: RequestInit) => Promise<T>;
}

const PartnerContext = createContext<PartnerContextType | undefined>(undefined);

const PARTNER_TOKEN_KEY = 'partner_token';

export const PartnerProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [token, setTokenState] = useState<string | null>(() => {
    try {
      return localStorage.getItem(PARTNER_TOKEN_KEY);
    } catch {
      return null;
    }
  });

  const [partner, setPartner] = useState<PartnerProfile | null>(null);
  const [wallet, setWallet] = useState<PartnerWallet | null>(null);
  const [nextLevel, setNextLevel] = useState<NextLevelInfo | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activeTab, setActiveTabState] = useState<PartnerTab>(getInitialTab);

  const setActiveTab = (tab: PartnerTab) => {
    setActiveTabState(tab);
    if (typeof window !== 'undefined') {
      const subpath = tab === 'dashboard' ? '' : `/${tab}`;
      const targetUrl = `/partner${subpath}`;
      if (window.location.pathname !== targetUrl) {
        window.history.pushState(null, '', targetUrl);
      }
    }
  };

  useEffect(() => {
    const handlePopState = () => {
      setActiveTabState(getInitialTab());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const setStoredToken = (newToken: string | null) => {
    try {
      if (newToken) {
        localStorage.setItem(PARTNER_TOKEN_KEY, newToken);
      } else {
        localStorage.removeItem(PARTNER_TOKEN_KEY);
      }
    } catch {}
    setTokenState(newToken);
  };

  const partnerFetch = useCallback(async <T = any>(endpoint: string, options: RequestInit = {}): Promise<T> => {
    const url = endpoint.startsWith('http') ? endpoint : `${BASE_URL}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string> || {})
    };

    if (!(options.body instanceof FormData) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    const currentToken = token || localStorage.getItem(PARTNER_TOKEN_KEY);
    if (currentToken) {
      headers['Authorization'] = `Bearer ${currentToken}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include'
    });

    let data: any;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    if (!response.ok) {
      const errMsg = (data && typeof data === 'object' && data.error) ? data.error : `Request failed with status ${response.status}`;
      throw new Error(errMsg);
    }

    return data as T;
  }, [token]);

  const normalizePartnerAndWallet = (data: any): {
    partner: PartnerProfile | null;
    wallet: PartnerWallet | null;
    nextLevel: NextLevelInfo | null;
  } => {
    if (!data) return { partner: null, wallet: null, nextLevel: null };

    const p = data.partner || data.user || data;
    const partnerId = p.id || p.partnerId || data.partnerId;

    if (!partnerId) {
      return { partner: null, wallet: null, nextLevel: null };
    }

    const partner: PartnerProfile = {
      id: String(partnerId),
      userId: String(p.userId || p.user_id || data.userId || ''),
      name: String(p.name || data.name || ''),
      email: String(p.email || data.email || ''),
      phone: p.phone || data.phone,
      businessName: p.businessName || p.business_name || data.businessName,
      status: (p.status || data.status || 'ACTIVE') as 'ACTIVE' | 'SUSPENDED',
      mustChangePassword: Boolean(p.mustChangePassword ?? p.must_change_password ?? data.mustChangePassword),
      levelId: p.levelId || data.levelId,
      levelName: p.levelName || data.levelName,
      levelArabicName: p.levelArabicName || data.levelArabicName,
      badgeColor: p.badgeColor || data.badgeColor,
      discountPercent: Number(p.discountPercent ?? data.discountPercent ?? 0),
      totalPoints: Number(p.totalPoints ?? data.totalPoints ?? 0),
      ordersCount: Number(p.ordersCount ?? p.totalOrders ?? data.totalOrders ?? 0),
      totalPurchasesUsd: Number(p.totalPurchasesUsd ?? p.totalSpentUsd ?? data.totalSpentUsd ?? 0)
    };

    const w = data.wallet || {
      balance: Number(data.balance ?? p.balance ?? 0),
      currency: data.currency ?? p.currency ?? 'USD',
      updatedAt: new Date().toISOString()
    };

    const wallet: PartnerWallet = {
      balance: Number(w.balance || 0),
      currency: String(w.currency || 'USD'),
      updatedAt: String(w.updatedAt || new Date().toISOString())
    };

    const nextLevel: NextLevelInfo | null = data.nextLevel || p.nextLevel || null;

    return { partner, wallet, nextLevel };
  };

  const refreshProfile = useCallback(async () => {
    try {
      const res = await partnerFetch<any>('/api/partner/me');
      const { partner: p, wallet: w, nextLevel: nl } = normalizePartnerAndWallet(res);

      if (p) {
        setPartner(p);
        setWallet(w);
        if (nl) {
          setNextLevel(nl);
        }
        try {
          localStorage.setItem('kiro_cached_user', JSON.stringify({
            id: p.userId,
            email: p.email,
            name: p.name,
            role: 'PARTNER'
          }));
        } catch {}
      }
    } catch (err: any) {
      if (err.message && (err.message.includes('401') || err.message.includes('غير مصرح') || err.message.includes('تسجيل الدخول'))) {
        setStoredToken(null);
        setPartner(null);
        setWallet(null);
        setNextLevel(null);
      }
    }
  }, [partnerFetch]);

  useEffect(() => {
    const initAuth = async () => {
      setIsLoading(true);
      try {
        await refreshProfile();
      } catch {
        // Ignored
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, [refreshProfile]);

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await partnerFetch<any>('/api/partner/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });

      if (res && (res.success || res.token)) {
        if (res.token) {
          setStoredToken(res.token);
        }
        const { partner: p, wallet: w, nextLevel: nl } = normalizePartnerAndWallet(res);
        if (p) {
          setPartner(p);
          setWallet(w);
          if (nl) setNextLevel(nl);
          try {
            localStorage.setItem('kiro_cached_user', JSON.stringify({
              id: p.userId,
              email: p.email,
              name: p.name,
              role: 'PARTNER'
            }));
          } catch {}
        }
        await refreshProfile();
        return { success: true };
      }
      return { success: false, error: res?.error || 'تعذر تسجيل الدخول' };
    } catch (err: any) {
      return { success: false, error: err.message || 'فشل الاتصال بالخادم' };
    }
  };

  const logout = async () => {
    try {
      await partnerFetch('/api/partner/logout', { method: 'POST' });
    } catch {
      // Ignored
    } finally {
      setStoredToken(null);
      setPartner(null);
      setWallet(null);
      setNextLevel(null);
      try {
        localStorage.removeItem('kiro_cached_user');
      } catch {}
    }
  };

  return (
    <PartnerContext.Provider
      value={{
        partner,
        wallet,
        nextLevel,
        token,
        isAuthenticated: !!partner,
        isLoading,
        activeTab,
        setActiveTab,
        login,
        logout,
        refreshProfile,
        partnerFetch
      }}
    >
      {children}
    </PartnerContext.Provider>
  );
};

export const usePartner = (): PartnerContextType => {
  const context = useContext(PartnerContext);
  if (!context) {
    throw new Error('usePartner must be used within a PartnerProvider');
  }
  return context;
};
