import React, { useState } from 'react';
import { Product } from '../types';
import { 
  X, 
  CheckCircle2, 
  MapPin, 
  Scale, 
  ShieldCheck, 
  Calendar, 
  Plus, 
  Minus, 
  ShoppingBag,
  Sparkles,
  Heart
} from 'lucide-react';

interface ProductDetailModalProps {
  product: Product | null;
  onClose: () => void;
  onAddToCart: (product: Product, quantity: number) => void;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  product,
  onClose,
  onAddToCart,
}) => {
  const [quantity, setQuantity] = useState(1);

  if (!product) return null;

  const handleAdd = () => {
    onAddToCart(product, quantity);
    onClose();
  };

  const hasDiscount = product.originalPrice && product.originalPrice > product.price;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
      <div 
        className="relative w-full max-w-3xl bg-[#FAF8F3] rounded-3xl shadow-2xl border border-[#E4D7C2] overflow-hidden text-right animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 left-4 z-20 w-9 h-9 rounded-full bg-white/90 hover:bg-white text-gray-700 shadow-md flex items-center justify-center transition-all"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="grid grid-cols-1 md:grid-cols-12">
          {/* Product Image Column */}
          <div className="md:col-span-5 relative bg-[#EDE4D4] min-h-[280px] md:min-h-[420px]">
            <img
              src={product.image}
              alt={product.name}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent md:hidden" />
            
            <div className="absolute bottom-4 right-4 flex flex-wrap gap-2">
              {product.isOrganic && (
                <span className="px-3 py-1 rounded-full bg-[#163826] text-white text-xs font-bold shadow-md flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#76E088]" />
                  ۱۰۰٪ طبیعی و خام
                </span>
              )}
            </div>
          </div>

          {/* Details Column */}
          <div className="md:col-span-7 p-6 sm:p-7 flex flex-col justify-between max-h-[85vh] overflow-y-auto">
            <div>
              {/* Category & Origin */}
              <div className="flex items-center justify-between text-xs text-[#6F7F72] mb-2">
                <span className="font-semibold text-[#8C6D2B] bg-[#F5ECDA] px-2.5 py-1 rounded-md">
                  {product.categoryLabel}
                </span>
                <span className="flex items-center gap-1 text-[#4F6052]">
                  <MapPin className="w-3.5 h-3.5 text-[#163826]" />
                  {product.origin}
                </span>
              </div>

              {/* Title */}
              <h2 className="text-xl sm:text-2xl font-black text-[#133020] mb-2">
                {product.name}
              </h2>

              {/* Badges / Specs row */}
              <div className="flex flex-wrap gap-2.5 my-3 text-xs">
                <div className="flex items-center gap-1.5 bg-white border border-[#DFD3BE] px-3 py-1 rounded-lg text-[#324536]">
                  <Scale className="w-3.5 h-3.5 text-[#D4A340]" />
                  <span className="font-medium">وزن: {product.weight}</span>
                </div>
                {product.harvestYear && (
                  <div className="flex items-center gap-1.5 bg-white border border-[#DFD3BE] px-3 py-1 rounded-lg text-[#324536]">
                    <Calendar className="w-3.5 h-3.5 text-[#163826]" />
                    <span className="font-medium">{product.harvestYear}</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5 bg-white border border-[#DFD3BE] px-3 py-1 rounded-lg text-[#324536]">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="font-medium">تضمین بازگشت وجه</span>
                </div>
              </div>

              {/* Description */}
              <p className="text-xs sm:text-sm text-[#4E5C50] leading-relaxed my-3">
                {product.description}
              </p>

              {/* Health Benefits */}
              {product.benefits && product.benefits.length > 0 && (
                <div className="my-4 bg-white/70 border border-[#E7DCBF] rounded-2xl p-3.5">
                  <h4 className="text-xs font-bold text-[#163826] mb-2 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#D4A340]" />
                    خواص سلامتی و درمانی تایید شده:
                  </h4>
                  <ul className="space-y-1.5 text-xs text-[#3C4C3E]">
                    {product.benefits.map((b, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#163826] flex-shrink-0 mt-0.5" />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Nutrition Facts */}
              {product.nutritionFacts && (
                <div className="grid grid-cols-2 gap-2 text-[11px] bg-[#F1EADF] p-3 rounded-xl mb-4 text-[#3A4A3C]">
                  {product.nutritionFacts.calories && (
                    <div><span className="font-bold">انرژی:</span> {product.nutritionFacts.calories}</div>
                  )}
                  {product.nutritionFacts.purity && (
                    <div><span className="font-bold">خلوص:</span> {product.nutritionFacts.purity}</div>
                  )}
                  {product.nutritionFacts.protein && (
                    <div><span className="font-bold">پروتئین:</span> {product.nutritionFacts.protein}</div>
                  )}
                  {product.nutritionFacts.naturalSugar && (
                    <div><span className="font-bold">قند:</span> {product.nutritionFacts.naturalSugar}</div>
                  )}
                </div>
              )}
            </div>

            {/* Price & Purchase Actions */}
            <div className="pt-4 border-t border-[#E8DEC9] space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-[#5D6F61] font-semibold">تعداد:</span>
                  <div className="flex items-center border border-[#D5C6AC] rounded-full bg-white px-2 py-1 shadow-xs">
                    <button
                      onClick={() => setQuantity(Math.min(product.stock, quantity + 1))}
                      className="w-6 h-6 rounded-full hover:bg-gray-100 flex items-center justify-center text-[#163826]"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-8 text-center text-sm font-black text-[#163826]">
                      {quantity}
                    </span>
                    <button
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      className="w-6 h-6 rounded-full hover:bg-gray-100 flex items-center justify-center text-[#163826]"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Price Display */}
                <div className="text-left">
                  {hasDiscount && (
                    <div className="text-xs text-gray-400 line-through">
                      {(product.originalPrice! * quantity).toLocaleString('fa-IR')} تومان
                    </div>
                  )}
                  <div className="flex items-baseline gap-1 text-left justify-end">
                    <span className="text-xl sm:text-2xl font-black text-[#163826]">
                      {(product.price * quantity).toLocaleString('fa-IR')}
                    </span>
                    <span className="text-xs text-[#637566] font-semibold">تومان</span>
                  </div>
                </div>
              </div>

              <button
                onClick={handleAdd}
                disabled={product.stock <= 0}
                className="w-full py-3.5 px-6 rounded-2xl bg-[#163826] hover:bg-[#0E2619] active:scale-98 text-white font-black text-sm sm:text-base shadow-lg shadow-[#163826]/20 transition-all flex items-center justify-center gap-2"
              >
                <ShoppingBag className="w-5 h-5 text-[#D4A340]" />
                <span>افزودن به سبد خرید</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
