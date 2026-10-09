import React from 'react';
import { CartItem, StoreSettings } from '../types';
import { 
  X, 
  Trash2, 
  Plus, 
  Minus, 
  ShoppingBag, 
  Truck, 
  ArrowLeft,
  Sparkles,
  ShieldCheck
} from 'lucide-react';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemoveItem: (productId: string) => void;
  onProceedToCheckout: () => void;
  settings: StoreSettings;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  items,
  onUpdateQuantity,
  onRemoveItem,
  onProceedToCheckout,
  settings,
}) => {
  if (!isOpen) return null;

  const subtotal = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const isFreeShipping = subtotal >= settings.freeShippingThreshold;
  const shippingCost = items.length === 0 ? 0 : (isFreeShipping ? 0 : settings.shippingCost);
  const total = subtotal + shippingCost;
  const amountNeededForFreeShipping = Math.max(0, settings.freeShippingThreshold - subtotal);
  const freeShippingProgress = Math.min(100, Math.round((subtotal / settings.freeShippingThreshold) * 100));

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-xs flex justify-end">
      <div 
        className="w-full max-w-md bg-[#FAF8F3] h-full shadow-2xl flex flex-col justify-between text-right animate-in slide-in-from-left duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[#E8DEC9] bg-white/70 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#EBF3E8] flex items-center justify-center text-[#163826]">
              <ShoppingBag className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-black text-[#163826] text-base">سبد خرید شما</h3>
              <p className="text-xs text-[#6F7F72]">
                {items.length > 0 ? `${items.reduce((s, i) => s + i.quantity, 0)} قلم کالا` : 'خالی است'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Free Shipping Progress bar */}
        {items.length > 0 && (
          <div className="bg-[#F0E8DC] px-4 py-3 border-b border-[#E3D6C1]">
            <div className="flex items-center justify-between text-xs font-semibold mb-1.5 text-[#2C4032]">
              <span className="flex items-center gap-1">
                <Truck className="w-3.5 h-3.5 text-[#163826]" />
                {isFreeShipping ? (
                  <span className="text-[#1A5333] font-bold">تبریک! سفارش شما شامل ارسال رایگان شد 🎉</span>
                ) : (
                  <span>
                    فقط <strong className="text-[#163826]">{amountNeededForFreeShipping.toLocaleString('fa-IR')}</strong> تومان تا ارسال رایگان
                  </span>
                )}
              </span>
              <span>{freeShippingProgress}٪</span>
            </div>
            <div className="w-full bg-[#DFD2BC] h-2 rounded-full overflow-hidden">
              <div 
                className="bg-gradient-to-r from-[#D4A340] to-[#163826] h-full rounded-full transition-all duration-500"
                style={{ width: `${freeShippingProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Items List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
          {items.length === 0 ? (
            <div className="py-20 text-center flex flex-col items-center justify-center">
              <div className="w-20 h-20 rounded-full bg-[#EAE2D2] flex items-center justify-center text-[#849586] mb-4">
                <ShoppingBag className="w-10 h-10 stroke-1" />
              </div>
              <p className="text-base font-bold text-[#2A3E30] mb-1">سبد خرید شما در حال حاضر خالی است</p>
              <p className="text-xs text-[#6F7F72] max-w-xs mb-6">
                از بخش کاتالوگ فروشگاه ناما، عسل‌های طبیعی و خوراکی‌های سالم را به سبد خود بیفزایید.
              </p>
              <button
                onClick={onClose}
                className="px-5 py-2.5 rounded-full bg-[#163826] text-white text-xs font-bold shadow-md hover:bg-[#0E2619] transition-all"
              >
                مشاهده محصولات فروشگاه
              </button>
            </div>
          ) : (
            items.map(({ product, quantity }) => (
              <div 
                key={product.id}
                className="bg-white rounded-2xl p-3 border border-[#E9DFCE] shadow-xs flex items-center gap-3"
              >
                <img
                  src={product.image}
                  alt={product.name}
                  className="w-16 h-16 rounded-xl object-cover border border-[#ECE2D2] flex-shrink-0"
                />
                
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs sm:text-sm font-bold text-[#143220] truncate mb-0.5">
                    {product.name}
                  </h4>
                  <div className="text-[11px] text-[#718274] mb-1">
                    وزن: {product.weight}
                  </div>
                  <div className="text-xs font-black text-[#163826]">
                    {(product.price * quantity).toLocaleString('fa-IR')} تومان
                  </div>
                </div>

                {/* Quantity Controls */}
                <div className="flex flex-col items-end gap-2">
                  <button
                    onClick={() => onRemoveItem(product.id)}
                    className="text-gray-400 hover:text-red-500 transition-colors p-1"
                    title="حذف از سبد"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>

                  <div className="flex items-center border border-[#D5C6AC] rounded-full bg-[#FAF8F3] px-1.5 py-0.5">
                    <button
                      onClick={() => onUpdateQuantity(product.id, Math.min(product.stock, quantity + 1))}
                      className="w-5 h-5 flex items-center justify-center text-[#163826] hover:bg-gray-200 rounded-full"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                    <span className="w-6 text-center text-xs font-bold text-[#163826]">
                      {quantity}
                    </span>
                    <button
                      onClick={() => onUpdateQuantity(product.id, quantity - 1)}
                      className="w-5 h-5 flex items-center justify-center text-[#163826] hover:bg-gray-200 rounded-full"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer / Summary */}
        {items.length > 0 && (
          <div className="p-4 sm:p-5 border-t border-[#E8DEC9] bg-white space-y-3 shadow-lg">
            <div className="space-y-1.5 text-xs text-[#4F6052]">
              <div className="flex justify-between">
                <span>مجموع اقلام:</span>
                <span className="font-bold text-[#163826]">{subtotal.toLocaleString('fa-IR')} تومان</span>
              </div>
              <div className="flex justify-between">
                <span>هزینه بسته‌بندی و ارسال:</span>
                <span className="font-bold">
                  {shippingCost === 0 ? (
                    <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">رایگان</span>
                  ) : (
                    `${shippingCost.toLocaleString('fa-IR')} تومان`
                  )}
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t border-[#EAE0D0] text-sm sm:text-base font-black text-[#163826]">
                <span>مبلغ قابل پرداخت:</span>
                <span className="text-lg text-[#163826]">{total.toLocaleString('fa-IR')} تومان</span>
              </div>
            </div>

            <button
              onClick={() => {
                onClose();
                onProceedToCheckout();
              }}
              className="w-full py-3.5 px-4 rounded-2xl bg-[#163826] hover:bg-[#0F281B] active:scale-98 text-white font-black text-sm sm:text-base shadow-lg shadow-[#163826]/20 transition-all flex items-center justify-center gap-2"
            >
              <span>ادامه فرآیند و ثبت سفارش (کارت به کارت)</span>
              <ArrowLeft className="w-4 h-4 text-[#D4A340]" />
            </button>

            <div className="text-[11px] text-center text-[#748777] flex items-center justify-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-[#163826]" />
              <span>پرداخت امن با ارائه رسید معتبر بانکی و پیگیری لحظه‌ای</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
