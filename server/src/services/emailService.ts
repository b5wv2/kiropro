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
export function formatCurrencyAmount(amount: number | string, currency: string = 'SDG'): string {
  const num = Number(amount) || 0;
  const curr = (currency || 'SDG').toUpperCase();
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
  partnerDepositId?: string | null | undefined;
  eventType: 'TOPUP_CREATED' | 'TOPUP_APPROVED' | 'TOPUP_REJECTED' | 'ORDER_PROCESSING' | 'ORDER_COMPLETED' | 'ORDER_VOUCHER_DELIVERED' | 'USDT_ORDER_COMPLETED' | 'USDT_ORDER_CANCELED' | 'PARTNER_WELCOME' | 'PARTNER_DEPOSIT_APPROVED' | 'PARTNER_DEPOSIT_REJECTED' | 'SUPPORT_DONATION_COMPLETED' | 'MILITARY_RANK_PROMOTION';
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

export interface SendPartnerWelcomeEmailParams {
  to: string;
  partnerName: string;
  setupUrl: string;
  expiresHours?: number;
}

export async function sendPartnerWelcomeEmail(params: SendPartnerWelcomeEmailParams): Promise<{ success: boolean; id?: string; error?: string }> {
  const { to, partnerName, setupUrl, expiresHours = 72 } = params;
  const subject = `مرحباً بك في منصة KIROPRO Partner | قم بتعيين كلمة المرور`;

  const contentHtml = `
    <div style="text-align: center; margin-bottom: 24px;">
      <h1 style="font-size: 24px; font-weight: 900; color: #1E293B; margin: 0 0 10px 0;">
        مرحباً بك كشريك معتمد! 🤝
      </h1>
      <p style="font-size: 15px; line-height: 1.6; color: #64748B; margin: 0;">
        أهلاً بك <strong>${partnerName}</strong> في منصة التجار <strong>KIROPRO Partner</strong>.<br>
        تم إنشاء حسابك التجاري بنجاح من قبل الإدارة. يرجى الضغط على الزر أدناه لتعيين كلمة المرور الخاصة بك والبدء في شحن الألعاب لعملائك بأفضل الأسعار.
      </p>
    </div>

    <!-- Security Information Box -->
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 14px; padding: 20px; margin-bottom: 24px;">
      <tr>
        <td>
          <p style="margin: 0 0 10px 0; font-size: 14px; color: #0F172A; font-weight: 700;">
            معلومات الدخول والأمان:
          </p>
          <ul style="margin: 0; padding-right: 20px; color: #475569; font-size: 14px; line-height: 1.8;">
            <li>رابط البوابة: <a href="https://kiropro.store/partner" style="color: #D97706; font-weight: 700; text-decoration: none;">kiropro.store/partner</a></li>
            <li>البريد الإلكتروني المعتمد: <strong>${to}</strong></li>
            <li>صلاحية رابط الإعداد: <strong>${expiresHours} ساعة</strong> للاستخدام لمرة واحدة فقط.</li>
            <li>لا تشارك هذا الرابط مع أي شخص لحماية رصيدك وحسابك التجاري.</li>
          </ul>
        </td>
      </tr>
    </table>

    <div style="text-align: center; margin: 30px 0;">
      ${renderEmailButton('تعيين كلمة المرور وبدء العمل الآن', setupUrl, false)}
    </div>

    <p style="text-align: center; font-size: 13px; color: #94A3B8; margin-top: 24px;">
      إذا واجهتك أي صعوبة في الضغط على الزر أعلاه، يمكنك نسخ الرابط التالي ولصقه في متصفحك مباشرة:<br>
      <span style="display: inline-block; word-break: break-all; color: #64748B; font-size: 12px; margin-top: 6px;">${setupUrl}</span>
    </p>
  `;

  const text = `
KIROPRO Partner - تفعيل حساب الشريك
مرحباً بك ${partnerName}
تم إنشاء حسابك بنجاح في منصة التجار KIROPRO Partner.
رابط تعيين كلمة المرور: ${setupUrl}
صلاحية الرابط: ${expiresHours} ساعة لمرة واحدة فقط.
  `.trim();

  const html = renderEmailLayout(contentHtml, `مرحباً بك في KIROPRO Partner - تفعيل الحساب`);

  return recordAndSendEmail({
    eventType: 'PARTNER_WELCOME',
    recipient: to,
    subject,
    html,
    text
  });
}

export interface SendPartnerDepositApprovedEmailParams {
  to: string;
  partnerName: string;
  amountUsd: number;
  newBalanceUsd: number;
  depositId: string;
}

export async function sendPartnerDepositApprovedEmail(params: SendPartnerDepositApprovedEmailParams): Promise<{ success: boolean; id?: string; error?: string }> {
  const { to, partnerName, amountUsd, newBalanceUsd, depositId } = params;
  const subject = `تمت الموافقة على طلب الإيداع بقيمة $${amountUsd.toFixed(2)} | KIROPRO Partner`;

  const contentHtml = `
    <div style="text-align: center; margin-bottom: 24px;">
      <h1 style="font-size: 24px; font-weight: 900; color: #166534; margin: 0 0 10px 0;">
        تمت إضافة الرصيد بنجاح! 💰
      </h1>
      <p style="font-size: 15px; line-height: 1.6; color: #64748B; margin: 0;">
        مرحباً <strong>${partnerName}</strong>،<br>
        تمت مراجعة واعتماد طلب الإيداع الخاص بك، وتمت إضافة المبلغ إلى محفظتك بالدولار USD بنجاح.
      </p>
    </div>

    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 14px; padding: 20px; margin-bottom: 24px;">
      <tr>
        <td>
          <div style="font-size: 14px; color: #166534; font-weight: 700; margin-bottom: 8px;">
            المبلغ المضاف: $${amountUsd.toFixed(2)} USD
          </div>
          <div style="font-size: 16px; color: #0F172A; font-weight: 800; padding-top: 10px; border-top: 1px dashed #86EFAC;">
            الرصيد الحالي بالمحفظة: $${newBalanceUsd.toFixed(2)} USD
          </div>
        </td>
      </tr>
    </table>

    <div style="text-align: center; margin: 24px 0;">
      ${renderEmailButton('الانتقال لبوابة الشحن السريع', 'https://kiropro.store/partner', false)}
    </div>
  `;

  const text = `
KIROPRO Partner - اعتماد الإيداع
مرحباً ${partnerName}
تمت إضافة $${amountUsd.toFixed(2)} USD إلى رصيد محفظتك.
الرصيد الحالي: $${newBalanceUsd.toFixed(2)} USD
  `.trim();

  const html = renderEmailLayout(contentHtml, `تم اعتماد إيداع $${amountUsd.toFixed(2)} بنجاح`);

  return recordAndSendEmail({
    partnerDepositId: depositId,
    eventType: 'PARTNER_DEPOSIT_APPROVED',
    recipient: to,
    subject,
    html,
    text
  });
}

export interface SendPartnerDepositRejectedEmailParams {
  to: string;
  partnerName: string;
  amountUsd: number;
  reason?: string;
  depositId: string;
}

export async function sendPartnerDepositRejectedEmail(params: SendPartnerDepositRejectedEmailParams): Promise<{ success: boolean; id?: string; error?: string }> {
  const { to, partnerName, amountUsd, reason, depositId } = params;
  const subject = `تحديث بخصوص طلب الإيداع بقيمة $${amountUsd.toFixed(2)} | KIROPRO Partner`;

  const contentHtml = `
    <div style="text-align: center; margin-bottom: 24px;">
      <h1 style="font-size: 22px; font-weight: 900; color: #991B1B; margin: 0 0 10px 0;">
        تعذر اعتماد طلب الإيداع
      </h1>
      <p style="font-size: 15px; line-height: 1.6; color: #64748B; margin: 0;">
        مرحباً <strong>${partnerName}</strong>،<br>
        نأسف لإبلاغك بأنه تعذر قبول طلب الإيداع بقيمة <strong>$${amountUsd.toFixed(2)} USD</strong>.
      </p>
    </div>

    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #FEF2F2; border: 1px solid #FECACA; border-radius: 14px; padding: 20px; margin-bottom: 24px;">
      <tr>
        <td>
          <p style="margin: 0 0 8px 0; font-size: 14px; color: #991B1B; font-weight: 700;">
            سبب الرفض:
          </p>
          <p style="margin: 0; font-size: 14px; color: #1E293B;">
            ${reason || 'لم يتم مطابقة الإشعار البنكي بالحساب أو البيانات غير واضحة. يرجى التواصل مع الإدارة أو رفع إشعار جديد.'}
          </p>
        </td>
      </tr>
    </table>

    <div style="text-align: center; margin: 24px 0;">
      ${renderEmailButton('مراجعة المحفظة وتقديم طلب جديد', 'https://kiropro.store/partner', true)}
    </div>
  `;

  const text = `
KIROPRO Partner - تعذر اعتماد طلب الإيداع
مرحباً ${partnerName}
تعذر قبول طلب الإيداع بقيمة $${amountUsd.toFixed(2)} USD.
السبب: ${reason || 'يرجى مراجعة الإدارة'}
  `.trim();

  const html = renderEmailLayout(contentHtml, `تعذر اعتماد طلب الإيداع بقيمة $${amountUsd.toFixed(2)}`);

  return recordAndSendEmail({
    partnerDepositId: depositId,
    eventType: 'PARTNER_DEPOSIT_REJECTED',
    recipient: to,
    subject,
    html,
    text
  });
}

/**
 * Sends a digital voucher delivery email with purchased codes and redemption guide.
 * Status is tracked independently in email_events ('SENT' or 'FAILED').
 */
export async function sendVoucherDeliveryEmail(params: {
  to: string;
  orderId: string;
  productName: string;
  gameName: string;
  quantity: number;
  codes: string[];
  redemptionInstructions?: string;
  totalPaid?: string;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const { to, orderId, productName, gameName, quantity, codes, redemptionInstructions, totalPaid } = params;
  const subject = `أكواد طلبك جاهزة للاستخدام: ${productName} (${orderId.slice(0, 8)}) 🎁`;

  const codeBoxesHtml = codes.map((c, idx) => `
    <div style="background-color: #0B0F19; border: 1.5px solid ${BRAND_YELLOW}; border-radius: 10px; padding: 14px 16px; margin-bottom: 10px; text-align: center;">
      <span style="display: block; font-size: 11px; color: #94A3B8; font-weight: 700; margin-bottom: 4px;">
        كود التفعيل الرقمي ${codes.length > 1 ? `#${idx + 1}` : ''}:
      </span>
      <code style="font-family: 'Courier New', Courier, monospace; font-size: 18px; font-weight: 900; color: #FBBF24; letter-spacing: 1.5px; display: inline-block;">
        ${c}
      </code>
    </div>
  `).join('');

  const defaultInstructions = gameName.toLowerCase().includes('pubg')
    ? 'لاسترداد شدات ببجي: قم بزيارة موقع Midasbuy الرسمي (www.midasbuy.com)، اختر لعبة PUBG Mobile، اضغط على استرداد الرمز (Redeem)، أدخل معرّف اللاعب (Player ID) وكود الشدات أعلاه للتفعيل الفوري.'
    : 'لاسترداد جواهر فري فاير: قم بزيارة مركز شحن قارينا الرسمي (shop2game.com)، سجّل الدخول بمعرّف اللاعب (Player ID)، اختر قسيمة غارينا (Garena Voucher) وأدخل الكود أعلاه لشحن الجواهر فوراً.';

  const instructionsText = redemptionInstructions || defaultInstructions;

  const contentHtml = `
    <div style="text-align: center; margin-bottom: 24px;">
      <h2 style="margin: 0 0 6px 0; font-size: 22px; font-weight: 900; color: #0B0F19;">
        تم تسليم طلبك بنجاح! 🎉
      </h2>
      <p style="margin: 0; color: #64748B; font-size: 14px;">
        شكراً لشرائك من متجر KIROPRO. تجد أدناه بيانات وأكواد قسيمتك الرقمية.
      </p>
    </div>

    <!-- Order Summary Table -->
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 16px; margin-bottom: 20px;">
      <tr>
        <td style="padding: 6px 0; color: #64748B; font-size: 13px;">المنتج:</td>
        <td style="padding: 6px 0; color: #0B0F19; font-size: 13px; font-weight: 800; text-align: left;">${productName}</td>
      </tr>
      <tr>
        <td style="padding: 6px 0; color: #64748B; font-size: 13px;">الكمية:</td>
        <td style="padding: 6px 0; color: #0B0F19; font-size: 13px; font-weight: 800; text-align: left;">${quantity}</td>
      </tr>
      <tr>
        <td style="padding: 6px 0; color: #64748B; font-size: 13px;">رقم الطلب الداخلي:</td>
        <td style="padding: 6px 0; color: #0B0F19; font-size: 13px; font-weight: 700; font-family: monospace; text-align: left;">${orderId}</td>
      </tr>
      ${totalPaid ? `
      <tr>
        <td style="padding: 6px 0; color: #64748B; font-size: 13px;">المبلغ المدفوع:</td>
        <td style="padding: 6px 0; color: #059669; font-size: 14px; font-weight: 900; text-align: left;">${totalPaid}</td>
      </tr>` : ''}
    </table>

    <!-- Voucher Codes Section -->
    <div style="margin-bottom: 20px;">
      <h3 style="margin: 0 0 10px 0; font-size: 15px; font-weight: 900; color: #0B0F19;">
        🎁 أكواد التفعيل الرسمية:
      </h3>
      ${codeBoxesHtml}
    </div>

    <!-- Redemption Guide Box -->
    <div style="background-color: #FEF3C7; border: 1px solid #FDE68A; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
      <h4 style="margin: 0 0 6px 0; font-size: 13px; font-weight: 800; color: #92400E;">
        ℹ️ طريقة الاسترداد والشحن:
      </h4>
      <p style="margin: 0; font-size: 12px; color: #78350F; line-height: 1.6;">
        ${instructionsText}
      </p>
    </div>

    <!-- CTA Button -->
    <div style="text-align: center; margin: 24px 0 12px 0;">
      ${renderEmailButton('عرض الطلب في حسابك على المتجر', 'https://kiropro.store/account', true)}
    </div>
  `;

  const text = `
KIROPRO - تم تسليم طلبك بنجاح!
رقم الطلب: ${orderId}
المنتج: ${productName}
الأكواد:
${codes.join('\n')}

طريقة الاسترداد:
${instructionsText}
  `.trim();

  const html = renderEmailLayout(contentHtml, `أكواد طلبك جاهزة للاستخدام: ${productName}`);

  return recordAndSendEmail({
    orderId,
    eventType: 'ORDER_VOUCHER_DELIVERED',
    recipient: to,
    subject,
    html,
    text
  });
}

/**
 * Developer Support: Appreciation Email (Ordinary Donation)
 */
export async function sendSupportAppreciationEmail(params: {
  to: string;
  userName: string;
  amount: number;
  currentRank: string;
  rankBadge: string;
  totalDonated: number;
  remainingToNext?: number;
  nextRankName?: string;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const { to, userName, amount, currentRank, rankBadge, totalDonated, remainingToNext, nextRankName } = params;
  const subject = 'شكراً لدعمك المتجر وسيرفراتنا!';

  const remainingSnippet = (remainingToNext && remainingToNext > 0 && nextRankName)
    ? `
      <div style="background-color: #FEF3C7; border: 1px dashed #F59E0B; border-radius: 12px; padding: 14px 18px; margin-top: 18px; text-align: center;">
        <span style="font-size: 14px; color: #92400E; font-weight: 600;">
          تبقى لك <strong>${formatCurrencyAmount(remainingToNext, 'SDG')}</strong> فقط للترقية إلى رتبة <strong>[${nextRankName}]</strong> القادمة!
        </span>
      </div>
    `
    : `
      <div style="background-color: #ECFDF5; border: 1px dashed #10B981; border-radius: 12px; padding: 14px 18px; margin-top: 18px; text-align: center;">
        <span style="font-size: 14px; color: #065F46; font-weight: 700;">
          أنت الآن في أعلى الرتب العسكرية للمنصة! شكراً لعطائك الاستثنائي 👑
        </span>
      </div>
    `;

  const contentHtml = `
    <!-- Header Title -->
    <div style="text-align: center; margin-bottom: 24px;">
      <div style="font-size: 42px; line-height: 1; margin-bottom: 8px;">💖🎖️</div>
      <h2 style="color: #0F172A; margin: 0 0 6px 0; font-size: 22px; font-weight: 800;">شكراً لدعمك المتجر وسيرفراتنا!</h2>
      <p style="color: #64748B; margin: 0; font-size: 14px;">مرحباً ${userName}، مساهمتك الكريمة تصنع فارقاً كبيراً في استمرار وتطوير منصتنا.</p>
    </div>

    <!-- Details Card -->
    <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 16px; padding: 20px 24px; margin-bottom: 20px;">
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr>
          <td style="padding: 10px 0; color: #64748B; border-bottom: 1px solid #F1F5F9;">مبلغ الدعم المخصوم:</td>
          <td style="padding: 10px 0; text-align: left; font-weight: 800; color: #059669; border-bottom: 1px solid #F1F5F9;">
            ${formatCurrencyAmount(amount, 'SDG')}
          </td>
        </tr>
        <tr>
          <td style="padding: 10px 0; color: #64748B; border-bottom: 1px solid #F1F5F9;">إجمالي مساهماتك التراكمية:</td>
          <td style="padding: 10px 0; text-align: left; font-weight: 700; color: #0F172A; border-bottom: 1px solid #F1F5F9;">
            ${formatCurrencyAmount(totalDonated, 'SDG')}
          </td>
        </tr>
        <tr>
          <td style="padding: 10px 0; color: #64748B;">رتبتك الحالية:</td>
          <td style="padding: 10px 0; text-align: left; font-weight: 800; color: #D97706;">
            [ ${currentRank} ${rankBadge} ]
          </td>
        </tr>
      </table>
      ${remainingSnippet}
    </div>

    <!-- CTA Button -->
    <div style="text-align: center; margin: 28px 0 12px 0;">
      ${renderEmailButton('عرض رتبتك ولوحة الشرف', `${FRONTEND_URL}/developer-support`, true)}
    </div>
  `;

  const text = `
KIROPRO - شكراً لدعمك المتجر وسيرفراتنا!
مرحباً ${userName}،
تم خصم مبلغ الدعم بنجاح: ${formatCurrencyAmount(amount, 'SDG')}
إجمالي مساهماتك التراكمية: ${formatCurrencyAmount(totalDonated, 'SDG')}
رتبتك الحالية: [ ${currentRank} ${rankBadge} ]
رابط متابعة الرتب: ${FRONTEND_URL}/developer-support
  `.trim();

  const html = renderEmailLayout(contentHtml, `شكراً لمساهمتك الكريمة ودعمك للمتجر: ${formatCurrencyAmount(amount, 'SDG')}`);

  return recordAndSendEmail({
    eventType: 'SUPPORT_DONATION_COMPLETED',
    recipient: to,
    subject,
    html,
    text
  });
}

/**
 * Developer Support: Military Promotion Decree Email
 */
export async function sendMilitaryPromotionEmail(params: {
  to: string;
  userName: string;
  newRank: string;
  newBadge: string;
  newLevel: number;
  amount: number;
  totalDonated: number;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const { to, userName, newRank, newBadge, newLevel, amount, totalDonated } = params;
  const subject = `🎖️ مرسوم ترقية: مبارك ترقيتك إلى رتبة [${newRank}]!`;

  const contentHtml = `
    <!-- Header Emblem -->
    <div style="text-align: center; margin-bottom: 24px;">
      <div style="display: inline-block; background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%); padding: 18px 24px; border-radius: 20px; box-shadow: 0 10px 25px rgba(245, 158, 11, 0.4); margin-bottom: 12px;">
        <span style="font-size: 48px; line-height: 1;">${newBadge}</span>
      </div>
      <div style="display: inline-block; background-color: #FEF3C7; color: #B45309; padding: 4px 14px; border-radius: 999px; font-size: 13px; font-weight: 800; letter-spacing: 0.5px; margin-bottom: 8px;">
        المستوى العسكري ${newLevel} من 10
      </div>
      <h2 style="color: #0F172A; margin: 4px 0 6px 0; font-size: 24px; font-weight: 900;">مرسوم ترقية عسكرية رسمي</h2>
      <p style="color: #D97706; margin: 0; font-size: 17px; font-weight: 800;">رتبة [ ${newRank} ${newBadge} ]</p>
    </div>

    <!-- Official Decree Quote Card -->
    <div style="background: linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%); border: 2px solid #FDE68A; border-radius: 16px; padding: 22px 26px; margin-bottom: 24px; text-align: right; box-shadow: 0 4px 12px rgba(245, 158, 11, 0.08);">
      <p style="color: #78350F; font-size: 16px; line-height: 1.8; margin: 0; font-weight: 600;">
        <strong>تحية عسكرية يا بطل (${userName})!</strong><br/>
        تقديراً لمواقفك ودعمك المستمر للمتجر، صدر أمر ترقيتك رسمياً إلى رتبة 
        <strong style="color: #B45309; font-size: 18px;">[ ${newRank} ${newBadge} ]</strong>.<br/>
        تم تعليق شارتك العسكرية الجديدة في ملفك الشخصي لتظهر أمام الجميع. شكراً لأنك من أعمدة هذا المجتمع!
      </p>
    </div>

    <!-- Financial Ledger Info -->
    <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 16px; padding: 18px 24px; margin-bottom: 20px;">
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr>
          <td style="padding: 8px 0; color: #64748B;">مبلغ الدعم في هذه العملية:</td>
          <td style="padding: 8px 0; text-align: left; font-weight: 800; color: #0F172A;">
            ${formatCurrencyAmount(amount, 'SDG')}
          </td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #64748B;">إجمالي مبالغ دعمك التراكمية:</td>
          <td style="padding: 8px 0; text-align: left; font-weight: 900; color: #B45309;">
            ${formatCurrencyAmount(totalDonated, 'SDG')}
          </td>
        </tr>
      </table>
    </div>

    <!-- CTA Button -->
    <div style="text-align: center; margin: 28px 0 12px 0;">
      ${renderEmailButton('عرض شارتك الجديدة ولوحة الشرف', `${FRONTEND_URL}/developer-support`, true)}
    </div>
  `;

  const text = `
KIROPRO - مرسوم ترقية عسكرية رسمي!
تحية عسكرية يا بطل (${userName})!
تقديراً لمواقفك ودعمك المستمر للمتجر، صدر أمر ترقيتك رسمياً إلى رتبة [ ${newRank} ${newBadge} ].
تم تعليق شارتك العسكرية الجديدة في ملفك الشخصي لتظهر أمام الجميع. شكراً لأنك من أعمدة هذا المجتمع!
إجمالي مساهماتك: ${formatCurrencyAmount(totalDonated, 'SDG')}
رابط لوحة الشرف: ${FRONTEND_URL}/developer-support
  `.trim();

  const html = renderEmailLayout(contentHtml, `🎖️ مرسوم ترقية: مبارك ترقيتك إلى رتبة [${newRank}]!`);

  return recordAndSendEmail({
    eventType: 'MILITARY_RANK_PROMOTION',
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
  sendVoucherDeliveryEmail,
  sendUsdtOrderCompletedEmail,
  sendUsdtOrderCanceledEmail,
  sendPartnerWelcomeEmail,
  sendPartnerDepositApprovedEmail,
  sendPartnerDepositRejectedEmail,
  sendSupportAppreciationEmail,
  sendMilitaryPromotionEmail,
  renderEmailBrand,
  renderEmailLayout,
  renderEmailStatusBadge,
  renderEmailButton,
  buildVerificationOtpEmailTemplate
};




