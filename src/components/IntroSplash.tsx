import React, { useState, useEffect } from 'react';
import namaLogoImg from '../assets/images/nama_store_logo_1791976961130.webp';
import { Sparkles, ArrowLeft } from 'lucide-react';

import { StoreSettings } from '../types';

interface IntroSplashProps {
  settings?: StoreSettings;
  onComplete?: () => void;
}

export const IntroSplash: React.FC<IntroSplashProps> = ({ settings, onComplete }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [stage, setStage] = useState<number>(0);
  const [isFadingOut, setIsFadingOut] = useState(false);

  useEffect(() => {
    // If intro animation is disabled by admin in CMS settings
    if (settings && settings.introEnabled === false) {
      if (onComplete) onComplete();
      return;
    }

    // Check if already viewed in this session
    try {
      const alreadySeen = sessionStorage.getItem('nama_intro_completed_v2');
      const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      if (alreadySeen === 'true' || prefersReducedMotion) {
        if (onComplete) onComplete();
        return;
      }
    } catch {
      // ignore storage access issues
    }

    setIsVisible(true);

    const t1 = setTimeout(() => setStage(1), 350);
    const t2 = setTimeout(() => setStage(2), 1100);
    const t3 = setTimeout(() => {
      setIsFadingOut(true);
    }, 2800);
    const t4 = setTimeout(() => {
      finishIntro();
    }, 3400);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [settings?.introEnabled]);

  const finishIntro = () => {
    try {
      sessionStorage.setItem('nama_intro_completed_v2', 'true');
    } catch {}
    // Trigger default audio playback
    try {
      window.dispatchEvent(new CustomEvent('nama_play_audio'));
    } catch {}
    setIsVisible(false);
    if (onComplete) onComplete();
  };

  if (!isVisible) return null;

  return (
    <aside 
      aria-label="خوش‌آمدگویی فروشگاه مواد غذایی ناما"
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#FAF7F0] text-[#163826] overflow-hidden transition-opacity duration-700 select-none ${
        isFadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* Background Decorative Motifs: Isfahan Turquoise & Southern Palm Warmth */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Soft Turquoise Ambient Aura (Isfahan tile tribute) */}
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-[#00828A]/8 rounded-full blur-3xl" />
        {/* Soft Saffron Golden Aura (Ahvaz sun & saffron tribute) */}
        <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-[#D4A340]/10 rounded-full blur-3xl" />

        {/* Delicate Geometric Tile Silhouette Watermark */}
        <svg 
          className="absolute inset-0 w-full h-full opacity-[0.035] text-[#163826]" 
          viewBox="0 0 400 400" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="0.8"
        >
          <pattern id="intro-tile" x="0" y="0" width="80" height="80" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 80 40 L 40 80 L 0 40 Z" />
            <circle cx="40" cy="40" r="16" />
            <path d="M 40 16 L 40 64 M 16 40 L 64 40" strokeDasharray="1.5 1.5" />
          </pattern>
          <rect width="100%" height="100%" fill="url(#intro-tile)" />
        </svg>
      </div>

      {/* Skip Button (رد کردن) in top corner */}
      <button
        type="button"
        onClick={finishIntro}
        className="absolute top-5 left-5 z-20 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/70 hover:bg-white text-xs font-bold text-[#4A3B2A] border border-[#E0D5C1] shadow-xs backdrop-blur-xs transition-all hover:scale-105 active:scale-95 cursor-pointer"
        title="رد کردن انیمیشن ورود"
      >
        <span>{settings?.introButtonText || 'ورود به فروشگاه'}</span>
        <ArrowLeft className="w-3.5 h-3.5 text-[#163826]" />
      </button>

      {/* Centerpiece Container */}
      <div className="relative z-10 flex flex-col items-center justify-center px-4 text-center max-w-md mx-auto">
        {/* Soft Golden Halo Behind Logo */}
        <div 
          className={`absolute w-56 h-56 sm:w-64 sm:h-64 rounded-full bg-gradient-to-tr from-[#D4A340]/25 via-[#E8C574]/15 to-transparent blur-2xl transition-all duration-1000 ${
            stage >= 1 ? 'opacity-100 scale-100' : 'opacity-0 scale-75'
          }`} 
        />

        {/* Outer Dark Green & Gold Framing Ring */}
        <div 
          className={`relative w-36 h-36 sm:w-44 sm:h-44 rounded-full p-2.5 transition-all duration-1000 ease-out ${
            stage >= 0 
              ? 'opacity-100 scale-100' 
              : 'opacity-0 scale-90'
          }`}
        >
          {/* Subtle spinning accent border */}
          <div className="absolute inset-0 rounded-full border border-[#D4A340]/40 border-dashed animate-[spin_24s_linear_infinite]" />
          
          {/* Inner ring */}
          <div className="w-full h-full rounded-full border-2 border-[#163826] bg-[#FAF8F3] shadow-xl shadow-[#163826]/10 p-1 flex items-center justify-center overflow-hidden">
            {/* Authentic Nama Official Logo */}
            <img
              src={namaLogoImg}
              alt="لوگوی رسمی مواد غذایی ناما"
              className={`w-full h-full object-cover rounded-full transition-all duration-700 ease-out ${
                stage >= 1 
                  ? 'opacity-100 scale-100 filter-none' 
                  : 'opacity-0 scale-95 blur-xs'
              }`}
            />
          </div>
        </div>

        {/* Brand Name Title */}
        <div 
          className={`mt-5 space-y-2 transition-all duration-700 ease-out ${
            stage >= 1 
              ? 'opacity-100 translate-y-0' 
              : 'opacity-0 translate-y-3'
          }`}
        >
          <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-[#EBF3E8] border border-[#C5D8C1] text-[#163826] text-[11px] font-bold shadow-xs">
            <Sparkles className="w-3 h-3 text-[#D4A340]" />
            <span>{settings?.introBadge || 'محصولات غذایی اصیل و طبیعی'}</span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-black text-[#163826] tracking-tight font-['Vazirmatn']">
            {settings?.introTitle || settings?.storeName || 'فروشگاه مواد غذایی ناما'}
          </h2>
        </div>

        {/* Authentic Tagline Reveal */}
        <div 
          className={`mt-3 transition-all duration-800 ease-out ${
            stage >= 2 
              ? 'opacity-100 translate-y-0' 
              : 'opacity-0 translate-y-3'
          }`}
        >
          <div className="flex items-center justify-center gap-3">
            <div className="w-8 h-[1px] bg-gradient-to-r from-transparent to-[#D4A340]" />
            <p className="text-sm sm:text-base font-bold text-[#A4781C] tracking-wide">
              {settings?.introSlogan || settings?.slogan || '«از نام و جان، برای طعمی ماندگار»'}
            </p>
            <div className="w-8 h-[1px] bg-gradient-to-l from-transparent to-[#D4A340]" />
          </div>

          <p className="text-xs text-[#5D6F61] mt-2 font-medium">
            {settings?.introSubtitle || 'دستچین اصیل‌ترین محصولات طبیعی ایران'}
          </p>
        </div>

        {/* Elegant Minimal Progress Dot Indicator */}
        <div className="mt-8 flex items-center justify-center gap-1.5">
          <span className={`w-2 h-2 rounded-full transition-all duration-500 ${stage >= 0 ? 'bg-[#163826] scale-100' : 'bg-gray-300 scale-75'}`} />
          <span className={`w-2 h-2 rounded-full transition-all duration-500 ${stage >= 1 ? 'bg-[#00828A] scale-100' : 'bg-gray-300 scale-75'}`} />
          <span className={`w-2 h-2 rounded-full transition-all duration-500 ${stage >= 2 ? 'bg-[#D4A340] scale-100' : 'bg-gray-300 scale-75'}`} />
        </div>
      </div>
    </aside>
  );
};
