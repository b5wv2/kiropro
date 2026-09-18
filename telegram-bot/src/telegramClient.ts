import { config } from './config';
import { PendingOrder } from './apiClient';

export interface InlineKeyboardButton {
  text: string;
  callback_data: string;
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

export class TelegramBotClient {
  private token: string;
  private apiBase: string;

  constructor() {
    this.token = config.botToken;
    this.apiBase = `https://api.telegram.org/bot${this.token}`;
  }

  private async callApi<T>(method: string, body: Record<string, any>): Promise<T> {
    if (!this.token) {
      throw new Error('BOT_TOKEN is not configured.');
    }

    const response = await fetch(`${this.apiBase}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await response.json();
    if (!data.ok) {
      throw new Error(data.description || `Telegram API Error on ${method}`);
    }

    return data.result as T;
  }

  async sendMessage(chatId: string | number, text: string, replyMarkup?: InlineKeyboardMarkup): Promise<any> {
    return this.callApi('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      reply_markup: replyMarkup
    });
  }

  async editMessageText(chatId: string | number, messageId: number, text: string, replyMarkup?: InlineKeyboardMarkup): Promise<any> {
    return this.callApi('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: 'HTML',
      reply_markup: replyMarkup
    });
  }

  async answerCallbackQuery(callbackQueryId: string, text?: string, showAlert = false): Promise<any> {
    return this.callApi('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text,
      show_alert: showAlert
    });
  }

  async getUpdates(offset?: number, timeout = 25): Promise<any[]> {
    return this.callApi('getUpdates', {
      offset,
      timeout,
      allowed_updates: ['message', 'callback_query']
    });
  }

  /**
   * Format Order Alert Text matching user requirements
   */
  formatOrderAlertText(order: PendingOrder, reminderCount: number = 0): string {
    const shortRef = order.id.slice(0, 8).toUpperCase();
    const customer = order.userName || order.userEmail || order.userId.slice(0, 8);
    const valueFormatted = `${Number(order.chargedAmount).toLocaleString()} ${order.chargedCurrency}`;
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

  /**
   * Primary Action Buttons for Order Alert
   */
  createOrderKeyboards(orderId: string): InlineKeyboardMarkup {
    return {
      inline_keyboard: [
        [
          { text: '✅ تم التحويل', callback_data: `prompt_complete:${orderId}` },
          { text: '❌ إلغاء الطلب', callback_data: `prompt_cancel:${orderId}` }
        ]
      ]
    };
  }

  /**
   * Confirmation Dialog Buttons
   */
  createConfirmationKeyboards(orderId: string): InlineKeyboardMarkup {
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

  /**
   * Cancellation Confirmation Buttons
   */
  createCancelKeyboards(orderId: string): InlineKeyboardMarkup {
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
}

export const telegramBot = new TelegramBotClient();
