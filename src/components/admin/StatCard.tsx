import React from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ size?: number; className?: string; color?: string; strokeWidth?: number }>;
  iconColor?: string;
  iconBg?: string;
  subtitle?: string;
  trend?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  icon: Icon,
  iconColor = '#f59e0b',
  iconBg = 'rgba(245, 158, 11, 0.12)',
  subtitle,
  trend
}) => {
  return (
    <div className="admin-stat-card">
      <div className="admin-stat-card-header">
        <span className="admin-stat-label">{label}</span>
        <div className="admin-stat-icon-wrapper" style={{ backgroundColor: iconBg, color: iconColor }}>
          <Icon size={22} strokeWidth={2.2} color={iconColor} />
        </div>
      </div>
      
      <div className="admin-stat-value">{value}</div>
      
      {(subtitle || trend) && (
        <div className="admin-stat-footer">
          {trend && <span style={{ color: '#10b981', fontWeight: 700 }}>{trend}</span>}
          {subtitle && <span>{subtitle}</span>}
        </div>
      )}
    </div>
  );
};
