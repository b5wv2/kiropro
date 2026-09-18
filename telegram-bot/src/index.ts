import { config, validateConfig } from './config';
import { backendClient } from './apiClient';
import { telegramBot } from './telegramClient';
import { reminderEngine } from './reminderEngine';

console.log('====================================================');
console.log('🤖 Starting KIROPRO USDT Telegram Bot Service...');
console.log('====================================================');

validateConfig();

let isRunning = true;
let updateOffset = 0;

/**
 * Handle incoming callback queries from inline keyboard buttons
 */
async function handleCallbackQuery(query: any) {
  const queryId = query.id;
  const from = query.from;
  const data = String(query.data || '');
  const message = query.message;

  const adminName = [from?.first_name, from?.last_name].filter(Boolean).join(' ') || from?.username || String(from?.id);
  const adminId = String(from?.id || '');

  try {
    // 1. Prompt Confirmation for Completion
    if (data.startsWith('prompt_complete:')) {
      const orderId = data.replace('prompt_complete:', '');
      const orders = await backendClient.getPendingOrders();
      const order = orders.find(o => o.id === orderId);

      if (!order) {
        await telegramBot.answerCallbackQuery(queryId, 'الطلب غير موجود أو تمت معالجته مسبقاً.', true);
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

      const confirmKeyboards = telegramBot.createConfirmationKeyboards(orderId);
      await telegramBot.editMessageText(message.chat.id, message.message_id, promptText, confirmKeyboards);
      await telegramBot.answerCallbackQuery(queryId);
      return;
    }

    // 2. Execute Completion Confirmation
    if (data.startsWith('confirm_complete:')) {
      const orderId = data.replace('confirm_complete:', '');

      await telegramBot.answerCallbackQuery(queryId, 'جاري إتمام الطلب وتحديث السجلات...');

      try {
        await backendClient.completeOrder(orderId, {
          adminTelegramId: adminId,
          adminName
        });

        // Immediately stop reminders for this order
        reminderEngine.stopOrderReminder(orderId);

        const successText = [
          `✅ <b>تم إتمام التحويل بنجاح</b>`,
          ``,
          `<b>رقم الطلب:</b> <code>#${orderId.slice(0, 8).toUpperCase()}</code>`,
          `<b>تم التنفيذ بواسطة:</b> ${adminName} (@${from?.username || adminId})`,
          `<b>الحالة:</b> مكتمل (COMPLETED)`,
          `<b>تاريخ الإكمال:</b> ${new Date().toLocaleString('ar-SA')}`,
          ``,
          `<i>تم خصم المخزون نهائياً، وتوقفت تنبيهات التيليجرام، وأُرسل بريد التأكيد للعميل تلقائياً.</i>`
        ].join('\n');

        await telegramBot.editMessageText(message.chat.id, message.message_id, successText);
      } catch (err: any) {
        console.error('[Bot Error on complete]:', err.message);
        await telegramBot.answerCallbackQuery(queryId, `خطأ: ${err.message}`, true);
      }
      return;
    }

    // 3. Prompt Confirmation for Cancellation
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

      const cancelKeyboards = telegramBot.createCancelKeyboards(orderId);
      await telegramBot.editMessageText(message.chat.id, message.message_id, cancelPromptText, cancelKeyboards);
      await telegramBot.answerCallbackQuery(queryId);
      return;
    }

    // 4. Execute Cancellation Confirmation
    if (data.startsWith('confirm_cancel:')) {
      const orderId = data.replace('confirm_cancel:', '');

      await telegramBot.answerCallbackQuery(queryId, 'جاري إلغاء الطلب واسترجاع الرصيد...');

      try {
        await backendClient.cancelOrder(orderId, {
          reason: `إلغاء عبر بوت التيليجرام بواسطة ${adminName}`,
          adminTelegramId: adminId,
          adminName
        });

        // Immediately stop reminders
        reminderEngine.stopOrderReminder(orderId);

        const canceledText = [
          `❌ <b>تم إلغاء الطلب ورد الرصيد بنجاح</b>`,
          ``,
          `<b>رقم الطلب:</b> <code>#${orderId.slice(0, 8).toUpperCase()}</code>`,
          `<b>الملغي:</b> ${adminName} (@${from?.username || adminId})`,
          `<b>الحالة:</b> ملغي (CANCELED)`,
          ``,
          `<i>تم رد كامل المبلغ إلى رصيد محفظة العميل وإعادة كمية الـ USDT للمخزون المتاح.</i>`
        ].join('\n');

        await telegramBot.editMessageText(message.chat.id, message.message_id, canceledText);
      } catch (err: any) {
        console.error('[Bot Error on cancel]:', err.message);
        await telegramBot.answerCallbackQuery(queryId, `خطأ: ${err.message}`, true);
      }
      return;
    }

    // 5. Back to original Alert View
    if (data.startsWith('back_to_alert:')) {
      const orderId = data.replace('back_to_alert:', '');
      const orders = await backendClient.getPendingOrders();
      const order = orders.find(o => o.id === orderId);

      if (order) {
        const text = telegramBot.formatOrderAlertText(order, 0);
        const keyboards = telegramBot.createOrderKeyboards(orderId);
        await telegramBot.editMessageText(message.chat.id, message.message_id, text, keyboards);
      }
      await telegramBot.answerCallbackQuery(queryId, 'تم التراجع.');
      return;
    }

    await telegramBot.answerCallbackQuery(queryId);
  } catch (err: any) {
    console.error('[Bot Error in handleCallbackQuery]:', err.message);
  }
}

/**
 * Main Telegram Updates Polling Loop
 */
async function startUpdatesPolling() {
  console.log('[TelegramBot] Updates listener started...');

  while (isRunning) {
    try {
      if (!config.botToken) {
        await new Promise(r => setTimeout(r, 5000));
        continue;
      }

      const updates = await telegramBot.getUpdates(updateOffset, 20);

      for (const update of updates) {
        updateOffset = Math.max(updateOffset, update.update_id + 1);

        if (update.callback_query) {
          await handleCallbackQuery(update.callback_query);
        } else if (update.message?.text === '/start') {
          await telegramBot.sendMessage(
            update.message.chat.id,
            `👋 أهلاً بك في بوت إدارة طلبات <b>KIROPRO USDT</b>.\nمعرف الدردشة الخاص بك هو: <code>${update.message.chat.id}</code>\nقم بوضعه في <code>ADMIN_TELEGRAM_CHAT_ID</code> في ملف <code>.env</code>.`
          );
        } else if (update.message?.text === '/status') {
          const pending = await backendClient.getPendingOrders().catch(() => []);
          await telegramBot.sendMessage(
            update.message.chat.id,
            `📊 <b>حالة النظام:</b>\nالطلبات المعلقة الحالية: <b>${pending.length}</b>`
          );
        }
      }
    } catch (err: any) {
      // Avoid rapid looping on network/token errors
      console.error('[TelegramBot Polling Warning]:', err.message);
      await new Promise(r => setTimeout(r, 4000));
    }
  }
}

// Start Services
reminderEngine.start();
startUpdatesPolling();

// Graceful Shutdown
function handleShutdown() {
  console.log('[TelegramBot] Shutting down gracefully...');
  isRunning = false;
  reminderEngine.stop();
  process.exit(0);
}

process.on('SIGINT', handleShutdown);
process.on('SIGTERM', handleShutdown);
