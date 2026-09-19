import pool from '../db';
import {
  getPendingTelegramOrders,
  ackTelegramOrder,
  completeUsdtOrder,
  cancelUsdtOrder
} from './cryptoService';

export interface InlineKeyboardButton {
  text: string;
  callback_data: string;
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

interface OrderReminderState {
  orderId: string;
  messageId: number;
  reminderCount: number;
  lastNotifiedAt: number;
}

/**
 * Singleton Telegram Bot Service embedded within the KIROPRO Backend
 */
export class TelegramBotService {
  private static instance: TelegramBotService | null = null;
  private botToken: string = '';
  private adminChatId: string = '';
  private reminderIntervalMs: number = 10000;
  private isRunning: boolean = false;
  private isPollingActive: boolean = false;
  private updateOffset: number = 0;
  private activeOrders: Map<string, OrderReminderState> = new Map();
  private reminderTimer: NodeJS.Timeout | null = null;
  private isTickRunning: boolean = false;

  private constructor() {
    this.botToken = (process.env.BOT_TOKEN || '').trim();
    this.adminChatId = (process.env.ADMIN_TELEGRAM_CHAT_ID || '').trim();
    const parsedInterval = parseInt(process.env.TELEGRAM_REMINDER_INTERVAL_MS || '10000', 10);
    this.reminderIntervalMs = !isNaN(parsedInterval) && parsedInterval >= 3000 ? parsedInterval : 10000;
  }

  public static getInstance(): TelegramBotService {
    if (!TelegramBotService.instance) {
      TelegramBotService.instance = new TelegramBotService();
    }
    return TelegramBotService.instance;
  }

  /**
   * Safe Telegram API Call Helper
   */
  private async callTelegramApi<T = any>(method: string, body: Record<string, any>): Promise<T> {
    if (!this.botToken) {
      throw new Error('BOT_TOKEN is not configured.');
    }

    const response = await fetch(`https://api.telegram.org/bot${this.botToken}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data: any = await response.json();
    if (!data.ok) {
      throw new Error(data.description || `Telegram API error on ${method}`);
    }

    return data.result as T;
  }

  public async sendMessage(chatId: string | number, text: string, replyMarkup?: InlineKeyboardMarkup): Promise<any> {
    return this.callTelegramApi('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      reply_markup: replyMarkup
    });
  }

  public async editMessageText(chatId: string | number, messageId: number, text: string, replyMarkup?: InlineKeyboardMarkup): Promise<any> {
    return this.callTelegramApi('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: 'HTML',
      reply_markup: replyMarkup
    });
  }

  public async answerCallbackQuery(callbackQueryId: string, text?: string, showAlert = false): Promise<any> {
    return this.callTelegramApi('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text,
      show_alert: showAlert
    });
  }

  public async getUpdates(offset?: number, timeout = 20): Promise<any[]> {
    return this.callTelegramApi('getUpdates', {
      offset,
      timeout,
      allowed_updates: ['message', 'callback_query']
    });
  }

  /**
   * Format message text for orders
   */
  public formatOrderAlertText(order: any, reminderCount: number = 0): string {
    const shortRef = order.id.slice(0, 8).toUpperCase();
    const customer = order.userName || order.userEmail || order.userId?.slice(0, 8) || 'عميل';
    const valueFormatted = `${Number(order.chargedAmount).toLocaleString()} ${order.chargedCurrency || 'SDG'}`;
    const reminderBadge = reminderCount > 0 ? ` <i>(تذكير #${reminderCount})</i>` : '';

    return [
      `🚨 <b>طلب USDT جديد</b>${reminderBadge}`,
      ``,
      `<b>Amount:</b> <code>${order.usdtAmount} USDT</code>`,
      `<b>Network:</b> <code>${order.cryptoNetwork}</code>`,
      `<b>Wallet:</b> <code>${order.walletAddress}</code>`,
      `<b>Customer:</b> ${customer}`,
      `<b>Order ID:</b> <code>#${shortRef}</code>`,
      `<b>Value:</b> ${valueFormatted}`,
      `<b>Status:</b> ⏳ في انتظار التحويل`,
      ``,
      `<i>يرجى تحويل المبلغ من محفظتك إلى العنوان أعلاه ثم الضغط على [تم التحويل].</i>`
    ].join('\n');
  }

  public createOrderKeyboards(orderId: string): InlineKeyboardMarkup {
    return {
      inline_keyboard: [
        [
          { text: '✅ تم التحويل', callback_data: `prompt_complete:${orderId}` },
          { text: '❌ إلغاء الطلب', callback_data: `prompt_cancel:${orderId}` }
        ]
      ]
    };
  }

  public createConfirmationKeyboards(orderId: string): InlineKeyboardMarkup {
    return {
      inline_keyboard: [
        [
          { text: '⚠️ نعم، تأكيد إتمام التحويل', callback_data: `confirm_complete:${orderId}` }
        ],
        [
          { text: '↩️ تراجع', callback_data: `back_to_alert:${orderId}` }
        ]
      ]
    };
  }

  public createCancelKeyboards(orderId: string): InlineKeyboardMarkup {
    return {
      inline_keyboard: [
        [
          { text: '🚨 تأكيد إلغاء الطلب ورد الرصيد', callback_data: `confirm_cancel:${orderId}` }
        ],
        [
          { text: '↩️ تراجع', callback_data: `back_to_alert:${orderId}` }
        ]
      ]
    };
  }

  /**
   * Handles button clicks in Telegram
   */
  private async handleCallbackQuery(query: any) {
    const queryId = query.id;
    const from = query.from;
    const data = String(query.data || '');
    const message = query.message;

    const adminName = [from?.first_name, from?.last_name].filter(Boolean).join(' ') || from?.username || String(from?.id);
    const adminTelegramId = String(from?.id || '');

    // Restrict callback execution strictly to authorized ADMIN_TELEGRAM_CHAT_ID if configured
    if (this.adminChatId && String(message.chat.id) !== this.adminChatId && adminTelegramId !== this.adminChatId) {
      await this.answerCallbackQuery(queryId, 'غير مصرح لك بتنفيذ هذه العملية.', true);
      return;
    }

    try {
      // 1. Prompt Complete Confirmation
      if (data.startsWith('prompt_complete:')) {
        const orderId = data.replace('prompt_complete:', '');
        const pendingOrders = await getPendingTelegramOrders();
        const order = pendingOrders.find(o => o.id === orderId);

        if (!order) {
          await this.answerCallbackQuery(queryId, 'الطلب غير موجود أو تمت معالجته مسبقاً.', true);
          return;
        }

        const promptText = [
          `⚠️ <b>تأكيد تحويل USDT</b>`,
          ``,
          `هل تم بالفعل تحويل:`,
          `💰 <b>${order.usdtAmount} USDT</b>`,
          `🌐 على شبكة: <b>${order.cryptoNetwork}</b>`,
          `📍 إلى عنوان المحفظة:`,
          `<code>${order.walletAddress}</code>`,
          ``,
          `<i>بالضغط على تأكيد، ستكتمل المعاملة نهائياً وسيتم إشعار العميل بالبريد الإلكتروني.</i>`
        ].join('\n');

        await this.editMessageText(message.chat.id, message.message_id, promptText, this.createConfirmationKeyboards(orderId));
        await this.answerCallbackQuery(queryId);
        return;
      }

      // 2. Confirm Complete
      if (data.startsWith('confirm_complete:')) {
        const orderId = data.replace('confirm_complete:', '');
        await this.answerCallbackQuery(queryId, 'جاري إتمام الطلب...');

        try {
          await completeUsdtOrder({
            orderId,
            adminId: undefined
          });

          // Stop reminders for this order
          this.activeOrders.delete(orderId);
          console.log(`[TelegramBot] Order completed: #${orderId.slice(0, 8)} by ${adminName}`);

          const successText = [
            `✅ <b>تم إتمام التحويل بنجاح</b>`,
            ``,
            `<b>رقم الطلب:</b> <code>#${orderId.slice(0, 8).toUpperCase()}</code>`,
            `<b>تم التنفيذ بواسطة:</b> ${adminName} (@${from?.username || adminTelegramId})`,
            `<b>الحالة:</b> مكتمل (COMPLETED)`,
            `<b>تاريخ الإكمال:</b> ${new Date().toLocaleString('ar-SA')}`,
            ``,
            `<i>تم خصم المخزون نهائياً، وتوقفت تنبيهات التيليجرام، وأُرسل بريد التأكيد للعميل تلقائياً.</i>`
          ].join('\n');

          await this.editMessageText(message.chat.id, message.message_id, successText);
        } catch (err: any) {
          console.error('[TelegramBot] Failed to complete order via button:', err.message);
          await this.answerCallbackQuery(queryId, `خطأ: ${err.message}`, true);
        }
        return;
      }

      // 3. Prompt Cancel Confirmation
      if (data.startsWith('prompt_cancel:')) {
        const orderId = data.replace('prompt_cancel:', '');

        const cancelPromptText = [
          `🚨 <b>تأكيد إلغاء طلب USDT</b>`,
          ``,
          `هل أنت متأكد من رغبتك في إلغاء الطلب <code>#${orderId.slice(0, 8).toUpperCase()}</code>؟`,
          ``,
          `⚠️ <b>سيتم:</b>`,
          `1. فك حجز كمية USDT وإعادتها للمخزون المتاح فوراً.`,
          `2. إعادة المبلغ المدفوع بالكامل إلى رصيد محفظة العميل.`,
          `3. إيقاف تنبيهات وتذكيرات هذا الطلب.`
        ].join('\n');

        await this.editMessageText(message.chat.id, message.message_id, cancelPromptText, this.createCancelKeyboards(orderId));
        await this.answerCallbackQuery(queryId);
        return;
      }

      // 4. Confirm Cancel
      if (data.startsWith('confirm_cancel:')) {
        const orderId = data.replace('confirm_cancel:', '');
        await this.answerCallbackQuery(queryId, 'جاري إلغاء الطلب...');

        try {
          await cancelUsdtOrder({
            orderId,
            adminId: undefined,
            reason: `إلغاء عبر بوت التيليجرام بواسطة ${adminName}`
          });

          this.activeOrders.delete(orderId);
          console.log(`[TelegramBot] Order canceled: #${orderId.slice(0, 8)} by ${adminName}`);

          const canceledText = [
            `❌ <b>تم إلغاء الطلب ورد الرصيد بنجاح</b>`,
            ``,
            `<b>رقم الطلب:</b> <code>#${orderId.slice(0, 8).toUpperCase()}</code>`,
            `<b>الملغي:</b> ${adminName} (@${from?.username || adminTelegramId})`,
            `<b>الحالة:</b> ملغي (CANCELED)`,
            ``,
            `<i>تم رد كامل المبلغ إلى رصيد محفظة العميل وإعادة كمية الـ USDT للمخزون المتاح.</i>`
          ].join('\n');

          await this.editMessageText(message.chat.id, message.message_id, canceledText);
        } catch (err: any) {
          console.error('[TelegramBot] Failed to cancel order via button:', err.message);
          await this.answerCallbackQuery(queryId, `خطأ: ${err.message}`, true);
        }
        return;
      }

      // 5. Back to alert
      if (data.startsWith('back_to_alert:')) {
        const orderId = data.replace('back_to_alert:', '');
        const pendingOrders = await getPendingTelegramOrders();
        const order = pendingOrders.find(o => o.id === orderId);

        if (order) {
          const text = this.formatOrderAlertText(order, 0);
          await this.editMessageText(message.chat.id, message.message_id, text, this.createOrderKeyboards(orderId));
        }
        await this.answerCallbackQuery(queryId, 'تم التراجع.');
        return;
      }

      await this.answerCallbackQuery(queryId);
    } catch (err: any) {
      console.error('[TelegramBot] Error in handleCallbackQuery:', err.message);
    }
  }

  /**
   * 10-Second Reminder Loop with Concurrency Protection
   */
  private async reminderTick() {
    if (this.isTickRunning || !this.isRunning) return;
    this.isTickRunning = true;

    try {
      if (!this.adminChatId) {
        return;
      }

      // Fetch pending orders directly from DB
      const pendingOrders = await getPendingTelegramOrders();
      const currentOrderIds = new Set(pendingOrders.map(o => o.id));

      // Clean up no-longer-pending orders
      for (const [orderId] of this.activeOrders.entries()) {
        if (!currentOrderIds.has(orderId)) {
          this.activeOrders.delete(orderId);
        }
      }

      const now = Date.now();

      for (const order of pendingOrders) {
        const existingState = this.activeOrders.get(order.id);

        if (!existingState) {
          // Send initial notification
          try {
            console.log(`[TelegramBot] New USDT order notification for #${order.id.slice(0, 8)}`);
            const text = this.formatOrderAlertText(order, 0);
            const keyboards = this.createOrderKeyboards(order.id);
            const sentMsg = await this.sendMessage(this.adminChatId, text, keyboards);

            this.activeOrders.set(order.id, {
              orderId: order.id,
              messageId: sentMsg.message_id,
              reminderCount: 0,
              lastNotifiedAt: now
            });

            await ackTelegramOrder(order.id);
          } catch (sendErr: any) {
            console.error(`[TelegramBot] Failed to send alert for #${order.id.slice(0, 8)}:`, sendErr.message);
          }
        } else {
          // Check if interval has elapsed since last reminder
          const elapsed = now - existingState.lastNotifiedAt;

          if (elapsed >= this.reminderIntervalMs) {
            existingState.reminderCount += 1;
            existingState.lastNotifiedAt = now;

            try {
              const updatedText = this.formatOrderAlertText(order, existingState.reminderCount);
              const keyboards = this.createOrderKeyboards(order.id);

              await this.editMessageText(
                this.adminChatId,
                existingState.messageId,
                updatedText,
                keyboards
              );

              await ackTelegramOrder(order.id);
            } catch (editErr: any) {
              // If message was deleted or cannot be edited, send new reminder message
              try {
                const newText = this.formatOrderAlertText(order, existingState.reminderCount);
                const sent = await this.sendMessage(this.adminChatId, newText, this.createOrderKeyboards(order.id));
                existingState.messageId = sent.message_id;
                await ackTelegramOrder(order.id);
              } catch (retryErr: any) {
                console.warn('[TelegramBot] Could not update reminder message:', retryErr.message);
              }
            }
          }
        }
      }
    } catch (err: any) {
      console.error('[TelegramBot] Reminder loop error:', err.message);
    } finally {
      this.isTickRunning = false;
    }
  }

  /**
   * Telegram Long-Polling Updates Loop
   */
  private async startUpdatesPolling() {
    if (this.isPollingActive) return;
    this.isPollingActive = true;

    while (this.isRunning) {
      try {
        if (!this.botToken) {
          await new Promise(r => setTimeout(r, 5000));
          continue;
        }

        const updates = await this.getUpdates(this.updateOffset, 20);

        for (const update of updates) {
          this.updateOffset = Math.max(this.updateOffset, update.update_id + 1);

          if (update.callback_query) {
            await this.handleCallbackQuery(update.callback_query);
          } else if (update.message?.text === '/start') {
            await this.sendMessage(
              update.message.chat.id,
              `👋 مرحباً بك في بوت إدارة تحويلات <b>KIROPRO USDT</b>.\nمعرف الدردشة الخاص بك هو: <code>${update.message.chat.id}</code>\nقم بتعيين هذا المعرف في متغير <code>ADMIN_TELEGRAM_CHAT_ID</code> في لوحة Railway.`
            );
          } else if (update.message?.text === '/status') {
            const pending = await getPendingTelegramOrders().catch(() => []);
            await this.sendMessage(
              update.message.chat.id,
              `📊 <b>حالة تحويلات USDT:</b>\nعدد الطلبات في انتظار التحويل: <b>${pending.length}</b>`
            );
          }
        }
      } catch (err: any) {
        // Log warning but continue polling gracefully without crashing server
        console.warn('[TelegramBot] Polling warning:', err.message);
        await new Promise(r => setTimeout(r, 4000));
      }
    }

    this.isPollingActive = false;
  }

  /**
   * Starts the Telegram Bot Service (Singleton guarantee)
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[TelegramBot] Service already running. Ignoring duplicate start call.');
      return;
    }

    console.log('[TelegramBot] Starting...');

    if (!this.botToken) {
      console.warn('[TelegramBot] BOT_TOKEN is not configured in environment variables. Telegram bot service disabled.');
      return;
    }

    if (!this.adminChatId) {
      console.warn('[TelegramBot] ADMIN_TELEGRAM_CHAT_ID is not configured. Notifications will be paused until ID is provided.');
    }

    try {
      // Verify token with getMe
      const botInfo: any = await this.callTelegramApi('getMe', {});
      console.log(`[TelegramBot] Connected (@${botInfo.username || 'bot'})`);

      this.isRunning = true;

      // Start 10-second reminder scheduler
      console.log(`[TelegramBot] Reminder scheduler started (interval: ${this.reminderIntervalMs}ms)`);
      this.reminderTick();
      this.reminderTimer = setInterval(() => this.reminderTick(), this.reminderIntervalMs);

      // Start Polling asynchronously in background
      this.startUpdatesPolling().catch(err => {
        console.error('[TelegramBot] Fatal error in polling loop:', err);
      });
    } catch (err: any) {
      console.error('[TelegramBot] Failed to connect to Telegram API:', err.message);
      // Isolated failure: do not throw to allow Express server to continue operating normally
    }
  }

  /**
   * Graceful Shutdown
   */
  public stop(): void {
    if (!this.isRunning) return;
    console.log('[TelegramBot] Stopping...');
    this.isRunning = false;

    if (this.reminderTimer) {
      clearInterval(this.reminderTimer);
      this.reminderTimer = null;
    }

    this.activeOrders.clear();
    console.log('[TelegramBot] Stopped successfully.');
  }
}

export const telegramBotService = TelegramBotService.getInstance();
export default telegramBotService;
