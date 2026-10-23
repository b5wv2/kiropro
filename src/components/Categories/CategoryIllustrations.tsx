import React from 'react';

/**
 * 2026 Modern Vector Illustrations for KiroPro Categories
 * Ultra-lightweight, 0 network latency, razor-sharp on Retina/4K/OLED screens.
 */

export const VouchersIllustration: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 160 100"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    style={{ width: '100%', height: '100%', maxHeight: 95, display: 'block' }}
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="vouch-gold" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#FDE047" />
        <stop offset="100%" stopColor="#EAB308" />
      </linearGradient>
      <linearGradient id="vouch-ps" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#00439C" />
        <stop offset="100%" stopColor="#002255" />
      </linearGradient>
      <linearGradient id="vouch-dark" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#1E293B" />
        <stop offset="100%" stopColor="#0F172A" />
      </linearGradient>
      <filter id="vouch-shadow" x="-10%" y="-10%" width="130%" height="130%">
        <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#0F172A" floodOpacity="0.18" />
      </filter>
    </defs>

    {/* Background Yellow Voucher Card */}
    <g transform="translate(18, 12) rotate(-8)" filter="url(#vouch-shadow)">
      <rect width="68" height="44" rx="8" fill="url(#vouch-gold)" />
      <circle cx="14" cy="22" r="6" fill="#FEF08A" opacity="0.6" />
      <rect x="26" y="16" width="30" height="4" rx="2" fill="#713F12" opacity="0.4" />
      <rect x="26" y="24" width="20" height="3" rx="1.5" fill="#713F12" opacity="0.3" />
    </g>

    {/* PlayStation Blue Card */}
    <g transform="translate(76, 16) rotate(6)" filter="url(#vouch-shadow)">
      <rect width="70" height="46" rx="9" fill="url(#vouch-ps)" />
      {/* PS Shapes */}
      <polygon points="18,22 24,14 30,22" stroke="#FFFFFF" strokeWidth="2" strokeLinejoin="round" fill="none" opacity="0.9" />
      <circle cx="40" cy="18" r="4" stroke="#FFFFFF" strokeWidth="2" fill="none" opacity="0.9" />
      <line x1="16" y1="33" x2="24" y2="39" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" opacity="0.9" />
      <line x1="24" y1="33" x2="16" y2="39" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" opacity="0.9" />
      <rect x="36" y="31" width="8" height="8" rx="1" stroke="#FFFFFF" strokeWidth="2" fill="none" opacity="0.9" />
    </g>

    {/* Front Google Play Card */}
    <g transform="translate(36, 32)" filter="url(#vouch-shadow)">
      <rect width="80" height="52" rx="10" fill="url(#vouch-dark)" stroke="#334155" strokeWidth="1" />
      {/* Google Play Multi-colored Logo */}
      <g transform="translate(26, 14)">
        {/* Blue Triangle */}
        <path d="M4 3L18 12L4 21V3Z" fill="#3B82F6" />
        {/* Yellow Overlap */}
        <path d="M18 12L24 8.5L20 4.5L18 12Z" fill="#FACC15" />
        {/* Green Top */}
        <path d="M4 3L18 12L20 4.5L5 0.5C4.4 0.3 4 0.7 4 1.3V3Z" fill="#22C55E" />
        {/* Red Bottom */}
        <path d="M4 21L18 12L20 19.5L5 23.5C4.4 23.7 4 23.3 4 22.7V21Z" fill="#EF4444" />
      </g>
      <rect x="58" y="22" width="14" height="4" rx="2" fill="#E2E8F0" opacity="0.7" />
      <rect x="58" y="30" width="10" height="3" rx="1.5" fill="#64748B" />
    </g>
  </svg>
);

export const GameTopUpIllustration: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 160 100"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    style={{ width: '100%', height: '100%', maxHeight: 95, display: 'block' }}
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="game-controller" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#1E293B" />
        <stop offset="100%" stopColor="#0B0F19" />
      </linearGradient>
      <filter id="game-shadow" x="-10%" y="-10%" width="130%" height="130%">
        <feDropShadow dx="0" dy="5" stdDeviation="6" floodColor="#0F172A" floodOpacity="0.22" />
      </filter>
    </defs>

    {/* Background floating game badges */}
    {/* Free Fire mini card */}
    <g transform="translate(100, 10) rotate(10)">
      <rect width="38" height="30" rx="7" fill="#F97316" opacity="0.9" />
      <path d="M11 20C11 20 12 14 17 11C18 14 21 13 22 8C26 12 28 17 25 21C22 25 15 25 11 20Z" fill="#FEF08A" />
    </g>

    {/* PUBG mini card */}
    <g transform="translate(24, 12) rotate(-10)">
      <rect width="38" height="30" rx="7" fill="#3B82F6" opacity="0.9" />
      <circle cx="19" cy="15" r="7" fill="#FFFFFF" opacity="0.9" />
      <path d="M14 17C14 14 17 12 24 12V18H14Z" fill="#1E293B" />
    </g>

    {/* Sleek Modern Controller */}
    <g transform="translate(26, 26)" filter="url(#game-shadow)">
      {/* Controller Body */}
      <path
        d="M24 10C36 8 72 8 84 10C94 11 106 20 102 44C100 56 90 62 82 58C72 54 68 44 54 44C40 44 36 54 26 58C18 62 8 56 6 44C2 20 14 11 24 10Z"
        fill="url(#game-controller)"
        stroke="#334155"
        strokeWidth="1.2"
      />

      {/* Cyber Yellow Accent Bar */}
      <path d="M42 12C48 11 60 11 66 12L64 16H44L42 12Z" fill="#FFE600" />

      {/* Left D-Pad */}
      <rect x="23" y="24" width="6" height="16" rx="2" fill="#334155" />
      <rect x="18" y="29" width="16" height="6" rx="2" fill="#334155" />
      <circle cx="26" cy="32" r="2" fill="#FFE600" />

      {/* Right Action Buttons */}
      <circle cx="82" cy="26" r="3" fill="#FFE600" /> {/* Y */}
      <circle cx="76" cy="32" r="3" fill="#38BDF8" /> {/* X */}
      <circle cx="88" cy="32" r="3" fill="#EF4444" /> {/* B */}
      <circle cx="82" cy="38" r="3" fill="#22C55E" /> {/* A */}

      {/* Dual Analog Thumbsticks with Yellow Accent Rings */}
      <circle cx="42" cy="38" r="8" fill="#0B0F19" stroke="#FFE600" strokeWidth="1.5" />
      <circle cx="42" cy="38" r="5" fill="#334155" />

      <circle cx="66" cy="38" r="8" fill="#0B0F19" stroke="#FFE600" strokeWidth="1.5" />
      <circle cx="66" cy="38" r="5" fill="#334155" />
    </g>
  </svg>
);

export const PaymentCardsIllustration: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 160 100"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    style={{ width: '100%', height: '100%', maxHeight: 95, display: 'block' }}
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="card-dark" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#1E293B" />
        <stop offset="100%" stopColor="#0B0F19" />
      </linearGradient>
      <linearGradient id="card-visa" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#0F172A" />
        <stop offset="100%" stopColor="#020617" />
      </linearGradient>
      <filter id="paycard-shadow" x="-10%" y="-10%" width="130%" height="130%">
        <feDropShadow dx="0" dy="5" stdDeviation="6" floodColor="#0B0F19" floodOpacity="0.25" />
      </filter>
    </defs>

    {/* Back Card (Visa) */}
    <g transform="translate(68, 14) rotate(8)" filter="url(#paycard-shadow)">
      <rect width="78" height="50" rx="9" fill="url(#card-visa)" stroke="#334155" strokeWidth="1" />
      <text x="44" y="24" fill="#FFFFFF" fontSize="9" fontWeight="900" fontFamily="sans-serif" letterSpacing="1">VISA</text>
      <circle cx="16" cy="22" r="5" fill="#38BDF8" opacity="0.6" />
      <rect x="14" y="36" width="30" height="3" rx="1.5" fill="#475569" />
    </g>

    {/* Front Card (KIROPRO Mastercard) */}
    <g transform="translate(16, 26) rotate(-3)" filter="url(#paycard-shadow)">
      <rect width="86" height="54" rx="10" fill="url(#card-dark)" stroke="#334155" strokeWidth="1.2" />

      {/* Gold EMV Chip */}
      <rect x="12" y="14" width="13" height="10" rx="2.5" fill="#F59E0B" stroke="#D97706" strokeWidth="0.8" />
      <line x1="12" y1="19" x2="25" y2="19" stroke="#B45309" strokeWidth="0.6" />

      {/* KIROPRO Brand Text */}
      <text x="32" y="21" fill="#FFE600" fontSize="8" fontWeight="900" fontFamily="sans-serif" letterSpacing="0.8">KIROPRO</text>

      {/* Contactless symbol */}
      <path d="M72 14C74 16 74 19 72 21M69 16C70 17.5 70 18.5 69 19.5" stroke="#94A3B8" strokeWidth="1" strokeLinecap="round" />

      {/* Card number dots */}
      <circle cx="14" cy="36" r="1.5" fill="#94A3B8" />
      <circle cx="19" cy="36" r="1.5" fill="#94A3B8" />
      <circle cx="24" cy="36" r="1.5" fill="#94A3B8" />
      <circle cx="29" cy="36" r="1.5" fill="#94A3B8" />
      <text x="34" y="38" fill="#E2E8F0" fontSize="7" fontWeight="700" fontFamily="monospace">8824</text>

      {/* Mastercard Interlocking Circles */}
      <g transform="translate(60, 36)">
        <circle cx="8" cy="7" r="7" fill="#EB001B" />
        <circle cx="17" cy="7" r="7" fill="#F79E1B" opacity="0.9" />
      </g>
    </g>
  </svg>
);

export const SocialMediaIllustration: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 160 100"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    style={{ width: '100%', height: '100%', maxHeight: 95, display: 'block' }}
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="soc-ig" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#833AB4" />
        <stop offset="50%" stopColor="#FD1D1D" />
        <stop offset="100%" stopColor="#FCB045" />
      </linearGradient>
      <filter id="soc-shadow" x="-15%" y="-15%" width="130%" height="130%">
        <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#0F172A" floodOpacity="0.18" />
      </filter>
    </defs>

    {/* 1. Instagram */}
    <g transform="translate(18, 16) rotate(-6)" filter="url(#soc-shadow)">
      <rect width="36" height="36" rx="10" fill="url(#soc-ig)" />
      <rect x="8" y="8" width="20" height="20" rx="5" stroke="#FFFFFF" strokeWidth="2.2" fill="none" />
      <circle cx="18" cy="18" r="5" stroke="#FFFFFF" strokeWidth="2.2" fill="none" />
      <circle cx="23.5" cy="12.5" r="1.3" fill="#FFFFFF" />
    </g>

    {/* 2. TikTok */}
    <g transform="translate(56, 10) rotate(4)" filter="url(#soc-shadow)">
      <rect width="36" height="36" rx="10" fill="#010101" />
      <path
        d="M21 10C22.2 12.2 24.5 13.5 27 13.7V17.2C24.8 17.1 22.8 16.3 21.3 15V22C21.3 25.3 18.6 28 15.3 28C12 28 9.3 25.3 9.3 22C9.3 18.7 12 16 15.3 16C15.9 16 16.5 16.1 17.1 16.3V19.9C16.5 19.6 15.9 19.5 15.3 19.5C13.9 19.5 12.8 20.6 12.8 22C12.8 23.4 13.9 24.5 15.3 24.5C16.7 24.5 17.8 23.4 17.8 22V10H21Z"
        fill="#00F2FE"
      />
      <path
        d="M20 11C21.2 13.2 23.5 14.5 26 14.7V16.7C23.8 16.6 21.8 15.8 20.3 14.5V21C20.3 24.3 17.6 27 14.3 27C11 27 8.3 24.3 8.3 21C8.3 17.7 11 15 14.3 15C14.9 15 15.5 15.1 16.1 15.3V18.9C15.5 18.6 14.9 18.5 14.3 18.5C12.9 18.5 11.8 19.6 11.8 21C11.8 22.4 12.9 23.5 14.3 23.5C15.7 23.5 16.8 22.4 16.8 21V11H20Z"
        fill="#FE0979"
      />
      <path
        d="M20.5 10.5C21.7 12.7 24 14 26.5 14.2V16.7C24.3 16.6 22.3 15.8 20.8 14.5V21.5C20.8 24.8 18.1 27.5 14.8 27.5C11.5 27.5 8.8 24.8 8.8 21.5C8.8 18.2 11.5 15.5 14.8 15.5C15.4 15.5 16 15.6 16.6 15.8V19.4C16 19.1 15.4 19 14.8 19C13.4 19 12.3 20.1 12.3 21.5C12.3 22.9 13.4 24 14.8 24C16.2 24 17.3 22.9 17.3 21.5V10.5H20.5Z"
        fill="#FFFFFF"
      />
    </g>

    {/* 3. YouTube */}
    <g transform="translate(42, 48) rotate(-2)" filter="url(#soc-shadow)">
      <rect width="36" height="34" rx="9" fill="#FF0000" />
      <polygon points="14,11 26,17 14,23" fill="#FFFFFF" />
    </g>

    {/* 4. Telegram */}
    <g transform="translate(92, 38) rotate(5)" filter="url(#soc-shadow)">
      <circle cx="20" cy="20" r="18" fill="#2AABEE" />
      <path
        d="M10 20L28 12L24 28L18 22L14 25V20Z"
        fill="#FFFFFF"
      />
      <path
        d="M18 22L25 15L15 21L18 22Z"
        fill="#CBD5E1"
      />
    </g>
  </svg>
);

export const VirtualNumbersIllustration: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 160 100"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    style={{ width: '100%', height: '100%', maxHeight: 95, display: 'block' }}
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="phone-body" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#1E293B" />
        <stop offset="100%" stopColor="#0B0F19" />
      </linearGradient>
      <linearGradient id="chat-gold" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#FFE600" />
        <stop offset="100%" stopColor="#EAB308" />
      </linearGradient>
      <filter id="phone-shadow" x="-15%" y="-15%" width="130%" height="130%">
        <feDropShadow dx="0" dy="5" stdDeviation="6" floodColor="#0F172A" floodOpacity="0.22" />
      </filter>
    </defs>

    {/* Background Glow / Secondary Card */}
    <rect x="36" y="16" width="48" height="70" rx="12" fill="#FEF08A" opacity="0.3" transform="rotate(-6 36 16)" />

    {/* Modern Smartphone */}
    <g transform="translate(48, 12)" filter="url(#phone-shadow)">
      <rect width="48" height="76" rx="11" fill="url(#phone-body)" stroke="#334155" strokeWidth="1.2" />

      {/* Screen area */}
      <rect x="4" y="6" width="40" height="64" rx="7" fill="#0B0F19" />

      {/* Speaker Bar */}
      <rect x="18" y="2" width="12" height="2" rx="1" fill="#475569" />

      {/* In-Call Phone Receiver Icon */}
      <g transform="translate(15, 24)">
        <circle cx="9" cy="9" r="11" fill="rgba(255, 230, 0, 0.15)" />
        <path
          d="M6 5C5.4 5 5 5.4 5 6C5 11 9 15 14 15C14.6 15 15 14.6 15 14V12.3C15 11.9 14.7 11.6 14.4 11.5L12.4 10.6C12.1 10.5 11.7 10.6 11.5 10.8L10.6 11.7C9.2 11 8 9.8 7.3 8.4L8.2 7.5C8.4 7.3 8.5 6.9 8.4 6.6L7.5 4.6C7.4 4.3 7.1 4 6.7 4H6Z"
          fill="#FFE600"
        />
      </g>
    </g>

    {/* Floating Yellow Chat Bubble with OTP Dots */}
    <g transform="translate(84, 32)" filter="url(#phone-shadow)">
      <path
        d="M6 0H36C39.3 0 42 2.7 42 6V24C42 27.3 39.3 30 36 30H12L4 36V30C1.8 30 0 28.2 0 26V6C0 2.7 2.7 0 6 0Z"
        fill="url(#chat-gold)"
      />
      <circle cx="13" cy="15" r="2.5" fill="#0B0F19" />
      <circle cx="21" cy="15" r="2.5" fill="#0B0F19" />
      <circle cx="29" cy="15" r="2.5" fill="#0B0F19" />
    </g>
  </svg>
);

export const SubscriptionsIllustration: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 160 100"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    style={{ width: '100%', height: '100%', maxHeight: 95, display: 'block' }}
    aria-hidden="true"
  >
    <defs>
      <filter id="sub-shadow" x="-15%" y="-15%" width="130%" height="130%">
        <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#0F172A" floodOpacity="0.18" />
      </filter>
    </defs>

    {/* 1. Netflix Card */}
    <g transform="translate(20, 24) rotate(-6)" filter="url(#sub-shadow)">
      <rect width="38" height="48" rx="8" fill="#141414" stroke="#262626" strokeWidth="1" />
      {/* 3D Ribbon 'N' */}
      <path d="M12 10H16V38H12V10Z" fill="#B20710" />
      <path d="M22 10H26V38H22V10Z" fill="#B20710" />
      <path d="M12 10L26 38H22L12 10Z" fill="#E50914" />
    </g>

    {/* 2. Spotify Card */}
    <g transform="translate(60, 14) rotate(4)" filter="url(#sub-shadow)">
      <rect width="42" height="42" rx="10" fill="#121212" stroke="#282828" strokeWidth="1" />
      {/* Spotify Audio Arcs */}
      <circle cx="21" cy="21" r="14" fill="#1DB954" />
      <path d="M13 18C17 16.8 22 17.2 26.5 19.5" stroke="#121212" strokeWidth="2.4" strokeLinecap="round" fill="none" />
      <path d="M14 22C17.5 21 21.5 21.3 25 23" stroke="#121212" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M15.5 26C18.2 25.2 21.2 25.5 23.8 26.8" stroke="#121212" strokeWidth="1.6" strokeLinecap="round" fill="none" />
    </g>

    {/* 3. YouTube Premium Badge */}
    <g transform="translate(94, 34) rotate(-3)" filter="url(#sub-shadow)">
      <rect width="44" height="34" rx="9" fill="#FF0000" />
      <polygon points="17,10 30,17 17,24" fill="#FFFFFF" />
    </g>
  </svg>
);
