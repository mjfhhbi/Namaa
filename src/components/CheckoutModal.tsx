import React, { useState } from 'react';
import { CartItem, Order, StoreSettings } from '../types';
import { 
  X, 
  CreditCard, 
  Copy, 
  Check, 
  Upload, 
  Truck, 
  MapPin, 
  Phone, 
  User, 
  FileText, 
  ShieldCheck, 
  Sparkles,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  settings: StoreSettings;
  onOrderCompleted: (order: Order) => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  onClose,
  items,
  settings,
  onOrderCompleted,
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Step 1: Customer Info
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [province, setProvince] = useState('تهران');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [notes, setNotes] = useState('');
  const [step1Errors, setStep1Errors] = useState<Record<string, string>>({});

  // Step 2: Payment Info
  const [cardLast4, setCardLast4] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [receiptImage, setReceiptImage] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdOrder, setCreatedOrder] = useState<Order | null>(null);

  if (!isOpen) return null;

  const subtotal = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const isFreeShipping = subtotal >= settings.freeShippingThreshold;
  const shippingCost = isFreeShipping ? 0 : settings.shippingCost;
  const totalAmount = subtotal + shippingCost;

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2500);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert('حجم عکس رسید نباید بیشتر از ۵ مگابایت باشد.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setReceiptImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const validateStep1 = () => {
    const errs: Record<string, string> = {};
    if (!customerName.trim() || customerName.trim().length < 3) {
      errs.name = 'نام و نام خانوادگی را وارد کنید';
    }
    const cleanPhone = customerPhone.replace(/\s+/g, '');
    if (!cleanPhone || !/^09\d{9}$/.test(cleanPhone)) {
      errs.phone = 'شماره موبایل معتبر ۱۱ رقمی (مانند 0912...) وارد کنید';
    }
    if (!city.trim()) {
      errs.city = 'نام شهر را وارد کنید';
    }
    if (!address.trim() || address.trim().length < 8) {
      errs.address = 'آدرس کامل پستی جهت تحویل مرسوله الزامی است';
    }
    setStep1Errors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleProceedToStep2 = () => {
    if (validateStep1()) {
      setStep(2);
    }
  };

  const handleFinalSubmit = async () => {
    setIsSubmitting(true);
    const orderId = `NM-${Math.floor(1000 + Math.random() * 9000)}`;

    const newOrder: Order = {
      id: orderId,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      province: province.trim(),
      city: city.trim(),
      address: address.trim(),
      postalCode: postalCode.trim(),
      items: items.map(i => ({
        productId: i.product.id,
        name: i.product.name,
        price: i.product.price,
        weight: i.product.weight,
        image: i.product.image,
        quantity: i.quantity,
      })),
      subtotal,
      shippingCost,
      totalAmount,
      status: 'paid_pending_approval',
      paymentMethod: 'card_to_card',
      cardLast4: cardLast4.trim() || undefined,
      paymentReference: paymentReference.trim() || undefined,
      receiptImage: receiptImage || undefined,
      notes: notes.trim() || undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setCreatedOrder(newOrder);
    onOrderCompleted(newOrder);

    // Launch celebratory confetti
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#163826', '#D4A340', '#4A7C59', '#F4EFE6']
    });

    setIsSubmitting(false);
    setStep(3);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
      <div 
        className="relative w-full max-w-2xl bg-[#FAF8F3] rounded-3xl shadow-2xl border border-[#E4D7C2] overflow-hidden text-right animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="p-4 sm:p-5 border-b border-[#E8DEC9] bg-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-full bg-[#EAF2E7] text-[#163826] font-black text-sm flex items-center justify-center">
              {step === 3 ? '✓' : step}
            </span>
            <div>
              <h3 className="text-base font-black text-[#163826]">
                {step === 1 && 'مرحله ۱ از ۲: مشخصات تحویل گیرنده'}
                {step === 2 && 'مرحله ۲ از ۲: واریز کارت به کارت و ثبت فیش'}
                {step === 3 && 'سفارش شما با موفقیت ثبت شد 🎉'}
              </h3>
              <p className="text-xs text-[#6F7F72]">
                {step === 1 && 'اطلاعات پستی جهت ارسال مرسوله با پست پیشتاز'}
                {step === 2 && 'واریز به حساب فروشگاه ناما و بارگذاری مشخصات پرداخت'}
                {step === 3 && 'کد رهگیری اختصاصی برای پیگیری وضعیت ارسال'}
              </p>
            </div>
          </div>

          {step !== 3 && (
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* STEP 1: Customer Address Form */}
        {step === 1 && (
          <div className="p-5 sm:p-7 space-y-4 max-h-[75vh] overflow-y-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#2A3F30] mb-1">
                  نام و نام خانوادگی تحویل‌گیرنده *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="مثال: علی محمدی"
                    className="w-full bg-white border border-[#D5C6AC] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-[#163826] focus:outline-none focus:ring-2 focus:ring-[#163826]"
                  />
                  <User className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                </div>
                {step1Errors.name && (
                  <span className="text-[11px] text-red-600 mt-1 block">{step1Errors.name}</span>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-[#2A3F30] mb-1">
                  شماره تلفن همراه (جهت پیامک رهگیری) *
                </label>
                <div className="relative">
                  <input
                    type="tel"
                    dir="ltr"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="09123456789"
                    className="w-full bg-white border border-[#D5C6AC] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-left text-[#163826] focus:outline-none focus:ring-2 focus:ring-[#163826]"
                  />
                  <Phone className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2" />
                </div>
                {step1Errors.phone && (
                  <span className="text-[11px] text-red-600 mt-1 block">{step1Errors.phone}</span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#2A3F30] mb-1">
                  استان *
                </label>
                <input
                  type="text"
                  value={province}
                  onChange={(e) => setProvince(e.target.value)}
                  placeholder="تهران، اصفهان، فارس، خراسان..."
                  className="w-full bg-white border border-[#D5C6AC] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-[#163826] focus:outline-none focus:ring-2 focus:ring-[#163826]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#2A3F30] mb-1">
                  شهر *
                </label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="نام شهر"
                  className="w-full bg-white border border-[#D5C6AC] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-[#163826] focus:outline-none focus:ring-2 focus:ring-[#163826]"
                />
                {step1Errors.city && (
                  <span className="text-[11px] text-red-600 mt-1 block">{step1Errors.city}</span>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#2A3F30] mb-1">
                آدرس دقیق پستی (خیابان، کوچه، پلاک، واحد) *
              </label>
              <textarea
                rows={2}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="آدرس دقیق جهت تحویل پست پیشتاز..."
                className="w-full bg-white border border-[#D5C6AC] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-[#163826] focus:outline-none focus:ring-2 focus:ring-[#163826]"
              />
              {step1Errors.address && (
                <span className="text-[11px] text-red-600 mt-1 block">{step1Errors.address}</span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#2A3F30] mb-1">
                  کد پستی ۱۰ رقمی (اختیاری ولی توصیه شده)
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  placeholder="1234567890"
                  className="w-full bg-white border border-[#D5C6AC] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-left text-[#163826] focus:outline-none focus:ring-2 focus:ring-[#163826]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#2A3F30] mb-1">
                  توضیحات یا یادداشت تحویل (اختیاری)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="ساعت حضور، زمان تحویل..."
                  className="w-full bg-white border border-[#D5C6AC] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-[#163826] focus:outline-none focus:ring-2 focus:ring-[#163826]"
                />
              </div>
            </div>

            {/* Total recap */}
            <div className="bg-[#F2ECE0] p-3.5 rounded-2xl flex items-center justify-between text-xs text-[#2A3E30]">
              <span>مبلغ کل سفارش شما:</span>
              <span className="text-base font-black text-[#163826]">
                {totalAmount.toLocaleString('fa-IR')} تومان
              </span>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={handleProceedToStep2}
                className="w-full py-3.5 px-4 rounded-2xl bg-[#163826] hover:bg-[#0E2619] text-white font-black text-sm shadow-lg shadow-[#163826]/20 transition-all flex items-center justify-center gap-2"
              >
                <span>مرحله بعد: پرداخت کارت به کارت</span>
                <ArrowLeft className="w-4 h-4 text-[#D4A340]" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Card to Card Payment & Receipt Upload */}
        {step === 2 && (
          <div className="p-5 sm:p-7 space-y-5 max-h-[75vh] overflow-y-auto">
            {/* Bank Card Presentation Card */}
            <div className="relative rounded-3xl p-5 sm:p-6 bg-gradient-to-br from-[#163826] via-[#102B1D] to-[#0A1D13] text-white shadow-xl overflow-hidden">
              <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full blur-2xl pointer-events-none" />
              <div className="absolute bottom-0 left-0 w-40 h-40 bg-[#D4A340]/20 rounded-full blur-xl pointer-events-none" />

              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-semibold text-emerald-200">
                  {settings.bankName}
                </span>
                <span className="px-2.5 py-1 rounded-full bg-white/10 text-amber-300 text-[11px] font-bold">
                  حساب رسمی ناما فود
                </span>
              </div>

              {/* Card Number display */}
              <div className="my-4 text-center">
                <div className="text-[11px] text-gray-300 mb-1">شماره کارت جهت واریز وجه:</div>
                <div className="flex items-center justify-center gap-3">
                  <span dir="ltr" className="text-xl sm:text-2xl font-mono font-black tracking-wider text-amber-200">
                    {settings.cardNumber}
                  </span>
                  <button
                    onClick={() => copyToClipboard(settings.cardNumber.replace(/\s|-/g, ''), 'card')}
                    className="p-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white transition-all flex items-center gap-1 text-xs"
                    title="کپی شماره کارت"
                  >
                    {copiedField === 'card' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    <span className="text-[10px]">{copiedField === 'card' ? 'کپی شد' : 'کپی'}</span>
                  </button>
                </div>
              </div>

              {/* Card Details Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-white/10 text-xs">
                <div>
                  <span className="text-gray-400 block text-[11px]">به نام:</span>
                  <span className="font-bold text-white">{settings.cardHolder}</span>
                </div>
                <div className="sm:text-left">
                  <span className="text-gray-400 block text-[11px]">مبلغ دقیق قابل واریز:</span>
                  <span className="font-black text-amber-300 text-sm">
                    {totalAmount.toLocaleString('fa-IR')} تومان
                  </span>
                </div>
              </div>

              {/* Shaba Number (Optional copy) */}
              {settings.shabaNumber && (
                <div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-between text-[11px] text-gray-300">
                  <span className="truncate">شبا: <span dir="ltr" className="font-mono text-gray-200">{settings.shabaNumber}</span></span>
                  <button
                    onClick={() => copyToClipboard(settings.shabaNumber, 'shaba')}
                    className="text-amber-300 hover:underline flex items-center gap-1 flex-shrink-0 mr-2"
                  >
                    <Copy className="w-3 h-3" />
                    <span>کپی شبا</span>
                  </button>
                </div>
              )}
            </div>

            {/* Payment Details Input Form */}
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-[#E7DDC9] space-y-4">
              <h4 className="text-xs sm:text-sm font-bold text-[#163826] flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-[#D4A340]" />
                <span>مشخصات واریز خود را وارد نمایید:</span>
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#2C4030] mb-1">
                    ۴ رقم آخر کارت واریز کننده
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    maxLength={4}
                    value={cardLast4}
                    onChange={(e) => setCardLast4(e.target.value)}
                    placeholder="مثال: 4912"
                    className="w-full bg-[#FAF8F3] border border-[#D5C6AC] rounded-xl px-3 py-2 text-xs sm:text-sm text-center font-mono focus:outline-none focus:ring-2 focus:ring-[#163826]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#2C4030] mb-1">
                    شماره پیگیری / شماره ارجاع فیش
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                    placeholder="مثال: 849201"
                    className="w-full bg-[#FAF8F3] border border-[#D5C6AC] rounded-xl px-3 py-2 text-xs sm:text-sm text-center font-mono focus:outline-none focus:ring-2 focus:ring-[#163826]"
                  />
                </div>
              </div>

              {/* Receipt Image File Upload */}
              <div>
                <label className="block text-xs font-semibold text-[#2C4030] mb-1">
                  تصویر فیش واریزی (اسکرین‌شات رسید همراه بانک یا عابر)
                </label>
                
                {receiptImage ? (
                  <div className="relative border border-[#C8DAC3] bg-[#F2F7F0] p-3 rounded-2xl flex items-center gap-3">
                    <img 
                      src={receiptImage} 
                      alt="فیش واریزی" 
                      className="w-16 h-16 object-cover rounded-xl border border-[#D0DEC9]"
                    />
                    <div className="flex-1">
                      <span className="text-xs font-bold text-emerald-800 flex items-center gap-1">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        رسید واریزی با موفقیت ضمیمه شد
                      </span>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        ادمین رسید را بررسی و سفارش شما را تایید می‌کند.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setReceiptImage('')}
                      className="p-1.5 rounded-full hover:bg-gray-200 text-red-500 text-xs"
                      title="حذف و آپلود مجدد"
                    >
                      حذف
                    </button>
                  </div>
                ) : (
                  <label className="border-2 border-dashed border-[#D5C6AC] hover:border-[#163826] bg-[#FAF8F3] hover:bg-[#F2ECE0] p-4 rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all">
                    <Upload className="w-6 h-6 text-[#163826] mb-1.5" />
                    <span className="text-xs font-bold text-[#163826]">
                      کلیک برای انتخاب یا کشیدن تصویر رسید
                    </span>
                    <span className="text-[10px] text-gray-500 mt-0.5">
                      فرمت‌های JPG، PNG (حداکثر ۵ مگابایت)
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                  </label>
                )}
              </div>

              <div className="bg-[#FFFBEB] border border-[#FDE68A] p-3 rounded-xl flex items-start gap-2 text-xs text-[#92400E]">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600" />
                <span>
                  نکته: در صورت نداشتن تصویر رسید در حال حاضر، می‌توانید سفارش را ثبت نموده و اطلاعات واریز را پس از پرداخت در بخش «پیگیری سفارش» تکمیل فرمایید.
                </span>
              </div>
            </div>

            {/* Navigation buttons */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="py-3 px-4 rounded-xl border border-[#D5C6AC] hover:bg-gray-100 text-[#2C4030] text-xs font-bold transition-all flex items-center gap-1"
              >
                <ArrowRight className="w-4 h-4" />
                <span>ویرایش آدرس</span>
              </button>

              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleFinalSubmit}
                className="flex-1 py-3.5 px-4 rounded-2xl bg-[#163826] hover:bg-[#0E2619] disabled:bg-gray-400 text-white font-black text-sm sm:text-base shadow-lg shadow-[#163826]/20 transition-all flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <span>در حال ثبت سفارش و ارسال اعلان...</span>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-[#D4A340]" />
                    <span>تایید نهایی و ثبت سفارش خرید</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Success Confirmation */}
        {step === 3 && createdOrder && (
          <div className="p-6 sm:p-8 text-center space-y-5">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-[#EBF3E8] border-2 border-[#BED7B7] flex items-center justify-center text-[#163826] mx-auto shadow-md">
              <CheckCircle2 className="w-10 h-10 sm:w-12 sm:h-12 text-[#163826]" />
            </div>

            <div>
              <span className="px-3 py-1 rounded-full bg-[#E9F3E7] text-[#1E4D34] text-xs font-black inline-block mb-2">
                سفارش شما با موفقیت ثبت شد
              </span>
              <h3 className="text-xl sm:text-2xl font-black text-[#143220]">
                از اعتماد و همراهی شما با «ناما» سپاسگزاریم
              </h3>
              <p className="text-xs sm:text-sm text-[#5B6D5E] mt-1 max-w-md mx-auto">
                اطلاعات سفارش شما به مدیریت فروشگاه ارسال گردید و پس از بررسی واریزی، روند بسته‌بندی بهداشتی و ارسال پستی آغاز می‌شود.
              </p>
            </div>

            {/* Tracking Code Banner */}
            <div className="bg-[#FAF5EC] border-2 border-[#E7D6B9] rounded-2xl p-4 max-w-sm mx-auto text-center shadow-xs">
              <span className="text-xs text-[#718274] block mb-1">کد پیگیری اختصاصی سفارش شما:</span>
              <div className="flex items-center justify-center gap-2">
                <span className="text-2xl sm:text-3xl font-mono font-black text-[#163826] tracking-wider">
                  {createdOrder.id}
                </span>
                <button
                  onClick={() => copyToClipboard(createdOrder.id, 'orderId')}
                  className="p-1.5 rounded-lg bg-white border border-[#D5C6AC] hover:bg-gray-50 text-xs flex items-center gap-1"
                  title="کپی کد سفارش"
                >
                  {copiedField === 'orderId' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <span className="text-[11px] text-[#839587] block mt-1">
                این کد را برای استعلام وضعیت بسته نزد خود نگه دارید.
              </span>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button
                onClick={onClose}
                className="w-full sm:w-auto px-6 py-3 rounded-full bg-[#163826] hover:bg-[#0E2619] text-white text-xs sm:text-sm font-bold shadow-md transition-all"
              >
                بازگشت به فروشگاه
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
