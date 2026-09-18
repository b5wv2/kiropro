import { config } from './config';
import { backendClient, PendingOrder } from './apiClient';
import { telegramBot } from './telegramClient';

interface OrderReminderState {
  orderId: string;
  messageId: number;
  reminderCount: number;
  lastNotifiedAt: number;
}

export class ReminderEngine {
  private activeOrders: Map<string, OrderReminderState> = new Map();
  private isTickRunning = false;
  private timer: NodeJS.Timeout | null = null;

  start() {
    console.log(`[ReminderEngine] Starting reminder scheduler with interval: ${config.reminderIntervalMs}ms...`);
    // Run initial tick immediately, then interval
    this.tick();
    this.timer = setInterval(() => this.tick(), config.reminderIntervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.log('[ReminderEngine] Stopped reminder scheduler.');
  }

  /**
   * Stop reminders for a specific order immediately
   */
  stopOrderReminder(orderId: string) {
    this.activeOrders.delete(orderId);
    console.log(`[ReminderEngine] Reminders stopped for Order #${orderId.slice(0, 8)}`);
  }

  /**
   * Get tracked message ID for an order
   */
  getOrderMessageId(orderId: string): number | undefined {
    return this.activeOrders.get(orderId)?.messageId;
  }

  /**
   * Main scheduler tick with Mutex concurrency protection
   */
  private async tick() {
    if (this.isTickRunning) {
      // Prevent overlapping runs if previous tick took longer than interval
      return;
    }

    this.isTickRunning = true;

    try {
      if (!config.adminChatId) {
        return;
      }

      // 1. Fetch current pending orders from KIROPRO Backend
      const pendingOrders = await backendClient.getPendingOrders();
      const currentOrderIds = new Set(pendingOrders.map(o => o.id));

      // 2. Clean up any orders that are no longer pending (completed or canceled)
      for (const [orderId] of this.activeOrders.entries()) {
        if (!currentOrderIds.has(orderId)) {
          this.activeOrders.delete(orderId);
          console.log(`[ReminderEngine] Order #${orderId.slice(0, 8)} is no longer pending. Reminders purged.`);
        }
      }

      const now = Date.now();

      // 3. Process each pending order
      for (const order of pendingOrders) {
        const existingState = this.activeOrders.get(order.id);

        if (!existingState) {
          // First time seeing this order: Send New Order Alert
          try {
            const text = telegramBot.formatOrderAlertText(order, 0);
            const keyboards = telegramBot.createOrderKeyboards(order.id);
            const sentMsg = await telegramBot.sendMessage(config.adminChatId, text, keyboards);

            this.activeOrders.set(order.id, {
              orderId: order.id,
              messageId: sentMsg.message_id,
              reminderCount: 0,
              lastNotifiedAt: now
            });

            await backendClient.ackOrder(order.id);
            console.log(`[ReminderEngine] New Alert sent for Order #${order.id.slice(0, 8)} (Msg ID: ${sentMsg.message_id})`);
          } catch (sendErr: any) {
            console.error(`[ReminderEngine] Failed to send alert for Order #${order.id}:`, sendErr.message);
          }
        } else {
          // Order already has an alert. Check if interval has elapsed since last notification
          const elapsed = now - existingState.lastNotifiedAt;

          if (elapsed >= config.reminderIntervalMs) {
            existingState.reminderCount += 1;
            existingState.lastNotifiedAt = now;

            try {
              // Update the original message with live reminder count & timestamp to avoid spamming chat
              const updatedText = telegramBot.formatOrderAlertText(order, existingState.reminderCount);
              const keyboards = telegramBot.createOrderKeyboards(order.id);

              await telegramBot.editMessageText(
                config.adminChatId,
                existingState.messageId,
                updatedText,
                keyboards
              );

              await backendClient.ackOrder(order.id);
              console.log(`[ReminderEngine] Order #${order.id.slice(0, 8)} reminder updated (#${existingState.reminderCount})`);
            } catch (editErr: any) {
              // If edit failed (e.g. message was deleted by admin or unmodified), send a fresh reminder ping
              console.warn(`[ReminderEngine] Could not edit message for Order #${order.id.slice(0, 8)}, sending fresh ping:`, editErr.message);
              try {
                const text = telegramBot.formatOrderAlertText(order, existingState.reminderCount);
                const keyboards = telegramBot.createOrderKeyboards(order.id);
                const freshMsg = await telegramBot.sendMessage(config.adminChatId, text, keyboards);
                existingState.messageId = freshMsg.message_id;
              } catch {}
            }
          }
        }
      }
    } catch (err: any) {
      console.error('[ReminderEngine Error in tick]:', err.message);
    } finally {
      this.isTickRunning = false;
    }
  }
}

export const reminderEngine = new ReminderEngine();
