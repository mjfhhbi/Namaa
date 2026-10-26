import React from 'react';
import { Logo } from './Logo';
import { StoreSettings } from '../types';
import { AudioPlayer } from './AudioPlayer';
import { 
  ShoppingBag, 
  Search, 
  Truck, 
  PhoneCall, 
  KeyRound, 
  Sparkles
} from 'lucide-react';

interface HeaderProps {
  settings: StoreSettings;
  cartCount: number;
  isCartBumping?: boolean;
  onOpenCart: () => void;
  onOpenTracking: () => void;
  onOpenAdmin?: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  isAdminLoggedIn?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  settings,
  cartCount,
  isCartBumping = false,
  onOpenCart,
  onOpenTracking,
  onOpenAdmin,
  searchQuery,
  onSearchChange,
  isAdminLoggedIn = false,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-[#FAF7F0]/95 backdrop-blur-md border-b border-[#E8DEC9] shadow-[0_2px_15px_rgba(0,0,0,0.04)]">
      {/* Top Banner */}
      {Boolean(
        settings.announcement && 
        !settings.announcement.includes('۶۰۰') && 
        !settings.announcement.includes('آزمایش') && 
        !settings.announcement.includes('ضمانت اصالت')
      ) && (
        <div className="bg-gradient-to-r from-[#231709] via-[#2F1E0C] to-[#1E2D20] text-[#FAF7F2] px-4 py-2 text-xs sm:text-[13px] text-center font-medium flex items-center justify-center gap-2 shadow-inner">
          <Sparkles className="w-3.5 h-3.5 text-[#D4A340] animate-pulse" />
          <span>{settings.announcement}</span>
          <span className="hidden md:inline text-[#D4A340]/70">|</span>
          <a 
            href={`tel:${settings.supportPhone}`} 
            className="hidden md:inline-flex items-center gap-1 text-[#D4A340] hover:underline hover:text-amber-200"
          >
            <PhoneCall className="w-3 h-3" />
            پشتیبانی: {settings.supportPhone}
          </a>
        </div>
      )}

      {/* Main Nav */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2.5 sm:py-3.5 flex items-center justify-between gap-2 sm:gap-4">
        {/* Logo and Brand */}
        <Logo size={46} className="shrink-0" />

        {/* Search Input (Desktop) */}
        <div className="hidden md:flex flex-1 max-w-md mx-4 lg:mx-6 relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="جستجوی محصولات سالم و اصیل ناما..."
            className="w-full bg-white border border-[#D5C6AC] text-sm text-[#231709] placeholder-[#8C7E70] rounded-full py-2.5 pr-10 pl-4 focus:outline-none focus:ring-2 focus:ring-[#D4A340] focus:border-transparent transition-all shadow-xs"
          />
          <Search className="w-4 h-4 text-[#8C7E70] absolute right-3.5 top-1/2 -translate-y-1/2" />
          {searchQuery && (
            <button 
              onClick={() => onSearchChange('')}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600 bg-gray-100 rounded-full w-4 h-4 flex items-center justify-center"
            >
              ×
            </button>
          )}
        </div>

        {/* Action Buttons: Music, Tracking, Admin, Cart */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          {/* 1. Ambient Music Toggle */}
          <AudioPlayer />

          {/* 2. Order Tracking Button */}
          <button
            type="button"
            onClick={onOpenTracking}
            className="shrink-0 inline-flex items-center justify-center gap-1.5 h-9 sm:h-10 px-2.5 sm:px-3.5 text-xs sm:text-sm font-bold text-[#231709] bg-[#EDE4D4]/80 hover:bg-[#E2D6C0] rounded-full border border-[#D8CBB2] transition-colors cursor-pointer active:scale-95 shadow-xs"
            title="پیگیری سفارش با کد رهگیری"
            aria-label="پیگیری سفارش"
          >
            <Truck className="w-4 h-4 text-[#2F4E34] shrink-0" />
            <span className="hidden md:inline whitespace-nowrap">پیگیری سفارش</span>
          </button>

          {/* 3. Admin Panel Button */}
          {onOpenAdmin && (
            <button
              type="button"
              onClick={onOpenAdmin}
              className={`shrink-0 relative inline-flex items-center justify-center gap-1.5 h-9 sm:h-10 px-2 sm:px-3 text-xs font-bold rounded-full border transition-colors cursor-pointer active:scale-95 shadow-xs ${
                isAdminLoggedIn
                  ? 'text-emerald-950 bg-emerald-50 hover:bg-emerald-100 border-emerald-300 ring-2 ring-emerald-400/40'
                  : 'text-[#4B3B2B] bg-[#F5EFE4] hover:bg-[#EADFCB] border-[#D9CDBF]'
              }`}
              title="ورود به پنل مدیریت فروشگاه"
              aria-label="پنل مدیریت"
            >
              <KeyRound className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#B8860B] shrink-0" />
              <span className="whitespace-nowrap">
                <span className="hidden sm:inline">پنل </span>
                {isAdminLoggedIn ? 'مدیریت (فعال)' : 'مدیریت'}
              </span>
            </button>
          )}

          {/* 4. Shopping Cart Button */}
          <button
            type="button"
            onClick={onOpenCart}
            className={`shrink-0 relative inline-flex items-center justify-center gap-1.5 sm:gap-2 h-9 sm:h-10 px-3 sm:px-4 text-xs sm:text-sm font-black text-white bg-[#231709] hover:bg-[#150D05] active:scale-95 rounded-full shadow-md shadow-[#231709]/20 transition-all cursor-pointer ${
              isCartBumping ? 'animate-cart-wiggle ring-4 ring-[#D4A340]/60 bg-[#160E05] shadow-lg shadow-[#D4A340]/30' : ''
            }`}
            title="مشاهده سبد خرید"
            aria-label="سبد خرید"
          >
            {isCartBumping && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#D4A340] text-[#231709] text-[10px] font-black px-2 py-0.5 rounded-full shadow-lg animate-bounce pointer-events-none whitespace-nowrap z-30">
                +۱ افزوده شد
              </span>
            )}
            <ShoppingBag className={`w-4 h-4 text-[#D4A340] shrink-0 transition-transform ${isCartBumping ? 'scale-125' : ''}`} />
            <span className="hidden md:inline whitespace-nowrap">سبد خرید</span>
            {cartCount > 0 && (
              <span className={`bg-[#D4A340] text-[#231709] text-[11px] font-black w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-all ${
                isCartBumping ? 'scale-130 ring-2 ring-white' : ''
              }`}>
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Mobile Search Bar */}
      <div className="md:hidden px-4 pb-3">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="جستجوی محصولات ناما..."
            className="w-full bg-white border border-[#D5C6AC] text-xs text-[#231709] placeholder-[#8C7E70] rounded-full py-2 pr-9 pl-4 focus:outline-none focus:ring-2 focus:ring-[#D4A340]"
          />
          <Search className="w-3.5 h-3.5 text-[#8C7E70] absolute right-3 top-1/2 -translate-y-1/2" />
          {searchQuery && (
            <button 
              onClick={() => onSearchChange('')}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600"
            >
              ×
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
