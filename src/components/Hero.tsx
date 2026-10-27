import React from 'react';
import { ProductCategory, StoreSettings } from '../types';
import { 
  ShieldCheck, 
  Leaf, 
  Award, 
  Truck, 
  Sparkles
} from 'lucide-react';

interface HeroProps {
  settings: StoreSettings;
  activeCategory: ProductCategory;
  onSelectCategory: (cat: ProductCategory) => void;
  onScrollToCatalog: () => void;
}

export const Hero: React.FC<HeroProps> = ({
  settings,
  activeCategory,
  onSelectCategory,
}) => {
  const categoriesList = [
    { id: 'all', label: 'همه محصولات', icon: '🌿' },
    ...(settings.customCategories && settings.customCategories.length > 0
      ? settings.customCategories.map(c => ({
          id: c.id,
          label: c.name,
          icon: c.icon || '🍵'
        }))
      : []
    )
  ];

  const badgeText = settings.heroBadge || "محصولات غذایی ۱۰۰٪ طبیعی، سالم و دستچین ایرانی";
  const titleText = settings.heroTitle || "از نام و جان، برای طعمی ماندگار";
  const subtitleText = settings.heroSubtitle || "سفره‌ای پربرکت با اصیل‌ترین خوراکی‌های سنتی، سالم و سلامت‌محور ایران؛ دستچین‌شده با تعهد به خلوص، کیفیت ممتاز و طعمی ماندگار.";

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-[#FAF8F5] via-[#F3ECE0] to-[#FAF8F5] pt-6 pb-10 border-b border-[#E5DAC4]">
      {/* Decorative ambient background glows inspired by Isfahan's turquoise and saffron */}
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-[#00828A]/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-1/4 w-80 h-80 bg-[#D4A340]/12 rounded-full blur-2xl pointer-events-none" />

      {/* Subtle Persian arch outline in background */}
      <div className="absolute top-4 left-6 opacity-[0.06] pointer-events-none hidden lg:block">
        <svg className="w-64 h-80 text-[#00828A]" viewBox="0 0 100 130" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M10 130 L10 55 C10 30 35 10 50 0 C65 10 90 30 90 55 L90 130" />
          <path d="M20 130 L20 60 C20 40 40 22 50 14 C60 22 80 40 80 60 L80 130" strokeDasharray="3 3" />
        </svg>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div>
          {/* Text and Value Prop */}
          <div className="max-w-3xl text-right space-y-4">
            
            {/* Quality Badge */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-[#EFE7D8] border border-[#D5C6AC] text-[#4A361F] text-xs font-bold shadow-xs">
                <Sparkles className="w-3.5 h-3.5 text-[#B8860B]" />
                <span>{badgeText}</span>
              </div>
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-[#231709] leading-[1.3] tracking-tight">
              {titleText.includes('،') ? (
                <>
                  {titleText.split('،')[0]}، <br className="hidden sm:inline" />
                  <span className="text-[#A4781C] relative inline-block">
                    {titleText.split('،').slice(1).join('،')}
                    <svg className="absolute -bottom-2 right-0 w-full h-2.5 text-[#D4A340]/50" viewBox="0 0 100 20" preserveAspectRatio="none">
                      <path d="M0 10 Q 50 20 100 10" stroke="currentColor" strokeWidth="4" fill="none" strokeLinecap="round" />
                    </svg>
                  </span>
                </>
              ) : (
                <span className="text-[#231709]">{titleText}</span>
              )}
            </h1>

            <p className="text-sm sm:text-base text-[#4D3F31] max-w-xl leading-relaxed">
              {subtitleText}
            </p>

            {/* Quality Badges with Persian Arch Card Touches */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="flex items-center gap-2 bg-white/95 border border-[#E0D5C1] px-3 py-2.5 rounded-2xl text-xs text-[#2A1D0E] shadow-xs hover:border-[#00828A]/50 transition-colors">
                <ShieldCheck className="w-4 h-4 text-[#00828A] flex-shrink-0" />
                <span className="font-bold">{settings.qualityBadge1 || "برگه آزمایش معتبر"}</span>
              </div>
              <div className="flex items-center gap-2 bg-white/95 border border-[#E0D5C1] px-3 py-2.5 rounded-2xl text-xs text-[#2A1D0E] shadow-xs hover:border-[#D4A340]/60 transition-colors">
                <Award className="w-4 h-4 text-[#D4A340] flex-shrink-0" />
                <span className="font-bold">{settings.qualityBadge2 || "تضمین ۱۰۰٪ اصالت"}</span>
              </div>
              <div className="flex items-center gap-2 bg-white/95 border border-[#E0D5C1] px-3 py-2.5 rounded-2xl text-xs text-[#2A1D0E] shadow-xs hover:border-[#00828A]/50 transition-colors">
                <Truck className="w-4 h-4 text-[#00828A] flex-shrink-0" />
                <span className="font-bold">{settings.qualityBadge3 || "بسته‌بندی ایمن پستی"}</span>
              </div>
              <div className="flex items-center gap-2 bg-white/95 border border-[#E0D5C1] px-3 py-2.5 rounded-2xl text-xs text-[#2A1D0E] shadow-xs hover:border-[#D4A340]/60 transition-colors">
                <Sparkles className="w-4 h-4 text-[#D4A340] flex-shrink-0" />
                <span className="font-bold">{settings.qualityBadge4 || "ارسال فوری سراسری"}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Categories Navigation Bar (Shown when categories exist) */}
        {categoriesList.length > 1 && (
          <div id="catalog-section" className="mt-9 pt-5 border-t border-[#E5DAC4]">
            <div className="flex items-center justify-between mb-3.5">
              <h2 className="text-base sm:text-lg font-bold text-[#231709] flex items-center gap-2">
                <span>دسته‌بندی‌های محصولات ناما</span>
                <span className="w-2 h-2 rounded-full bg-[#00828A]" />
              </h2>
              <span className="text-xs text-[#6B5A4B]">کلیک برای فیلتر سریع کاتالوگ</span>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
              {categoriesList.map((cat) => {
                const isActive = activeCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => onSelectCategory(cat.id)}
                    className={`flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs sm:text-sm font-bold transition-all border cursor-pointer ${
                      isActive
                        ? 'bg-[#231709] text-[#FAF7F0] border-[#231709] shadow-md shadow-[#231709]/20'
                        : 'bg-white hover:bg-[#F5EFE3] text-[#3E2D1D] border-[#DFD3BE]'
                    }`}
                  >
                    <span className="text-base">{cat.icon}</span>
                    <span>{cat.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </section>
  );
};
