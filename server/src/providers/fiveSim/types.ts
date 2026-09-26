// 5SIM Official API Types strictly matching the official documentation

export interface FiveSimProfile {
  id: number;
  email: string;
  vendor?: string;
  default_forwarding_number?: string;
  balance: number;
  rating: number;
  default_country?: {
    name: string;
    iso: string;
    prefix: string;
  };
  default_operator?: {
    name: string;
  };
  frozen_balance: number;
}

export interface FiveSimSmsItem {
  id?: number;
  created_at: string;
  date?: string;
  sender: string;
  text: string;
  code: string;
}

export interface FiveSimOrderResponse {
  id: number;
  phone: string;
  operator: string;
  product: string;
  price: number;
  status: 'PENDING' | 'RECEIVED' | 'CANCELED' | 'TIMEOUT' | 'FINISHED' | 'BANNED';
  expires: string;
  sms: FiveSimSmsItem[] | null;
  created_at: string;
  forwarding?: boolean;
  forwarding_number?: string;
  country: string;
}

export interface FiveSimPriceItem {
  cost: number;
  count: number;
  rate?: number;
}

export type FiveSimPricesResponse = Record<string, Record<string, Record<string, FiveSimPriceItem>>>;

export interface FiveSimProductItem {
  Category: string;
  Qty: number;
  Price: number;
}

export type FiveSimProductsResponse = Record<string, FiveSimProductItem>;

export interface FiveSimApiError {
  status: number;
  message: string;
  details?: any;
}
