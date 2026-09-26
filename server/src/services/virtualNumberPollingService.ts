import pool from '../db';
import { virtualNumberService } from './virtualNumberService';

export class VirtualNumberPollingService {
  private intervalRef: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private readonly pollIntervalMs = 4000; // Poll every 4 seconds

  public start() {
    if (this.intervalRef) return;

    this.intervalRef = setInterval(() => {
      this.tick();
    }, this.pollIntervalMs);

    console.log('[VirtualNumberPolling] Service started (interval: 4s)');
  }

  public stop() {
    if (this.intervalRef) {
      clearInterval(this.intervalRef);
      this.intervalRef = null;
      console.log('[VirtualNumberPolling] Service stopped');
    }
  }

  private async tick() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      // Find orders that are currently waiting for SMS code and not yet expired
      const activeOrdersRes = await pool.query(
        `SELECT id, provider_order_id, expires_at 
         FROM virtual_number_orders 
         WHERE status = 'WAITING_FOR_CODE' 
           AND provider_order_id IS NOT NULL 
         ORDER BY created_at ASC 
         LIMIT 20`
      );

      if (activeOrdersRes.rows.length === 0) {
        return;
      }

      for (const order of activeOrdersRes.rows) {
        try {
          await virtualNumberService.checkAndUpdateOrder(order.id);
        } catch (err: any) {
          // Log without sensitive data
          console.warn(`[VirtualNumberPolling] Error checking order ${order.id}:`, err.message);
        }
      }
    } catch (err: any) {
      console.warn('[VirtualNumberPolling] Polling tick error:', err.message);
    } finally {
      this.isProcessing = false;
    }
  }
}

export const virtualNumberPollingService = new VirtualNumberPollingService();
