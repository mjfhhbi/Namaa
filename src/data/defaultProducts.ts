import { Product, StoreSettings } from '../types';

export const DEFAULT_SETTINGS: StoreSettings = {
  storeName: "ناما | NAMA",
  slogan: "از نام و جان برای طعمی ماندگار",
  cardNumber: "",
  cardHolder: "",
  bankName: "",
  shabaNumber: "",
  shippingCost: 45000,
  supportPhone: "+98 916 644 9409",
  supportWhatsApp: "+98 916 644 9409",
  supportInstagram: "namafoods_",
  supportTelegram: "",
  supportAddress: "فروشگاه مرکزی محصولات ناما",
  ntfyTopic: "",
  announcement: "",
  isStoreOpen: true,
  // متون قابل ویرایش هیرو
  heroBadge: "محصولات غذایی ۱۰۰٪ طبیعی، سالم و دستچین ایرانی",
  heroTitle: "از نام و جان، برای طعمی ماندگار",
  heroSubtitle: "سفره‌ای پربرکت با اصیل‌ترین طعم‌های دیار ایران؛ خوراکی‌های ناب، چای‌های اصیل و محصولات سلامت‌محور بدون مواد افزودنی و با تضمین کیفیت.",
  heroButtonText: "مشاهده و خرید محصولات",
  qualityBadge1: "برگه آزمایش معتبر",
  qualityBadge2: "تضمین ۱۰۰٪ اصالت",
  qualityBadge3: "بسته‌بندی ایمن پستی",
  qualityBadge4: "ارسال فوری سراسری",
  // متون بنر تبلیغاتی
  promoBadge: "جشنواره اصالت و سلامت ناما",
  promoTitle: "از نام و جان، برای طعمی ماندگار",
  promoSubtitle: "تعهد به سلامت و اصالت در ناما؛ دستچین شده بدون ذره‌ای مواد افزودنی شیمیایی، مستقیم از دستان تولیدکنندگان و کشاورزان امین ایران.",
  // درباره ما فوتر
  aboutText: "فروشگاه تخصصی محصولات ارگانیک و سنتی ناما با پایبندی به شعار «از نام و جان برای طعمی ماندگار»، برترین محصولات سالم را مستقیماً به سفره‌های گرم خانواده‌ها می‌رساند.",
  // طبق دستور کاربر هیچ دسته‌بندی پیش‌فرضی قرار داده نمی‌شود (مدیر در پنل دسته ایجاد می‌کند)
  customCategories: [],
  discountCodes: [],
};

// کاتالوگ کاملاً خالی؛ طبق دستور کاربر هیچ محصول فیک یا پیش‌فرضی قرار داده نشده است
export const DEFAULT_PRODUCTS: Product[] = [];

// لیست سفارشات اولیه خالی
export const SAMPLE_ORDERS: any[] = [];
