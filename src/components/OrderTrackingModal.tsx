import React, { useState } from 'react';
import { Order, OrderStatus } from '../types';
import { 
  X, 
  Search, 
  Truck, 
  CheckCircle2, 
  Clock, 
  Package, 
  AlertCircle, 
  CreditCard, 
  ExternalLink,
  PhoneCall,
  MapPin,
  Upload,
  Copy,
  Check
} from 'lucide-react';
import { searchOrder, updateOrderStatus } from '../services/storeService';

interface OrderTrackingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOrderUpdated?: (order: Order) => void;
}

const STATUS_STEPS: { status: OrderStatus; label: string; desc: string }[] = [
  { 
    status: 'paid_pending_approval', 
    label: 'ثبت سفارش و بررسی فیش', 
    desc: 'رسید پرداخت توسط کارشناس مالی در حال بررسی است.' 
  },
  { 
    status: 'approved', 
    label: 'تایید واریزی', 
    desc: 'پرداخت با موفقیت تایید و سفارش جهت آماده‌سازی ارجاع شد.' 
  },
  { 
    status: 'packaging', 
    label: 'بسته‌بندی بهداشتی', 
    desc: 'محصولات دستچین شده و با عایق ضدضربه بسته‌بندی می‌گردند.' 
  },
  { 
    status: 'shipped', 
    label: 'ارسال شده با پست پیشتاز', 
    desc: 'بسته تحویل شرکت ملی پست گردیده و در راه مقصد است.' 
  },
];

export const OrderTrackingModal: React.FC<OrderTrackingModalProps> = ({
  isOpen,
  onClose,
  onOrderUpdated,
}) => {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<Order | null>(null);
  const [searched, setSearched] = useState(false);
  const [copied, setCopied] = useState(false);

  // Late receipt upload state
  const [lateReceipt, setLateReceipt] = useState('');
  const [lateCardLast4, setLateCardLast4] = useState('');
  const [isUpdatingReceipt, setIsUpdatingReceipt] = useState(false);

  if (!isOpen) return null;

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setSearched(true);
    const result = await searchOrder(query);
    setOrder(result);
    setLoading(false);
  };

  const handleLateUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setLateReceipt(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveLateReceipt = async () => {
    if (!order) return;
    setIsUpdatingReceipt(true);
    await updateOrderStatus(order.id, 'paid_pending_approval', {
      receiptImage: lateReceipt || order.receiptImage,
      cardLast4: lateCardLast4.trim() || order.cardLast4,
    });
    const updated: Order = {
      ...order,
      receiptImage: lateReceipt || order.receiptImage,
      cardLast4: lateCardLast4.trim() || order.cardLast4,
      status: 'paid_pending_approval',
    };
    setOrder(updated);
    if (onOrderUpdated) onOrderUpdated(updated);
    setIsUpdatingReceipt(false);
    alert('اطلاعات پرداخت با موفقیت ثبت شد و برای ادمین ارسال گردید.');
  };

  const getStepIndex = (status: OrderStatus) => {
    switch (status) {
      case 'pending_receipt':
      case 'paid_pending_approval':
        return 0;
      case 'approved':
        return 1;
      case 'packaging':
        return 2;
      case 'shipped':
        return 3;
      default:
        return 0;
    }
  };

  const activeStepIdx = order ? getStepIndex(order.status) : 0;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
      <div 
        className="relative w-full max-w-2xl bg-[#FAF8F3] rounded-3xl shadow-2xl border border-[#E4D7C2] overflow-hidden text-right animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[#E8DEC9] bg-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#EBF3E8] flex items-center justify-center text-[#163826]">
              <Truck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-black text-[#163826]">پیگیری وضعیت سفارش</h3>
              <p className="text-xs text-[#6F7F72]">استعلام با کد سفارش یا شماره موبایل</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 sm:p-7 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* Search Box */}
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="کد پیگیری (مانند NM-7841) یا شماره موبایل..."
              className="flex-1 bg-white border border-[#D5C6AC] rounded-2xl px-4 py-2.5 text-xs sm:text-sm text-[#163826] focus:outline-none focus:ring-2 focus:ring-[#163826]"
            />
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 rounded-2xl bg-[#163826] hover:bg-[#0E2619] text-white text-xs sm:text-sm font-bold shadow-md transition-all flex items-center gap-1.5"
            >
              <Search className="w-4 h-4" />
              <span>استعلام</span>
            </button>
          </form>

          {/* Results Area */}
          {loading ? (
            <div className="py-12 text-center text-sm text-[#6F7F72] flex items-center justify-center gap-2">
              <div className="w-5 h-5 border-2 border-[#163826] border-t-transparent rounded-full animate-spin" />
              <span>در حال جستجو و استعلام اطلاعات...</span>
            </div>
          ) : order ? (
            <div className="space-y-6">
              {/* Order Status Banner */}
              <div className="bg-white p-4 sm:p-5 rounded-3xl border border-[#E7DDC9] shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#F0E6D5]">
                  <div>
                    <span className="text-xs text-[#718274] block">کد سفارش:</span>
                    <span className="text-lg font-mono font-black text-[#163826]">
                      {order.id}
                    </span>
                  </div>
                  <div className="text-left">
                    <span className="text-xs text-[#718274] block">تاریخ ثبت:</span>
                    <span className="text-xs font-semibold text-[#2C4030]">
                      {new Date(order.createdAt).toLocaleDateString('fa-IR')}
                    </span>
                  </div>
                </div>

                {/* Tracking Progress Timeline */}
                <div className="py-5">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {STATUS_STEPS.map((step, idx) => {
                      const isCompleted = idx <= activeStepIdx;
                      const isCurrent = idx === activeStepIdx;
                      return (
                        <div 
                          key={step.status} 
                          className={`p-3 rounded-2xl border text-center transition-all ${
                            isCurrent
                              ? 'bg-[#EBF4E8] border-[#163826] shadow-sm'
                              : isCompleted
                              ? 'bg-[#FAF8F3] border-[#C8DAC3]'
                              : 'bg-gray-50 border-gray-200 opacity-60'
                          }`}
                        >
                          <div className={`w-8 h-8 rounded-full mx-auto mb-2 flex items-center justify-center font-bold text-xs ${
                            isCurrent
                              ? 'bg-[#163826] text-white animate-pulse'
                              : isCompleted
                              ? 'bg-[#3E7D56] text-white'
                              : 'bg-gray-200 text-gray-500'
                          }`}>
                            {isCompleted ? '✓' : idx + 1}
                          </div>
                          <h5 className="text-xs font-black text-[#163826] mb-1">
                            {step.label}
                          </h5>
                          <p className="text-[10px] text-[#637566] leading-tight">
                            {step.desc}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Postal Tracking Code Highlight (if shipped) */}
                {order.trackingCode && (
                  <div className="mt-2 bg-[#F3EDE2] border border-[#DFCDB3] p-4 rounded-2xl">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <Package className="w-5 h-5 text-[#163826]" />
                        <div>
                          <span className="text-xs font-bold text-[#163826] block">
                            کد رهگیری مرسوله پستی:
                          </span>
                          <span dir="ltr" className="text-sm sm:text-base font-mono font-black text-[#8C6D2B]">
                            {order.trackingCode}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(order.trackingCode!);
                            setCopied(true);
                            setTimeout(() => setCopied(false), 2000);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-white border border-[#D5C6AC] text-xs font-semibold flex items-center gap-1"
                        >
                          {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copied ? 'کپی شد' : 'کپی کد'}</span>
                        </button>

                        <a
                          href={`https://tracking.post.ir/?id=${order.trackingCode}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3.5 py-1.5 rounded-lg bg-[#163826] text-white text-xs font-bold hover:bg-[#0E2619] transition-all flex items-center gap-1"
                        >
                          <span>رهگیری در سایت پست</span>
                          <ExternalLink className="w-3.5 h-3.5 text-amber-300" />
                        </a>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Late Receipt upload section if no receipt attached */}
              {!order.receiptImage && order.status === 'paid_pending_approval' && (
                <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl space-y-3">
                  <div className="flex items-start gap-2 text-xs text-amber-900 font-bold">
                    <AlertCircle className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
                    <span>فیش واریزی برای این سفارش هنوز بارگذاری نشده است!</span>
                  </div>
                  <p className="text-[11px] text-amber-800">
                    اگر مبلغ را کارت به کارت فرموده‌اید، می‌توانید عکس فیش یا ۴ رقم کارت را در کادر زیر ثبت فرمایید تا فاکتور سریع‌تر تایید شود.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="text"
                      dir="ltr"
                      maxLength={4}
                      value={lateCardLast4}
                      onChange={(e) => setLateCardLast4(e.target.value)}
                      placeholder="۴ رقم آخر کارت شما"
                      className="bg-white border border-amber-300 rounded-xl px-3 py-2 text-xs font-mono text-center"
                    />
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLateUpload}
                      className="text-xs file:mr-2 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:bg-[#163826] file:text-white"
                    />
                  </div>
                  {(lateReceipt || lateCardLast4) && (
                    <button
                      onClick={handleSaveLateReceipt}
                      disabled={isUpdatingReceipt}
                      className="w-full py-2 bg-[#163826] hover:bg-[#0E2619] text-white rounded-xl text-xs font-bold transition-all"
                    >
                      {isUpdatingReceipt ? 'در حال ذخیره...' : 'ثبت فیش واریز'}
                    </button>
                  )}
                </div>
              )}

              {/* Order Items & Address */}
              <div className="bg-white p-4 sm:p-5 rounded-3xl border border-[#E7DDC9] space-y-3">
                <h4 className="text-xs font-bold text-[#163826]">اقلام سفارش:</h4>
                <div className="divide-y divide-[#F0E6D5]">
                  {order.items.map((item, i) => (
                    <div key={i} className="py-2.5 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <img src={item.image} alt={item.name} className="w-10 h-10 rounded-lg object-cover" />
                        <div>
                          <span className="font-bold text-[#143220] block">{item.name}</span>
                          <span className="text-[10px] text-[#768779]">{item.weight} × {item.quantity} عدد</span>
                        </div>
                      </div>
                      <span className="font-bold text-[#163826]">
                        {(item.price * item.quantity).toLocaleString('fa-IR')} تومان
                      </span>
                    </div>
                  ))}
                </div>

                <div className="pt-2 border-t border-[#F0E6D5] flex justify-between text-sm font-black text-[#163826]">
                  <span>مبلغ کل پرداختی:</span>
                  <span>{order.totalAmount.toLocaleString('fa-IR')} تومان</span>
                </div>
              </div>

              {/* Delivery Address Details */}
              <div className="bg-[#FAF8F3] p-4 rounded-2xl border border-[#E4D7C2] text-xs text-[#334637] space-y-1">
                <div><span className="font-bold">تحویل‌گیرنده:</span> {order.customerName} ({order.customerPhone})</div>
                <div><span className="font-bold">آدرس پستی:</span> {order.province}، {order.city}، {order.address}</div>
                {order.postalCode && <div><span className="font-bold">کد پستی:</span> {order.postalCode}</div>}
              </div>
            </div>
          ) : searched ? (
            <div className="py-12 text-center">
              <AlertCircle className="w-10 h-10 text-amber-600 mx-auto mb-2" />
              <p className="text-sm font-bold text-[#2A3E30] mb-1">سفارشی با این مشخصات یافت نشد</p>
              <p className="text-xs text-[#6F7F72]">
                لطفاً کد سفارش (مانند NM-7841) یا شماره موبایل ثبت شده را به درستی بررسی فرمایید.
              </p>
            </div>
          ) : (
            <div className="py-10 text-center text-xs text-[#6F7F72]">
              کد سفارش دریافت شده در انتهای خرید را وارد کنید تا وضعیت لحظه‌ای مرسوله را مشاهده نمایید.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
