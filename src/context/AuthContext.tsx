import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, LoginCredentials, RegisterData, AuthResult } from '../types/auth';
import { api, setToken, clearToken, BASE_URL } from '../lib/api';

export interface ContactChannel {
  id: 'whatsapp' | 'telegram' | 'facebook';
  name: string;
  title: string;
  subtitle: string;
  enabled: boolean;
  url: string;
  order: number;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  maintenanceMode: boolean;
  checkMaintenanceStatus: () => Promise<boolean>;
  contactChannels: ContactChannel[];
  primaryWhatsapp: ContactChannel | null;
  refreshContactChannels: () => Promise<void>;
  login: (credentials: LoginCredentials) => Promise<AuthResult>;
  register: (data: RegisterData) => Promise<AuthResult>;
  verifyEmail: (email: string, otp: string) => Promise<AuthResult>;
  resendOtp: (email: string) => Promise<AuthResult>;
  quickLogin: () => Promise<AuthResult>;
  checkAdminSession: () => Promise<{ hasValidAdminSession: boolean; email?: string }>;
  logout: () => Promise<void>;
  currentView: 'home' | 'login' | 'register' | 'account' | 'admin' | 'reviews' | 'forgot-password' | 'usdt';
  navigateTo: (view: 'home' | 'login' | 'register' | 'account' | 'admin' | 'reviews' | 'forgot-password' | 'usdt') => void;
  isAccountMenuOpen: boolean;
  setIsAccountMenuOpen: (open: boolean) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const CACHED_USER_KEY = 'kiro_cached_user';
const CACHED_MAINT_KEY = 'kiro_maintenance_mode';

const getInitialCachedUser = (): User | null => {
  try {
    const raw = localStorage.getItem(CACHED_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const getInitialMaintenanceMode = (): boolean => {
  try {
    return localStorage.getItem(CACHED_MAINT_KEY) === 'true';
  } catch {
    return false;
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Synchronously initialize from cache so page renders immediately with 0ms delay on refresh
  const [user, setUser] = useState<User | null>(getInitialCachedUser);
  const [isLoading, setIsLoading] = useState(false); // Only true during active form operations (login/register)
  const [maintenanceMode, setMaintenanceMode] = useState<boolean>(getInitialMaintenanceMode);
  const [contactChannels, setContactChannels] = useState<ContactChannel[]>([]);
  const [primaryWhatsapp, setPrimaryWhatsapp] = useState<ContactChannel | null>(null);
  const [currentView, setCurrentView] = useState<'home' | 'login' | 'register' | 'account' | 'admin' | 'reviews' | 'forgot-password' | 'usdt'>('home');
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);

  const refreshContactChannels = async () => {
    try {
      const res = await api.get<{ channels: ContactChannel[]; primaryWhatsapp: ContactChannel | null }>('/api/contact-channels');
      if (res?.channels) {
        setContactChannels(res.channels);
        setPrimaryWhatsapp(res.primaryWhatsapp || null);
      }
    } catch (e) {
      console.error('Failed to refresh contact channels:', e);
    }
  };

  const checkMaintenanceStatus = async (): Promise<boolean> => {
    try {
      const res = await api.get<{
        maintenanceMode: boolean;
        contactChannels?: ContactChannel[];
        primaryWhatsapp?: ContactChannel | null;
      }>('/api/settings/public');
      const isMaint = Boolean(res?.maintenanceMode);
      setMaintenanceMode(isMaint);
      try {
        localStorage.setItem(CACHED_MAINT_KEY, isMaint ? 'true' : 'false');
      } catch {}
      if (res?.contactChannels) {
        setContactChannels(res.contactChannels);
      }
      if (res?.primaryWhatsapp !== undefined) {
        setPrimaryWhatsapp(res.primaryWhatsapp);
      }
      return isMaint;
    } catch {
      return maintenanceMode;
    }
  };

  useEffect(() => {
    const initAuth = async () => {
      try {
        if (window.location.pathname === '/forgot-password') {
          setCurrentView('forgot-password');
        } else if (window.location.pathname === '/reviews') {
          setCurrentView('reviews');
        } else if (window.location.pathname === '/usdt') {
          setCurrentView('usdt');
        }

        const [authData, settingsData] = await Promise.all([
          api.get('/api/auth/me').catch(() => null),
          api.get('/api/settings/public').catch(() => null)
        ]);

        if (settingsData) {
          if (settingsData.maintenanceMode !== undefined) {
            const isMaint = Boolean(settingsData.maintenanceMode);
            setMaintenanceMode(isMaint);
            try {
              localStorage.setItem(CACHED_MAINT_KEY, isMaint ? 'true' : 'false');
            } catch {}
          }
          if (settingsData.contactChannels) {
            setContactChannels(settingsData.contactChannels);
          }
          if (settingsData.primaryWhatsapp !== undefined) {
            setPrimaryWhatsapp(settingsData.primaryWhatsapp);
          }
        }

        if (authData?.user) {
          setUser(authData.user);
          try {
            localStorage.setItem(CACHED_USER_KEY, JSON.stringify(authData.user));
          } catch {}

          if (authData.user?.role === 'ADMIN' && window.location.pathname.includes('admin')) {
            setCurrentView('admin');
          } else if (window.location.pathname === '/reviews') {
            setCurrentView('reviews');
          } else if (window.location.pathname === '/forgot-password') {
            setCurrentView('forgot-password');
          } else if (window.location.pathname === '/usdt') {
            setCurrentView('usdt');
          }
        } else {
          setUser(null);
          try {
            localStorage.removeItem(CACHED_USER_KEY);
          } catch {}
        }
      } catch {
        clearToken();
        setUser(null);
        try {
          localStorage.removeItem(CACHED_USER_KEY);
        } catch {}
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, []);

  const navigateTo = (view: 'home' | 'login' | 'register' | 'account' | 'admin' | 'reviews' | 'forgot-password' | 'usdt') => {
    // Protected route check
    if (view === 'account' && !user) {
      setCurrentView('login');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    
    // Admin route check
    if (view === 'admin' && user?.role !== 'ADMIN') {
      setCurrentView('home');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setCurrentView(view);
    if (typeof window !== 'undefined') {
      if (view === 'forgot-password') {
        window.history.pushState(null, '', '/forgot-password');
      } else if (view === 'login') {
        window.history.pushState(null, '', '/login');
      } else if (view === 'register') {
        window.history.pushState(null, '', '/register');
      } else if (view === 'usdt') {
        window.history.pushState(null, '', '/usdt');
      } else if (view === 'home') {
        window.history.pushState(null, '', '/');
      }
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const login = async (credentials: LoginCredentials): Promise<AuthResult> => {
    setIsLoading(true);
    try {
      const response = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(credentials)
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok && (data.user || data.token)) {
        setToken();

        try {
          const meData = await api.get('/api/auth/me');
          setUser(meData.user);
          try {
            localStorage.setItem(CACHED_USER_KEY, JSON.stringify(meData.user));
          } catch {}

          if (meData.user?.role === 'ADMIN') {
            setCurrentView('admin');
          } else {
            setCurrentView('home');
          }
        } catch {
          setUser(data.user);
          try {
            localStorage.setItem(CACHED_USER_KEY, JSON.stringify(data.user));
          } catch {}
          if (data.user?.role === 'ADMIN') {
            setCurrentView('admin');
          } else {
            setCurrentView('home');
          }
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
        return { success: true };
      } else {
        // Check for ban response (403 or code/message containing ban/restriction)
        if (
          response.status === 403 &&
          (data.code?.includes('BANNED') || data.message?.includes('حظر') || data.message?.includes('تقييد'))
        ) {
          return {
            success: false,
            error: data.message || 'تم حظر حسابك من قبل إدارة KIROPRO.',
            banInfo: data
          };
        }

        // Check if unverified customer
        if (data.requiresVerification) {
          return {
            success: false,
            requiresVerification: true,
            email: data.email,
            error: data.error
          };
        }
        return {
          success: false,
          error: data.error || data.message || 'فشل تسجيل الدخول. يرجى التأكد من البريد وكلمة المرور.'
        };
      }
    } catch (err: any) {
      console.error('Login error:', err);
      return { success: false, error: 'تعذر الاتصال بالخادم. يرجى المحاولة لاحقاً.' };
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (data: RegisterData): Promise<AuthResult> => {
    setIsLoading(true);
    try {
      const resData = await api.post('/api/auth/register', data);
      return {
        success: true,
        requiresVerification: true,
        email: resData.email,
        message: resData.message
      };
    } catch (err: any) {
      console.error('Register error', err);
      // Check for ban response (403 on registration)
      if (
        err?.status === 403 &&
        (err?.data?.code?.includes('BANNED') ||
          err?.data?.message?.includes('حظر') ||
          err?.data?.message?.includes('تقييد') ||
          err?.data?.message?.includes('إنشاء'))
      ) {
        return {
          success: false,
          error: err.data?.message || 'تم تقييد الوصول من قبل إدارة KIROPRO.',
          banInfo: err.data
        };
      }
      const errMsg = err?.data?.error || err.message || 'فشل إنشاء الحساب.';
      return {
        success: false,
        error: errMsg,
        cooldownRemaining: err?.data?.cooldownRemaining
      };
    } finally {
      setIsLoading(false);
    }
  };

  const verifyEmail = async (email: string, otp: string): Promise<AuthResult> => {
    setIsLoading(true);
    try {
      const resData = await api.post('/api/auth/verify-email', { email, otp });
      setToken();
      setUser(resData.user);
      try {
        localStorage.setItem(CACHED_USER_KEY, JSON.stringify(resData.user));
      } catch {}
      navigateTo('home');
      return {
        success: true,
        message: resData.message
      };
    } catch (err: any) {
      console.error('Email verification error', err);
      return {
        success: false,
        error: err?.data?.error || err.message || 'رمز التحقق غير صحيح أو منتهي الصلاحية.'
      };
    } finally {
      setIsLoading(false);
    }
  };

  const resendOtp = async (email: string): Promise<AuthResult> => {
    try {
      const resData = await api.post('/api/auth/resend-otp', { email });
      return {
        success: true,
        message: resData.message
      };
    } catch (err: any) {
      console.error('Resend OTP error', err);
      return {
        success: false,
        error: err?.data?.error || err.message || 'فشل إعادة إرسال الرمز.',
        cooldownRemaining: err?.data?.cooldownRemaining
      };
    }
  };

  const checkAdminSession = async (): Promise<{ hasValidAdminSession: boolean; email?: string }> => {
    try {
      const data = await api.get('/api/auth/session-status');
      return {
        hasValidAdminSession: !!data?.hasValidAdminSession,
        email: data?.email
      };
    } catch {
      return { hasValidAdminSession: false };
    }
  };

  const quickLogin = async (): Promise<AuthResult> => {
    setIsLoading(true);
    try {
      const data = await api.post('/api/auth/quick-login');
      setToken();

      if (data.user) {
        setUser(data.user);
        try {
          localStorage.setItem(CACHED_USER_KEY, JSON.stringify(data.user));
        } catch {}
        if (data.user.role === 'ADMIN') {
          setCurrentView('admin');
        } else {
          setCurrentView('home');
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return { success: true };
      }

      return {
        success: false,
        error: data.error || 'فشل الدخول السريع.'
      };
    } catch (err: any) {
      console.error('Quick login error:', err);
      if (
        err?.status === 403 &&
        (err?.data?.code?.includes('BANNED') || err?.data?.message?.includes('حظر') || err?.data?.message?.includes('تقييد'))
      ) {
        return {
          success: false,
          error: err.data?.message || 'تم حظر حسابك من قبل إدارة KIROPRO.',
          banInfo: err.data
        };
      }
      return {
        success: false,
        error: err?.data?.error || err?.message || 'لا توجد جلسة نشطة صالحة على هذا المتصفح. يرجى تسجيل الدخول بكلمة المرور.'
      };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      await api.post('/api/auth/logout').catch(() => {});
    } catch (err) {
      console.error('Logout error', err);
    }
    
    clearToken();
    try {
      localStorage.removeItem(CACHED_USER_KEY);
    } catch {}
    setUser(null);
    setIsAccountMenuOpen(false);
    setCurrentView('home');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: Boolean(user),
        isLoading,
        maintenanceMode,
        checkMaintenanceStatus,
        contactChannels,
        primaryWhatsapp,
        refreshContactChannels,
        login,
        register,
        verifyEmail,
        resendOtp,
        quickLogin,
        checkAdminSession,
        logout,
        currentView,
        navigateTo,
        isAccountMenuOpen,
        setIsAccountMenuOpen
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
