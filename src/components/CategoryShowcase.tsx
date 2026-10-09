import React from 'react';
import { ProductCategory, Product } from '../types';
import { ArrowLeft } from 'lucide-react';
import { PRODUCT_IMAGES } from '../data/productImages';

interface CategoryShowcaseProps {
  products: Product[];
  activeCategory: ProductCategory;
  onSelectCategory: (cat: ProductCategory) => void;
}

interface CategoryCardItem {
  id: ProductCategory;
  title: string;
  subtitle: string;
  badge: string;
  image: string;
  accentColor: string;
}

const CATEGORY_CARDS: CategoryCardItem[] = [
  {
    id: 'honey_medicinal',
    title: 'عسل‌های درمانی و خاص',
    subtitle: 'عسل کوهستان سبلان، گون، آویشن با موم و ژل رویال',
    badge: '۱۰۰٪ خام و درمانی',
    image: PRODUCT_IMAGES.pureMountainHoney,
    accentColor: '#D4A340',
  },
  {
    id: 'dates_export',
    title: 'خرماهای صادراتی و لوکس',
    subtitle: 'پیارم سوپر اعلا، رطب مضافتی بم و خرمای زاهدی قصب',
    badge: 'دستچین صادراتی',
    image: PRODUCT_IMAGES.luxuryPiaromDates,
    accentColor: '#A87922',
  },
  {
    id: 'syrups_traditional',
    title: 'شیره‌ها و معجون‌های سنتی',
    subtitle: 'ارده دوآتشه کنجد ایرانی اردکان و شیره انگور دیگ مسی ملایر',
    badge: 'بدون شکر افزوده',
    image: PRODUCT_IMAGES.sesameTahiniArdeh,
    accentColor: '#8C5A24',
  },
  {
    id: 'saffron_gold',
    title: 'زعفران و طلای سرخ',
    subtitle: 'زعفران سوپر نگین سحرگاهی قائنات در قوطی‌های خاتم نفیس',
    badge: 'کروسین صادراتی',
    image: PRODUCT_IMAGES.superNeginSaffron,
    accentColor: '#C43D32',
  },
  {
    id: 'oils_herbal',
    title: 'روغن‌های فرابکر و دمنوش',
    subtitle: 'روغن زیتون پرس سرد طارم رودبار و دمنوش آرامش وحشی',
    badge: 'طبیعی و ارگانیک',
    image: PRODUCT_IMAGES.virginOliveOil,
    accentColor: '#365A3D',
  },
];

export const CategoryShowcase: React.FC<CategoryShowcaseProps> = ({
  products,
  activeCategory,
  onSelectCategory,
}) => {
  return (
    <section className="my-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="text-right">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-[#D4A340]" />
            <span className="text-xs font-bold text-[#A47922]">دسته‌بندی‌های محبوب و پرطرفدار</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-[#231709]">
            انتخاب بر اساس سبد تندرستی ناما
          </h2>
        </div>

        <button
          onClick={() => onSelectCategory('all')}
          className="text-xs sm:text-sm font-bold text-[#231709] hover:text-[#D4A340] transition-colors flex items-center gap-1.5"
        >
          <span>مشاهده همه محصولات</span>
          <span>←</span>
        </button>
      </div>

      {/* Grid of 5 Category Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {CATEGORY_CARDS.map((cat) => {
          const count = products.filter(p => p.category === cat.id).length;
          const isSelected = activeCategory === cat.id;

          return (
            <div
              key={cat.id}
              onClick={() => onSelectCategory(cat.id)}
              className={`group relative rounded-3xl overflow-hidden cursor-pointer border-2 transition-all duration-300 shadow-xs hover:shadow-xl hover:-translate-y-1 ${
                isSelected 
                  ? 'border-[#D4A340] ring-2 ring-[#D4A340]/40 shadow-md' 
                  : 'border-[#EADFCB] hover:border-[#D4A340]/60'
              } bg-white flex flex-col justify-between`}
            >
              {/* Image area */}
              <div className="relative h-40 w-full overflow-hidden bg-[#FAF6EE]">
                <img
                  src={cat.image}
                  alt={cat.title}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                
                {/* Badge top */}
                <div className="absolute top-2.5 right-2.5">
                  <span className="px-2 py-0.5 rounded-md bg-[#231709]/85 backdrop-blur-xs text-white text-[10px] font-bold border border-white/10">
                    {cat.badge}
                  </span>
                </div>

                {/* Count bottom */}
                <div className="absolute bottom-2 right-2.5 text-[11px] text-amber-200 font-bold drop-shadow">
                  {count} محصول اختصاصی
                </div>
              </div>

              {/* Text Body */}
              <div className="p-4 text-right flex-1 flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-black text-[#231709] group-hover:text-[#A47922] transition-colors mb-1">
                    {cat.title}
                  </h3>
                  <p className="text-[11px] text-[#637265] leading-relaxed line-clamp-2">
                    {cat.subtitle}
                  </p>
                </div>

                <div className="pt-3 mt-2 border-t border-[#F2ECE0] flex items-center justify-between text-xs font-bold text-[#A47922] group-hover:text-[#231709]">
                  <span>ورود به دسته</span>
                  <ArrowLeft className="w-3.5 h-3.5 transform group-hover:-translate-x-1 transition-transform" />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
