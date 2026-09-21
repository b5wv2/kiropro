export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  balance: number;
  currency: string;
  preferred_currency?: 'USD' | 'SDG';
  role: 'CUSTOMER' | 'ADMIN';
  emailVerified?: boolean;
  referral_code?: string;
  createdAt: string;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface LoginCredentials {
  email: string;
  password?: string;
}

export interface RegisterData {
  name: string;
  email: string;
  password?: string;
  preferred_currency?: 'USD' | 'SDG';
  referral_code?: string;
}

export interface AuthResult {
  success: boolean;
  requiresVerification?: boolean;
  email?: string;
  error?: string;
  message?: string;
  cooldownRemaining?: number;
}
