/**
 * G2Bulk API Contract Types
 * Source of truth: G2Bulk official API documentation
 * Base URL: https://api.g2bulk.com/v1/
 */

export interface G2BulkUserResponse {
  success: boolean;
  user_id: number;
  username: string;
  first_name: string;
  balance: number;
}

export interface G2BulkGame {
  id: number;
  code: string;
  name: string;
  image_url: string;
}

export interface G2BulkGamesResponse {
  success: boolean;
  games: G2BulkGame[];
}

export interface G2BulkGameFieldsResponse {
  code: string;
  info: {
    fields: string[];
    notes?: string | undefined;
  };
}

export interface G2BulkGameServersResponse {
  code: string;
  servers?: Record<string, string> | undefined;
  detail?: {
    code: string;
    message: string;
  } | undefined;
}

export interface G2BulkCheckPlayerParams {
  game: string;
  user_id: string;
  server_id?: string | undefined;
  charname?: string | undefined;
}

export interface G2BulkCheckPlayerResponse {
  valid: string; // 'valid'
  name: string;
  openid?: string | undefined;
  message?: string | undefined;
}

export interface G2BulkCatalogueItem {
  id: number;
  name: string;
  amount: number;
}

export interface G2BulkCatalogueResponse {
  success: boolean;
  game: {
    code: string;
    name: string;
    image_url: string;
  };
  catalogues: G2BulkCatalogueItem[];
}

export interface G2BulkCreateOrderParams {
  catalogue_name: string;
  player_id: string;
  server_id?: string | undefined;
  charname?: string | undefined;
  remark?: string | undefined;
  callback_url?: string | undefined;
}

export interface G2BulkCreatedOrder {
  order_id: number;
  game: string;
  catalogue: string;
  player_id: string;
  player_name?: string | undefined;
  price: number;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  callback_url?: string | undefined;
}

export interface G2BulkCreateOrderResponse {
  success: boolean;
  message: string;
  order: G2BulkCreatedOrder;
}

export interface G2BulkOrderStatusResponse {
  success: boolean;
  order_id: number;
  game_code?: string | undefined;
  game_name?: string | undefined;
  player_id?: string | undefined;
  player_name?: string | undefined;
  server_id?: string | undefined;
  denom_id?: string | undefined;
  price?: number | undefined;
  status: string; // 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'completed' | 'FAILED' | 'failed' | 'REFUNDED'
  message?: string | undefined;
  delivery_items?: string[] | undefined;
  is_refunded?: boolean | undefined;
  created_at?: string | undefined;
  completed_at?: string | undefined;
}
