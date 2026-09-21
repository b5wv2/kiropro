import React, { createContext, useContext, useState, useEffect } from 'react';
import { formatCurrency } from '../lib/formatters';
import { useAuth } from './AuthContext';
import { useOverlay } from './OverlayContext';
import { api } from '../lib/api';

interface WalletContextType {
  balance: number;
  currency: string;
  exchangeRate: number;
  formattedBalance: string;
  pendingBalance: number;
  formattedPendingBalance: string;
  deposit: (amount: number) => Promise<void>;
  deduct: (amount: number, description?: string) => Promise<boolean>;
  openDepositModal: () => void;
  closeDepositModal: () => void;
  toastMessage: string | null;
  toastType: 'success' | 'warning' | 'info';
  showToast: (msg: string, type?: 'success' | 'warning' | 'info') => void;
  refreshBalance: () => Promise<void>;
  topupRequests: any[];
  fetchTopups: () => Promise<void>;
  submitTopupRequest: (formData: FormData) => Promise<{ success: boolean; message?: string; topup?: any }>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAuthenticated, navigateTo } = useAuth();
  const { openOverlay, closeOverlay } = useOverlay();
  const [balance, setBalance] = useState<number>(user ? user.balance : 0);
  const [currency, setCurrency] = useState<string>(user?.currency || user?.preferred_currency || 'SDG');
  const [exchangeRate, setExchangeRate] = useState<number>(7600);
  const [pendingBalance, setPendingBalance] = useState<number>(0);
  const [topupRequests, setTopupRequests] = useState<any[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'success' | 'warning' | 'info'>('info');

  const fetchExchangeRate = async () => {
    try {
      const res = await api.get<{ exchangeRate: number }>('/api/wallet/rate');
      if (res?.exchangeRate) {
        setExchangeRate(Number(res.exchangeRate));
      }
    } catch (err) {
      console.error('Failed to fetch exchange rate', err);
    }
  };

  useEffect(() => {
    fetchExchangeRate();
  }, []);

  const fetchTopups = async (currentCurr: string = currency) => {
    if (!isAuthenticated) return;
    try {
      const data = await api.get<any[]>('/api/topups');
      setTopupRequests(data);
      const pendingSum = data
        .filter(t => t.status === 'PENDING')
        .reduce((sum, t) => {
          if (currentCurr === 'SDG') {
            return sum + parseFloat(t.amount_sdg || t.requested_amount || 0);
          }
          return sum + parseFloat(t.amount_usd || 0);
        }, 0);
      setPendingBalance(pendingSum);
    } catch (err) {
      console.error('Failed to fetch user topups', err);
    }
  };

  // Synchronize balance with logged in user and fetch pending topups
  useEffect(() => {
    if (user) {
      const curr = user.currency || user.preferred_currency || 'SDG';
      setBalance(user.balance);
      setCurrency(curr);
      fetchTopups(curr);
    } else {
      setBalance(0);
      setCurrency('SDG');
      setPendingBalance(0);
      setTopupRequests([]);
    }
  }, [user, isAuthenticated]);

  const showToast = (msg: string, type: 'success' | 'warning' | 'info' = 'info') => {
    setToastMessage(msg);
    setToastType(type);
    setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  };

  // Deprecated direct auto-credit: Now opens the manual transfer deposit modal
  const deposit = async (_amount: number) => {
    if (!isAuthenticated) {
      showToast('يرجى تسجيل الدخول أولاً لإيداع الرصيد', 'warning');
      navigateTo('login');
      return;
    }
    openDepositModal();
  };

  const submitTopupRequest = async (formData: FormData) => {
    if (!isAuthenticated) {
      showToast('يرجى تسجيل الدخول أولاً لتقديم طلب الشحن', 'warning');
      navigateTo('login');
      return { success: false, message: 'Unauthorized' };
    }

    try {
      const res = await api.upload('/api/topups', formData);
      showToast(res.message || 'تم استلام طلب شحن محفظتك وسيتم مراجعته.', 'success');
      await fetchTopups();
      return { success: true, message: res.message, topup: res.topup };
    } catch (err: any) {
      console.error('Failed to submit topup', err);
      const errMsg = err?.data?.error || err.message || 'فشل إرسال طلب الشحن';
      showToast(errMsg, 'warning');
      return { success: false, message: errMsg };
    }
  };

  const deduct = async (amount: number, description?: string): Promise<boolean> => {
    if (!isAuthenticated) {
      showToast('يرجى تسجيل الدخول أولاً لإتمام الطلب', 'warning');
      navigateTo('login');
      return false;
    }
    if (balance < amount) {
      showToast('الرصيد غير كافٍ لإتمام هذا الطلب', 'warning');
      return false;
    }
    
    try {
      const data = await api.post('/api/wallet/checkout', { amount, description });
      setBalance(data.balance);
      
      if (user) {
        user.balance = data.balance;
      }
      
      return true;
    } catch (err) {
      console.error(err);
      showToast('حدث خطأ أثناء الدفع', 'warning');
      return false;
    }
  };

  const refreshBalance = async () => {
    if (!isAuthenticated) return;
    try {
      const data = await api.get('/api/auth/me');
      const curr = data.user.currency || data.user.preferred_currency || 'USD';
      setBalance(data.user.balance);
      setCurrency(curr);
      if (user) {
        user.balance = data.user.balance;
        user.currency = curr;
      }
      await fetchTopups(curr);
    } catch (err) {
      console.error(err);
    }
  };

  const openDepositModal = () => {
    if (!isAuthenticated) {
      showToast('يرجى تسجيل الدخول لإدارة الرصيد', 'info');
      navigateTo('login');
      return;
    }
    openOverlay('wallet');
  };

  const closeDepositModal = () => closeOverlay();

  return (
    <WalletContext.Provider
      value={{
        balance,
        currency,
        exchangeRate,
        formattedBalance: isAuthenticated ? formatCurrency(balance, currency) : 'تسجيل الدخول',
        pendingBalance,
        formattedPendingBalance: formatCurrency(pendingBalance, currency),
        deposit,
        deduct,
        openDepositModal,
        closeDepositModal,
        toastMessage,
        toastType,
        showToast,
        refreshBalance,
        topupRequests,
        fetchTopups,
        submitTopupRequest
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};

export const useWallet = (): WalletContextType => {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
};
