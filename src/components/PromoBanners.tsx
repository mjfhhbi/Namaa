import React from 'react';
import { Sparkles, ArrowLeft, Award } from 'lucide-react';
import { ProductCategory, StoreSettings } from '../types';
import { PRODUCT_IMAGES } from '../data/productImages';

interface PromoBannersProps {
  settings: StoreSettings;
  onSelectCategory: (cat: ProductCategory) => void;
}

export const PromoBanners: React.FC<PromoBannersProps> = ({ settings, onSelectCategory }) => {
  const badge = settings.promoBadge || "جشنواره اصالت و سلامت ناما";
  const title = settings.promoTitle || "از نام و جان، برای طعمی ماندگار";
  const subtitle = settings.promoSubtitle || "هر قطره عسل کوهستان و هر دانه خرمای لوکس پیارم در «ناما»، تجلی تعهد به سلامتی و اصالت است. دستچین شده بدون ذره‌ای شکر مصنوعی یا سموم شیمیایی، مستقیم از دستان کشاورزان و زنبورداران امین ایران.";

  return (
    <section className="my-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
      {/* Main Luxury Hero-wide Banner */}
      <div className="relative rounded-3xl overflow-hidden bg-gradient-to-r from-[#231709] via-[#2A1D0E] to-[#1E2D20] text-white p-6 sm:p-10 shadow-2xl border-2 border-[#D4A340]/40">
        {/* Background ambient lighting */}
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-[#D4A340]/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 left-10 w-80 h-80 bg-[#35533A]/20 rounded-full blur-2xl pointer-events-none" />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center relative z-10">
          
          <div className="lg:col-span-7 text-right space-y-4">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#3B2912] border border-[#D4A340]/50 text-[#E8C574] text-xs font-bold shadow-xs">
              <Sparkles className="w-3.5 h-3.5 text-[#D4A340]" />
              <span>{badge}</span>
            </div>

            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-[#FAF7F2] leading-tight tracking-tight">
              {title}
            </h2>

            <p className="text-xs sm:text-sm text-[#E2D8C9] leading-relaxed max-w-xl">
              {subtitle}
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                onClick={() => onSelectCategory('honey_medicinal')}
                className="px-5 py-2.5 rounded-full bg-[#D4A340] hover:bg-[#B8860B] active:scale-95 text-[#231709] text-xs sm:text-sm font-black shadow-lg shadow-[#D4A340]/25 transition-all flex items-center gap-2"
              >
                <span>خرید عسل‌های درمانی و خاص</span>
                <ArrowLeft className="w-4 h-4" />
              </button>

              <button
                onClick={() => onSelectCategory('dates_export')}
                className="px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-white border border-[#D4A340]/40 text-xs sm:text-sm font-bold transition-all flex items-center gap-2"
              >
                <span>مشاهده خرماهای صادراتی</span>
              </button>
            </div>
          </div>

          {/* High-res authentic product collage */}
          <div className="lg:col-span-5 relative">
            <div className="grid grid-cols-2 gap-3.5">
              <div className="relative rounded-2xl overflow-hidden shadow-lg border border-[#D4A340]/40 aspect-square group">
                <img
                  src={PRODUCT_IMAGES.pureMountainHoney}
                  alt="عسل طبیعی و خام سبلان ناما"
                  className="w-full h-full object-cover group-hover:scale-108 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent flex flex-col justify-end p-3 text-right">
                  <span className="text-[11px] font-black text-amber-300">عسل خام سبلان</span>
                  <span className="text-[9px] text-gray-200">ساکارز زیر ۱.۵٪ آزمایشگاهی</span>
                </div>
              </div>

              <div className="relative rounded-2xl overflow-hidden shadow-lg border border-[#D4A340]/40 aspect-square group">
                <img
                  src={PRODUCT_IMAGES.luxuryPiaromDates}
                  alt="خرما پیارم لوکس صادراتی ناما"
                  className="w-full h-full object-cover group-hover:scale-108 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent flex flex-col justify-end p-3 text-right">
                  <span className="text-[11px] font-black text-amber-300">خرمای شکلاتی پیارم</span>
                  <span className="text-[9px] text-gray-200">سوپر اعلا حاجی‌آباد</span>
                </div>
              </div>
            </div>

            {/* Quality pill badge */}
            <div className="absolute -bottom-3 right-1/2 translate-x-1/2 bg-[#2D1F10]/95 backdrop-blur-md border border-[#D4A340] px-4 py-1.5 rounded-full shadow-xl flex items-center gap-2 whitespace-nowrap">
              <Award className="w-3.5 h-3.5 text-[#D4A340]" />
              <span className="text-[11px] font-bold text-[#FAF7F2]">
                تضمین ۱۰۰٪ خلوص طبیعی با برگه آزمایش معتبر
              </span>
            </div>
          </div>

        </div>
      </div>

      {/* Secondary Dual Banners (Honey & Dates Focus) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
        
        {/* Banner 1: عسل‌های درمانی و خاص */}
        <div 
          onClick={() => onSelectCategory('honey_medicinal')}
          className="group relative rounded-3xl overflow-hidden bg-gradient-to-br from-[#291B0B] via-[#352310] to-[#1E3324] p-6 sm:p-7 text-white shadow-lg border border-[#D4A340]/40 cursor-pointer transition-all duration-300 hover:shadow-xl hover:border-[#D4A340]"
        >
          <div className="flex flex-col sm:flex-row items-center gap-5 justify-between">
            <div className="text-right space-y-2.5 flex-1">
              <span className="px-2.5 py-1 rounded-full bg-[#4A3215] text-[#E8C574] text-[10px] font-black border border-[#D4A340]/40 inline-block">
                مجموعه دارویی و خام
              </span>
              <h3 className="text-lg sm:text-xl font-black text-[#FAF7F2] group-hover:text-[#D4A340] transition-colors">
                عسل‌های درمانی و خاص ناما
              </h3>
              <p className="text-xs text-amber-100/75 leading-relaxed line-clamp-2">
                عسل آویشن، گون با موم خودبافت و ژل رویال ارگانیک؛ از نام و جان برای تقویت قوای جسمی و آرامش تنفس.
              </p>
              <div className="pt-1 flex items-center gap-1.5 text-xs font-black text-[#D4A340] group-hover:gap-2.5 transition-all">
                <span>مشاهده محصولات این دسته</span>
                <span>←</span>
              </div>
            </div>

            <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-2xl overflow-hidden border-2 border-[#D4A340]/50 shadow-md flex-shrink-0">
              <img
                src={PRODUCT_IMAGES.naturalRawHoneycomb}
                alt="عسل درمانی با موم ناما"
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
              />
            </div>
          </div>
        </div>

        {/* Banner 2: خرماهای صادراتی و لوکس */}
        <div 
          onClick={() => onSelectCategory('dates_export')}
          className="group relative rounded-3xl overflow-hidden bg-gradient-to-br from-[#1C2C1F] via-[#2A3F30] to-[#251A0D] p-6 sm:p-7 text-white shadow-lg border border-[#4E7557]/40 cursor-pointer transition-all duration-300 hover:shadow-xl hover:border-[#D4A340]"
        >
          <div className="flex flex-col sm:flex-row items-center gap-5 justify-between">
            <div className="text-right space-y-2.5 flex-1">
              <span className="px-2.5 py-1 rounded-full bg-[#183921] text-[#9EE5AA] text-[10px] font-black border border-[#3E7D56]/50 inline-block">
                دستچین ممتاز صادراتی
              </span>
              <h3 className="text-lg sm:text-xl font-black text-[#FAF7F2] group-hover:text-[#D4A340] transition-colors">
                خرماهای لوکس و صادراتی
              </h3>
              <p className="text-xs text-emerald-100/75 leading-relaxed line-clamp-2">
                پیارم اعلای حاجی‌آباد، رطب مشکی بم و خرمای زاهدی قصب؛ بسته‌بندی‌های بهداشتی و طعمی ماندگار.
              </p>
              <div className="pt-1 flex items-center gap-1.5 text-xs font-black text-[#D4A340] group-hover:gap-2.5 transition-all">
                <span>مشاهده محصولات این دسته</span>
                <span>←</span>
              </div>
            </div>

            <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-2xl overflow-hidden border-2 border-[#D4A340]/50 shadow-md flex-shrink-0">
              <img
                src={PRODUCT_IMAGES.mozafatiBamDates}
                alt="رطب صادراتی بم ناما"
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
              />
            </div>
          </div>
        </div>

      </div>
    </section>
  );
};
