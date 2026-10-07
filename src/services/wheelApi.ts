import { api } from '../lib/api';

export interface PublicWheelPrize {
  id: string;
  name: string;
  description?: string;
  type: string;
  value: number;
  color: string;
  icon: string;
  displayOrder: number;
}

export interface WheelCreditsSummary {
  dailyAvailable: boolean;
  purchaseAvailable: number;
  total: number;
}

export interface WheelStatusResponse {
  isAuthenticated: boolean;
  canSpin: boolean;
  availableSpins: number;
  creditsSummary?: WheelCreditsSummary;
  todaySpin: any | null;
  nextSpinAt: string;
  serverTime: string;
  todayDate: string;
  history: Array<{
    id: string;
    spin_date: string;
    source_type?: 'DAILY' | 'PURCHASE';
    reward_type: string;
    reward_value: number;
    reward_details: any;
    created_at: string;
    prize_name?: string;
    prize_color?: string;
    prize_icon?: string;
  }>;
  prizes: PublicWheelPrize[];
}

export interface SpinResultResponse {
  success: boolean;
  alreadySpun?: boolean;
  canSpin: boolean;
  availableSpins?: number;
  creditsSummary?: WheelCreditsSummary;
  consumedSource?: 'DAILY' | 'PURCHASE';
  message?: string;
  prize?: PublicWheelPrize;
  rewardDetails?: any;
  spin?: any;
  nextSpinAt?: string;
}

export interface AdminWheelPrize {
  id: string;
  name: string;
  description?: string;
  type: string;
  value: number;
  weight: number;
  color: string;
  icon: string;
  is_active: boolean;
  max_winners?: number | null;
  current_winners: number;
  max_total_cost?: number | null;
  current_total_cost: number;
  starts_at?: string | null;
  expires_at?: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface AdminWheelStats {
  overview: {
    totalSpins: number;
    totalRewardCost: number;
    averageRewardCost: number;
    highestReward: number;
    noPrizeCount: number;
    noPrizePercentage: number;
    smallRewardsCount: number;
    smallRewardsPercentage: number;
    highRewardsCount: number;
    highRewardsPercentage: number;
  };
  prizesBreakdown: Array<{
    id: string;
    name: string;
    type: string;
    value: number;
    weight: number;
    color: string;
    is_active: boolean;
    max_winners?: number | null;
    max_total_cost?: number | null;
    current_winners: number;
    current_total_cost: number;
    actual_spin_wins: number;
    actual_spin_cost: number;
  }>;
  recentSpins: Array<{
    id: string;
    user_id: string;
    user_name: string;
    user_email: string;
    spin_date: string;
    reward_type: string;
    reward_value: number;
    reward_details: any;
    created_at: string;
    prize_name?: string;
    prize_color?: string;
  }>;
}

export const wheelApi = {
  // Customer methods
  getStatus: () => api.get<WheelStatusResponse>('/api/wheel/status'),
  spin: () => api.post<SpinResultResponse>('/api/wheel/spin', {}),

  // Admin methods
  getStats: () => api.get<AdminWheelStats>('/api/admin/wheel/stats'),
  getPrizes: () => api.get<AdminWheelPrize[]>('/api/admin/wheel/prizes'),
  createPrize: (data: Partial<AdminWheelPrize>) => api.post<{ success: boolean; prize: AdminWheelPrize }>('/api/admin/wheel/prizes', data),
  updatePrize: (id: string, data: Partial<AdminWheelPrize>) => api.put<{ success: boolean; prize: AdminWheelPrize }>(`/api/admin/wheel/prizes/${id}`, data),
  togglePrize: (id: string) => api.patch<{ success: boolean; prize: AdminWheelPrize }>(`/api/admin/wheel/prizes/${id}/toggle`),
  deletePrize: (id: string) => api.delete<{ success: boolean; message: string }>(`/api/admin/wheel/prizes/${id}`),
};
