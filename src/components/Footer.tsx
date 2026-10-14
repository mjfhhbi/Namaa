import React from 'react';
import { Logo } from './Logo';
import { StoreSettings } from '../types';
import namaLogoImg from '../assets/images/nama_store_logo_1791976961130.webp';
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
            <div className="inline-flex items-center gap-3 bg-[#FAF7F0] p-3 rounded-2xl shadow-md border border-amber-900/20">
              <Logo size={60} showText={true} />
            </div>

            <p className="text-xs sm:text-sm text-[#DFD3C3] leading-relaxed max-w-sm">
              {settings.aboutText || "فروشگاه تخصصی محصولات طبیعی و سالم ناما با پایبندی به شعار «از نام و جان برای طعمی ماندگار»، باکیفیت‌ترین خوراکی‌های اصیل و سنتی ایران را مستقیماً به سفره‌های پربرکت خانواده‌ها می‌رساند."}
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <div className="flex items-center gap-1.5 text-xs text-[#E8C574] font-bold bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl">
                <Award className="w-4 h-4 text-[#D4A340]" />
                <span>ضمانت کیفیت و سلامت کالا</span>
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
                  className="hover:text-amber-300 transition-colors flex items-center gap-1.5 text-gray-400 hover:text-gray-200"
                >
                  <KeyRound className="w-3.5 h-3.5 text-amber-500" />
                  <span>ورود به پنل مدیریت فروشگاه</span>
                </button>
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

            <div className="space-y-2.5 text-xs">
              <a 
                href={`tel:${settings.supportPhone || '+989166449409'}`} 
                className="flex items-center gap-2 text-white hover:text-amber-300 transition-colors"
              >
                <PhoneCall className="w-4 h-4 text-emerald-400" />
                <span>تلفن تماس: <strong dir="ltr" className="font-mono text-emerald-300">{settings.supportPhone || '+98 916 644 9409'}</strong></span>
              </a>

              <a 
                href="https://wa.me/989166449409" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-emerald-300 hover:text-emerald-200 transition-colors bg-emerald-950/40 px-3 py-1.5 rounded-xl border border-emerald-500/30 w-fit"
              >
                <span className="w-4 h-4 flex items-center justify-center font-bold text-sm">💬</span>
                <span>واتساپ پشتیبانی: <strong dir="ltr" className="font-mono">+98 916 644 9409</strong></span>
              </a>

              <a 
                href="https://instagram.com/namafoods_" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-gray-300 hover:text-pink-300 transition-colors"
              >
                <Instagram className="w-4 h-4 text-pink-400" />
                <span>اینستاگرام: <span dir="ltr" className="font-mono text-white font-bold">@namafoods_</span></span>
              </a>
            </div>
          </div>
        </div>

        {/* Bottom Copyright */}
        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between text-xs text-amber-100/60 gap-3 text-center sm:text-right">
          <div className="flex items-center justify-center sm:justify-start gap-2">
            <img 
              src={namaLogoImg} 
              alt="لوگو فروشگاه ناما" 
              className="w-6 h-6 rounded-full object-cover border border-[#D4A340]/40 shrink-0 shadow-sm"
              referrerPolicy="no-referrer"
            />
            <span>
              © {new Date().getFullYear()} تمامی حقوق مادی و معنوی متعلق به فروشگاه مواد غذایی ناما (NAMA FOOD PRODUCTS) می‌باشد.
            </span>
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
