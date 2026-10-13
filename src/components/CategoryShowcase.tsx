import React from 'react';
import { ProductCategory, Product, StoreSettings } from '../types';
import { ArrowLeft, Sparkles, FolderPlus } from 'lucide-react';

interface CategoryShowcaseProps {
  products: Product[];
  settings?: StoreSettings;
  activeCategory: ProductCategory;
  onSelectCategory: (cat: ProductCategory) => void;
  onOpenAdmin?: () => void;
}

export const CategoryShowcase: React.FC<CategoryShowcaseProps> = ({
  products,
  settings,
  activeCategory,
  onSelectCategory,
  onOpenAdmin,
}) => {
  // If no products exist yet, do not render fake product category cards
  if (products.length === 0) {
    return null;
  }

  // Derive unique categories from actual products
  const categoryMap = new Map<string, { label: string; count: number; image: string }>();

  products.forEach(p => {
    const catId = p.category;
    const catLabel = p.categoryLabel || catId;
    if (!categoryMap.has(catId)) {
      categoryMap.set(catId, {
        label: catLabel,
        count: 1,
        image: p.image,
      });
    } else {
      const existing = categoryMap.get(catId)!;
      existing.count += 1;
    }
  });

  const categories = Array.from(categoryMap.entries()).map(([id, info]) => ({
    id,
    label: info.label,
    count: info.count,
    image: info.image,
  }));

  if (categories.length === 0) return null;

  return (
    <section className="my-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="text-right">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-[#D4A340]" />
            <span className="text-xs font-bold text-[#A47922]">دسته‌بندی‌های فعال فروشگاه</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-[#231709]">
            انتخاب بر اساس دسته‌بندی
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

      {/* Grid of Dynamic Category Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {categories.map((cat) => {
          const isSelected = activeCategory === cat.id;

          return (
            <div
              key={cat.id}
              onClick={() => onSelectCategory(cat.id)}
              className={`group relative rounded-3xl overflow-hidden cursor-pointer transition-all duration-300 border bg-white ${
                isSelected
                  ? 'border-[#231709] shadow-xl ring-2 ring-[#231709]/20 -translate-y-1'
                  : 'border-[#E8DEC9] hover:border-[#D4A340] hover:shadow-lg'
              }`}
            >
              {/* Image Container */}
              <div className="relative h-36 sm:h-44 overflow-hidden bg-[#FAF7F0]">
                {cat.image ? (
                  <img
                    src={cat.image}
                    alt={cat.label}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-3xl bg-[#FAF3E3]">
                    🌿
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

                <div className="absolute bottom-3 right-3 text-white text-right">
                  <h3 className="text-sm sm:text-base font-black leading-tight drop-shadow-md">
                    {cat.label}
                  </h3>
                  <span className="text-[11px] text-[#E8C574] font-bold">
                    {cat.count} محصول
                  </span>
                </div>
              </div>

              {/* Action bar */}
              <div className="p-2.5 flex items-center justify-between text-xs font-bold text-[#231709] bg-[#FAF7F2]">
                <span className="text-[11px] text-[#695745]">مشاهده محصولات</span>
                <span className="text-[#D4A340] group-hover:-translate-x-1 transition-transform">←</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
