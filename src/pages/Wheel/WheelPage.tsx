import React, { useEffect, useRef, useState, useCallback } from 'react';
import { wheelApi, PublicWheelPrize, WheelStatusResponse } from '../../services/wheelApi';
import { useAuth } from '../../context/AuthContext';
import styles from './WheelPage.module.css';
import { 
  Sparkles, 
  Clock, 
  CheckCircle2, 
  Copy, 
  AlertCircle, 
  Volume2, 
  VolumeX, 
  ShieldCheck, 
  History, 
  Trophy,
  Loader2,
  Gift,
  ArrowRight,
  Flame,
  Crown,
  Ticket,
  ShoppingBag
} from 'lucide-react';

interface SliceDisplay {
  primary: string;        // Ultra-short headline (e.g. "5K", "2K", "1K", "500", "20%", "FREE", "NO WIN")
  secondary: string;      // Subtitle (e.g. "SDG", "OFF", "شحن", "")
  badge?: string;         // Mini pill badge (e.g. "JACKPOT", "HOT")
  iconEmoji: string;      // E.g. "👑", "🔥", "🎁", "⚡", "🍀", "💎"
  tier: 'jackpot' | 'rare' | 'medium' | 'small' | 'none';
  primaryFontSize: number;
  textColor: string;
  pillBorder: string;
  pillBg: string;
  gradientColors: [string, string, string]; // [inner, middle, outer]
}

export const WheelPage: React.FC = () => {
  const { user, isAuthenticated, navigateTo } = useAuth();
  const [status, setStatus] = useState<WheelStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [spinning, setSpinning] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [spinError, setSpinError] = useState<string | null>(null);

  // Result modal state
  const [wonPrize, setWonPrize] = useState<{
    prize: PublicWheelPrize;
    rewardDetails: any;
    tier: 'jackpot' | 'rare' | 'medium' | 'small' | 'none';
    consumedSource?: 'DAILY' | 'PURCHASE';
  } | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  // Countdown timer string (HH:MM:SS)
  const [countdown, setCountdown] = useState<string>('--:--:--');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const confettiCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const currentRotationRef = useRef<number>(0);
  const animFrameRef = useRef<number | null>(null);
  const confettiAnimRef = useRef<number | null>(null);

  // Audio Context for Web Audio sound synthesis
  const audioCtxRef = useRef<AudioContext | null>(null);

  const getAudioContext = () => {
    if (!audioCtxRef.current && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        audioCtxRef.current = new AudioCtx();
      }
    }
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  };

  const playTickSound = (speedFactor = 1) => {
    if (!soundEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      
      const baseFreq = 700 + (1 - speedFactor) * 200;
      osc.frequency.setValueAtTime(baseFreq, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(140, ctx.currentTime + 0.03);
      
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.03);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.03);
    } catch {}
  };

  const playTierFanfare = (tier: 'jackpot' | 'rare' | 'medium' | 'small' | 'none') => {
    if (!soundEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;

      if (tier === 'none') {
        const notes = [392.00, 329.63]; // G4, E4
        notes.forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.18);
          gain.gain.setValueAtTime(0.08, ctx.currentTime + i * 0.18);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.18 + 0.3);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(ctx.currentTime + i * 0.18);
          osc.stop(ctx.currentTime + i * 0.18 + 0.35);
        });
        return;
      }

      if (tier === 'jackpot') {
        const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98]; // C5 to G6
        notes.forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.09);
          gain.gain.setValueAtTime(0.18, ctx.currentTime + i * 0.09);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.09 + 0.6);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(ctx.currentTime + i * 0.09);
          osc.stop(ctx.currentTime + i * 0.09 + 0.65);
        });
        return;
      }

      const notes = tier === 'rare' 
        ? [523.25, 659.25, 783.99, 1046.5]
        : [523.25, 659.25, 783.99];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.1);
        gain.gain.setValueAtTime(0.12, ctx.currentTime + i * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.1 + 0.45);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.1);
        osc.stop(ctx.currentTime + i * 0.1 + 0.5);
      });
    } catch {}
  };

  // Format short, high-contrast, ultra-readable typography for each slice
  const formatSlice = useCallback((prize: PublicWheelPrize, index: number): SliceDisplay => {
    const pType = (prize.type || '').toUpperCase();
    const val = Number(prize.value) || 0;
    const name = prize.name || '';

    // 1. NO PRIZE (Dark Gray / Muted Slate, humble, calm)
    if (pType === 'NO_PRIZE' || val === 0 || name.includes('لا جائزة') || name.includes('حظ')) {
      return {
        primary: 'NO WIN',
        secondary: '',
        iconEmoji: '🍀',
        tier: 'none',
        primaryFontSize: 15,
        textColor: '#94A3B8',
        pillBorder: 'rgba(148, 163, 184, 0.25)',
        pillBg: 'rgba(15, 23, 42, 0.85)',
        gradientColors: index % 2 === 0 
          ? ['#0B0F19', '#111827', '#1E293B'] 
          : ['#070A12', '#0F172A', '#1A2333']
      };
    }

    // 2. GRAND PRIZE / JACKPOT (Dark Gold treatment, crown, JACKPOT badge)
    if (pType === 'GRAND_PRIZE' || val >= 5000 || (pType === 'DISCOUNT_PERCENT' && val >= 25)) {
      return {
        primary: val >= 1000 ? `${Math.round(val / 1000)}K` : `${val}%`,
        secondary: val >= 1000 ? 'SDG' : 'OFF',
        badge: 'JACKPOT',
        iconEmoji: '👑',
        tier: 'jackpot',
        primaryFontSize: 22,
        textColor: '#FFFFFF',
        pillBorder: '#F59E0B',
        pillBg: 'rgba(120, 53, 15, 0.9)',
        gradientColors: ['#451A03', '#92400E', '#D97706']
      };
    }

    // 3. RARE / HIGH (1K, 2K SDG, or 20% discount)
    if (val >= 1000 || (pType === 'DISCOUNT_PERCENT' && val >= 15)) {
      const isPercent = pType === 'DISCOUNT_PERCENT';
      return {
        primary: isPercent ? `${val}%` : `${Math.round(val / 1000)}K`,
        secondary: isPercent ? 'OFF' : 'SDG',
        badge: 'HOT',
        iconEmoji: isPercent ? '💎' : '🔥',
        tier: 'rare',
        primaryFontSize: 21,
        textColor: '#FFFFFF',
        pillBorder: '#EA580C',
        pillBg: 'rgba(124, 45, 18, 0.9)',
        gradientColors: ['#431407', '#9A3412', '#EA580C']
      };
    }

    // 4. MEDIUM (500 SDG, or Free Shipping)
    if (val >= 500 || pType === 'FREE_SHIPPING') {
      const isFree = pType === 'FREE_SHIPPING';
      return {
        primary: isFree ? 'FREE' : '500',
        secondary: isFree ? 'شحن' : 'SDG',
        badge: isFree ? 'مجاني' : undefined,
        iconEmoji: isFree ? '🚀' : '🎁',
        tier: 'medium',
        primaryFontSize: 20,
        textColor: '#FFFFFF',
        pillBorder: '#2563EB',
        pillBg: 'rgba(30, 58, 138, 0.9)',
        gradientColors: ['#0F172A', '#1E3A8A', '#2563EB']
      };
    }

    // 5. SMALL REWARDS (100 - 200 SDG)
    const isEmerald = index % 2 === 0;
    return {
      primary: String(val),
      secondary: 'SDG',
      badge: undefined,
      iconEmoji: '⚡',
      tier: 'small',
      primaryFontSize: 19,
      textColor: '#FFFFFF',
      pillBorder: isEmerald ? '#059669' : '#7C3AED',
      pillBg: isEmerald ? 'rgba(6, 78, 59, 0.85)' : 'rgba(76, 29, 149, 0.85)',
      gradientColors: isEmerald 
        ? ['#062E25', '#064E3B', '#059669'] 
        : ['#1E1035', '#3B1774', '#6D28D9']
    };
  }, []);

  // Load Status
  const loadStatus = async () => {
    try {
      const data = await wheelApi.getStatus();
      setStatus(data);
    } catch (err: any) {
      console.error('Failed to load wheel status:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, [user]);

  // Live countdown timer to nextSpinAt
  useEffect(() => {
    if (!status?.nextSpinAt) return;

    const updateTimer = () => {
      const targetTime = new Date(status.nextSpinAt).getTime();
      const now = Date.now();
      const diff = targetTime - now;

      if (diff <= 0) {
        setCountdown('00:00:00');
        if (status.creditsSummary?.dailyAvailable === false) {
          loadStatus();
        }
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      const pad = (n: number) => String(n).padStart(2, '0');
      setCountdown(`${pad(hours)}:${pad(minutes)}:${pad(seconds)}`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [status?.nextSpinAt, status?.creditsSummary?.dailyAvailable]);

  // Draw High-DPI Wheel on Canvas with Upright Readability
  const drawWheel = useCallback((rotationAngleRad: number) => {
    const canvas = canvasRef.current;
    if (!canvas || !status?.prizes || status.prizes.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
    const displaySize = 720;
    
    if (canvas.width !== displaySize * dpr) {
      canvas.width = displaySize * dpr;
      canvas.height = displaySize * dpr;
    }

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, displaySize, displaySize);

    const prizes = status.prizes;
    const numSlices = prizes.length;
    const sliceAngle = (2 * Math.PI) / numSlices;
    const centerX = displaySize / 2;
    const centerY = displaySize / 2;
    const radius = centerX - 18;

    // Apply wheel rotation
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(rotationAngleRad);

    // 1. Draw Slices
    prizes.forEach((prize, i) => {
      const sliceInfo = formatSlice(prize, i);
      const startAngle = i * sliceAngle;
      const endAngle = startAngle + sliceAngle;
      const midAngle = startAngle + sliceAngle / 2;

      // Wedge geometry
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius, startAngle, endAngle);
      ctx.closePath();

      // Deep, Rich Radial Gradient (Dark Gaming Theme)
      const grad = ctx.createRadialGradient(0, 0, radius * 0.2, 0, 0, radius);
      grad.addColorStop(0, sliceInfo.gradientColors[0]);
      grad.addColorStop(0.65, sliceInfo.gradientColors[1]);
      grad.addColorStop(1, sliceInfo.gradientColors[2]);
      ctx.fillStyle = grad;
      ctx.fill();

      // Clean Precision Separator Line
      ctx.beginPath();
      ctx.moveTo(Math.cos(startAngle) * (radius * 0.2), Math.sin(startAngle) * (radius * 0.2));
      ctx.lineTo(Math.cos(startAngle) * radius, Math.sin(startAngle) * radius);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Outer Edge Metallic Marker Pin
      const pinRadius = 3.5;
      const pinX = Math.cos(startAngle) * (radius - 8);
      const pinY = Math.sin(startAngle) * (radius - 8);
      ctx.beginPath();
      ctx.arc(pinX, pinY, pinRadius, 0, 2 * Math.PI);
      ctx.fillStyle = '#0B0F19';
      ctx.fill();
      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // 2. Draw Upright Sector Card (No Inverted or Unreadable Text)
      ctx.save();
      ctx.rotate(midAngle);

      // We orient text radially towards the rim, but if the wedge is facing leftwards
      // (angles between 90° and 270°), we flip by 180° so the text is NEVER upside down!
      const isLeftHemisphere = midAngle > Math.PI / 2 && midAngle < (3 * Math.PI) / 2;
      const labelDistance = radius - 82;

      ctx.translate(labelDistance, 0);
      if (isLeftHemisphere) {
        ctx.rotate(Math.PI); // Upright flip for 100% readability
      }

      // Draw Sector Card Capsule
      const cardW = 74;
      const cardH = sliceInfo.secondary ? 48 : 34;

      ctx.save();
      ctx.beginPath();
      ctx.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 8);
      ctx.fillStyle = sliceInfo.pillBg;
      ctx.fill();
      ctx.strokeStyle = sliceInfo.pillBorder;
      ctx.lineWidth = sliceInfo.tier === 'jackpot' ? 2 : 1;
      ctx.stroke();
      ctx.restore();

      // Draw Icon + Primary Text
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const line1Y = sliceInfo.secondary ? -7 : 0;
      ctx.font = `900 ${sliceInfo.primaryFontSize}px "Outfit", "Inter", system-ui, sans-serif`;
      ctx.fillStyle = sliceInfo.textColor;
      ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
      ctx.shadowBlur = 6;

      ctx.fillText(`${sliceInfo.iconEmoji} ${sliceInfo.primary}`, 0, line1Y);

      // Draw Secondary Subtitle (e.g. SDG, OFF)
      if (sliceInfo.secondary) {
        ctx.font = '800 11px system-ui, sans-serif';
        ctx.fillStyle = sliceInfo.tier === 'jackpot' ? '#FDE68A' : 'rgba(255, 255, 255, 0.8)';
        ctx.shadowBlur = 3;
        ctx.fillText(sliceInfo.secondary, 0, 13);
      }

      ctx.restore();
      ctx.restore(); // Undo sector translation & rotation
    });

    ctx.restore(); // Undo wheel rotation

    // 3. Dark Outer Bezel Ring (Precision Gaming Track, No Casino Bulbs)
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.strokeStyle = '#0B0F19';
    ctx.lineWidth = 10;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius - 5, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();
  }, [status?.prizes, formatSlice]);

  useEffect(() => {
    if (status?.prizes) {
      drawWheel(currentRotationRef.current);
    }
  }, [status?.prizes, drawWheel]);

  // Particle Confetti Launcher
  const launchConfetti = (tier: 'jackpot' | 'rare' | 'medium' | 'small' | 'none') => {
    if (tier === 'none') return;
    const canvas = confettiCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const count = tier === 'jackpot' ? 90 : tier === 'rare' ? 50 : 25;
    const colors = tier === 'jackpot' 
      ? ['#F59E0B', '#FBBF24', '#FDE68A', '#D97706', '#E2E8F0']
      : ['#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#F8FAFC'];

    const particles: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      color: string;
      rotation: number;
      rotSpeed: number;
      opacity: number;
    }> = [];

    for (let i = 0; i < count; i++) {
      particles.push({
        x: canvas.width / 2 + (Math.random() - 0.5) * 220,
        y: canvas.height * 0.45 + (Math.random() - 0.5) * 60,
        vx: (Math.random() - 0.5) * 12,
        vy: -Math.random() * 11 - 3,
        size: Math.random() * 7 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.2,
        opacity: 1
      });
    }

    const animateConfetti = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;

      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.35;
        p.rotation += p.rotSpeed;
        p.opacity -= 0.008;

        if (p.opacity > 0) {
          alive = true;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rotation);
          ctx.globalAlpha = Math.max(0, p.opacity);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.65);
          ctx.restore();
        }
      });

      if (alive) {
        confettiAnimRef.current = requestAnimationFrame(animateConfetti);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };

    if (confettiAnimRef.current) {
      cancelAnimationFrame(confettiAnimRef.current);
    }
    confettiAnimRef.current = requestAnimationFrame(animateConfetti);
  };

  // Handle Spin Execution
  const handleSpinClick = async () => {
    if (!isAuthenticated) {
      navigateTo('login');
      return;
    }

    if (!status?.canSpin || spinning) return;

    setSpinError(null);
    setSpinning(true);
    getAudioContext();

    try {
      const res = await wheelApi.spin();

      if (!res.success && res.alreadySpun) {
        setSpinError(res.message || 'لا توجد محاولات سحب متاحة حالياً.');
        setSpinning(false);
        await loadStatus();
        return;
      }

      if (!res.prize) {
        throw new Error('تعذر تحديد نتيجة السحب.');
      }

      const winningPrize = res.prize;
      const prizes = status.prizes;
      const winningIndex = prizes.findIndex(p => p.id === winningPrize.id);

      if (winningIndex === -1) {
        throw new Error('جائزة غير مطابقة في القائمة.');
      }

      const winningSlice = formatSlice(winningPrize, winningIndex);

      // Precise Stop Calculation:
      // Pointer points DOWN from top at angle -PI/2 (270 deg).
      // Mid-angle of winning slice: winningIndex * sliceAngle + sliceAngle / 2
      // We want sliceCenterAngle + finalRot = -PI/2 (mod 2*PI).
      const sliceAngle = (2 * Math.PI) / prizes.length;
      const sliceCenterAngle = winningIndex * sliceAngle + sliceAngle / 2;
      const extraRotations = 6;
      const targetRotation = (2 * Math.PI * extraRotations) - sliceCenterAngle - (Math.PI / 2);

      const startRotation = currentRotationRef.current % (2 * Math.PI);
      const totalRotationDelta = targetRotation - startRotation + (2 * Math.PI * extraRotations);

      const durationMs = 5000;
      const startTime = performance.now();
      let lastTickAngle = startRotation;

      // Smooth realistic deceleration curve
      const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);

      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / durationMs, 1);
        const ease = easeOutQuart(progress);

        const currentRot = startRotation + totalRotationDelta * ease;
        currentRotationRef.current = currentRot;
        drawWheel(currentRot);

        if (Math.abs(currentRot - lastTickAngle) >= sliceAngle * 0.8) {
          playTickSound(progress);
          lastTickAngle = currentRot;
        }

        if (progress < 1) {
          animFrameRef.current = requestAnimationFrame(animate);
        } else {
          setSpinning(false);
          playTierFanfare(winningSlice.tier);
          launchConfetti(winningSlice.tier);

          // Open celebration modal
          setWonPrize({
            prize: winningPrize,
            rewardDetails: res.rewardDetails,
            tier: winningSlice.tier,
            consumedSource: res.consumedSource
          });

          // Refresh status for updated credits count & history
          loadStatus();
        }
      };

      animFrameRef.current = requestAnimationFrame(animate);
    } catch (err: any) {
      console.error('Spin error:', err);
      setSpinError(err?.message || 'حدث خطأ أثناء السحب. يرجى المحاولة لاحقاً.');
      setSpinning(false);
    }
  };

  const handleCopyCode = (code: string) => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  const availableSpins = status?.availableSpins ?? (status?.canSpin ? 1 : 0);
  const creditsSummary = status?.creditsSummary;

  if (loading) {
    return (
      <div className={styles.container} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: '#F59E0B' }}>
          <Loader2 size={38} className="animate-spin" style={{ margin: '0 auto 12px' }} />
          <div style={{ color: '#F8FAFC', fontWeight: 800, fontSize: '1.05rem' }}>جاري تحميل عجلة الحظ...</div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Particle Canvas */}
      <canvas ref={confettiCanvasRef} className={styles.confettiCanvas} />

      <div className={styles.wrapper}>
        {/* Header Section */}
        <div className={styles.header}>
          <div className={styles.badge}>
            <Sparkles size={16} />
            <span>عجلة الحظ اليومية • محاولة يومية + محاولة إضافية مع كل طلب مؤهل</span>
          </div>
          <h1 className={styles.title}>
            أدر العجلة واربح <span className={styles.titleHighlight}>جوائز وخصومات فورية</span>
          </h1>
          <p className={styles.subtitle}>
            كل حساب يحصل على سحب مجاني يومياً يتجدد تلقائياً عند منتصف الليل، بالإضافة لمحاولة إضافية (+1 Spin) فورية مع كل عملية شراء ناجحة!
          </p>
        </div>

        {/* Main Grid */}
        <div className={styles.mainGrid}>
          {/* Wheel Card */}
          <div className={styles.wheelCard}>
            {/* Top Toolbar */}
            <div className={styles.wheelToolbar}>
              {/* Credits Status Pill */}
              <div className={styles.creditsSummaryPill}>
                <Ticket size={16} color="#F59E0B" />
                <span>لديك: <strong>{availableSpins}</strong> محاولات</span>
                {isAuthenticated && creditsSummary && (
                  <span className={styles.creditsBreakdown}>
                    ({creditsSummary.dailyAvailable ? '1 يومية' : 'اليومية مستخدمة'}
                    {creditsSummary.purchaseAvailable > 0 ? ` + ${creditsSummary.purchaseAvailable} مشتريات` : ''})
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className={styles.securityTag}>
                  <ShieldCheck size={16} color="#10B981" />
                  <span>محمي وعادل 100%</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  className={styles.soundBtn}
                  title={soundEnabled ? 'كتم المؤثرات الصوتية' : 'تفعيل الصوت'}
                >
                  {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                </button>
              </div>
            </div>

            {/* Wheel Canvas Stage */}
            <div className={styles.wheelStage}>
              {/* Dark Outer Track Ring (Clean Gaming Bezel) */}
              <div className={styles.wheelOuterRing} />

              {/* 3D Gaming Needle Pointer */}
              <div className={`${styles.pointerContainer} ${spinning ? styles.pointerActive : ''}`}>
                <svg className={styles.pointerSvg} viewBox="0 0 38 48" fill="none">
                  <polygon points="19,48 5,14 33,14" fill="#F59E0B" stroke="#070A12" strokeWidth="2.5" />
                  <polygon points="19,48 19,14 33,14" fill="#FBBF24" opacity="0.6" />
                  <circle cx="19" cy="14" r="8" fill="#111827" stroke="#F59E0B" strokeWidth="2" />
                  <circle cx="19" cy="14" r="3.5" fill="#F59E0B" />
                </svg>
              </div>

              {/* Canvas Wheel */}
              <canvas
                ref={canvasRef}
                className={styles.wheelCanvas}
              />

              {/* Center KIRO PRO Gaming Hub */}
              <button
                type="button"
                className={`
                  ${styles.centerHub} 
                  ${availableSpins > 0 && !spinning ? styles.centerHubActive : ''} 
                  ${spinning ? styles.centerHubSpinning : ''} 
                  ${availableSpins === 0 && isAuthenticated ? styles.centerHubLocked : ''}
                `}
                onClick={handleSpinClick}
                disabled={spinning || (isAuthenticated && availableSpins === 0)}
                title={availableSpins > 0 ? 'أدر العجلة' : 'انتهت المحاولات حالياً'}
              >
                <div className={styles.hubInner}>
                  {spinning ? (
                    <div className={styles.hubSpinningState}>
                      <span className={styles.hubSpinIcon}>⚡</span>
                    </div>
                  ) : !isAuthenticated ? (
                    <div className={styles.hubState}>
                      <span className={styles.hubBrand}>KIRO</span>
                      <span className={styles.hubMainText}>دخول</span>
                      <span className={styles.hubSubText}>للسحب</span>
                    </div>
                  ) : availableSpins > 0 ? (
                    <div className={styles.hubState}>
                      <span className={styles.hubBrand}>⚡ KIRO</span>
                      <span className={styles.hubSpinText}>SPIN</span>
                      <span className={styles.hubActionText}>أدر الآن</span>
                    </div>
                  ) : (
                    <div className={styles.hubLockedState}>
                      <span className={styles.hubLockedTitle}>24H</span>
                      <span className={styles.hubLockedTime}>LOCKED</span>
                    </div>
                  )}
                </div>
              </button>
            </div>

            {/* Spin Controls & Status Info */}
            <div className={styles.controlsBox}>
              {spinError && (
                <div className={styles.errorMessage}>
                  <AlertCircle size={18} />
                  <span>{spinError}</span>
                </div>
              )}

              {!isAuthenticated ? (
                <div>
                  <button
                    type="button"
                    className={styles.spinBtn}
                    onClick={() => navigateTo('login')}
                  >
                    <span>سجل الدخول لبدء السحب اليومي 🎯</span>
                  </button>
                  <p className={styles.loginHint}>
                    تسجيل الحساب مجاني تماماً ويمنحك فرصة فورية كل 24 ساعة.
                  </p>
                </div>
              ) : availableSpins > 0 ? (
                <div>
                  <button
                    type="button"
                    className={styles.spinBtn}
                    onClick={handleSpinClick}
                    disabled={spinning}
                  >
                    <Sparkles size={20} />
                    <span>{spinning ? 'جاري دوران العجلة...' : `أدر عجلة الحظ الآن! (متبقي ${availableSpins} محاولات)`}</span>
                  </button>
                  <div className={`${styles.statusCard} ${styles.statusAvailable}`}>
                    <CheckCircle2 size={18} />
                    <span>لديك {availableSpins} محاولات سحب جاهزة للاستخدام الآن!</span>
                  </div>
                </div>
              ) : (
                <div>
                  <button
                    type="button"
                    className={styles.spinBtn}
                    disabled
                  >
                    <span>انتهت محاولاتك لهذا اليوم ✨</span>
                  </button>
                  <div className={`${styles.statusCard} ${styles.statusUsed}`}>
                    <div className={styles.usedNotice}>لقد استنفدت جميع محاولاتك الحالية.</div>
                    <div className={styles.countdownRow}>
                      <span>المحاولة اليومية المجانية تتجدد بعد:</span>
                      <span className={styles.countdownPill}>
                        <Clock size={15} />
                        {countdown}
                      </span>
                    </div>
                    <div className={styles.purchaseBonusHint}>
                      <ShoppingBag size={14} color="#F59E0B" />
                      <span>💡 احصل على محاولة إضافية فورية (+1 Spin) مع كل طلب شراء جديد ناجح!</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Side Column: Rules & User History */}
          <div className={styles.sideColumn}>
            {/* Rules Card */}
            <div className={styles.card}>
              <h3 className={styles.cardTitle}>
                <Trophy size={20} color="#F59E0B" />
                <span>شروط وقواعد السحب والمحاولات</span>
              </h3>
              <ul className={styles.rulesList}>
                <li className={styles.ruleItem}>
                  <div className={styles.ruleIcon}>🎯</div>
                  <div>
                    <strong>محاولة يومية مجانية:</strong> يحصل كل مستخدم موثق على فرصة سحب واحدة مجانية كل 24 ساعة تتجدد عند منتصف الليل.
                  </div>
                </li>
                <li className={styles.ruleItem}>
                  <div className={styles.ruleIcon}>🛒</div>
                  <div>
                    <strong>+1 محاولة مع كل طلب شراء:</strong> كل عملية شراء ناجحة لمنتجات المتجر (ألعاب، حسابات، بطاقات) تمنحك محاولة سحب إضافية تراكمية فور اكتمال الطلب (باستثناء تحويلات USDT).
                  </div>
                </li>
                <li className={styles.ruleItem}>
                  <div className={styles.ruleIcon}>🎁</div>
                  <div>
                    <strong>جوائز فورية حقيقية:</strong> أكواد خصم فورية وقسائم تضاف مباشرة لحسابك صالحة للاستخدام في مشتريات المتجر.
                  </div>
                </li>
                <li className={styles.ruleItem}>
                  <div className={styles.ruleIcon}>🛡️</div>
                  <div>
                    <strong>أمان تام:</strong> نظام معتمد ومحمي بالكامل في الخادم ضد التكرار والتلاعب بساعة الجهاز.
                  </div>
                </li>
              </ul>
            </div>

            {/* History Card */}
            <div className={styles.card}>
              <h3 className={styles.cardTitle}>
                <History size={20} color="#F59E0B" />
                <span>سجل سحوباتك السابقة</span>
              </h3>

              {!isAuthenticated ? (
                <p style={{ color: '#64748B', fontSize: '0.9rem', textAlign: 'center', margin: '20px 0' }}>
                  سجل دخولك لرؤية سجل جوائزك وسحوباتك السابقة.
                </p>
              ) : status?.history && status.history.length > 0 ? (
                <div className={styles.historyList}>
                  {status.history.map((record: any) => {
                    const promoCode = record.reward_details?.promoCode;
                    return (
                      <div key={record.id} className={styles.historyItem}>
                        <div className={styles.historyLeft}>
                          <div
                            className={styles.prizeDot}
                            style={{ background: record.prize_color || '#F59E0B' }}
                          />
                          <div>
                            <div className={styles.historyName}>
                              {record.prize_name || record.reward_type}
                              {record.source_type === 'PURCHASE' && (
                                <span className={styles.historySourceTag}>مشتريات 🛒</span>
                              )}
                            </div>
                            <div className={styles.historyDate}>
                              {new Date(record.created_at).toLocaleDateString('ar-EG', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </div>
                          </div>
                        </div>

                        {promoCode && (
                          <button
                            type="button"
                            className={styles.codeCopyBtn}
                            onClick={() => handleCopyCode(promoCode)}
                            title="نسخ كود الخصم"
                          >
                            <Copy size={12} />
                            <span>{promoCode}</span>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p style={{ color: '#64748B', fontSize: '0.9rem', textAlign: 'center', margin: '20px 0' }}>
                  لم تسجل أي سحوبات بعد. أدر العجلة لتكون أول تجربة لك!
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Result Celebration Modal */}
      {wonPrize && (
        <div className={styles.modalOverlay} onClick={() => setWonPrize(null)}>
          <div 
            className={`
              ${styles.modalContent} 
              ${wonPrize.tier === 'jackpot' ? styles.modalJackpot : ''} 
              ${wonPrize.tier === 'none' ? styles.modalNone : ''}
            `} 
            onClick={e => e.stopPropagation()}
          >
            {wonPrize.tier === 'jackpot' && (
              <div className={styles.jackpotBanner}>
                <Crown size={16} />
                <span>🏆 فوز استثنائي • JACKPOT 🏆</span>
              </div>
            )}

            {wonPrize.tier === 'rare' && (
              <div className={styles.rareBanner}>
                <Flame size={16} />
                <span>🔥 فوز مميز جداً 🔥</span>
              </div>
            )}

            <div
              className={styles.modalIcon}
              style={{
                background: wonPrize.tier === 'jackpot' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(245, 158, 11, 0.1)',
                color: wonPrize.prize.color || '#F59E0B',
                borderColor: wonPrize.tier === 'jackpot' ? '#F59E0B' : 'rgba(245, 158, 11, 0.4)'
              }}
            >
              {wonPrize.tier === 'jackpot' ? '👑' : wonPrize.tier === 'none' ? '🍀' : '🎉'}
            </div>

            <h3 className={styles.modalTitle}>
              {wonPrize.tier === 'none' ? 'حظ أوفر في المرة القادمة!' : 'مبروك! ربحت معنا'}
            </h3>

            <div className={styles.modalPrizeName}>
              {wonPrize.prize.name}
            </div>

            <p className={styles.modalDescription}>
              {wonPrize.rewardDetails?.instructions || wonPrize.rewardDetails?.message || wonPrize.prize.description || (
                wonPrize.tier === 'none' 
                  ? 'لم يحالفك الحظ في هذا السحب. يمكنك استخدام محاولاتك الأخرى أو الشراء للحصول على محاولات إضافية!' 
                  : 'تم إضافة الجائزة إلى حسابك بنجاح.'
              )}
            </p>

            {wonPrize.rewardDetails?.promoCode && (
              <div className={styles.voucherBox}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#94A3B8', marginBottom: 2 }}>رمز كود الخصم:</div>
                  <div className={styles.voucherCode}>{wonPrize.rewardDetails.promoCode}</div>
                </div>
                <button
                  type="button"
                  className={styles.codeCopyBtn}
                  onClick={() => handleCopyCode(wonPrize.rewardDetails.promoCode)}
                >
                  <Copy size={14} />
                  <span>{copiedCode ? 'تم النسخ!' : 'نسخ الكود'}</span>
                </button>
              </div>
            )}

            <div className={styles.modalActionButtons}>
              {wonPrize.tier !== 'none' ? (
                <button
                  type="button"
                  className={styles.modalPrimaryBtn}
                  onClick={() => {
                    setWonPrize(null);
                    navigateTo('home');
                  }}
                >
                  <Gift size={18} />
                  <span>استخدام الجائزة في المتجر</span>
                  <ArrowRight size={16} />
                </button>
              ) : (
                <button
                  type="button"
                  className={styles.modalCloseBtn}
                  onClick={() => setWonPrize(null)}
                >
                  {availableSpins > 0 ? `متابعة السحب (متبقي ${availableSpins})` : 'حسناً، فهمت'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WheelPage;
