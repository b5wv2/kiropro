import React from 'react';
import { 
  LayoutDashboard, 
  Users, 
  ShoppingCart, 
  Wallet, 
  Tag, 
  Package, 
  Server, 
  ShieldAlert, 
  Settings, 
  Store, 
  LogOut,
  X,
  ArrowDownCircle,
  CreditCard,
  Coins,
  Star,
  ShieldCheck,
  Trophy
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export type AdminTab = 
  | 'dashboard' 
  | 'customers' 
  | 'referrals'
  | 'orders' 
  | 'crypto'
  | 'topups'
  | 'payment-methods'
  | 'wallet' 
  | 'cashback'
  | 'codes' 
  | 'products' 
  | 'reviews'
  | 'providers' 
  | 'audit' 
  | 'security'
  | 'settings';

interface AdminSidebarProps {
  activeTab: AdminTab;
  setActiveTab: (tab: AdminTab) => void;
  isOpen: boolean;
  onClose: () => void;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({
  activeTab,
  setActiveTab,
  isOpen,
  onClose
}) => {
  const { user, navigateTo, logout } = useAuth();

  const navItems: { id: AdminTab; label: string; icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }> }[] = [
    { id: 'dashboard', label: 'لوحة التحكم', icon: LayoutDashboard },
    { id: 'customers', label: 'العملاء', icon: Users },
    { id: 'referrals', label: 'متصدرين الإحالات', icon: Trophy },
    { id: 'orders', label: 'الطلبات', icon: ShoppingCart },
    { id: 'crypto', label: 'إدارة USDT والتحويل', icon: Coins },
    { id: 'topups', label: 'طلبات الشحن البنكي', icon: ArrowDownCircle },
    { id: 'payment-methods', label: 'طرق الدفع والحسابات', icon: CreditCard },
    { id: 'wallet', label: 'إدارة المحافظ', icon: Wallet },
    { id: 'cashback', label: 'مكافآت الكاش باك', icon: Coins },
    { id: 'codes', label: 'أكواد الخصم', icon: Tag },
    { id: 'products', label: 'المنتجات والألعاب', icon: Package },
    { id: 'reviews', label: 'التقييمات والمراجعات', icon: Star },
    { id: 'providers', label: 'مزودو الخدمة (APIs)', icon: Server },
    { id: 'audit', label: 'سجل العمليات (Audit)', icon: ShieldAlert },
    { id: 'security', label: 'سجل الأمان (Security)', icon: ShieldCheck },
    { id: 'settings', label: 'إعدادات المنصة', icon: Settings },
  ];

  const handleNavClick = (tabId: AdminTab) => {
    setActiveTab(tabId);
    onClose();
  };

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      <div 
        className={`admin-mobile-overlay ${isOpen ? 'open' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sidebar Element */}
      <aside className={`admin-sidebar ${isOpen ? 'open' : ''}`}>
        {/* Brand Header */}
        <div className="admin-sidebar-brand" style={{ justifyContent: 'space-between' }}>
          <div className="admin-sidebar-brand-logo">
            <span className="admin-sidebar-brand-title">KIRO</span>
            <span className="admin-sidebar-brand-badge">PRO ADMIN</span>
          </div>
          <button 
            className="admin-modal-close" 
            style={{ display: isOpen ? 'flex' : 'none', color: '#94a3b8' }}
            onClick={onClose}
            aria-label="إغلاق القائمة"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="admin-sidebar-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`admin-nav-item ${isActive ? 'active' : ''}`}
              >
                <Icon size={20} strokeWidth={isActive ? 2.5 : 2} className="admin-nav-icon" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Footer Profile & Actions */}
        <div className="admin-sidebar-footer">
          <div className="admin-user-profile-badge">
            <div className="admin-user-avatar">
              {(user?.name || 'A').charAt(0).toUpperCase()}
            </div>
            <div className="admin-user-info">
              <div className="admin-user-name">{user?.name || 'مسؤول النظام'}</div>
              <div className="admin-user-email">{user?.email || 'حساب مسؤول'}</div>
            </div>
          </div>

          <button
            onClick={() => navigateTo('home')}
            className="admin-btn admin-btn-secondary"
            style={{ width: '100%', justifyContent: 'flex-start' }}
          >
            <Store size={18} />
            <span>عرض المتجر</span>
          </button>

          <button
            onClick={logout}
            className="admin-btn admin-btn-outline-danger"
            style={{ width: '100%', justifyContent: 'flex-start' }}
          >
            <LogOut size={18} />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </aside>
    </>
  );
};
