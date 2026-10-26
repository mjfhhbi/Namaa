import React, { useState, useEffect, useRef } from 'react';
import { Lock, Unlock, Eye, EyeOff, X, AlertCircle, ShieldCheck } from 'lucide-react';

interface AdminLoginDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (token: string) => void;
}

export const AdminLoginDialog: React.FC<AdminLoginDialogProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [pin, setPin] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when opened and reset form
  useEffect(() => {
    if (isOpen) {
      setPin('');
      setErrorMessage(null);
      setShowPassword(false);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  // Handle ESC key to dismiss
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPin = pin.trim();
    if (!cleanPin) {
      setErrorMessage('لطفاً رمز عبور مدیریت را وارد نمایید.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: cleanPin }),
      });

      const data = await response.json();

      if (response.ok && data.token) {
        sessionStorage.setItem('nama_admin_token', data.token);
        onSuccess(data.token);
      } else {
        setErrorMessage(data?.error || 'رمز عبور مدیریت نادرست است. لطفاً دوباره امتحان کنید.');
      }
    } catch {
      setErrorMessage('خطا در برقراری ارتباط با سرور. لطفاً اتصال اینترنت خود را بررسی فرمایید.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm bg-[#FAF8F3] rounded-3xl shadow-2xl border border-[#E4D7C2] p-5 sm:p-6 text-right animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 left-4 w-9 h-9 rounded-full bg-black/5 hover:bg-black/10 active:scale-95 flex items-center justify-center text-[#4B3B2B] transition-colors cursor-pointer"
          title="بستن"
          aria-label="بستن"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Lock Icon */}
        <div className="w-12 h-12 rounded-2xl bg-[#EDE4D4] border border-[#D8CBB2] flex items-center justify-center text-[#231709] mx-auto mb-3 shadow-xs">
          <Lock className="w-6 h-6 text-[#231709]" />
        </div>

        {/* Header */}
        <div className="text-center space-y-1 mb-5">
          <h3 className="text-base sm:text-lg font-black text-[#231709]">
            ورود به پنل مدیریت
          </h3>
          <p className="text-xs text-[#6A5A4A]">
            دسترسی به سفارشات، موجودی و کاتالوگ فروشگاه
          </p>
        </div>

        {/* Direct PIN Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5 text-right">
            <label className="text-xs font-bold text-[#4B3B2B] block">
              رمز عبور مدیریت:
            </label>
            <div className="relative">
              <input
                ref={inputRef}
                type={showPassword ? 'text' : 'password'}
                dir="ltr"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full bg-white border border-[#D5C6AC] rounded-2xl px-4 py-2.5 text-center text-base sm:text-lg font-mono tracking-widest text-[#231709] focus:outline-none focus:ring-2 focus:ring-[#D4A340] placeholder:tracking-normal placeholder:text-sm pl-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8C7E70] hover:text-[#231709] transition-colors"
                title={showPassword ? 'مخفی‌سازی رمز' : 'نمایش رمز'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {errorMessage && (
            <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 text-xs font-bold rounded-2xl flex items-center gap-2 text-right animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || !pin.trim()}
            className="w-full py-2.5 sm:py-3 rounded-2xl bg-[#231709] hover:bg-[#150D05] active:scale-95 text-white font-black text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Unlock className="w-4 h-4 text-[#D4A340]" />
            <span>{isLoading ? 'در حال تایید اعتبار...' : 'ورود به پنل'}</span>
          </button>
        </form>

        {/* Security Badge */}
        <div className="mt-4 pt-3 border-t border-[#EDE4D4] flex items-center justify-center gap-1.5 text-[11px] text-[#6A5A4A]">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span>احراز هویت سروری امن و بدون نیاز به حساب‌های خارجی</span>
        </div>
      </div>
    </div>
  );
};
