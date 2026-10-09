import React from 'react';
import { ProductCategory, StoreSettings } from '../types';
import { 
  ShieldCheck, 
  Leaf, 
  Award, 
  Truck, 
  Sparkles
} from 'lucide-react';
import { PRODUCT_IMAGES } from '../data/productImages';

interface HeroProps {
  settings: StoreSettings;
  activeCategory: ProductCategory;
  onSelectCategory: (cat: ProductCategory) => void;
  onScrollToCatalog: () => void;
}

const CATEGORIES: { id: ProductCategory; label: string; icon: string }[] = [
  { id: 'all', label: 'همه محصولات', icon: '🌿' },
  { id: 'honey_medicinal', label: 'عسل‌های درمانی و خاص', icon: '🍯' },
  { id: 'dates_export', label: 'خرماهای صادراتی و لوکس', icon: '🌴' },
  { id: 'syrups_traditional', label: 'شیره‌ها و معجون‌های سنتی', icon: '🥣' },
  { id: 'saffron_gold', label: 'زعفران و طلای سرخ', icon: '✨' },
  { id: 'oils_herbal', label: 'روغن‌های فرابکر و دمنوش', icon: '🫒' },
];

export const Hero: React.FC<HeroProps> = ({
  settings,
  activeCategory,
  onSelectCategory,
  onScrollToCatalog,
}) => {
  const badgeText = settings.heroBadge || "محصولات غذایی ۱۰۰٪ طبیعی، سالم و دستچین ایرانی";
  const titleText = settings.heroTitle || "از نام و جان، برای طعمی ماندگار";
  const subtitleText = settings.heroSubtitle || "سفره‌ای پربرکت با اصیل‌ترین طعم‌های دیار ایران؛ از عسل‌های بکر سبلان و خرمای شکلاتی پیارم تا دوشاب ناب ملایر و زعفران نگین قائنات، بدون مواد افزودنی و با تضمین بازگشت وجه.";
  const buttonText = settings.heroButtonText || "مشاهده و خرید محصولات";

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-[#FAF7F0] via-[#F4EDE1] to-[#FAF7F0] pt-6 pb-10 border-b border-[#E8DEC9]">
      {/* Decorative ambient background glows */}
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-[#D4A340]/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-1/4 w-80 h-80 bg-[#2F4E34]/10 rounded-full blur-2xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          
          {/* Text and Value Prop */}
          <div className="lg:col-span-7 text-right space-y-5">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#EFE7D8] border border-[#D5C6AC] text-[#3D2912] text-xs sm:text-sm font-bold shadow-xs">
              <Leaf className="w-3.5 h-3.5 text-[#2F4E34]" />
              <span>{badgeText}</span>
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

            {/* Quality Badges */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="flex items-center gap-2 bg-white/90 border border-[#E0D5C1] px-3 py-2 rounded-xl text-xs text-[#2A1D0E] shadow-xs">
                <ShieldCheck className="w-4 h-4 text-[#2F4E34] flex-shrink-0" />
                <span className="font-bold">{settings.qualityBadge1 || "برگه آزمایش معتبر"}</span>
              </div>
              <div className="flex items-center gap-2 bg-white/90 border border-[#E0D5C1] px-3 py-2 rounded-xl text-xs text-[#2A1D0E] shadow-xs">
                <Award className="w-4 h-4 text-[#D4A340] flex-shrink-0" />
                <span className="font-bold">{settings.qualityBadge2 || "تضمین ۱۰۰٪ اصالت"}</span>
              </div>
              <div className="flex items-center gap-2 bg-white/90 border border-[#E0D5C1] px-3 py-2 rounded-xl text-xs text-[#2A1D0E] shadow-xs">
                <Truck className="w-4 h-4 text-[#2F4E34] flex-shrink-0" />
                <span className="font-bold">{settings.qualityBadge3 || "بسته‌بندی ایمن پستی"}</span>
              </div>
              <div className="flex items-center gap-2 bg-white/90 border border-[#E0D5C1] px-3 py-2 rounded-xl text-xs text-[#2A1D0E] shadow-xs">
                <Sparkles className="w-4 h-4 text-[#D4A340] flex-shrink-0" />
                <span className="font-bold">{settings.qualityBadge4 || "ارسال فوری سراسری"}</span>
              </div>
            </div>

            {/* Quick Action Button */}
            <div className="pt-2 flex flex-wrap gap-3">
              <button
                onClick={onScrollToCatalog}
                className="px-6 py-3 bg-[#231709] hover:bg-[#150D05] active:scale-95 text-[#FAF7F0] font-black text-sm sm:text-base rounded-full shadow-lg shadow-[#231709]/20 transition-all flex items-center gap-2"
              >
                <span>{buttonText}</span>
                <span className="text-[#D4A340]">←</span>
              </button>
            </div>
          </div>

          {/* Visual Showcase Card */}
          <div className="lg:col-span-5 relative">
            <div className="relative mx-auto max-w-md rounded-3xl overflow-hidden border-4 border-white shadow-2xl bg-white p-2">
              <div className="relative h-72 sm:h-80 rounded-2xl overflow-hidden">
                <img
                  src={PRODUCT_IMAGES.pureMountainHoney}
                  alt="عسل طبیعی و محصولات ارگانیک ناما"
                  className="w-full h-full object-cover transform hover:scale-105 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent flex flex-col justify-end p-5 text-white text-right">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="px-2.5 py-0.5 rounded-full bg-[#D4A340] text-[#231709] text-xs font-black">
                      پیشنهاد ویژه ناما
                    </span>
                    <span className="text-xs text-amber-200">برداشت امسال</span>
                  </div>
                  <h3 className="text-lg font-bold">عسل درمانی سبلان با موم خودبافت</h3>
                  <p className="text-xs text-gray-200 mt-1 line-clamp-1">
                    ساکاروز زیر ۲ درصد با عطر گیاهان دارویی خودرو دامنه‌های کوهستان
                  </p>
                </div>
              </div>

              {/* Floating review/trust pill */}
              <div className="absolute -bottom-3 -right-3 sm:-right-4 bg-white/95 backdrop-blur-sm px-4 py-2.5 rounded-2xl border border-[#E0D5C1] shadow-lg flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#FAF3E3] border border-[#E3CE9B] flex items-center justify-center text-[#A4781C] font-black text-sm">
                  ۱۰۰٪
                </div>
                <div className="text-right">
                  <div className="text-xs font-bold text-[#231709]">خالص و آزمایش شده</div>
                  <div className="text-[11px] text-[#695745]">بدون شکر و حرارت</div>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Categories Navigation Bar */}
        <div id="catalog-section" className="mt-10 pt-6 border-t border-[#E5DAC4]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg sm:text-xl font-bold text-[#231709] flex items-center gap-2">
              <span>دسته‌بندی‌های محصولات ناما</span>
              <span className="w-2.5 h-2.5 rounded-full bg-[#D4A340]" />
            </h2>
            <span className="text-xs text-[#6B5A4B]">کلیک برای فیلتر سریع فهرست</span>
          </div>

          <div className="flex items-center gap-2.5 overflow-x-auto pb-2 scrollbar-none">
            {CATEGORIES.map((cat) => {
              const isActive = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => onSelectCategory(cat.id)}
                  className={`flex-shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-xs sm:text-sm font-bold transition-all border ${
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

      </div>
    </section>
  );
};
