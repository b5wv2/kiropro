import React, { createContext, useContext, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

export type ActiveOverlay = 'mobile-menu' | 'account' | 'wallet' | null;

interface OverlayContextType {
  activeOverlay: ActiveOverlay;
  openOverlay: (overlay: ActiveOverlay) => void;
  closeOverlay: () => void;
}

const OverlayContext = createContext<OverlayContextType | undefined>(undefined);

export const OverlayProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeOverlay, setActiveOverlay] = useState<ActiveOverlay>(null);

  const openOverlay = (overlay: ActiveOverlay) => {
    setActiveOverlay(overlay);
  };

  const closeOverlay = () => {
    setActiveOverlay(null);
  };

  useEffect(() => {
    if (activeOverlay) {
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
    } else {
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    }
    
    return () => {
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    };
  }, [activeOverlay]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && activeOverlay) {
        closeOverlay();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeOverlay]);

  return (
    <OverlayContext.Provider value={{ activeOverlay, openOverlay, closeOverlay }}>
      {children}
      {/* Central Backdrop - Rendered via Portal */}
      {activeOverlay && createPortal(
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(11, 15, 25, 0.5)',
            zIndex: 9990, // Backdrop z-index (drawers are 10000)
            opacity: 1,
            backdropFilter: 'none',
            WebkitBackdropFilter: 'none',
            transition: 'opacity 0.2s ease',
          }}
          onClick={closeOverlay}
          aria-hidden="true"
        />,
        document.body
      )}
    </OverlayContext.Provider>
  );
};

export const useOverlay = () => {
  const context = useContext(OverlayContext);
  if (!context) {
    throw new Error('useOverlay must be used within an OverlayProvider');
  }
  return context;
};
