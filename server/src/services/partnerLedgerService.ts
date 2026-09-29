import { PoolClient } from 'pg';
import pool from '../db';
import { v4 as uuidv4 } from 'uuid';

export type PartnerLedgerType = 
  | 'DEPOSIT' 
  | 'PURCHASE' 
  | 'REFUND' 
  | 'MANUAL_CREDIT' 
  | 'MANUAL_DEBIT' 
  | 'BONUS' 
  | 'ADJUSTMENT';

export interface PartnerLedgerEntry {
  partnerId: string;
  type: PartnerLedgerType;
  amount: number;
  currency?: string;
  referenceId?: string | null;
  referenceType?: 'ORDER' | 'DEPOSIT' | 'MANUAL' | 'ADMIN_ADJUSTMENT' | null;
  actorId?: string | null;
  actorType?: 'PARTNER' | 'ADMIN' | 'SYSTEM';
  description: string;
}

export interface WalletOperationResult {
  success: boolean;
  walletId: string;
  partnerId: string;
  balanceBefore: number;
  balanceAfter: number;
  amount: number;
  ledgerId: string;
}

export class PartnerLedgerService {
  /**
   * Safe Credit Operation with row-level lock and immutable ledger entry.
   * Can be executed inside an existing client transaction or will manage its own.
   */
  public async credit(
    params: PartnerLedgerEntry,
    externalClient?: PoolClient
  ): Promise<WalletOperationResult> {
    const client = externalClient || await pool.connect();
    const shouldManageTx = !externalClient;

    const numAmount = Math.round(Number(params.amount) * 10000) / 10000;
    if (numAmount <= 0) {
      throw new Error('المبلغ المراد إيداعه يجب أن يكون أكبر من الصفر.');
    }

    try {
      if (shouldManageTx) await client.query('BEGIN');

      // 1. Lock partner wallet row for update
      const walletRes = await client.query(
        `SELECT id, balance, total_deposited_usd 
         FROM partner_wallets 
         WHERE partner_id = $1 
         FOR UPDATE`,
        [params.partnerId]
      );

      if (walletRes.rows.length === 0) {
        throw new Error('محفظة الشريك غير موجودة.');
      }

      const wallet = walletRes.rows[0];
      const balanceBefore = Number(wallet.balance);
      const balanceAfter = Math.round((balanceBefore + numAmount) * 10000) / 10000;
      const isDeposit = params.type === 'DEPOSIT';

      // 2. Update wallet balance
      await client.query(
        `UPDATE partner_wallets 
         SET balance = $1,
             total_deposited_usd = total_deposited_usd + $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [balanceAfter, isDeposit ? numAmount : 0, wallet.id]
      );

      // 3. Record in immutable ledger
      const ledgerId = uuidv4();
      await client.query(
        `INSERT INTO partner_ledger (
          id, partner_id, wallet_id, type, amount, currency,
          balance_before, balance_after, reference_id, reference_type,
          status, actor_id, actor_type, description
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          ledgerId,
          params.partnerId,
          wallet.id,
          params.type,
          numAmount,
          params.currency || 'USD',
          balanceBefore,
          balanceAfter,
          params.referenceId || null,
          params.referenceType || null,
          'COMPLETED',
          params.actorId || null,
          params.actorType || 'SYSTEM',
          params.description
        ]
      );

      if (shouldManageTx) await client.query('COMMIT');

      return {
        success: true,
        walletId: wallet.id,
        partnerId: params.partnerId,
        balanceBefore,
        balanceAfter,
        amount: numAmount,
        ledgerId
      };
    } catch (err: any) {
      if (shouldManageTx) await client.query('ROLLBACK');
      throw err;
    } finally {
      if (shouldManageTx) client.release();
    }
  }

  /**
   * Safe Debit Operation with row-level lock, non-negative balance check,
   * and immutable ledger recording.
   */
  public async debit(
    params: PartnerLedgerEntry,
    externalClient?: PoolClient
  ): Promise<WalletOperationResult> {
    const client = externalClient || await pool.connect();
    const shouldManageTx = !externalClient;

    const numAmount = Math.round(Number(params.amount) * 10000) / 10000;
    if (numAmount <= 0) {
      throw new Error('المبلغ المراد خصمه يجب أن يكون أكبر من الصفر.');
    }

    try {
      if (shouldManageTx) await client.query('BEGIN');

      // 1. Lock partner wallet row for update
      const walletRes = await client.query(
        `SELECT id, balance, total_spent_usd 
         FROM partner_wallets 
         WHERE partner_id = $1 
         FOR UPDATE`,
        [params.partnerId]
      );

      if (walletRes.rows.length === 0) {
        throw new Error('محفظة الشريك غير موجودة.');
      }

      const wallet = walletRes.rows[0];
      const balanceBefore = Number(wallet.balance);

      // Strict balance check
      if (balanceBefore < numAmount) {
        throw new Error('رصيد المحفظة غير كافٍ لإتمام العملية.');
      }

      const balanceAfter = Math.round((balanceBefore - numAmount) * 10000) / 10000;
      const isPurchase = params.type === 'PURCHASE';

      // 2. Update wallet balance
      await client.query(
        `UPDATE partner_wallets 
         SET balance = $1,
             total_spent_usd = total_spent_usd + $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [balanceAfter, isPurchase ? numAmount : 0, wallet.id]
      );

      // 3. Record in immutable ledger
      const ledgerId = uuidv4();
      await client.query(
        `INSERT INTO partner_ledger (
          id, partner_id, wallet_id, type, amount, currency,
          balance_before, balance_after, reference_id, reference_type,
          status, actor_id, actor_type, description
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          ledgerId,
          params.partnerId,
          wallet.id,
          params.type,
          numAmount,
          params.currency || 'USD',
          balanceBefore,
          balanceAfter,
          params.referenceId || null,
          params.referenceType || null,
          'COMPLETED',
          params.actorId || null,
          params.actorType || 'SYSTEM',
          params.description
        ]
      );

      if (shouldManageTx) await client.query('COMMIT');

      return {
        success: true,
        walletId: wallet.id,
        partnerId: params.partnerId,
        balanceBefore,
        balanceAfter,
        amount: numAmount,
        ledgerId
      };
    } catch (err: any) {
      if (shouldManageTx) await client.query('ROLLBACK');
      throw err;
    } finally {
      if (shouldManageTx) client.release();
    }
  }

  /**
   * Highly secure, idempotent refund operation that prevents Double Refund.
   */
  public async executeSafeOrderRefund(params: {
    orderId: string;
    partnerId: string;
    refundAmountUsd: number;
    reason: string;
    actorId?: string | null;
    actorType?: 'SYSTEM' | 'ADMIN';
  }, externalClient?: PoolClient): Promise<boolean> {
    const client = externalClient || await pool.connect();
    const shouldManageTx = !externalClient;

    try {
      if (shouldManageTx) await client.query('BEGIN');

      // 1. Check order status under row lock
      const orderRes = await client.query(
        `SELECT id, status, partner_price_usd 
         FROM partner_orders 
         WHERE id = $1 
         FOR UPDATE`,
        [params.orderId]
      );

      if (orderRes.rows.length === 0) {
        throw new Error('الطلب غير موجود.');
      }

      const order = orderRes.rows[0];
      if (order.status === 'REFUNDED') {
        console.warn(`[SafeRefund] Order ${params.orderId} is already REFUNDED. Skipping double refund.`);
        if (shouldManageTx) await client.query('ROLLBACK');
        return false;
      }

      // 2. Strict Double Refund Check in Ledger
      const existingRefund = await client.query(
        `SELECT id FROM partner_ledger 
         WHERE reference_id = $1 AND type = 'REFUND' 
         LIMIT 1`,
        [params.orderId]
      );

      if (existingRefund.rows.length > 0) {
        console.warn(`[SafeRefund] Ledger refund entry already exists for order ${params.orderId}. Skipping.`);
        if (shouldManageTx) await client.query('ROLLBACK');
        return false;
      }

      // 3. Mark order as REFUNDED atomically
      await client.query(
        `UPDATE partner_orders 
         SET status = 'REFUNDED', 
             failure_reason = COALESCE(failure_reason, $1),
             completed_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [params.reason, params.orderId]
      );

      // 4. Re-credit partner wallet
      await this.credit({
        partnerId: params.partnerId,
        type: 'REFUND',
        amount: params.refundAmountUsd,
        currency: 'USD',
        referenceId: params.orderId,
        referenceType: 'ORDER',
        actorId: params.actorId || null,
        actorType: params.actorType || 'SYSTEM',
        description: `استرجاع رصيد الطلب #${params.orderId.slice(0, 8)}: ${params.reason}`
      }, client);

      if (shouldManageTx) await client.query('COMMIT');
      return true;
    } catch (err: any) {
      if (shouldManageTx) await client.query('ROLLBACK');
      throw err;
    } finally {
      if (shouldManageTx) client.release();
    }
  }

  /**
   * Fetch Partner Ledger History
   */
  public async getHistory(params: {
    partnerId: string;
    limit?: number;
    offset?: number;
    type?: string;
  }) {
    const limit = Math.min(Math.max(params.limit || 50, 1), 100);
    const offset = Math.max(params.offset || 0, 0);

    const values: any[] = [params.partnerId, limit, offset];
    let typeClause = '';
    if (params.type && params.type !== 'ALL') {
      typeClause = `AND type = $4`;
      values.push(params.type);
    }

    const query = `
      SELECT 
        l.id, l.type, l.amount, l.currency,
        l.balance_before as "balanceBefore",
        l.balance_after as "balanceAfter",
        l.reference_id as "referenceId",
        l.reference_type as "referenceType",
        l.status, l.actor_type as "actorType",
        l.description, l.created_at as "createdAt"
      FROM partner_ledger l
      WHERE l.partner_id = $1
      ${typeClause}
      ORDER BY l.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const countQuery = `
      SELECT COUNT(*) as count 
      FROM partner_ledger 
      WHERE partner_id = $1 
      ${typeClause}
    `;

    const countValues = params.type && params.type !== 'ALL' ? [params.partnerId, params.type] : [params.partnerId];

    const [rowsRes, countRes] = await Promise.all([
      pool.query(query, values),
      pool.query(countQuery, countValues)
    ]);

    return {
      total: parseInt(countRes.rows[0].count, 10),
      items: rowsRes.rows
    };
  }
}

export const partnerLedgerService = new PartnerLedgerService();
