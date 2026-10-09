import React, { useState } from 'react';
import { Product } from '../types';
import { ProductCard } from './ProductCard';
import { Sparkles, Clock, Flame, Award } from 'lucide-react';

interface FeaturedCollectionsProps {
  products: Product[];
  onAddToCart: (p: Product) => void;
  onOpenDetails: (p: Product) => void;
}

export const FeaturedCollections: React.FC<FeaturedCollectionsProps> = ({
  products,
  onAddToCart,
  onOpenDetails,
}) => {
  const [collectionTab, setCollectionTab] = useState<'featured' | 'new_arrivals'>('featured');

  // Featured products (special honey, luxury dates, royal jelly, saffron)
  const featuredProducts = products.filter(p => p.isFeatured || p.category === 'honey_medicinal' || p.category === 'dates_export').slice(0, 4);

  // New arrivals
  const newArrivals = products.filter(p => p.isNewArrival).slice(0, 4);

  const displayedList = collectionTab === 'featured' ? featuredProducts : newArrivals;

  return (
    <section className="my-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Section Header with Tabs */}
      <div className="bg-gradient-to-r from-[#FAF6EE] via-[#F4EDE0] to-[#FAF6EE] p-4 sm:p-5 rounded-3xl border border-[#E8DEC9] mb-6 flex flex-wrap items-center justify-between gap-4">
        
        <div className="text-right">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-[#D4A340]" />
            <span className="text-xs font-bold text-[#A47922]">دستچین ممتاز کارشناسان ناما</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-[#231709]">
            {collectionTab === 'featured' ? 'محصولات منتخب، عسل‌های خاص و خرماهای لوکس' : 'آخرین محصولات اضافه شده به انبار ناما'}
          </h2>
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center gap-2 bg-white/90 p-1.5 rounded-2xl border border-[#D5C6AC] shadow-xs">
          <button
            onClick={() => setCollectionTab('featured')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center gap-1.5 ${
              collectionTab === 'featured'
                ? 'bg-[#231709] text-white shadow-md'
                : 'text-[#647567] hover:text-[#231709]'
            }`}
          >
            <Award className="w-3.5 h-3.5 text-[#D4A340]" />
            <span>محصولات منتخب ویژه</span>
          </button>

          <button
            onClick={() => setCollectionTab('new_arrivals')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center gap-1.5 ${
              collectionTab === 'new_arrivals'
                ? 'bg-[#231709] text-white shadow-md'
                : 'text-[#647567] hover:text-[#231709]'
            }`}
          >
            <Clock className="w-3.5 h-3.5 text-[#D4A340]" />
            <span>آخرین محصولات اضافه شده</span>
          </button>
        </div>

      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 sm:gap-6">
        {displayedList.map(product => (
          <ProductCard
            key={product.id}
            product={product}
            onAddToCart={onAddToCart}
            onOpenDetails={onOpenDetails}
          />
        ))}
      </div>
    </section>
  );
};
