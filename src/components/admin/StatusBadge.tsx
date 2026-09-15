import React from 'react';

export type StatusType = 
  | 'PENDING' | 'COMPLETED' | 'FAILED' | 'PROCESSING' | 'CANCELLED'
  | 'ACTIVE' | 'INACTIVE' | 'EXPIRED' | 'SUSPENDED'
  | 'ONLINE' | 'OFFLINE'
  | 'WALLET_CREDIT' | 'WALLET_DEBIT' | 'DEPOSIT' | 'PURCHASE' | 'REFUND' | 'ADMIN_ADJUSTMENT';

interface StatusBadgeProps {
  status: StatusType | string;
  customLabel?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, customLabel }) => {
  const normalized = (status || '').toUpperCase();

  let className = 'admin-badge-neutral';
  let defaultLabel = status;

  switch (normalized) {
    case 'COMPLETED':
    case 'ACTIVE':
    case 'ONLINE':
      className = 'admin-badge-success';
      defaultLabel = normalized === 'COMPLETED' ? 'مكتمل' : normalized === 'ACTIVE' ? 'نشط' : 'متصل';
      break;

    case 'PENDING':
    case 'PROCESSING':
      className = 'admin-badge-warning';
      defaultLabel = normalized === 'PENDING' ? 'قيد الانتظار' : 'جاري المعالجة';
      break;

    case 'FAILED':
    case 'SUSPENDED':
    case 'OFFLINE':
    case 'CANCELLED':
      className = 'admin-badge-danger';
      defaultLabel = normalized === 'FAILED' ? 'مرفوض / فشل' : normalized === 'SUSPENDED' ? 'معلق' : 'ملغي';
      break;

    case 'WALLET_CREDIT':
    case 'DEPOSIT':
    case 'REFUND':
    case 'REFUNDED':
      className = 'admin-badge-success';
      defaultLabel = normalized === 'WALLET_CREDIT' ? 'إيداع إداري' : normalized === 'DEPOSIT' ? 'إيداع' : 'استرجاع';
      break;

    case 'WALLET_DEBIT':
    case 'PURCHASE':
    case 'ADMIN_ADJUSTMENT':
      className = 'admin-badge-info';
      defaultLabel = normalized === 'WALLET_DEBIT' ? 'خصم إداري' : normalized === 'PURCHASE' ? 'شراء طلب' : 'تعديل رصيد';
      break;

    case 'EXPIRED':
    case 'INACTIVE':
      className = 'admin-badge-neutral';
      defaultLabel = normalized === 'EXPIRED' ? 'منتهي الصلاحية' : 'غير نشط';
      break;

    default:
      className = 'admin-badge-neutral';
      defaultLabel = status;
  }

  return (
    <span className={`admin-badge ${className}`}>
      {customLabel || defaultLabel}
    </span>
  );
};
