import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, Smartphone, Share, PlusSquare, X } from 'lucide-react';

export const PWAInstallButton: React.FC<{ variant?: 'header' | 'floating' | 'banner' }> = ({
  variant = 'header'
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already installed and running standalone, do not show button
  if (isInstalled) {
    return null;
  }

  // If not installable and not iOS, don't clutter the UI
  if (!isInstallable && !isIOS) {
    return null;
  }

  const handleClick = () => {
    if (isInstallable) {
      install();
    } else if (isIOS) {
      setShowIOSGuide(true);
    }
  };

  return (
    <>
      {variant === 'header' && (
        <button
          onClick={handleClick}
          title="نصب اپلیکیشن فروشگاه ناما"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#163826]/10 hover:bg-[#163826] text-[#163826] hover:text-[#FAF7F2] border border-[#163826]/20 text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-95"
        >
          <Download className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">نصب اپلیکیشن</span>
          <span className="sm:hidden">نصب</span>
        </button>
      )}

      {variant === 'floating' && (
        <button
          onClick={handleClick}
          title="نصب وب‌اپلیکیشن ناما روی گوشی"
          className="fixed bottom-20 left-4 z-40 flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-[#163826] text-[#D4A340] border border-[#D4A340]/40 shadow-xl hover:bg-[#0E2619] transition-all cursor-pointer active:scale-95 text-xs font-bold animate-in fade-in"
        >
          <Smartphone className="w-4 h-4 text-[#D4A340]" />
          <span>نصب نسخه موبایل</span>
        </button>
      )}

      {variant === 'banner' && (
        <div className="bg-[#163826] text-[#FAF7F2] py-2 px-4 text-xs flex items-center justify-between border-b border-[#D4A340]/30">
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-[#D4A340]" />
            <span>برای دسترسی سریع‌تر، اپلیکیشن ناما را روی صفحه اصلی گوشی خود نصب کنید.</span>
          </div>
          <button
            onClick={handleClick}
            className="px-3 py-1 rounded-lg bg-[#D4A340] hover:bg-[#C29230] text-[#163826] font-black text-xs transition-all cursor-pointer"
          >
            نصب رایگان
          </button>
        </div>
      )}

      {/* iOS Safari Installation Guide Modal */}
      {showIOSGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in"
          onClick={() => setShowIOSGuide(false)}
        >
          <div
            className="relative w-full max-w-sm rounded-3xl bg-[#FAF8F3] border border-[#E4D7C2] p-6 shadow-2xl text-right animate-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowIOSGuide(false)}
              className="absolute top-4 left-4 p-1.5 rounded-full hover:bg-gray-200 text-gray-500 transition-all"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="w-12 h-12 rounded-2xl bg-[#163826] text-[#D4A340] flex items-center justify-center mb-3">
              <Smartphone className="w-6 h-6" />
            </div>

            <h3 className="text-base font-black text-[#163826]">
              نصب روی آیفون و آیپد (iOS)
            </h3>
            <p className="text-xs text-gray-600 mt-1 leading-relaxed">
              برای نصب فروشگاه ناما بدون نیاز به اپ‌استور، کافیست مراحل زیر را در مرورگر Safari انجام دهید:
            </p>

            <div className="space-y-3 mt-4 text-xs font-bold text-[#163826]">
              <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-white border border-[#E7D6B9]">
                <Share className="w-5 h-5 text-[#D4A340] flex-shrink-0" />
                <span>۱. در پایین مرورگر سافاری دکمه اشتراک‌گذاری (Share) را بزنید.</span>
              </div>
              <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-white border border-[#E7D6B9]">
                <PlusSquare className="w-5 h-5 text-[#D4A340] flex-shrink-0" />
                <span>۲. گزینه «Add to Home Screen» (افزودن به صفحه اصلی) را انتخاب کنید.</span>
              </div>
            </div>

            <button
              onClick={() => setShowIOSGuide(false)}
              className="mt-5 w-full py-2.5 rounded-xl bg-[#163826] hover:bg-[#0E2619] text-[#FAF7F2] text-xs font-black transition-all cursor-pointer"
            >
              متوجه شدم
            </button>
          </div>
        </div>
      )}
    </>
  );
};
