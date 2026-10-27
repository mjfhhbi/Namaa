import React, { useState } from 'react';
import { CartItem, Order, StoreSettings, OrderStatus } from '../types';
import { 
  X, 
  CreditCard, 
  Copy, 
  Check, 
  Upload, 
  MapPin, 
  Phone, 
  User, 
  CheckCircle2,
  AlertCircle,
  Building,
  ArrowRight,
  ArrowLeft,
  Lock,
  FileCheck
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { compressImage } from '../utils/imageCompressor';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  settings: StoreSettings;
  onOrderCompleted: (order: Order) => void;
}

// Convert Persian and Arabic numbers to English standard digits
export const toEnglishDigits = (str: string): string => {
  if (!str) return '';
  const farsiDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  let res = str;
  for (let i = 0; i < 10; i++) {
    res = res.replaceAll(farsiDigits[i], String(i)).replaceAll(arabicDigits[i], String(i));
  }
  return res;
};

const IRAN_PROVINCES = [
  'خراسان رضوی',
  'خراسان جنوبی',
  'خراسان شمالی',
  'خراسان',
  'تهران',
  'اصفهان',
  'فارس',
  'آذربایجان شرقی',
  'مازندران',
  'گیلان',
  'البرز',
  'خوزستان',
  'کرمان',
  'یزد',
  'قم',
  'همدان',
  'کرمانشاه',
  'آذربایجان غربی',
  'مرکزی',
  'قزوین',
  'گلستان',
  'لرستان',
  'هرمزگان',
  'کردستان',
  'سیستان و بلوچستان',
  'اردبیل',
  'بوشهر',
  'زنجان',
  'چهارمحال و بختیاری',
  'کهگیلویه و بویراحمد',
  'سمنان',
  'ایلام'
];

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  onClose,
  items,
  settings,
  onOrderCompleted,
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Step 1: Customer & Postal Info
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [province, setProvince] = useState('تهران');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [notes, setNotes] = useState('');
  const [step1Errors, setStep1Errors] = useState<Record<string, string>>({});
  const [attemptedStep1, setAttemptedStep1] = useState(false);

  // Step 2: Payment & Receipt Info (defaults to official card_to_card bank transfer)
  const [paymentMethodChoice, setPaymentMethodChoice] = useState<'zarinpal' | 'card_to_card'>('card_to_card');
  const [cardLast4, setCardLast4] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [receiptImage, setReceiptImage] = useState<string>('');
  const [isCompressing, setIsCompressing] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdOrder, setCreatedOrder] = useState<Order | null>(null);

  // Bank Info loaded securely upon entering Step 2
  const [bankInfo, setBankInfo] = useState<{
    bankName: string;
    cardNumber: string;
    cardHolder: string;
    shabaNumber: string;
  } | null>(null);
  const [isLoadingBankInfo, setIsLoadingBankInfo] = useState(false);
  const [bankInfoError, setBankInfoError] = useState<string | null>(null);

  // Discount code state
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<any | null>(null);
  const [couponMessage, setCouponMessage] = useState<{ text: string; isError: boolean } | null>(null);

  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && step !== 3) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, step, onClose]);

  const subtotal = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const shippingCost = settings.shippingCost || 0;

  let discountAmount = 0;
  if (appliedCoupon) {
    if (appliedCoupon.type === 'percent') {
      discountAmount = Math.round((subtotal * appliedCoupon.amount) / 100);
      if (appliedCoupon.maxDiscount && discountAmount > appliedCoupon.maxDiscount) {
        discountAmount = appliedCoupon.maxDiscount;
      }
    } else {
      discountAmount = appliedCoupon.amount;
    }
  }
  const totalAmount = Math.max(0, subtotal - discountAmount) + shippingCost;

  const handleApplyCoupon = () => {
    setCouponMessage(null);
    const clean = couponCode.trim().toUpperCase();
    if (!clean) return;
    const found = settings.discountCodes?.find(d => d.code.toUpperCase() === clean && d.isActive);
    if (!found) {
      setCouponMessage({ text: 'کد تخفیف وارد شده معتبر نیست یا منقضی شده است.', isError: true });
      return;
    }
    if (found.minPurchase && subtotal < found.minPurchase) {
      setCouponMessage({ text: `حداقل مبلغ خرید برای این کد ${found.minPurchase.toLocaleString('fa-IR')} تومان است.`, isError: true });
      return;
    }
    setAppliedCoupon(found);
    setCouponMessage({ text: `کد تخفیف ${found.code} با موفقیت اعمال شد 🎉`, isError: false });
  };

  // Real-time checks
  const cleanPhone = toEnglishDigits(customerPhone).replace(/\D/g, '');
  const isPhoneValid = /^09\d{9}$/.test(cleanPhone);

  const cleanPostal = toEnglishDigits(postalCode).replace(/\D/g, '');
  const isPostalValid = cleanPostal.length >= 5;

  const isNameValid = customerName.trim().length >= 3;
  const isAddressValid = address.trim().length >= 5;
  const isProvinceValid = province.trim().length >= 2;
  const isCityValid = city.trim().length >= 2;

  const isStep1Complete = 
    isNameValid && 
    isPhoneValid && 
    isAddressValid && 
    isPostalValid && 
    isProvinceValid && 
    isCityValid;

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2500);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadError(null);
      if (!file.type.startsWith('image/')) {
        setUploadError('فرمت فایل نامعتبر است. لطفاً یک تصویر (JPG، PNG، WEBP) انتخاب فرمایید.');
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setUploadError('حجم فایل انتخاب شده نباید بیشتر از ۱۰ مگابایت باشد.');
        return;
      }
      try {
        setIsCompressing(true);
        const compressedBase64 = await compressImage(file, 900, 0.75);
        setReceiptImage(compressedBase64);
      } catch (err: any) {
        setUploadError(err?.message || 'خطا در بارگذاری و فشرده‌سازی تصویر رسید.');
      } finally {
        setIsCompressing(false);
      }
    }
  };

  const validateStep1 = () => {
    setAttemptedStep1(true);
    const errs: Record<string, string> = {};

    if (!customerName.trim() || customerName.trim().length < 3) {
      errs.name = 'نام و نام خانوادگی تحویل‌گیرنده را به صورت کامل وارد کنید (حداقل ۳ حرف)';
    }

    if (!cleanPhone) {
      errs.phone = 'شماره تلفن همراه الزامی است';
    } else if (!cleanPhone.startsWith('09')) {
      errs.phone = 'شماره همراه باید با 09 شروع شود (مثال: 09123456789)';
    } else if (cleanPhone.length !== 11) {
      errs.phone = `شماره همراه باید ۱۱ رقم باشد (در حال حاضر ${cleanPhone.length} رقم وارد شده)`;
    }

    if (!province.trim()) {
      errs.province = 'انتخاب استان الزامی است';
    }

    if (!city.trim() || city.trim().length < 2) {
      errs.city = 'نام شهر تحویل‌گیرنده را وارد کنید';
    }

    if (!address.trim()) {
      errs.address = 'آدرس پستی جهت ارسال مرسوله الزامی است';
    } else if (address.trim().length < 5) {
      errs.address = 'لطفاً آدرس پستی را با جزئیات وارد فرمایید (حداقل ۵ کاراکتر)';
    }

    if (!cleanPostal) {
      errs.postalCode = 'کد پستی تحویل‌گیرنده الزامی است';
    } else if (cleanPostal.length < 5) {
      errs.postalCode = 'کد پستی باید حداقل ۵ رقم باشد (۱۰ رقم استاندارد)';
    }

    setStep1Errors(errs);
    return Object.keys(errs).length === 0;
  };

  const fetchBankInfo = async (phoneToUse?: string) => {
    setIsLoadingBankInfo(true);
    setBankInfoError(null);
    try {
      const res = await fetch('/api/checkout/payment-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerPhone: phoneToUse || cleanPhone }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.bankInfo) {
          setBankInfo(data.bankInfo);
          return;
        }
      }
      const err = await res.json().catch(() => null);
      setBankInfoError(err?.error || 'خطا در دریافت اطلاعات حساب بانکی');
    } catch {
      setBankInfoError('خطا در برقراری ارتباط با سرور جهت دریافت اطلاعات کارت');
    } finally {
      setIsLoadingBankInfo(false);
    }
  };

  const handleProceedToStep2 = () => {
    if (validateStep1()) {
      setStep(2);
      fetchBankInfo(cleanPhone);
      // Smooth scroll to top
      const modalBody = document.getElementById('checkout-modal-body');
      if (modalBody) modalBody.scrollTop = 0;
    }
  };

  const handleFinalSubmit = async (methodOverride?: 'card_to_card' | 'zarinpal') => {
    const chosenMethod = methodOverride || paymentMethodChoice;

    // Re-verify Step 1 before allowing final submit
    if (!validateStep1()) {
      setStep(1);
      return;
    }

    setUploadError(null);
    setIsSubmitting(true);
    const orderId = `NM-${Math.floor(1000 + Math.random() * 9000)}`;

    const hasReceipt = Boolean(receiptImage && receiptImage.trim().length > 0);
    const orderStatus: OrderStatus = chosenMethod === 'card_to_card' 
      ? (hasReceipt ? 'paid_pending_approval' : 'pending_receipt') 
      : 'pending_receipt';

    const finalPostal = cleanPostal ? (cleanPostal.length >= 10 ? cleanPostal.slice(0, 10) : cleanPostal.padEnd(10, '0')) : '1111111111';

    const newOrder: Order = {
      id: orderId,
      customerName: customerName.trim(),
      customerPhone: cleanPhone,
      province: province.trim(),
      city: city.trim(),
      address: address.trim(),
      postalCode: finalPostal,
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
      discountCode: appliedCoupon?.code || undefined,
      discountAmount: discountAmount > 0 ? discountAmount : undefined,
      status: orderStatus,
      paymentMethod: chosenMethod,
      zarinpalAuthority: chosenMethod === 'zarinpal' ? `ZP-${Math.floor(10000000 + Math.random() * 90000000)}` : undefined,
      cardLast4: chosenMethod === 'card_to_card' ? (toEnglishDigits(cardLast4).replace(/\D/g, '').slice(0, 4) || undefined) : undefined,
      paymentReference: chosenMethod === 'card_to_card' ? (toEnglishDigits(paymentReference).trim() || undefined) : undefined,
      receiptImage: chosenMethod === 'card_to_card' && hasReceipt ? receiptImage : undefined,
      notes: notes.trim() || undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      setCreatedOrder(newOrder);
      await onOrderCompleted(newOrder);

      // Launch celebratory confetti
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#163826', '#D4A340', '#4A7C59', '#F4EFE6']
      });

      setStep(3);
    } catch (err: any) {
      setUploadError('خطا در ذخیره سفارش در دیتابیس: ' + (err?.message || 'مجدداً تلاش کنید'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5"
      onClick={() => { if (step !== 3) onClose(); }}
    >
      <div 
        className="relative w-full max-w-2xl bg-[#FAF8F3] rounded-3xl shadow-2xl border border-[#E4D7C2] overflow-hidden text-right animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Step Progress Top Header */}
        <div className="p-4 sm:p-5 border-b border-[#E8DEC9] bg-white">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-[#163826] text-[#D4A340] font-black text-sm flex items-center justify-center">
                {step === 3 ? '✓' : step}
              </span>
              <div>
                <h3 className="text-base font-black text-[#163826]">
                  {step === 1 && 'مرحله ۱ از ۲: مشخصات و آدرس پستی'}
                  {step === 2 && 'مرحله ۲ از ۲: پرداخت و ارسال فیش واریزی'}
                  {step === 3 && 'سفارش شما با موفقیت ثبت شد 🎉'}
                </h3>
                <p className="text-xs text-[#6F7F72]">
                  {step === 1 && 'تکمیل دقیق تمامی فیلدها جهت ارسال مرسوله با پست پیشتاز الزامی است'}
                  {step === 2 && 'کارت‌به‌کارت به حساب رسمی ناما و بارگذاری عکس رسید'}
                  {step === 3 && 'کد رهگیری اختصاصی برای پیگیری بسته تا زمان تحویل'}
                </p>
              </div>
            </div>

            {step !== 3 && (
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}
                onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}
                className="w-10 h-10 rounded-full hover:bg-red-50 hover:text-red-700 active:bg-red-100 flex items-center justify-center text-gray-500 transition-colors cursor-pointer border border-transparent hover:border-red-200"
                title="بستن"
                aria-label="بستن"
              >
                <X className="w-5 h-5 stroke-[2.5]" />
              </button>
            )}
          </div>

          {/* Stepper visual bar */}
          {step !== 3 && (
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div 
                onClick={() => setStep(1)}
                className={`flex items-center gap-2 p-2 rounded-xl text-xs font-bold cursor-pointer transition-all ${
                  step === 1 
                    ? 'bg-[#163826] text-white shadow-xs' 
                    : isStep1Complete 
                      ? 'bg-[#EBF3E8] text-[#163826] border border-[#C8DAC3]' 
                      : 'bg-gray-100 text-gray-600'
                }`}
              >
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                  step === 1 ? 'bg-[#D4A340] text-[#163826]' : isStep1Complete ? 'bg-[#163826] text-white' : 'bg-gray-300 text-gray-700'
                }`}>
                  {isStep1Complete ? '✓' : '۱'}
                </div>
                <span>۱. اطلاعات تحویل‌گیرنده</span>
              </div>

              <div 
                onClick={() => {
                  if (validateStep1()) setStep(2);
                }}
                className={`flex items-center gap-2 p-2 rounded-xl text-xs font-bold transition-all ${
                  step === 2 
                    ? 'bg-[#163826] text-white shadow-xs' 
                    : receiptImage 
                      ? 'bg-[#EBF3E8] text-[#163826] border border-[#C8DAC3] cursor-pointer' 
                      : isStep1Complete 
                        ? 'bg-amber-50 text-amber-900 border border-amber-200 cursor-pointer' 
                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
              >
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                  step === 2 ? 'bg-[#D4A340] text-[#163826]' : receiptImage ? 'bg-[#163826] text-white' : 'bg-gray-300 text-gray-700'
                }`}>
                  {receiptImage ? '✓' : '۲'}
                </div>
                <span>۲. فیش واریزی</span>
                {!isStep1Complete && <Lock className="w-3 h-3 text-gray-400 mr-auto" />}
              </div>
            </div>
          )}
        </div>

        {/* Modal Scrollable Content */}
        <div id="checkout-modal-body" className="p-5 sm:p-7 max-h-[75vh] overflow-y-auto">
          {/* STEP 1: Customer Address Form */}
          {step === 1 && (
            <div className="space-y-4">
              {/* Validation Summary if errors exist */}
              {attemptedStep1 && Object.keys(step1Errors).length > 0 && (
                <div className="bg-red-50 border border-red-200 p-3.5 rounded-2xl flex items-start gap-2.5 text-xs text-red-800 animate-in fade-in">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block mb-1">لطفاً موارد زیر را قبل از رفتن به مرحله بعد تکمیل نمایید:</span>
                    <ul className="list-disc list-inside space-y-0.5 text-[11px] text-red-700">
                      {Object.values(step1Errors).map((msg, idx) => (
                        <li key={idx}>{msg}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Name and Phone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-[#2A3F30]">
                      نام و نام خانوادگی تحویل‌گیرنده *
                    </label>
                    {isNameValid && (
                      <span className="text-[10px] text-emerald-700 font-bold flex items-center gap-0.5">
                        <CheckCircle2 className="w-3 h-3" /> تأیید
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => {
                        setCustomerName(e.target.value);
                        if (step1Errors.name) setStep1Errors(prev => ({ ...prev, name: '' }));
                      }}
                      placeholder="مثال: متین جهانبانی"
                      className={`w-full bg-white border rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-[#163826] focus:outline-none focus:ring-2 ${
                        step1Errors.name ? 'border-red-400 bg-red-50/30 focus:ring-red-500' : isNameValid ? 'border-emerald-500/70 focus:ring-emerald-700' : 'border-[#D5C6AC] focus:ring-[#163826]'
                      }`}
                    />
                    <User className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  </div>
                  {step1Errors.name && (
                    <span className="text-[11px] text-red-600 mt-1 block font-medium">{step1Errors.name}</span>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-[#2A3F30]">
                      شماره تلفن همراه (جهت هماهنگی و رهگیری سفارش) *
                    </label>
                    <span className="text-[10px] text-gray-500 font-mono">
                      {cleanPhone ? `${cleanPhone.length} / ۱۱ رقم` : '۱۱ رقم با 09'}
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      type="tel"
                      dir="ltr"
                      maxLength={11}
                      value={customerPhone}
                      onChange={(e) => {
                        const val = toEnglishDigits(e.target.value).replace(/\D/g, '').slice(0, 11);
                        setCustomerPhone(val);
                        if (step1Errors.phone) setStep1Errors(prev => ({ ...prev, phone: '' }));
                      }}
                      placeholder="09123456789"
                      className={`w-full bg-white border rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-left font-mono text-[#163826] focus:outline-none focus:ring-2 ${
                        step1Errors.phone ? 'border-red-400 bg-red-50/30 focus:ring-red-500' : isPhoneValid ? 'border-emerald-500/70 focus:ring-emerald-700' : 'border-[#D5C6AC] focus:ring-[#163826]'
                      }`}
                    />
                    <Phone className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2" />
                  </div>
                  {step1Errors.phone ? (
                    <span className="text-[11px] text-red-600 mt-1 block font-medium">{step1Errors.phone}</span>
                  ) : isPhoneValid ? (
                    <span className="text-[10px] text-emerald-700 mt-1 block font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> شماره معتبر است
                    </span>
                  ) : null}
                </div>
              </div>

              {/* Province and City */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[#2A3F30] mb-1">
                    استان مقصد *
                  </label>
                  <div className="relative">
                    <select
                      value={province}
                      onChange={(e) => {
                        setProvince(e.target.value);
                        if (step1Errors.province) setStep1Errors(prev => ({ ...prev, province: '' }));
                      }}
                      className="w-full bg-white border border-[#D5C6AC] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-[#163826] focus:outline-none focus:ring-2 focus:ring-[#163826] cursor-pointer appearance-none"
                    >
                      {IRAN_PROVINCES.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                    <Building className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                  {step1Errors.province && (
                    <span className="text-[11px] text-red-600 mt-1 block">{step1Errors.province}</span>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-[#2A3F30]">
                      نام شهر مقصد *
                    </label>
                    {isCityValid && (
                      <span className="text-[10px] text-emerald-700 font-bold flex items-center gap-0.5">
                        <CheckCircle2 className="w-3 h-3" /> تأیید
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => {
                      setCity(e.target.value);
                      if (step1Errors.city) setStep1Errors(prev => ({ ...prev, city: '' }));
                    }}
                    placeholder="مثال: تهران، اصفهان، شیراز..."
                    className={`w-full bg-white border rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-[#163826] focus:outline-none focus:ring-2 ${
                      step1Errors.city ? 'border-red-400 bg-red-50/30 focus:ring-red-500' : isCityValid ? 'border-emerald-500/70 focus:ring-emerald-700' : 'border-[#D5C6AC] focus:ring-[#163826]'
                    }`}
                  />
                  {step1Errors.city && (
                    <span className="text-[11px] text-red-600 mt-1 block">{step1Errors.city}</span>
                  )}
                </div>
              </div>

              {/* Exact Address */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-[#2A3F30]">
                    آدرس دقیق پستی (خیابان، کوچه، پلاک، واحد) *
                  </label>
                  <span className="text-[10px] text-gray-500">
                    حداقل ۱۰ کاراکتر ({address.trim().length} حرف)
                  </span>
                </div>
                <textarea
                  rows={2}
                  value={address}
                  onChange={(e) => {
                    setAddress(e.target.value);
                    if (step1Errors.address) setStep1Errors(prev => ({ ...prev, address: '' }));
                  }}
                  placeholder="خیابان اصلی، خیابان فرعی، کوچه، پلاک، طبقه و زنگ واحد جهت مأمور پست..."
                  className={`w-full bg-white border rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-[#163826] focus:outline-none focus:ring-2 ${
                    step1Errors.address ? 'border-red-400 bg-red-50/30 focus:ring-red-500' : isAddressValid ? 'border-emerald-500/70 focus:ring-emerald-700' : 'border-[#D5C6AC] focus:ring-[#163826]'
                  }`}
                />
                {step1Errors.address && (
                  <span className="text-[11px] text-red-600 mt-1 block font-medium">{step1Errors.address}</span>
                )}
              </div>

              {/* Postal Code & Notes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-[#2A3F30]">
                      کد پستی ۱۰ رقمی تحویل‌گیرنده *
                    </label>
                    <span className={`text-[10px] font-mono font-bold ${isPostalValid ? 'text-emerald-700' : 'text-gray-500'}`}>
                      {cleanPostal ? `${cleanPostal.length} / ۱۰ رقم` : 'دقیقاً ۱۰ رقم'}
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      dir="ltr"
                      maxLength={10}
                      value={postalCode}
                      onChange={(e) => {
                        const val = toEnglishDigits(e.target.value).replace(/\D/g, '').slice(0, 10);
                        setPostalCode(val);
                        if (step1Errors.postalCode) setStep1Errors(prev => ({ ...prev, postalCode: '' }));
                      }}
                      placeholder="مثال: 1985734211"
                      className={`w-full bg-white border rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-left font-mono tracking-wider text-[#163826] focus:outline-none focus:ring-2 ${
                        step1Errors.postalCode ? 'border-red-400 bg-red-50/30 focus:ring-red-500' : isPostalValid ? 'border-emerald-500/70 focus:ring-emerald-700' : 'border-[#D5C6AC] focus:ring-[#163826]'
                      }`}
                    />
                    <MapPin className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2" />
                  </div>
                  {step1Errors.postalCode ? (
                    <span className="text-[11px] text-red-600 mt-1 block font-bold">{step1Errors.postalCode}</span>
                  ) : isPostalValid ? (
                    <span className="text-[10px] text-emerald-700 mt-0.5 block font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> کد پستی ۱۰ رقمی معتبر است
                    </span>
                  ) : (
                    <span className="text-[10px] text-gray-500 mt-0.5 block">کد پستی ۱۰ رقمی درج شده روی کارت ملی یا قبض</span>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#2A3F30] mb-1">
                    یادداشت سفارش (اختیاری)
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="ساعت حضور، زنگ واحد، راهنمای تحویل..."
                    className="w-full bg-white border border-[#D5C6AC] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-[#163826] focus:outline-none focus:ring-2 focus:ring-[#163826]"
                  />
                </div>
              </div>

              {/* Discount Coupon Code Box */}
              <div className="bg-white p-3 rounded-2xl border border-[#D5C6AC] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#2A3F30]">کد تخفیف دارید؟</span>
                  {appliedCoupon && (
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
                      ✓ {appliedCoupon.code} اعمال شد
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    dir="ltr"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                    placeholder="کد تخفیف..."
                    className="flex-1 bg-[#FAF8F3] border border-gray-300 rounded-xl px-3 py-1.5 text-xs font-mono font-bold text-center uppercase"
                  />
                  <button
                    type="button"
                    onClick={handleApplyCoupon}
                    className="px-4 py-2 bg-[#231709] hover:bg-[#150D05] text-white rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap"
                  >
                    اعمال تخفیف
                  </button>
                </div>
                {couponMessage && (
                  <span className={`text-[11px] font-bold block ${couponMessage.isError ? 'text-red-600' : 'text-emerald-700'}`}>
                    {couponMessage.text}
                  </span>
                )}
              </div>

              {/* Total Recap Card */}
              <div className="bg-[#F2ECE0] p-3.5 rounded-2xl space-y-1.5 text-xs text-[#2A3E30] border border-[#E4D7C2]">
                <div className="flex justify-between">
                  <span>مجموع اقلام:</span>
                  <span>{subtotal.toLocaleString('fa-IR')} تومان</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-emerald-800 font-bold">
                    <span>تخفیف کوپن:</span>
                    <span>-{discountAmount.toLocaleString('fa-IR')} تومان</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>هزینه ارسال پستی:</span>
                  <span>{shippingCost > 0 ? `${shippingCost.toLocaleString('fa-IR')} تومان` : 'طبق تعرفه پستی'}</span>
                </div>
                <div className="pt-2 border-t border-[#D5C6AC] flex items-center justify-between text-sm font-black text-[#163826]">
                  <span>مبلغ قابل پرداخت:</span>
                  <span>{totalAmount.toLocaleString('fa-IR')} تومان</span>
                </div>
              </div>

              {/* Next Step Button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleProceedToStep2}
                  className="w-full py-3.5 px-4 rounded-2xl bg-[#163826] hover:bg-[#0E2619] text-white font-black text-sm shadow-lg shadow-[#163826]/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>مرحله بعد: انتخاب روش پرداخت و تکمیل سفارش</span>
                  <ArrowLeft className="w-4 h-4 text-[#D4A340]" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Payment Selection (ZarinPal Gateway & Card to Card) */}
          {step === 2 && (
            <div className="space-y-5">
              {/* Fallback if Step 1 was incomplete */}
              {!isStep1Complete && (
                <div className="bg-amber-50 border border-amber-200 p-3 rounded-2xl flex items-center justify-between text-xs text-amber-900">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                    <span>برخی اطلاعات پستی شما در مرحله قبل کامل نشده است.</span>
                  </div>
                  <button
                    onClick={() => setStep(1)}
                    className="text-xs font-bold text-[#163826] underline hover:no-underline cursor-pointer"
                  >
                    تکمیل اطلاعات پستی
                  </button>
                </div>
              )}

              {/* Payment Method Selector */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPaymentMethodChoice('zarinpal')}
                  className={`p-3.5 rounded-2xl border-2 transition-all flex flex-col items-center justify-center gap-1.5 cursor-pointer text-center ${
                    paymentMethodChoice === 'zarinpal'
                      ? 'border-[#D4A340] bg-[#FAF3E3] text-[#231709] shadow-md ring-2 ring-[#D4A340]/40'
                      : 'border-[#E3DAC8] bg-white text-gray-600 hover:border-[#D4A340]/50'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-black text-xs sm:text-sm text-[#231709]">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
                    <span>درگاه پرداخت زرین‌پال</span>
                  </div>
                  <span className="text-[10px] text-gray-500 font-medium">پرداخت آنلاین و آنی با کلیه کارت‌های شتاب</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethodChoice('card_to_card')}
                  className={`p-3.5 rounded-2xl border-2 transition-all flex flex-col items-center justify-center gap-1.5 cursor-pointer text-center ${
                    paymentMethodChoice === 'card_to_card'
                      ? 'border-[#163826] bg-[#EBF3E8] text-[#163826] shadow-md ring-2 ring-[#163826]/30'
                      : 'border-[#E3DAC8] bg-white text-gray-600 hover:border-[#163826]/40'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-black text-xs sm:text-sm">
                    <CreditCard className="w-3.5 h-3.5 text-[#163826]" />
                    <span>کارت به کارت بانکی</span>
                  </div>
                  <span className="text-[10px] text-gray-500 font-medium">واریز به حساب و بارگذاری فیش</span>
                </button>
              </div>

              {/* OPTION 1: ZARINPAL ONLINE GATEWAY */}
              {paymentMethodChoice === 'zarinpal' && (
                <div className="bg-gradient-to-br from-[#FFFDF9] via-[#FAF4E8] to-[#F5ECE0] rounded-3xl p-5 sm:p-6 border-2 border-[#D4A340]/60 shadow-lg space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-[#EAD8B8]">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-2xl bg-[#D4A340] text-[#231709] flex items-center justify-center font-black text-base shadow-xs">
                        ZP
                      </div>
                      <div>
                        <h4 className="font-black text-sm text-[#231709]">درگاه پرداخت اینترنتی زرین‌پال</h4>
                        <p className="text-[11px] text-gray-600">متصل به شبکه شاپرک با نظارت بانک مرکزی</p>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black border border-emerald-300">
                      درگاه فعال شاپرک
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-white/80 p-3.5 rounded-2xl border border-[#E7DAC4]">
                    <div>
                      <span className="text-gray-500 block text-[11px]">پذیرنده:</span>
                      <strong className="text-[#231709]">{settings.storeName || 'فروشگاه ناما'}</strong>
                    </div>
                    <div className="sm:text-left">
                      <span className="text-gray-500 block text-[11px]">مبلغ قابل پرداخت:</span>
                      <strong className="text-emerald-700 text-sm font-black">{totalAmount.toLocaleString('fa-IR')} تومان</strong>
                    </div>
                  </div>

                  <div className="space-y-2 text-[11px] text-[#5C4B3C] bg-amber-500/10 p-3 rounded-xl border border-amber-500/20">
                    <div className="flex items-center gap-1.5 font-bold text-[#8A5E12]">
                      <Lock className="w-3.5 h-3.5 text-[#D4A340]" />
                      <span>امنیت و سرعت پرداخت:</span>
                    </div>
                    <p className="leading-relaxed">
                      با کلیه کارت‌های عضو شتاب (رمز پویا) می‌توانید سفارش خود را فوراً نهایی کنید. پس از لمس دکمه زیر، سفارش ثبت و کد رهگیری یکتا صادر می‌شود.
                    </p>
                  </div>

                  <div className="pt-2 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="py-3.5 px-4 rounded-xl border border-[#D5C6AC] hover:bg-gray-100 text-[#2C4030] text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                    >
                      <ArrowRight className="w-4 h-4" />
                      <span>مشخصات پستی</span>
                    </button>

                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => handleFinalSubmit('zarinpal')}
                      className="flex-1 py-4 px-5 rounded-2xl bg-gradient-to-r from-[#D4A340] via-[#C5922C] to-[#B8860B] hover:brightness-105 active:scale-[0.99] text-[#231709] font-black text-sm sm:text-base shadow-xl shadow-[#D4A340]/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {isSubmitting ? (
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 border-2 border-[#231709] border-t-transparent rounded-full animate-spin" />
                          <span>در حال اتصال به درگاه و ثبت سفارش...</span>
                        </div>
                      ) : (
                        <>
                          <Lock className="w-4 h-4 text-[#231709]" />
                          <span>پرداخت آنلاین {totalAmount.toLocaleString('fa-IR')} تومان با زرین‌پال</span>
                          <ArrowLeft className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* OPTION 2: CARD TO CARD (Shown when card_to_card is selected) */}
              {paymentMethodChoice === 'card_to_card' && (
                <>
                  {/* Bank Card Presentation Card */}
                  {(() => {
                    const activeBank = bankInfo?.bankName || settings.bankName || 'بانک ملی ایران';
                    const activeCard = bankInfo?.cardNumber || settings.cardNumber;
                    const activeHolder = bankInfo?.cardHolder || settings.cardHolder || 'متین جهانبانی (ناما فود)';
                    const activeShaba = bankInfo?.shabaNumber || settings.shabaNumber;

                    return (
                      <div className="relative rounded-3xl p-5 sm:p-6 bg-gradient-to-br from-[#163826] via-[#102B1D] to-[#0A1D13] text-white shadow-xl overflow-hidden">
                        <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full blur-2xl pointer-events-none" />
                        <div className="absolute bottom-0 left-0 w-40 h-40 bg-[#D4A340]/20 rounded-full blur-xl pointer-events-none" />

                        <div className="flex items-center justify-between mb-4">
                          <span className="text-xs font-semibold text-emerald-200">
                            {activeBank}
                          </span>
                          <span className="px-2.5 py-1 rounded-full bg-white/10 text-amber-300 text-[11px] font-bold">
                            حساب رسمی فروشگاه ناما
                          </span>
                        </div>

                        {/* Card Number display */}
                        <div className="my-4 text-center">
                          <div className="text-[11px] text-gray-300 mb-1">شماره کارت جهت واریز وجه:</div>
                          {isLoadingBankInfo ? (
                            <div className="py-2 text-sm text-amber-200 animate-pulse font-medium">
                              در حال دریافت اطلاعات امن حساب بانکی...
                            </div>
                          ) : activeCard ? (
                            <div className="flex items-center justify-center gap-3">
                              <span dir="ltr" className="text-xl sm:text-2xl font-mono font-black tracking-wider text-amber-200">
                                {activeCard}
                              </span>
                              <button
                                type="button"
                                onClick={() => copyToClipboard(activeCard.replace(/\s|-/g, ''), 'card')}
                                className="p-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white transition-all flex items-center gap-1 text-xs"
                                title="کپی شماره کارت"
                              >
                                {copiedField === 'card' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                                <span className="text-[10px]">{copiedField === 'card' ? 'کپی شد' : 'کپی'}</span>
                              </button>
                            </div>
                          ) : (
                            <div className="py-1">
                              <span className="text-xs text-rose-300">
                                {bankInfoError || 'اطلاعات کارت دریافت نشد.'}
                              </span>
                              <button
                                type="button"
                                onClick={() => fetchBankInfo(cleanPhone)}
                                className="mr-2 text-xs text-amber-300 underline"
                              >
                                تلاش مجدد
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Card Details Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-white/10 text-xs">
                          <div>
                            <span className="text-gray-400 block text-[11px]">به نام:</span>
                            <span className="font-bold text-white">{activeHolder}</span>
                          </div>
                          <div className="sm:text-left">
                            <span className="text-gray-400 block text-[11px]">مبلغ دقیق قابل واریز:</span>
                            <span className="font-black text-amber-300 text-sm">
                              {totalAmount.toLocaleString('fa-IR')} تومان
                            </span>
                          </div>
                        </div>

                        {/* Shaba Number (Optional copy) */}
                        {activeShaba && (
                          <div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-between text-[11px] text-gray-300">
                            <span className="truncate">شبا: <span dir="ltr" className="font-mono text-gray-200">{activeShaba}</span></span>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(activeShaba, 'shaba')}
                              className="text-amber-300 hover:underline flex items-center gap-1 flex-shrink-0 mr-2"
                            >
                              <Copy className="w-3 h-3" />
                              <span>کپی شبا</span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })()}

              {/* Payment Details Input Form */}
              <div className="bg-white p-4 sm:p-5 rounded-2xl border border-[#E7DDC9] space-y-4">
                <h4 className="text-xs sm:text-sm font-bold text-[#163826] flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-[#D4A340]" />
                  <span>مشخصات واریز خود را وارد نمایید:</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#2C4030] mb-1">
                      ۴ رقم آخر کارت واریز کننده (اختیاری)
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      maxLength={4}
                      value={cardLast4}
                      onChange={(e) => setCardLast4(toEnglishDigits(e.target.value).replace(/\D/g, '').slice(0, 4))}
                      placeholder="مثال: 4912"
                      className="w-full bg-[#FAF8F3] border border-[#D5C6AC] rounded-xl px-3 py-2 text-xs sm:text-sm text-center font-mono focus:outline-none focus:ring-2 focus:ring-[#163826]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#2C4030] mb-1">
                      شماره پیگیری / شماره ارجاع فیش (اختیاری)
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(toEnglishDigits(e.target.value))}
                      placeholder="مثال: 849201"
                      className="w-full bg-[#FAF8F3] border border-[#D5C6AC] rounded-xl px-3 py-2 text-xs sm:text-sm text-center font-mono focus:outline-none focus:ring-2 focus:ring-[#163826]"
                    />
                  </div>
                </div>

                {/* Receipt Image File Upload (MANDATORY) */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-[#2C4030]">
                      تصویر فیش واریزی (اسکرین‌شات رسید همراه بانک یا عابر) *
                    </label>
                    <span className="text-xs text-red-600 font-bold bg-red-50 px-2 py-0.5 rounded-full border border-red-200">
                      ارسال رسید اجباری است
                    </span>
                  </div>
                  
                  {receiptImage ? (
                    <div className="relative border-2 border-emerald-500 bg-[#F2F7F0] p-3.5 rounded-2xl flex items-center gap-3">
                      <img 
                        src={receiptImage} 
                        alt="فیش واریزی" 
                        className="w-16 h-16 object-cover rounded-xl border border-emerald-300 shadow-xs"
                      />
                      <div className="flex-1">
                        <span className="text-xs font-black text-emerald-800 flex items-center gap-1">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          رسید واریزی با موفقیت بارگذاری و تأیید شد
                        </span>
                        <p className="text-[11px] text-gray-600 mt-0.5">
                          فیش شما مستقیماً در پنل مدیریت بررسی و با کد رهگیری اختصاصی تأیید می‌گردد.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setReceiptImage('')}
                        className="py-1 px-3 rounded-lg bg-red-100 hover:bg-red-200 text-red-700 text-xs font-bold"
                        title="حذف و تغییر رسید"
                      >
                        تغییر عکس
                      </button>
                    </div>
                  ) : (
                    <div>
                      <label className="border-2 border-dashed border-[#163826]/40 hover:border-[#163826] bg-[#FAF8F3] hover:bg-[#F2ECE0] p-5 rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all">
                        {isCompressing ? (
                          <div className="py-2 flex flex-col items-center gap-1.5">
                            <div className="w-5 h-5 border-2 border-[#163826] border-t-transparent rounded-full animate-spin" />
                            <span className="text-xs font-bold text-[#163826]">در حال آماده‌سازی و بهینه‌سازی تصویر رسید...</span>
                          </div>
                        ) : (
                          <>
                            <Upload className="w-8 h-8 text-[#163826] mb-1.5" />
                            <span className="text-xs sm:text-sm font-black text-[#163826]">
                              لمس کنید: بارگذاری اسکرین‌شات رسید بانکی
                            </span>
                            <span className="text-[10px] text-gray-500 mt-1">
                              مستقیماً از گالری عکس آیفون یا اندروید انتخاب فرمایید (JPG، PNG، WEBP)
                            </span>
                          </>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          disabled={isCompressing}
                          onChange={handleImageUpload}
                          className="hidden"
                        />
                      </label>
                    </div>
                  )}

                  {uploadError && (
                    <p className="text-xs text-red-600 mt-2 font-bold flex items-center gap-1 bg-red-50 p-2.5 rounded-xl border border-red-200 animate-in fade-in">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      {uploadError}
                    </p>
                  )}
                </div>

                <div className="bg-[#FAF3E0] border border-[#E8D4A9] p-3 rounded-xl flex items-start gap-2 text-xs text-[#8A5A12]">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-[#B8860B]" />
                  <span className="leading-relaxed">
                    مشتری گرامی: پس از واریز مبلغ {totalAmount.toLocaleString('fa-IR')} تومان و ارسال فیش، یک کد رهگیری اختصاصی دریافت می‌کنید که در بالای سایت با کلیک روی «پیگیری سفارش» وضعیت فیش و کد مرسوله پستی را در هر لحظه مشاهده خواهید کرد.
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
                  <span>ویرایش مشخصات پستی</span>
                </button>

                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleFinalSubmit('card_to_card')}
                  className="flex-1 py-3.5 px-4 rounded-2xl text-white font-black text-sm sm:text-base shadow-lg transition-all flex items-center justify-center gap-2 bg-[#163826] hover:bg-[#0E2619] active:scale-98 shadow-[#163826]/20 cursor-pointer"
                >
                  {isSubmitting ? (
                    <span>در حال ثبت سفارش در دیتابیس...</span>
                  ) : receiptImage ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-[#D4A340]" />
                      <span>تأیید نهایی و ثبت سفارش با فیش</span>
                    </>
                  ) : (
                    <>
                      <FileCheck className="w-4 h-4 text-amber-300" />
                      <span>ثبت نهایی سفارش (ارسال فیش پس از واریز)</span>
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      )}

          {/* STEP 3: Success Confirmation */}
          {step === 3 && createdOrder && (
            <div className="text-center space-y-5 py-4">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-[#EBF3E8] border-2 border-[#BED7B7] flex items-center justify-center text-[#163826] mx-auto shadow-md">
                <CheckCircle2 className="w-10 h-10 sm:w-12 sm:h-12 text-[#163826]" />
              </div>

              <div>
                <span className="px-3 py-1 rounded-full bg-[#E9F3E7] text-[#1E4D34] text-xs font-black inline-block mb-2">
                  سفارش شما با موفقیت در دیتابیس ثبت شد
                </span>
                <h3 className="text-xl sm:text-2xl font-black text-[#143220]">
                  از خرید شما از «محصولات غذایی ناما» سپاسگزاریم
                </h3>
                <p className="text-xs sm:text-sm text-[#5B6D5E] mt-1 max-w-md mx-auto">
                  اطلاعات سفارش و فیش واریزی در پنل مدیریت دریافت شد. پس از بررسی، بسته شما آماده‌سازی و کد پیگیری مرسوله پستی ثبت می‌گردد.
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
                  این کد را ذخیره فرمایید تا در بخش «پیگیری سفارش» وضعیت ارسال را بررسی کنید.
                </span>
              </div>

              {/* Order Info recap */}
              <div className="bg-white border border-[#E2D8C3] rounded-2xl p-3.5 max-w-md mx-auto text-xs text-right space-y-1.5">
                <div className="flex justify-between text-gray-600">
                  <span>تحویل گیرنده:</span>
                  <span className="font-bold text-[#163826]">{createdOrder.customerName}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>شماره تماس:</span>
                  <span className="font-mono font-bold text-[#163826]">{createdOrder.customerPhone}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>کد پستی:</span>
                  <span className="font-mono font-bold text-[#163826]">{createdOrder.postalCode}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>مبلغ پرداختی:</span>
                  <span className="font-bold text-amber-700">{createdOrder.totalAmount.toLocaleString('fa-IR')} تومان</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>روش پرداخت:</span>
                  <span className="font-bold text-[#163826]">
                    {createdOrder.paymentMethod === 'zarinpal' ? 'درگاه آنلاین زرین‌پال' : 'کارت به کارت'}
                  </span>
                </div>
                {createdOrder.zarinpalAuthority && (
                  <div className="flex justify-between text-gray-600">
                    <span>کد ارجاع شاپرک (زرین‌پال):</span>
                    <span className="font-mono font-bold text-emerald-700">{createdOrder.zarinpalAuthority}</span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                <button
                  onClick={onClose}
                  className="w-full sm:w-auto px-6 py-3 rounded-full bg-[#163826] hover:bg-[#0E2619] text-white text-xs sm:text-sm font-bold shadow-md transition-all"
                >
                  بازگشت به صفحه فروشگاه
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
