import React from 'react';
import { Logo } from './Logo';
import { StoreSettings } from '../types';
import { 
  PhoneCall, 
  Send, 
  Instagram, 
  ShieldCheck, 
  Truck, 
  Award, 
  KeyRound
} from 'lucide-react';

interface FooterProps {
  settings: StoreSettings;
  onOpenTracking: () => void;
  onOpenAdmin: () => void;
}

export const Footer: React.FC<FooterProps> = ({
  settings,
  onOpenTracking,
  onOpenAdmin,
}) => {
  return (
    <footer className="bg-[#1C1207] text-[#FAF7F0] border-t-4 border-[#D4A340] pt-14 pb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 pb-12 border-b border-white/10">
          
          {/* Brand & Slogan */}
          <div className="md:col-span-5 space-y-4 text-right">
            <div className="inline-block bg-[#FAF7F0] p-2.5 rounded-2xl">
              <Logo size={48} showText={true} />
            </div>

            <p className="text-xs sm:text-sm text-[#DFD3C3] leading-relaxed max-w-sm">
              {settings.aboutText || "فروشگاه تخصصی مواد غذایی ارگانیک و سنتی ناما با پایبندی به شعار «از نام و جان برای طعمی ماندگار»، برترین محصولات سالم مزارع، کوهپایه‌ها و نخلستان‌های ایران را مستقیماً به سفره‌های گرم خانواده‌ها می‌رساند."}
            </p>

            <div className="flex items-center gap-3 pt-2">
              <div className="flex items-center gap-1.5 text-xs text-[#E8C574] font-bold bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl">
                <Award className="w-4 h-4 text-[#D4A340]" />
                <span>برگه آزمایش تایید خلوص عسل</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-emerald-300 font-bold bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>ضمانت اصالت و بازگشت وجه</span>
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div className="md:col-span-3 space-y-3 text-right">
            <h4 className="text-sm font-black text-[#D4A340]">
              دسترسی سریع و خدمات
            </h4>
            <ul className="space-y-2 text-xs text-gray-300">
              <li>
                <button
                  onClick={onOpenTracking}
                  className="hover:text-amber-300 transition-colors flex items-center gap-1.5"
                >
                  <Truck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>پیگیری مرسوله پستی با کد رهگیری</span>
                </button>
              </li>
              <li>
                <button
                  onClick={onOpenAdmin}
                  className="hover:text-amber-300 transition-colors flex items-center gap-1.5"
                >
                  <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                  <span>ورود به پنل مدیریت فروشگاه (رمز: 1383)</span>
                </button>
              </li>
              <li className="pt-1 text-[11px] text-gray-400">
                تسویه حساب کارت به کارت امن با بانک {settings.bankName}
              </li>
              <li className="text-[11px] text-gray-400">
                ارسال سریع به سراسر ایران با پست پیشتاز
              </li>
            </ul>
          </div>

          {/* Contact & Socials */}
          <div className="md:col-span-4 space-y-3 text-right">
            <h4 className="text-sm font-black text-[#D4A340]">
              ارتباط و پشتیبانی سفارشات
            </h4>
            <p className="text-xs text-gray-300 leading-relaxed">
              هرگونه سوال در رابطه با سفارشات، ارسال و خواص محصولات دارید با ما در ارتباط باشید:
            </p>

            <div className="space-y-2 text-xs">
              <a 
                href={`tel:${settings.supportPhone}`} 
                className="flex items-center gap-2 text-white hover:text-amber-300 transition-colors"
              >
                <PhoneCall className="w-4 h-4 text-emerald-400" />
                <span>تلفن تماس مستقیم: <strong dir="ltr" className="font-mono">{settings.supportPhone}</strong></span>
              </a>

              {settings.supportInstagram && (
                <div className="flex items-center gap-2 text-gray-300">
                  <Instagram className="w-4 h-4 text-pink-400" />
                  <span>اینستاگرام: <span dir="ltr" className="font-mono text-white">@{settings.supportInstagram}</span></span>
                </div>
              )}

              {settings.supportTelegram && (
                <div className="flex items-center gap-2 text-gray-300">
                  <Send className="w-4 h-4 text-sky-400" />
                  <span>تلگرام پشتیبانی: <span dir="ltr" className="font-mono text-white">@{settings.supportTelegram}</span></span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom Copyright */}
        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between text-xs text-amber-100/60 gap-3 text-center sm:text-right">
          <div>
            © {new Date().getFullYear()} تمامی حقوق مادی و معنوی متعلق به فروشگاه مواد غذایی ناما (NAMA FOOD PRODUCTS) می‌باشد.
          </div>
          <div className="flex items-center gap-1.5 font-bold text-[#D4A340]">
            <span>از نام و جان برای طعمی ماندگار</span>
            <span>🌿</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
