import React from 'react';
import { Logo } from './Logo';
import { StoreSettings } from '../types';
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
  onOpenCart: () => void;
  onOpenTracking: () => void;
  onOpenAdmin: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  settings,
  cartCount,
  onOpenCart,
  onOpenTracking,
  onOpenAdmin,
  searchQuery,
  onSearchChange,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-[#FAF7F0]/95 backdrop-blur-md border-b border-[#E8DEC9] shadow-[0_2px_15px_rgba(0,0,0,0.04)]">
      {/* Top Banner */}
      {settings.announcement && (
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-4">
        {/* Logo and Brand */}
        <Logo size={52} />

        {/* Search Input (Desktop) */}
        <div className="hidden md:flex flex-1 max-w-md mx-6 relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="جستجوی عسل‌های درمانی، خرماهای لوکس، زعفران، ارده..."
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

        {/* Action Buttons */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Order Tracking Button */}
          <button
            onClick={onOpenTracking}
            className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 text-xs sm:text-sm font-bold text-[#231709] bg-[#EDE4D4]/80 hover:bg-[#E2D6C0] rounded-full border border-[#D8CBB2] transition-colors"
            title="پیگیری سفارش با کد رهگیری"
          >
            <Truck className="w-4 h-4 text-[#2F4E34]" />
            <span className="hidden sm:inline">پیگیری سفارش</span>
          </button>

          {/* Admin Panel Button */}
          <button
            onClick={onOpenAdmin}
            className="inline-flex items-center gap-1.5 px-2.5 sm:px-3.5 py-2 text-xs sm:text-sm font-bold text-[#4B3B2B] bg-[#F5EFE4] hover:bg-[#EADFCB] rounded-full border border-[#D9CDBF] transition-colors"
            title="ورود به پنل مدیریت فروشگاه (رمز: 1383)"
          >
            <KeyRound className="w-3.5 h-3.5 text-[#B8860B]" />
            <span className="hidden sm:inline">پنل مدیریت</span>
          </button>

          {/* Shopping Cart Button */}
          <button
            onClick={onOpenCart}
            className="relative inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-black text-white bg-[#231709] hover:bg-[#150D05] active:scale-95 rounded-full shadow-md shadow-[#231709]/20 transition-all"
          >
            <ShoppingBag className="w-4 h-4 text-[#D4A340]" />
            <span className="hidden sm:inline">سبد خرید</span>
            {cartCount > 0 && (
              <span className="bg-[#D4A340] text-[#231709] text-[11px] font-black w-5 h-5 rounded-full flex items-center justify-center -mr-1 animate-bounce">
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
            placeholder="جستجوی عسل‌های درمانی، خرماهای لوکس ناما..."
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
