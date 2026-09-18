import dns from 'node:dns';
// Force IPv4 first to prevent Node.js fetch from hanging/failing on unrouted IPv6 networks
dns.setDefaultResultOrder('ipv4first');

import { Resend } from 'resend';
import pool from '../db';
import crypto from 'crypto';

// Helper to mask email address for safe logging
function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return '***';
  const parts = email.split('@');
  const local = parts[0] || '';
  const domain = parts[1] || '';
  if (local.length <= 1) return `*@${domain}`;
  return `${local[0]}***@${domain}`;
}

// Sender Configuration
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL?.trim() || 'no-reply@kiropro.store';
const FROM_NAME = process.env.RESEND_FROM_NAME?.trim() || 'KIROPRO';
const SENDER = `${FROM_NAME} <${FROM_EMAIL}>`;
const FRONTEND_URL = (process.env.FRONTEND_URL?.trim() || 'http://localhost:5173').replace(/\/$/, '');

// Visual Tokens & Palette
const BRAND_YELLOW = '#F59E0B';
const BRAND_DARK = '#0B0F19';
const BRAND_GRAY_BG = '#0F172A';
const BRAND_GRAY_CARD = '#F8FAFC';
const BRAND_BORDER = '#E2E8F0';
const BRAND_TEXT_MAIN = '#1E293B';
const BRAND_TEXT_MUTED = '#64748B';

// Safe Currency Formatter
export function formatCurrencyAmount(amount: number | string, currency: string = 'USD'): string {
  const num = Number(amount) || 0;
  const curr = (currency || 'USD').toUpperCase();
  if (curr === 'SDG') {
    return `${Math.round(num).toLocaleString('en-US')} ج.س`;
  }
  return `$${num.toFixed(2)}`;
}

/**
 * Reusable Brand Header Component
 * Strictly adheres to KIRO [PRO] brand identity:
 * "KIRO" in bold black, "PRO" in white inside yellow rounded badge.
 */
export function renderEmailBrand(theme: 'light' | 'dark' = 'light'): string {
  const kiroColor = theme === 'dark' ? '#FFFFFF' : '#0B0F19';
  return `
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 0 auto;">
      <tr>
        <td style="vertical-align: middle; padding-left: 6px;">
          <span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans Arabic', Helvetica, Arial, sans-serif; font-size: 28px; font-weight: 900; color: ${kiroColor}; letter-spacing: -0.5px;">
            KIRO
          </span>
        </td>
        <td style="vertical-align: middle;">
          <span style="background-color: ${BRAND_YELLOW}; color: #FFFFFF; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; font-weight: 900; padding: 4px 10px; border-radius: 6px; letter-spacing: 1px; display: inline-block; box-shadow: 0 2px 8px rgba(245, 158, 11, 0.35);">
            PRO
          </span>
        </td>
      </tr>
    </table>
  `;
}

/**
 * Reusable Base Email Layout Wrapper - Premium Gaming Tech
 */
export function renderEmailLayout(contentHtml: string, previewText: string = 'إشعار من متجر KIROPRO'): string {
  return `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>KIROPRO</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td, p, a, span { font-family: 'Segoe UI', Arial, sans-serif !important; }
  </style>
  <![endif]-->
  <style type="text/css">
    body {
      margin: 0;
      padding: 0;
      background-color: #0B0F19;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Kufi Arabic', 'Segoe UI Arabic', Tahoma, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
      direction: rtl;
      text-align: right;
    }
    .wrapper-table {
      background-color: #0B0F19;
      background-image: radial-gradient(circle at 50% 0%, #1E293B 0%, #0B0F19 75%);
      padding: 40px 12px;
    }
    .email-container {
      max-width: 540px;
      margin: 0 auto;
      background-color: #FFFFFF;
      border-radius: 20px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(245, 158, 11, 0.15);
      overflow: hidden;
    }
    .email-top-accent {
      height: 4px;
      background: linear-gradient(90deg, #F59E0B 0%, #FBBF24 50%, #D97706 100%);
    }
    .email-header {
      background-color: #FFFFFF;
      padding: 32px 24px 16px;
      text-align: center;
    }
    .email-body {
      padding: 12px 32px 32px;
    }
    .email-footer {
      background-color: #0F172A;
      padding: 24px 20px;
      text-align: center;
      border-top: 1px solid #1E293B;
      color: #94A3B8;
    }
    @media only screen and (max-width: 480px) {
      .email-body { padding: 8px 18px 24px !important; }
      .email-container { border-radius: 14px !important; }
    }
  </style>
</head>
<body>
  <div style="display: none; max-height: 0px; overflow: hidden; mso-hide: all;">
    ${previewText}
  </div>
  <table class="wrapper-table" role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center">
        <div class="email-container">
          <!-- Top Yellow Accent Bar -->
          <div class="email-top-accent"></div>

          <!-- Header with Brand Logo -->
          <div class="email-header">
            ${renderEmailBrand('light')}
          </div>

          <!-- Main Content -->
          <div class="email-body">
            ${contentHtml}
          </div>

          <!-- Footer -->
          <div class="email-footer">
            <div style="margin-bottom: 6px;">
              <span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 15px; font-weight: 900; color: #FFFFFF; letter-spacing: 0.5px;">
                KIRO<span style="color: ${BRAND_YELLOW};">PRO</span>
              </span>
            </div>
            <p style="margin: 0 0 10px 0; color: #94A3B8; font-size: 13px; font-weight: 500;">
              اشحن ألعابك ومنتجاتك الرقمية فوري ومضمون ⚡
            </p>
            <div style="height: 1px; background-color: #1E293B; width: 60px; margin: 10px auto;"></div>
            <p style="margin: 0; color: #64748B; font-size: 11px; line-height: 1.6;">
              هذه رسالة آلية لتأكيد معاملاتك لدى KIROPRO. لا تقم بالرد على هذا البريد.<br>
              جميع الحقوق محفوظة © 2026 KIROPRO Store.
            </p>
          </div>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

/**
 * Reusable Status Badge Component
 */
export function renderEmailStatusBadge(statusType: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'REJECTED' | 'APPROVED', label: string): string {
  let bg = '#FEF3C7';
  let color = '#92400E';
  let border = '#FDE68A';

  if (statusType === 'COMPLETED' || statusType === 'APPROVED') {
    bg = '#DCFCE7';
    color = '#166534';
    border = '#BBF7D0';
  } else if (statusType === 'PROCESSING') {
    bg = '#E0F2FE';
    color = '#075985';
    border = '#BAE6FD';
  } else if (statusType === 'REJECTED') {
    bg = '#FEE2E2';
    color = '#991B1B';
    border = '#FECACA';
  }

  return `
    <span style="display: inline-block; background-color: ${bg}; color: ${color}; border: 1px solid ${border}; font-size: 13px; font-weight: 800; padding: 5px 14px; border-radius: 9999px; letter-spacing: 0.2px;">
      ${label}
    </span>
  `;
}

/**
 * Reusable Action Button Component
 */
export function renderEmailButton(label: string, url: string, secondary = false): string {
  const bg = secondary ? '#0F172A' : BRAND_YELLOW;
  const color = secondary ? '#FFFFFF' : '#0B0F19';
  const shadow = secondary ? 'rgba(15, 23, 42, 0.25)' : 'rgba(245, 158, 11, 0.35)';

  return `
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 18px auto;">
      <tr>
        <td align="center" style="border-radius: 10px; background-color: ${bg}; box-shadow: 0 4px 14px ${shadow};">
          <a href="${url}" target="_blank" rel="noopener noreferrer" style="display: inline-block; padding: 14px 28px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans Arabic', sans-serif; font-size: 15px; font-weight: 800; color: ${color}; text-decoration: none; border-radius: 10px; letter-spacing: 0.3px;">
            ${label}
          </a>
        </td>
      </tr>
    </table>
  `;
}

/**
 * Core Safe & Idempotent Email Dispatcher
 * Records event in email_events, respects idempotency, and never throws or impacts financial state.
 */
async function recordAndSendEmail(params: {
  userId?: string | null | undefined;
  orderId?: string | null | undefined;
  topupId?: string | null | undefined;
  eventType: 'TOPUP_CREATED' | 'TOPUP_APPROVED' | 'TOPUP_REJECTED' | 'ORDER_PROCESSING' | 'ORDER_COMPLETED' | 'USDT_ORDER_COMPLETED' | 'USDT_ORDER_CANCELED';
  recipient: string;
  subject: string;
  html: string;
  text: string;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const { userId, orderId, topupId, eventType, recipient, subject, html, text } = params;

  if (!recipient || !recipient.includes('@')) {
    console.warn(`[EmailService] Invalid recipient email for ${eventType}:`, recipient);
    return { success: false, error: 'INVALID_RECIPIENT' };
  }

  // Idempotency check: Has this event already been recorded/sent for this order or topup?
  try {
    if (orderId) {
      const existing = await pool.query(
        'SELECT id, status FROM "email_events" WHERE event_type = $1 AND order_id = $2 LIMIT 1',
        [eventType, orderId]
      );
      if (existing.rows.length > 0 && existing.rows[0].status === 'SENT') {
        console.log(`[EmailService Idempotency] Skipping duplicate email for event ${eventType} on order ${orderId}`);
        return { success: true, id: existing.rows[0].id };
      }
    }

    if (topupId) {
      const existing = await pool.query(
        'SELECT id, status FROM "email_events" WHERE event_type = $1 AND topup_id = $2 LIMIT 1',
        [eventType, topupId]
      );
      if (existing.rows.length > 0 && existing.rows[0].status === 'SENT') {
        console.log(`[EmailService Idempotency] Skipping duplicate email for event ${eventType} on topup ${topupId}`);
        return { success: true, id: existing.rows[0].id };
      }
    }
  } catch (chkErr) {
    console.warn('[EmailService] Idempotency pre-check query warning:', chkErr);
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.warn('[EmailService Warning] RESEND_API_KEY is not configured. Email will be logged as FAILED.');
    try {
      await pool.query(
        `INSERT INTO "email_events" (user_id, order_id, topup_id, event_type, recipient, subject, status, error_message)
         VALUES ($1, $2, $3, $4, $5, $6, 'FAILED', 'RESEND_API_KEY missing')
         ON CONFLICT DO NOTHING`,
        [userId || null, orderId || null, topupId || null, eventType, recipient, subject]
      );
    } catch {}
    return { success: false, error: 'RESEND_API_KEY missing' };
  }

  // Insert PENDING record
  let eventRecordId: string | null = null;
  try {
    const insRes = await pool.query(
      `INSERT INTO "email_events" (user_id, order_id, topup_id, event_type, recipient, subject, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'PENDING')
       RETURNING id`,
      [userId || null, orderId || null, topupId || null, eventType, recipient, subject]
    );
    eventRecordId = insRes.rows[0]?.id || null;
  } catch (dbErr: any) {
    // If unique constraint triggered, it means duplicate event already registered
    if (dbErr.code === '23505') {
      console.log(`[EmailService Idempotency] Event ${eventType} already logged in database.`);
      return { success: true };
    }
    console.error('[EmailService] Failed to insert email_events record:', dbErr);
  }

  // Send via Resend
  const resendClient = new Resend(apiKey);
  console.log(`[RESEND SEND START] Event: ${eventType} -> to: ${maskEmail(recipient)}`);

  try {
    const response = await resendClient.emails.send({
      from: SENDER,
      to: recipient,
      subject,
      html,
      text
    });

    if (response.error) {
      const errMsg = response.error.message || JSON.stringify(response.error);
      console.error(`[RESEND SEND FAILED] Event: ${eventType} error:`, errMsg);
      if (eventRecordId) {
        await pool.query(
          `UPDATE "email_events" SET status = 'FAILED', error_message = $1 WHERE id = $2`,
          [errMsg, eventRecordId]
        ).catch(() => {});
      }
      return { success: false, error: errMsg };
    }

    const providerId = response.data?.id;
    console.log(`[RESEND SEND SUCCESS] Event: ${eventType} id: ${providerId}`);

    if (eventRecordId) {
      await pool.query(
        `UPDATE "email_events" SET status = 'SENT', provider_message_id = $1, sent_at = NOW() WHERE id = $2`,
        [providerId, eventRecordId]
      ).catch(() => {});
    }

    return { success: true, id: providerId };
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    console.error(`[RESEND SEND EXCEPTION] Event: ${eventType} error:`, errMsg);
    if (eventRecordId) {
      await pool.query(
        `UPDATE "email_events" SET status = 'FAILED', error_message = $1 WHERE id = $2`,
        [errMsg, eventRecordId]
      ).catch(() => {});
    }
    return { success: false, error: errMsg };
  }
}

// =========================================================================
// 1. TOP-UP REQUEST CREATED EMAIL
// =========================================================================
export interface SendTopupCreatedParams {
  to: string;
  userId: string;
  topupId: string;
  customerName?: string;
  amount: number;
  currency: string;
  paymentMethodName?: string;
  exchangeRate?: number;
  requestIdShort: string;
}

export async function sendTopupCreatedEmail(params: SendTopupCreatedParams): Promise<{ success: boolean; id?: string }> {
  const { to, userId, topupId, customerName, amount, currency, paymentMethodName, exchangeRate, requestIdShort } = params;
  const greeting = customerName ? `مرحبًا ${customerName}` : 'مرحبًا بك';
  const subject = 'تم استلام طلب شحن محفظتك | KIROPRO';
  const formattedAmount = formatCurrencyAmount(amount, currency);

  const exchangeRateRow = (currency === 'SDG' && exchangeRate) ? `
    <tr>
      <td style="padding: 10px 0; border-bottom: 1px solid #E2E8F0; color: #64748B; font-size: 14px;">سعر الصرف:</td>
      <td style="padding: 10px 0; border-bottom: 1px solid #E2E8F0; font-weight: 700; color: #1E293B; font-size: 14px; text-align: left; direction: ltr;">
        1 USD = ${Number(exchangeRate).toLocaleString()} SDG
      </td>
    </tr>
  ` : '';

  const contentHtml = `
    <div style="text-align: center; margin-bottom: 24px;">
      <h1 style="font-size: 22px; font-weight: 900; color: ${BRAND_DARK}; margin: 0 0 10px 0;">
        طلب شحن المحفظة
      </h1>
      <p style="font-size: 15px; line-height: 1.6; color: #64748B; margin: 0;">
        ${greeting}،<br>
        تم استلام طلب شحن محفظتك بنجاح وهو الآن قيد المراجعة والاعتماد.
      </p>
    </div>

    <!-- Amount Card -->
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 14px; padding: 20px; margin-bottom: 24px;">
      <tr>
        <td align="center">
          <span style="font-size: 12px; font-weight: 800; color: #94A3B8; letter-spacing: 1px; text-transform: uppercase;">المبلغ المطلوب</span>
          <div style="font-size: 32px; font-weight: 900; color: ${BRAND_DARK}; margin: 6px 0 10px;">
            ${formattedAmount}
          </div>
          ${renderEmailStatusBadge('PENDING', 'قيد المراجعة ⏳')}
        </td>
      </tr>
    </table>

    <!-- Details Table -->
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 24px;">
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #E2E8F0; color: #64748B; font-size: 14px;">رقم الطلب:</td>
        <td style="padding: 10px 0; border-bottom: 1px solid #E2E8F0; font-weight: 700; color: #1E293B; font-size: 14px; text-align: left; direction: ltr;">
          #${requestIdShort}
        </td>
      </tr>
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #E2E8F0; color: #64748B; font-size: 14px;">طريقة الدفع:</td>
        <td style="padding: 10px 0; border-bottom: 1px solid #E2E8F0; font-weight: 700; color: #1E293B; font-size: 14px; text-align: left;">
          ${paymentMethodName || 'تحويل بنكي'}
        </td>
      </tr>
      ${exchangeRateRow}
    </table>

    <p style="font-size: 13px; color: #64748B; line-height: 1.6; text-align: center; margin: 0 0 16px;">
      سيتم مراجعة إيصال الدفع وإيداع الرصيد في محفظتك في أقرب وقت. سنرسل لك إشعاراً فور اعتماد الرصيد.
    </p>

    ${renderEmailButton('متابعة رصيد المحفظة', `${FRONTEND_URL}?tab=account`)}
  `;

  const text = `
KIROPRO
تم استلام طلب شحن محفظتك بنجاح.
${greeting}
المبلغ: ${formattedAmount}
رقم الطلب: #${requestIdShort}
الحالة: قيد المراجعة
طريقة الدفع: ${paymentMethodName || 'تحويل بنكي'}
  `.trim();

  const html = renderEmailLayout(contentHtml, `تم استلام طلب شحن محفظتك بمبلغ ${formattedAmount}`);

  return recordAndSendEmail({
    userId,
    topupId,
    eventType: 'TOPUP_CREATED',
    recipient: to,
    subject,
    html,
    text
  });
}

// =========================================================================
// 2. TOP-UP APPROVED EMAIL
// =========================================================================
export interface SendTopupApprovedParams {
  to: string;
  userId: string;
  topupId: string;
  customerName?: string;
  amount: number;
  currency: string;
  currentBalance: number;
}

export async function sendTopupApprovedEmail(params: SendTopupApprovedParams): Promise<{ success: boolean; id?: string }> {
  const { to, userId, topupId, customerName, amount, currency, currentBalance } = params;
  const greeting = customerName ? `مرحبًا ${customerName}` : 'مرحبًا بك';
  const subject = 'تمت إضافة الرصيد إلى محفظتك | KIROPRO';
  const formattedAmount = formatCurrencyAmount(amount, currency);
  const formattedBalance = formatCurrencyAmount(currentBalance, currency);

  const contentHtml = `
    <div style="text-align: center; margin-bottom: 24px;">
      <h1 style="font-size: 22px; font-weight: 900; color: #166534; margin: 0 0 10px 0;">
        تمت إضافة الرصيد بنجاح! ⚡
      </h1>
      <p style="font-size: 15px; line-height: 1.6; color: #64748B; margin: 0;">
        ${greeting}،<br>
        تم اعتماد طلب شحن محفظتك وإضافة الرصيد بنجاح إلى حسابك في <strong>KIROPRO</strong>.
      </p>
    </div>

    <!-- Approved Badge Card -->
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 14px; padding: 22px; margin-bottom: 24px;">
      <tr>
        <td align="center">
          <span style="font-size: 12px; font-weight: 800; color: #166534; letter-spacing: 1px;">المبلغ المضاف</span>
          <div style="font-size: 34px; font-weight: 900; color: #15803D; margin: 6px 0 12px;">
            +${formattedAmount}
          </div>
          ${renderEmailStatusBadge('APPROVED', 'معتمد ومضاف ✓')}
        </td>
      </tr>
    </table>

    <!-- Balance Summary Card -->
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
      <tr>
        <td style="color: #64748B; font-size: 14px; font-weight: 600;">رصيد محفظتك الحالي:</td>
        <td style="text-align: left; font-size: 18px; font-weight: 900; color: ${BRAND_DARK}; direction: ltr;">
          ${formattedBalance}
        </td>
      </tr>
    </table>

    <p style="font-size: 14px; color: #64748B; text-align: center; margin: 0 0 16px;">
      يمكنك الآن استخدام رصيدك مباشرة لشحن ألعابك المفضلة وشراء المنتجات الرقمية.
    </p>

    ${renderEmailButton('تصفح المتجر واشحن ألعابك', `${FRONTEND_URL}`)}
  `;

  const text = `
KIROPRO
تمت إضافة الرصيد إلى محفظتك بنجاح!
${greeting}
المبلغ المضاف: +${formattedAmount}
الرصيد الحالي: ${formattedBalance}
  `.trim();

  const html = renderEmailLayout(contentHtml, `تم اعتماد شحن محفظتك بمبلغ ${formattedAmount}`);

  return recordAndSendEmail({
    userId,
    topupId,
    eventType: 'TOPUP_APPROVED',
    recipient: to,
    subject,
    html,
    text
  });
}

// =========================================================================
// 3. TOP-UP REJECTED EMAIL
// =========================================================================
export interface SendTopupRejectedParams {
  to: string;
  userId: string;
  topupId: string;
  customerName?: string;
  amount: number;
  currency: string;
  requestIdShort: string;
  rejectionReason: string;
}

export async function sendTopupRejectedEmail(params: SendTopupRejectedParams): Promise<{ success: boolean; id?: string }> {
  const { to, userId, topupId, customerName, amount, currency, requestIdShort, rejectionReason } = params;
  const greeting = customerName ? `مرحبًا ${customerName}` : 'مرحبًا بك';
  const subject = 'تم رفض طلب شحن المحفظة | KIROPRO';
  const formattedAmount = formatCurrencyAmount(amount, currency);

  const contentHtml = `
    <div style="text-align: center; margin-bottom: 24px;">
      <h1 style="font-size: 22px; font-weight: 900; color: #991B1B; margin: 0 0 10px 0;">
        تعذر اعتماد طلب شحن المحفظة
      </h1>
      <p style="font-size: 15px; line-height: 1.6; color: #64748B; margin: 0;">
        ${greeting}،<br>
        نعتذر منك، لم نتمكن من اعتماد طلب الشحن الخاص بك للأسباب الموضحة أدناه.
      </p>
    </div>

    <!-- Status Card -->
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #FEF2F2; border: 1px solid #FECACA; border-radius: 14px; padding: 20px; margin-bottom: 24px;">
      <tr>
        <td align="center">
          <span style="font-size: 12px; font-weight: 800; color: #991B1B; letter-spacing: 1px;">المبلغ المطلوب</span>
          <div style="font-size: 30px; font-weight: 900; color: #991B1B; margin: 6px 0 10px;">
            ${formattedAmount}
          </div>
          ${renderEmailStatusBadge('REJECTED', 'مرفوض ✗')}
        </td>
      </tr>
    </table>

    <!-- Details Table -->
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 20px;">
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #E2E8F0; color: #64748B; font-size: 14px;">رقم الطلب:</td>
        <td style="padding: 10px 0; border-bottom: 1px solid #E2E8F0; font-weight: 700; color: #1E293B; font-size: 14px; text-align: left; direction: ltr;">
          #${requestIdShort}
        </td>
      </tr>
    </table>

    <!-- Rejection Reason Box -->
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #FFF1F2; border-right: 4px solid #F43F5E; border-radius: 8px; padding: 14px 16px; margin-bottom: 24px;">
      <tr>
        <td>
          <div style="font-size: 12px; font-weight: 800; color: #9F1239; margin-bottom: 4px;">سبب الرفض:</div>
          <p style="margin: 0; font-size: 14px; color: #4C0519; line-height: 1.6;">
            ${rejectionReason || 'يرجى مراجعة إشعار التحويل البنكي والتأكد من وضوح البيانات والمحاولة مجدداً.'}
          </p>
        </td>
      </tr>
    </table>

    ${renderEmailButton('إنشاء طلب شحن جديد', `${FRONTEND_URL}?tab=account`)}
  `;

  const text = `
KIROPRO
تم رفض طلب شحن المحفظة.
${greeting}
المبلغ: ${formattedAmount}
رقم الطلب: #${requestIdShort}
سبب الرفض: ${rejectionReason}
  `.trim();

  const html = renderEmailLayout(contentHtml, `تحديث حول طلب شحن محفظتك #${requestIdShort}`);

  return recordAndSendEmail({
    userId,
    topupId,
    eventType: 'TOPUP_REJECTED',
    recipient: to,
    subject,
    html,
    text
  });
}

// =========================================================================
// 4. ORDER PROCESSING EMAIL (Strictly NO Provider Disclosure)
// =========================================================================
export interface SendOrderProcessingParams {
  to: string;
  userId: string;
  orderId: string;
  customerName?: string;
  productName: string;
  orderNumber: string;
  amount: number;
  currency: string;
}

export async function sendOrderProcessingEmail(params: SendOrderProcessingParams): Promise<{ success: boolean; id?: string }> {
  const { to, userId, orderId, customerName, productName, orderNumber, amount, currency } = params;
  const greeting = customerName ? `مرحبًا ${customerName}` : 'مرحبًا بك';
  const subject = 'تم استلام طلبك وبدأ تنفيذه | KIROPRO';
  const formattedAmount = formatCurrencyAmount(amount, currency);

  const contentHtml = `
    <div style="text-align: center; margin-bottom: 24px;">
      <h1 style="font-size: 22px; font-weight: 900; color: ${BRAND_DARK}; margin: 0 0 10px 0;">
        طلبك قيد التنفيذ 🚀
      </h1>
      <p style="font-size: 15px; line-height: 1.6; color: #64748B; margin: 0;">
        ${greeting}،<br>
        تم استلام طلبك بنجاح وجارٍ تنفيذه آلياً وسرعان ما سيصلك رمز التفعيل أو الشحن.
      </p>
    </div>

    <!-- Product Card -->
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 14px; padding: 20px; margin-bottom: 24px;">
      <tr>
        <td align="center">
          <span style="font-size: 12px; font-weight: 800; color: #94A3B8; letter-spacing: 1px;">المنتج</span>
          <div style="font-size: 20px; font-weight: 900; color: ${BRAND_DARK}; margin: 6px 0 10px;">
            ${productName}
          </div>
          ${renderEmailStatusBadge('PROCESSING', 'قيد التنفيذ التلقائي ⚙️')}
        </td>
      </tr>
    </table>

    <!-- Order Info -->
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 24px;">
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #E2E8F0; color: #64748B; font-size: 14px;">رقم الطلب:</td>
        <td style="padding: 10px 0; border-bottom: 1px solid #E2E8F0; font-weight: 700; color: #1E293B; font-size: 14px; text-align: left; direction: ltr;">
          #${orderNumber}
        </td>
      </tr>
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #E2E8F0; color: #64748B; font-size: 14px;">المبلغ المدفوع:</td>
        <td style="padding: 10px 0; border-bottom: 1px solid #E2E8F0; font-weight: 800; color: #1E293B; font-size: 15px; text-align: left; direction: ltr;">
          ${formattedAmount}
        </td>
      </tr>
    </table>

    ${renderEmailButton('متابعة حالة الطلب', `${FRONTEND_URL}?tab=account`)}
  `;

  const text = `
KIROPRO
تم استلام طلبك وبدأ تنفيذه.
${greeting}
المنتج: ${productName}
رقم الطلب: #${orderNumber}
المبلغ: ${formattedAmount}
الحالة: قيد التنفيذ
  `.trim();

  const html = renderEmailLayout(contentHtml, `طلبك #${orderNumber} قيد التنفيذ الآن`);

  return recordAndSendEmail({
    userId,
    orderId,
    eventType: 'ORDER_PROCESSING',
    recipient: to,
    subject,
    html,
    text
  });
}

// =========================================================================
// 5. ORDER COMPLETED EMAIL (With One-Click Rating Button)
// =========================================================================
export interface SendOrderCompletedParams {
  to: string;
  userId: string;
  orderId: string;
  customerName?: string;
  productName: string;
  orderNumber: string;
  amount: number;
  currency: string;
  fulfillmentKey?: string | null;
  reviewToken?: string;
}

export async function sendOrderCompletedEmail(params: SendOrderCompletedParams): Promise<{ success: boolean; id?: string }> {
  const { to, userId, orderId, customerName, productName, orderNumber, amount, currency, fulfillmentKey, reviewToken } = params;
  const greeting = customerName ? `مرحبًا ${customerName}` : 'مرحبًا بك';
  const subject = 'تم تنفيذ طلبك بنجاح | KIROPRO';
  const formattedAmount = formatCurrencyAmount(amount, currency);

  // Digital code block if present
  let codeBlock = '';
  if (fulfillmentKey && fulfillmentKey.trim()) {
    codeBlock = `
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #0B0F19; border: 2px solid ${BRAND_YELLOW}; border-radius: 12px; padding: 18px; margin: 16px 0 24px; text-align: center;">
        <tr>
          <td align="center">
            <span style="font-size: 11px; font-weight: 800; color: ${BRAND_YELLOW}; letter-spacing: 1px; display: block; margin-bottom: 8px;">
              كود المنتج الرقمي (DIGITAL KEY)
            </span>
            <div style="font-family: monospace; font-size: 20px; font-weight: 900; color: #FFFFFF; letter-spacing: 2px; direction: ltr; user-select: all; padding: 4px 8px;">
              ${fulfillmentKey.trim()}
            </div>
          </td>
        </tr>
      </table>
    `;
  }

  // Review URL
  const reviewUrl = reviewToken 
    ? `${FRONTEND_URL}/review/${reviewToken}` 
    : `${FRONTEND_URL}?tab=account`;

  const contentHtml = `
    <div style="text-align: center; margin-bottom: 24px;">
      <h1 style="font-size: 22px; font-weight: 900; color: #166534; margin: 0 0 10px 0;">
        تم تنفيذ طلبك بنجاح! 🎉
      </h1>
      <p style="font-size: 15px; line-height: 1.6; color: #64748B; margin: 0;">
        ${greeting}،<br>
        يسرنا إبلاغك بأن طلبك قد اكتمل بنجاح وتسليم المنتج أصبح متاحاً لك.
      </p>
    </div>

    <!-- Product Card -->
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 14px; padding: 20px; margin-bottom: 20px;">
      <tr>
        <td align="center">
          <span style="font-size: 12px; font-weight: 800; color: #166534; letter-spacing: 1px;">المنتج المسلم</span>
          <div style="font-size: 22px; font-weight: 900; color: #14532D; margin: 6px 0 10px;">
            ${productName}
          </div>
          ${renderEmailStatusBadge('COMPLETED', 'تم التنفيذ بنجاح ✓')}
        </td>
      </tr>
    </table>

    ${codeBlock}

    <!-- Order Info -->
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 24px;">
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #E2E8F0; color: #64748B; font-size: 14px;">رقم الطلب:</td>
        <td style="padding: 10px 0; border-bottom: 1px solid #E2E8F0; font-weight: 700; color: #1E293B; font-size: 14px; text-align: left; direction: ltr;">
          #${orderNumber}
        </td>
      </tr>
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #E2E8F0; color: #64748B; font-size: 14px;">المبلغ:</td>
        <td style="padding: 10px 0; border-bottom: 1px solid #E2E8F0; font-weight: 800; color: #1E293B; font-size: 15px; text-align: left; direction: ltr;">
          ${formattedAmount}
        </td>
      </tr>
    </table>

    <!-- Rating / Review Section -->
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #FFFBEB; border: 1px solid #FDE68A; border-radius: 14px; padding: 20px; text-align: center; margin-bottom: 20px;">
      <tr>
        <td align="center">
          <span style="font-size: 14px; font-weight: 800; color: #92400E; display: block; margin-bottom: 6px;">
            كيف كانت تجربتك معنا؟
          </span>
          <div style="font-size: 24px; letter-spacing: 4px; color: ${BRAND_YELLOW}; margin-bottom: 12px;">
            ★★★★★
          </div>
          <p style="margin: 0 0 14px 0; font-size: 13px; color: #78350F;">
            رأيك يهمنا ويساعدنا في تقديم خدمة أسرع وأفضل دائماً.
          </p>
          <table role="presentation" border="0" cellpadding="0" cellspacing="0">
            <tr>
              <td align="center" style="border-radius: 8px; background-color: ${BRAND_YELLOW};">
                <a href="${reviewUrl}" target="_blank" rel="noopener noreferrer" style="display: inline-block; padding: 10px 22px; font-size: 14px; font-weight: 900; color: #0B0F19; text-decoration: none; border-radius: 8px;">
                  ⭐ قيّم تجربتك الآن
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    ${renderEmailButton('عرض تفاصيل الطلب في حسابك', `${FRONTEND_URL}?tab=account`, true)}
  `;

  const text = `
KIROPRO
تم تنفيذ طلبك بنجاح!
${greeting}
المنتج: ${productName}
رقم الطلب: #${orderNumber}
المبلغ: ${formattedAmount}
الحالة: تم التنفيذ بنجاح
${fulfillmentKey ? `كود المنتج: ${fulfillmentKey}` : ''}
قيّم تجربتك: ${reviewUrl}
  `.trim();

  const html = renderEmailLayout(contentHtml, `تم تسليم طلبك #${orderNumber} بنجاح`);

  return recordAndSendEmail({
    userId,
    orderId,
    eventType: 'ORDER_COMPLETED',
    recipient: to,
    subject,
    html,
    text
  });
}

// =========================================================================
// Verification OTP Email Template (Preserved for Auth)
// =========================================================================
export function buildVerificationOtpEmailTemplate(otp: string, name?: string): { subject: string; html: string; text: string } {
  const greeting = name ? `مرحبًا ${name}،` : 'مرحبًا بك،';
  const subject = `${otp} هو رمز التحقق الخاص بحسابك في KIROPRO`;
  const formattedOtp = otp.split('').join(' ');

  const contentHtml = `
    <div style="text-align: center; margin-bottom: 24px;">
      <h1 style="font-size: 22px; font-weight: 900; color: ${BRAND_DARK}; margin: 0 0 10px 0; letter-spacing: -0.3px;">
        تحقق من بريدك الإلكتروني
      </h1>
      <p style="font-size: 15px; line-height: 1.6; color: #64748B; margin: 0;">
        ${greeting}<br>
        استخدم رمز التحقق التالي لإكمال إنشاء حسابك في <strong>KIROPRO</strong>:
      </p>
    </div>

    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 0 0 24px 0;">
      <tr>
        <td align="center" style="background: #0B0F19; border: 2px solid ${BRAND_YELLOW}; border-radius: 14px; padding: 26px 18px; box-shadow: 0 8px 24px rgba(245, 158, 11, 0.16);">
          <span style="display: block; font-size: 11px; font-weight: 800; color: ${BRAND_YELLOW}; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 12px;">
            رمز التحقق السريع (SECURITY OTP)
          </span>
          <div style="font-family: 'SF Pro Mono', 'Courier New', Menlo, Monaco, monospace; font-size: 38px; font-weight: 900; letter-spacing: 12px; color: #FFFFFF; direction: ltr; display: inline-block; padding: 4px 10px;">
            ${formattedOtp}
          </div>
          <div style="margin-top: 14px; font-size: 12px; font-weight: 700; color: #FBBF24;">
            ⏱️ صالح لمدة 10 دقائق
          </div>
        </td>
      </tr>
    </table>

    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 0 0 20px 0;">
      <tr>
        <td style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-right: 4px solid #94A3B8; border-radius: 8px; padding: 14px 16px;">
          <p style="margin: 0; font-size: 13px; color: #64748B; line-height: 1.6; text-align: right;">
            🛡️ <strong>ملاحظة أمنية:</strong> إذا لم تطلب إنشاء هذا الحساب، يمكنك تجاهل هذه الرسالة بأمان وسيظل حسابك محمياً. لا تشارك هذا الرمز مع أي شخص.
          </p>
        </td>
      </tr>
    </table>
  `;

  const html = renderEmailLayout(contentHtml, `رمز التحقق الخاص بك هو: ${otp}`);
  const text = `KIROPRO\nتحقق من بريدك الإلكتروني\n${greeting}\nرمز التحقق: ${otp}\nصالح لمدة 10 دقائق`.trim();

  return { subject, html, text };
}

export interface SendOtpEmailParams {
  to: string;
  otp: string;
  name?: string;
}

export async function sendVerificationOtpEmail(params: SendOtpEmailParams): Promise<{ success: boolean; id?: string; error?: string }> {
  const { to, otp, name } = params;
  const maskedTo = maskEmail(to);

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.error('[EmailService Error] RESEND_API_KEY is not configured.');
    return { 
      success: false, 
      error: 'تعذر إرسال بريد التحقق: خدمة البريد غير مهيأة في السيرفر.' 
    };
  }

  const resendClient = new Resend(apiKey);
  const { subject, html, text } = buildVerificationOtpEmailTemplate(otp, name);

  console.log(`[RESEND SEND START] OTP to: ${maskedTo}`);

  try {
    const response = await resendClient.emails.send({
      from: SENDER,
      to,
      subject,
      html,
      text
    });

    if (response.error) {
      console.error(`[RESEND SEND FAILED] error:`, response.error.message || response.error);
      return { success: false, error: 'تعذر إرسال بريد التحقق إلى بريدك الإلكتروني.' };
    }

    console.log(`[RESEND SEND SUCCESS] id: ${response.data?.id}`);
    return { success: true, id: response.data?.id };
  } catch (err: any) {
    console.error(`[RESEND SEND FAILED] unexpected error:`, err?.message || err);
    return { success: false, error: 'تعذر الاتصال بمزود البريد الإلكتروني.' };
  }
}

export interface SendPasswordResetOtpEmailParams {
  to: string;
  otp: string;
  name?: string;
  userId?: string;
}

/**
 * Password Reset OTP Email Template
 * Strictly adheres to KIRO [PRO] brand identity:
 * Subject: "إعادة تعيين كلمة المرور | KIROPRO"
 */
export function buildPasswordResetOtpEmailTemplate(otp: string, name?: string): { subject: string; html: string; text: string } {
  const greeting = name ? `مرحبًا ${name}،` : 'مرحبًا بك،';
  const subject = 'إعادة تعيين كلمة المرور | KIROPRO';
  const formattedOtp = otp.split('').join(' ');

  const contentHtml = `
    <div style="text-align: center; margin-bottom: 24px;">
      <h1 style="font-size: 22px; font-weight: 900; color: ${BRAND_DARK}; margin: 0 0 10px 0; letter-spacing: -0.3px;">
        إعادة تعيين كلمة المرور
      </h1>
      <p style="font-size: 15px; line-height: 1.6; color: #64748B; margin: 0;">
        ${greeting}<br>
        تلقينا طلباً لإعادة تعيين كلمة المرور لحسابك في <strong>KIROPRO</strong>. استخدم رمز التحقق التالي لإتمام العملية:
      </p>
    </div>

    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 0 0 24px 0;">
      <tr>
        <td align="center" style="background: #0B0F19; border: 2px solid ${BRAND_YELLOW}; border-radius: 14px; padding: 26px 18px; box-shadow: 0 8px 24px rgba(245, 158, 11, 0.16);">
          <span style="display: block; font-size: 11px; font-weight: 800; color: ${BRAND_YELLOW}; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 12px;">
            رمز التحقق لإعادة تعيين كلمة المرور (PASSWORD RESET OTP)
          </span>
          <div style="font-family: 'SF Pro Mono', 'Courier New', Menlo, Monaco, monospace; font-size: 38px; font-weight: 900; letter-spacing: 12px; color: #FFFFFF; direction: ltr; display: inline-block; padding: 4px 10px;">
            ${formattedOtp}
          </div>
          <div style="margin-top: 14px; font-size: 12px; font-weight: 700; color: #FBBF24;">
            ⏱️ هذا الرمز صالح لمدة 10 دقائق فقط.
          </div>
        </td>
      </tr>
    </table>

    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 0 0 20px 0;">
      <tr>
        <td style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-right: 4px solid ${BRAND_YELLOW}; border-radius: 8px; padding: 14px 16px;">
          <p style="margin: 0; font-size: 13px; color: #64748B; line-height: 1.6; text-align: right;">
            🛡️ <strong>ملاحظة أمنية:</strong> إذا لم تطلب إعادة تعيين كلمة المرور، يمكنك تجاهل هذه الرسالة بأمان وستظل كلمة مرورك الحالية نشطة ومحمية دون تغيير. لا تشارك هذا الرمز مع أي شخص تحت أي ظرف.
          </p>
        </td>
      </tr>
    </table>
  `;

  const html = renderEmailLayout(contentHtml, `رمز التحقق لإعادة تعيين كلمة المرور هو: ${otp}`);
  const text = `KIROPRO\nإعادة تعيين كلمة المرور\n${greeting}\nرمز التحقق: ${otp}\nهذا الرمز صالح لمدة 10 دقائق.\nإذا لم تطلب إعادة تعيين كلمة المرور، يمكنك تجاهل هذه الرسالة.`.trim();

  return { subject, html, text };
}

export async function sendPasswordResetOtpEmail(params: SendPasswordResetOtpEmailParams): Promise<{ success: boolean; id?: string; error?: string }> {
  const { to, otp, name, userId } = params;
  const maskedTo = maskEmail(to);

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.error('[EmailService Error] RESEND_API_KEY is not configured.');
    return { 
      success: false, 
      error: 'تعذر إرسال بريد التحقق: خدمة البريد غير مهيأة في السيرفر.' 
    };
  }

  const resendClient = new Resend(apiKey);
  const { subject, html, text } = buildPasswordResetOtpEmailTemplate(otp, name);

  console.log(`[RESEND SEND START] Password reset OTP to: ${maskedTo}`);

  let eventRecordId: string | null = null;
  try {
    const insRes = await pool.query(
      `INSERT INTO "email_events" (user_id, event_type, recipient, subject, status)
       VALUES ($1, 'PASSWORD_RESET_OTP', $2, $3, 'PENDING')
       RETURNING id`,
      [userId || null, to, subject]
    );
    eventRecordId = insRes.rows[0]?.id || null;
  } catch (dbErr) {
    // Proceed with sending even if email_events insert fails
  }

  try {
    const response = await resendClient.emails.send({
      from: SENDER,
      to,
      subject,
      html,
      text
    });

    if (response.error) {
      console.error(`[RESEND SEND FAILED] error:`, response.error.message || response.error);
      if (eventRecordId) {
        await pool.query(
          `UPDATE "email_events" SET status = 'FAILED', error_message = $1 WHERE id = $2`,
          [response.error.message || 'Unknown provider error', eventRecordId]
        ).catch(() => {});
      }
      return { success: false, error: 'تعذر إرسال بريد إعادة تعيين كلمة المرور إلى بريدك الإلكتروني.' };
    }

    console.log(`[RESEND SEND SUCCESS] id: ${response.data?.id}`);
    if (eventRecordId) {
      await pool.query(
        `UPDATE "email_events" SET status = 'SENT', provider_message_id = $1, sent_at = NOW() WHERE id = $2`,
        [response.data?.id || null, eventRecordId]
      ).catch(() => {});
    }
    return { success: true, id: response.data?.id };
  } catch (err: any) {
    console.error(`[RESEND SEND FAILED] unexpected error:`, err?.message || err);
    if (eventRecordId) {
      await pool.query(
        `UPDATE "email_events" SET status = 'FAILED', error_message = $1 WHERE id = $2`,
        [err?.message || 'Unexpected failure', eventRecordId]
      ).catch(() => {});
    }
    return { success: false, error: 'تعذر الاتصال بمزود البريد الإلكتروني.' };
  }
}

export interface SendUsdtOrderCompletedParams {
  to: string;
  name?: string;
  userId?: string;
  orderId: string;
  orderNumber: string;
  usdtAmount: number;
  network: string;
  walletAddress: string;
  txHash?: string | null;
  chargedAmount: number;
  chargedCurrency: string;
}

export async function sendUsdtOrderCompletedEmail(params: SendUsdtOrderCompletedParams): Promise<{ success: boolean; id?: string; error?: string }> {
  const { to, name, userId, orderId, orderNumber, usdtAmount, network, walletAddress, txHash, chargedAmount, chargedCurrency } = params;
  const greeting = name ? `مرحبًا ${name}` : 'مرحبًا بك';
  const maskedAddress = walletAddress.length > 12 
    ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` 
    : walletAddress;

  const subject = `تم اكتمال طلب تحويل USDT بنجاح #${orderNumber} | KIROPRO`;

  const contentHtml = `
    <div style="text-align: center; margin-bottom: 24px;">
      <h1 style="font-size: 22px; font-weight: 900; color: #166534; margin: 0 0 10px 0;">
        تم اكتمال تحويل USDT بنجاح! ⚡
      </h1>
      <p style="font-size: 15px; line-height: 1.6; color: #64748B; margin: 0;">
        ${greeting}،<br>
        يسرنا إبلاغك بأنه تم تنفيذ تحويل رصيد USDT المطلوب إلى محفظتك بنجاح.
      </p>
    </div>

    <!-- Crypto Details Card -->
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 14px; padding: 22px; margin-bottom: 20px; text-align: center;">
      <tr>
        <td align="center">
          <span style="font-size: 12px; font-weight: 800; color: #166534; letter-spacing: 1px; display: block; margin-bottom: 4px;">المبلغ المحول</span>
          <div style="font-size: 32px; font-weight: 900; color: #14532D; margin: 4px 0 10px;">
            ${usdtAmount} USDT
          </div>
          ${renderEmailStatusBadge('COMPLETED', 'تم التحويل بنجاح ✓')}
        </td>
      </tr>
    </table>

    <!-- Transfer Details Table -->
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 24px;">
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #E2E8F0; color: #64748B; font-size: 14px;">رقم الطلب:</td>
        <td style="padding: 10px 0; border-bottom: 1px solid #E2E8F0; font-weight: 700; color: #1E293B; font-size: 14px; text-align: left; direction: ltr;">
          #${orderNumber}
        </td>
      </tr>
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #E2E8F0; color: #64748B; font-size: 14px;">الشبكة:</td>
        <td style="padding: 10px 0; border-bottom: 1px solid #E2E8F0; font-weight: 700; color: #1E293B; font-size: 14px; text-align: left; direction: ltr;">
          ${network}
        </td>
      </tr>
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #E2E8F0; color: #64748B; font-size: 14px;">عنوان المحفظة:</td>
        <td style="padding: 10px 0; border-bottom: 1px solid #E2E8F0; font-family: monospace; font-weight: 700; color: #1E293B; font-size: 14px; text-align: left; direction: ltr;">
          ${maskedAddress}
        </td>
      </tr>
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #E2E8F0; color: #64748B; font-size: 14px;">المبلغ المدفوع من الرصيد:</td>
        <td style="padding: 10px 0; border-bottom: 1px solid #E2E8F0; font-weight: 800; color: #1E293B; font-size: 15px; text-align: left; direction: ltr;">
          ${formatCurrencyAmount(chargedAmount, chargedCurrency)}
        </td>
      </tr>
      ${txHash ? `
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #E2E8F0; color: #64748B; font-size: 14px;">رمز المعاملة (TxID):</td>
        <td style="padding: 10px 0; border-bottom: 1px solid #E2E8F0; font-family: monospace; font-weight: 600; color: #0284C7; font-size: 12px; text-align: left; direction: ltr; word-break: break-all;">
          ${txHash}
        </td>
      </tr>
      ` : ''}
    </table>

    ${renderEmailButton('عرض تفاصيل الطلب في حسابك', `${FRONTEND_URL}?tab=account`, true)}
  `;

  const text = `
KIROPRO - تم اكتمال طلب تحويل USDT
${greeting}
رقم الطلب: #${orderNumber}
المبلغ المحول: ${usdtAmount} USDT
الشبكة: ${network}
عنوان المحفظة: ${maskedAddress}
الحالة: تم التحويل بنجاح
${txHash ? `معرف المعاملة: ${txHash}` : ''}
  `.trim();

  const html = renderEmailLayout(contentHtml, `تم تحويل ${usdtAmount} USDT لطلبك #${orderNumber}`);

  return recordAndSendEmail({
    userId,
    orderId,
    eventType: 'USDT_ORDER_COMPLETED',
    recipient: to,
    subject,
    html,
    text
  });
}

export interface SendUsdtOrderCanceledParams {
  to: string;
  name?: string;
  userId?: string;
  orderId: string;
  orderNumber: string;
  usdtAmount: number;
  reason?: string;
  refundedAmount: number;
  refundedCurrency: string;
}

export async function sendUsdtOrderCanceledEmail(params: SendUsdtOrderCanceledParams): Promise<{ success: boolean; id?: string; error?: string }> {
  const { to, name, userId, orderId, orderNumber, usdtAmount, reason, refundedAmount, refundedCurrency } = params;
  const greeting = name ? `مرحبًا ${name}` : 'مرحبًا بك';
  const subject = `تحديث بخصوص طلب تحويل USDT #${orderNumber} | KIROPRO`;

  const contentHtml = `
    <div style="text-align: center; margin-bottom: 24px;">
      <h1 style="font-size: 22px; font-weight: 900; color: #991B1B; margin: 0 0 10px 0;">
        تم إلغاء طلب تحويل USDT
      </h1>
      <p style="font-size: 15px; line-height: 1.6; color: #64748B; margin: 0;">
        ${greeting}،<br>
        نحيطك علمًا بأنه تم إلغاء طلب تحويل USDT رقم #${orderNumber} وتمت إعادة كامل المبلغ المدفوع تلقائيًا إلى رصيد محفظتك.
      </p>
    </div>

    <!-- Details Card -->
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #FEF2F2; border: 1px solid #FECACA; border-radius: 14px; padding: 20px; margin-bottom: 20px;">
      <tr>
        <td>
          <p style="margin: 0 0 8px 0; font-size: 14px; color: #991B1B; font-weight: 700;">
            سبب الإلغاء:
          </p>
          <p style="margin: 0; font-size: 14px; color: #1E293B;">
            ${reason || 'تعذر استكمال العملية، وتم رد الرصيد لمحفظتك.'}
          </p>
          <div style="margin-top: 14px; padding-top: 12px; border-top: 1px dashed #FCA5A5; font-size: 14px; color: #166534; font-weight: 800;">
            المبلغ المسترجع إلى محفظتك: ${formatCurrencyAmount(refundedAmount, refundedCurrency)}
          </div>
        </td>
      </tr>
    </table>

    ${renderEmailButton('عرض رصيد محفظتك الآن', `${FRONTEND_URL}?tab=account`, true)}
  `;

  const text = `
KIROPRO - تم إلغاء طلب تحويل USDT #${orderNumber}
${greeting}
السبب: ${reason || 'تعذر استكمال العملية'}
تم استرجاع مبلغ ${formatCurrencyAmount(refundedAmount, refundedCurrency)} إلى رصيد محفظتك بالكامل.
  `.trim();

  const html = renderEmailLayout(contentHtml, `تم إلغاء طلب #${orderNumber} ورد الرصيد`);

  return recordAndSendEmail({
    userId,
    orderId,
    eventType: 'USDT_ORDER_CANCELED',
    recipient: to,
    subject,
    html,
    text
  });
}

export default {
  sendVerificationOtpEmail,
  sendPasswordResetOtpEmail,
  buildPasswordResetOtpEmailTemplate,
  sendTopupCreatedEmail,
  sendTopupApprovedEmail,
  sendTopupRejectedEmail,
  sendOrderProcessingEmail,
  sendOrderCompletedEmail,
  sendUsdtOrderCompletedEmail,
  sendUsdtOrderCanceledEmail,
  renderEmailBrand,
  renderEmailLayout,
  renderEmailStatusBadge,
  renderEmailButton,
  buildVerificationOtpEmailTemplate
};

