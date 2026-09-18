import dotenv from 'dotenv';
dotenv.config();

export const config = {
  botToken: process.env.BOT_TOKEN || '',
  adminChatId: process.env.ADMIN_TELEGRAM_CHAT_ID || '',
  backendUrl: (process.env.KIROPRO_BACKEND_URL || 'http://localhost:5000').replace(/\/+$/, ''),
  botSecret: process.env.BOT_API_SECRET || '',
  reminderIntervalMs: Number(process.env.REMINDER_INTERVAL_MS) || 10000
};

export function validateConfig() {
  const missing: string[] = [];
  if (!config.botToken) missing.push('BOT_TOKEN');
  if (!config.adminChatId) missing.push('ADMIN_TELEGRAM_CHAT_ID');
  if (!config.botSecret) missing.push('BOT_API_SECRET');

  if (missing.length > 0) {
    console.warn(`[TelegramBot Warning] Missing configuration variables: ${missing.join(', ')}.`);
    console.warn('[TelegramBot Warning] Please configure .env file using .env.example as reference.');
  }
}
