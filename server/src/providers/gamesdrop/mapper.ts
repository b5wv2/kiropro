import { GamesDropOrderStatus } from './types';

export type KiroOrderStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';

/**
 * Map GamesDrop status to internal KIROPRO order status
 */
export function mapGamesDropStatus(status: GamesDropOrderStatus | string): KiroOrderStatus {
  const cleanStatus = (status || '').toUpperCase();
  switch (cleanStatus) {
    case 'SUBMITTED':
    case 'PROCESSING':
      return 'PROCESSING';
    case 'COMPLETED':
      return 'COMPLETED';
    case 'CANCELED':
    case 'FAILED':
      return 'FAILED';
    case 'REFUND':
    case 'REFUNDED':
      return 'REFUNDED';
    default:
      return 'PROCESSING';
  }
}

/**
 * Map GamesDrop error codes to friendly customer-safe messages
 * Strictly avoids leaking provider, supplier, or backend technical terms to the customer.
 */
export function mapGamesDropErrorMessage(errorCode?: string, originalMsg?: string): string {
  const code = (errorCode || '').toUpperCase();
  switch (code) {
    case 'INVALID_TOKEN':
      return 'الخدمة غير متاحة مؤقتاً، يرجى المحاولة لاحقاً.';
    case 'OFFER_NOT_FOUND':
      return 'الباقة المطلوبة غير متوفرة حالياً، يرجى اختيار باقة أخرى.';
    case 'TRANSACTION_DUPLICATE':
      return 'تم إرسال هذا الطلب مسبقاً، يرجى التحقق من قائمة طلباتك.';
    case 'WRONG_PRICE':
      return 'تغير سعر المنتج، يرجى تحديث الصفحة والمحاولة مرة أخرى.';
    case 'ORDER_NOT_FOUND':
      return 'لم يتم العثور على تفاصيل الطلب.';
    case 'INSUFFICIENT_BALANCE':
    case 'BALANCE_UNAVAILABLE':
      return 'تعذر تنفيذ الطلب حالياً، يرجى المحاولة لاحقاً.';
    case 'SERVICE_UNAVAILABLE':
      return 'الخدمة تحت الصيانة الدورية حالياً، يرجى المحاولة بعد قليل.';
    case 'INVALID_REQUEST_BODY':
      return 'بيانات الطلب المدخلة غير صالحة.';
    default:
      return 'تعذر استكمال معالجة الطلب حالياً. يرجى المحاولة لاحقاً.';
  }
}
