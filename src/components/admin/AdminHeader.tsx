import React from 'react';
import { Menu, Store, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { AdminTab } from './AdminSidebar';

interface AdminHeaderProps {
  activeTab: AdminTab;
  onOpenMobileMenu: () => void;
}

export const AdminHeader: React.FC<AdminHeaderProps> = ({
  activeTab,
  onOpenMobileMenu
}) => {
  const { navigateTo, logout } = useAuth();

  const getTabTitles = (tab: AdminTab) => {
    switch (tab) {
      case 'dashboard':
        return { title: 'لوحة التحكم الرئيسية', subtitle: 'نظرة عامة على أداء المنصة والإحصائيات الحية' };
      case 'customers':
        return { title: 'إدارة العملاء', subtitle: 'قائمة المستخدمين المسجلين، الأرصدة، وتفاصيل الحسابات' };
      case 'referrals':
        return { title: 'متصدرين الإحالات والمسابقات', subtitle: 'إحصائيات الإحالات، المتصدرين، وتدقيق المدعوين وعمليات الشحن' };
      case 'orders':
        return { title: 'إدارة الطلبات والشحن', subtitle: 'متابعة الطلبات المباشرة، التنفيذ اليدوي والاسترجاع' };
      case 'topups':
        return { title: 'طلبات شحن المحفظة (التحويل البنكي)', subtitle: 'تدقيق ومراجعة إيصالات التحويل البنكي واعتماد إضافة الرصيد' };
      case 'payment-methods':
        return { title: 'طرق الدفع والحسابات البنكية', subtitle: 'إدارة الحسابات البنكية ومحافظ التحويل المحلي للمستخدمين' };
      case 'wallet':
        return { title: 'العمليات المالية والمحافظ', subtitle: 'إجمالي الأرصدة وسجل حركات الإيداع والخصم' };
      case 'codes':
        return { title: 'أكواد الخصم والترويج', subtitle: 'إنشاء ومتابعة كوبونات الخصم ورصيد المحفظة المجاني' };
      case 'products':
        return { title: 'المنتجات وباقات الألعاب', subtitle: 'إدارة توفر الألعاب، الباقات، ومفاتيح الشحن' };
      case 'providers':
        return { title: 'بوابات ومزودو الخدمة (APIs)', subtitle: 'مراقبة اتصال بوابات الشحن الخارجية وحالة الخوادم' };
      case 'audit':
        return { title: 'سجل العمليات والرقابة (Audit Log)', subtitle: 'سجل غير قابل للتعديل لجميع العمليات الإدارية في النظام' };
      case 'settings':
        return { title: 'إعدادات النظام والمنصة', subtitle: 'التحكم في بيانات المتجر، العملة، ووضع الصيانة' };
      default:
        return { title: 'لوحة الإدارة', subtitle: 'إدارة منصة KIROPRO' };
    }
  };

  const { title, subtitle } = getTabTitles(activeTab);

  return (
    <header className="admin-header">
      <div className="admin-header-start">
        <button 
          className="admin-mobile-toggle"
          onClick={onOpenMobileMenu}
          aria-label="فتح القائمة"
        >
          <Menu size={22} />
        </button>

        <div className="admin-header-title-group">
          <h1 className="admin-header-title">{title}</h1>
          <p className="admin-header-subtitle">{subtitle}</p>
        </div>
      </div>

      <div className="admin-header-actions">
        <div className="admin-status-indicator" title="قاعدة بيانات PostgreSQL متصلة وتعمل بصحة جيدة">
          <span className="admin-status-dot"></span>
          <span>قاعدة البيانات متصلة</span>
        </div>

        <button 
          className="admin-btn admin-btn-secondary admin-btn-sm"
          onClick={() => navigateTo('home')}
          title="العودة إلى متجر المستخدمين"
        >
          <Store size={16} />
          <span className="btn-label">عرض المتجر</span>
        </button>

        <button 
          className="admin-btn admin-btn-outline-danger admin-btn-sm"
          onClick={logout}
          title="تسجيل الخروج من لوحة الإدارة"
        >
          <LogOut size={16} />
          <span className="btn-label">خروج</span>
        </button>
      </div>
    </header>
  );
};
