import React from 'react';
import { Header } from '../components/Header/Header';
import { MobileMenu } from '../components/MobileMenu/MobileMenu';
import { AccountDrawer } from '../components/AccountMenu/AccountDrawer';
import { Footer } from '../components/Footer/Footer';
import { DepositModal } from '../components/Modal/DepositModal';
import { useWallet } from '../context/WalletContext';
import { FloatingWhatsApp } from '../components/common/FloatingWhatsApp';

interface MainLayoutProps {
  children: React.ReactNode;
}

export const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const { toastMessage, toastType } = useWallet();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', width: '100%', overflowX: 'hidden' }}>
      {/* Sticky Header */}
      <Header />

      {/* Main Navigation Drawer on Mobile */}
      <MobileMenu />

      {/* Account Drawer on Mobile */}
      <AccountDrawer />

      {/* Main Content View */}
      <main style={{ flexGrow: 1, width: '100%' }}>
        {children}
      </main>

      {/* Footer */}
      <Footer />

      {/* Global Wallet Deposit Modal */}
      <DepositModal />

      {/* Global Toast Notification */}
      {toastMessage && (
        <div className="toast-container">
          <div className="toast">
            {toastType === 'success' ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFE600" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFE600" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            )}
            <span>{toastMessage}</span>
          </div>
        </div>
      )}
      <FloatingWhatsApp />
    </div>
  );
};
