import React from 'react';
import { Product } from '../types';
import { 
  Plus, 
  MapPin, 
  Sparkles, 
  Scale, 
  Star,
  CheckCircle2
} from 'lucide-react';

interface ProductCardProps {
  product: Product;
  onAddToCart: (p: Product) => void;
  onOpenDetails: (p: Product) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  onAddToCart,
  onOpenDetails,
}) => {
  const hasDiscount = product.originalPrice && product.originalPrice > product.price;
  const discountPercent = hasDiscount
    ? Math.round(((product.originalPrice! - product.price) / product.originalPrice!) * 100)
    : 0;

  return (
    <div className="group bg-white rounded-3xl border border-[#E7DDC9] overflow-hidden shadow-xs hover:shadow-xl hover:border-[#D4A340]/60 transition-all duration-300 flex flex-col justify-between">
      <div>
        {/* Image Container */}
        <div 
          onClick={() => onOpenDetails(product)}
          className="relative h-56 sm:h-60 w-full overflow-hidden bg-[#FAF6EE] cursor-pointer"
        >
          <img
            src={product.image}
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-108 transition-transform duration-700 ease-out"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

          {/* Badges */}
          <div className="absolute top-3 right-3 flex flex-col gap-1.5 items-end">
            {product.badge ? (
              <span className="px-2.5 py-1 rounded-full bg-[#231709]/90 backdrop-blur-xs text-[#E8C574] text-[11px] font-black shadow-sm border border-[#D4A340]/40 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-[#D4A340]" />
                {product.badge}
              </span>
            ) : product.isOrganic && (
              <span className="px-2.5 py-1 rounded-full bg-[#2F4E34]/90 backdrop-blur-xs text-[#FAF7F0] text-[11px] font-bold shadow-sm flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-[#79D488]" />
                ۱۰۰٪ طبیعی
              </span>
            )}
            {product.isPopular && !product.badge && (
              <span className="px-2.5 py-1 rounded-full bg-[#D4A340] text-[#231709] text-[11px] font-black shadow-sm flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-[#231709]" />
                پرفروش
              </span>
            )}
          </div>

          {/* Discount Tag */}
          {hasDiscount && (
            <div className="absolute top-3 left-3 bg-[#BE2D2D] text-white text-xs font-black px-2 py-1 rounded-lg shadow-md">
              {discountPercent}٪ تخفیف
            </div>
          )}

          {/* Weight & Origin overlay on bottom */}
          <div className="absolute bottom-2.5 right-3 left-3 flex items-center justify-between text-[11px] text-white/95 drop-shadow-md">
            <span className="bg-black/50 backdrop-blur-xs px-2 py-0.5 rounded-md flex items-center gap-1">
              <Scale className="w-3 h-3 text-[#D4A340]" />
              {product.weight}
            </span>
            <span className="bg-black/50 backdrop-blur-xs px-2 py-0.5 rounded-md flex items-center gap-1 truncate max-w-[130px]">
              <MapPin className="w-3 h-3 text-emerald-400" />
              {product.origin.split('،')[0]}
            </span>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 text-right">
          <div className="flex items-center justify-between text-[11px] font-bold text-[#8A6D3B] mb-1">
            <span>{product.categoryLabel}</span>
            {product.rating && (
              <span className="flex items-center gap-1 text-[#D4A340]">
                <Star className="w-3 h-3 fill-current" />
                <span className="font-mono text-gray-700">{product.rating}</span>
              </span>
            )}
          </div>

          <h3 
            onClick={() => onOpenDetails(product)}
            className="text-base sm:text-lg font-black text-[#231709] hover:text-[#A47922] transition-colors cursor-pointer line-clamp-1 mb-1.5"
          >
            {product.name}
          </h3>

          <p className="text-xs text-[#5D4E3F] line-clamp-2 leading-relaxed min-h-[34px]">
            {product.shortDesc}
          </p>
        </div>
      </div>

      {/* Footer & Pricing */}
      <div className="p-4 sm:p-5 pt-0">
        <div className="pt-3 border-t border-[#F0E8D9] flex items-center justify-between gap-2">
          {/* Price */}
          <div className="flex flex-col text-right">
            {hasDiscount && (
              <span className="text-[11px] text-[#9EA89F] line-through font-medium">
                {product.originalPrice?.toLocaleString('fa-IR')}
              </span>
            )}
            <div className="flex items-baseline gap-1">
              <span className="text-base sm:text-xl font-black text-[#231709]">
                {product.price.toLocaleString('fa-IR')}
              </span>
              <span className="text-[11px] font-semibold text-[#665545]">تومان</span>
            </div>
          </div>

          {/* Add to Cart button */}
          <button
            onClick={() => onAddToCart(product)}
            disabled={product.stock <= 0}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-full text-xs font-bold transition-all shadow-sm ${
              product.stock > 0
                ? 'bg-[#231709] hover:bg-[#150D05] active:scale-95 text-[#FAF7F0] hover:shadow-md'
                : 'bg-gray-200 text-gray-500 cursor-not-allowed'
            }`}
          >
            <Plus className="w-4 h-4 text-[#D4A340]" />
            <span>{product.stock > 0 ? 'افزودن' : 'ناموجود'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
