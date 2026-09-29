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

export type PartnerTab = 'dashboard' | 'quick-buy' | 'deposits' | 'ledger' | 'orders';

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
  const [activeTab, setActiveTab] = useState<PartnerTab>('dashboard');

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

  const refreshProfile = useCallback(async () => {
    try {
      const res = await partnerFetch<{
        success: boolean;
        partner: PartnerProfile;
        wallet: PartnerWallet;
        nextLevel?: NextLevelInfo;
      }>('/api/partner/me');

      if (res && res.partner) {
        setPartner(res.partner);
        setWallet(res.wallet);
        if (res.nextLevel) {
          setNextLevel(res.nextLevel);
        }
      }
    } catch (err: any) {
      // If 401 or token expired, clear partner
      if (err.message && err.message.includes('401')) {
        setStoredToken(null);
        setPartner(null);
        setWallet(null);
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
      const res = await partnerFetch<{
        success: boolean;
        token: string;
        partner: PartnerProfile;
        wallet: PartnerWallet;
      }>('/api/partner/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });

      if (res && res.success) {
        setStoredToken(res.token);
        setPartner(res.partner);
        setWallet(res.wallet);
        return { success: true };
      }
      return { success: false, error: 'تعذر تسجيل الدخول' };
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
