export type ProductCategory = 'all' | string;

export interface ProductCategoryItem {
  id: string; // identifier or slug
  name: string; // Persian display label, e.g. "چای", "دمنوش"
  icon?: string; // emoji or icon
  description?: string;
  image?: string;
}

export interface Product {
  id: string;
  name: string;
  category: ProductCategory;
  categoryLabel: string;
  price: number; // in Tomans
  originalPrice?: number; // for showing discount
  weight: string; // e.g. "۱ کیلوگرم", "۸۰۰ گرم"
  description: string;
  shortDesc: string;
  benefits: string[];
  origin: string;
  stock: number;
  image: string;
  isPopular?: boolean;
  isOrganic?: boolean;
  isFeatured?: boolean; // برای نمایش در بخش محصولات ویژه و منتخب
  isNewArrival?: boolean; // برای نمایش در آخرین محصولات اضافه شده
  badge?: string; // e.g. "عسل درمانی", "صادراتی اعلا", "تخفیف ویژه"
  rating?: number; // e.g. 4.9
  harvestYear?: string;
  nutritionFacts?: {
    calories?: string;
    protein?: string;
    naturalSugar?: string;
    purity?: string;
  };
  createdAt: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export type OrderStatus = 
  | 'pending_receipt'        // در انتظار ثبت فیش واریز
  | 'paid_pending_approval'  // فیش ثبت شده، در انتظار تایید ادمین
  | 'processing'             // پرداخت آنلاین موفق زرین‌پال، در انتظار پردازش
  | 'approved'               // واریز تایید شد
  | 'packaging'              // در حال بسته‌بندی بهداشتی
  | 'shipped'                // تحویل پست و ارسال شد
  | 'cancelled';             // لغو شده

export interface OrderItem {
  productId: string;
  name: string;
  price: number;
  weight: string;
  image: string;
  quantity: number;
}

export interface Order {
  id: string; // e.g. "NM-8492"
  customerName: string;
  customerPhone: string;
  province: string;
  city: string;
  address: string;
  postalCode: string;
  items: OrderItem[];
  subtotal: number;
  shippingCost: number;
  totalAmount: number;
  status: OrderStatus;
  paymentMethod: 'card_to_card' | 'zarinpal';
  cardLast4?: string;
  paymentReference?: string;
  zarinpalAuthority?: string;
  receiptImage?: string; // base64 or URL
  trackingCode?: string; // Postal tracking code
  notes?: string;
  discountCode?: string;
  discountAmount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface DiscountCode {
  id: string;
  code: string;
  type: 'percent' | 'fixed';
  amount: number; // e.g. 10 for 10% or 50000 for 50,000 Tomans
  minPurchase?: number; // Minimum cart value
  maxDiscount?: number; // Max discount in Tomans for percentage discounts
  isActive: boolean;
  expiresAt?: string;
  usageCount: number;
}

export interface StoreSettings {
  storeName: string;
  slogan: string;
  // اطلاعات کارت بانکی (فقط در تنظیمات خصوصی مدیریت)
  cardNumber?: string;
  cardHolder?: string;
  bankName?: string;
  shabaNumber?: string;
  // هزینه‌ها
  shippingCost: number;
  freeShippingThreshold?: number;
  // پشتیبانی
  supportPhone: string;
  supportWhatsApp: string;
  supportInstagram: string;
  supportTelegram?: string;
  supportAddress?: string;
  // اعلان‌ها و تنظیمات خصوصی
  ntfyTopic?: string;
  announcement: string;
  isStoreOpen: boolean;
  storeClosedMessage?: string;
  shippingNote?: string;
  // متون صفحه ورودی و انیمیشن اسپلش (CMS ورودی سایت)
  introEnabled?: boolean;
  introBadge?: string;
  introTitle?: string;
  introSlogan?: string;
  introSubtitle?: string;
  introButtonText?: string;
  // متون کپی‌رایت و پاورقی
  footerCopyright?: string;
  // متون کامل سایت (CMS قابل ویرایش کامل از پنل مدیریت)
  heroBadge?: string;
  heroTitle?: string;
  heroSubtitle?: string;
  heroButtonText?: string;
  promoTitle?: string;
  promoSubtitle?: string;
  promoBadge?: string;
  aboutText?: string;
  qualityBadge1?: string;
  qualityBadge2?: string;
  qualityBadge3?: string;
  qualityBadge4?: string;
  customCategories?: ProductCategoryItem[];
  discountCodes?: DiscountCode[];
  // درگاه پرداخت آنلاین زرین‌پال
  zarinpalEnabled?: boolean;
  zarinpalMerchantId?: string; // کد ۳۶ کاراکتری مرچنت زرین‌پال
  zarinpalSandbox?: boolean; // حالت تستی
}

export const DEFAULT_STORE_SETTINGS: StoreSettings = {
  storeName: 'محصولات غذایی ناما',
  slogan: 'از نام و جان، برای طعمی ماندگار',
  cardNumber: '۶۰۳۷۹۹۸۱۴۵۲۳۸۷۱۶',
  cardHolder: 'متین جهانبانی',
  bankName: 'بانک ملی ایران',
  shabaNumber: 'IR120170000000109283746501',
  shippingCost: 45000,
  freeShippingThreshold: 600000,
  supportPhone: '+98 916 644 9409',
  supportWhatsApp: '+98 916 644 9409',
  supportInstagram: 'namafoods_',
  announcement: '',
  isStoreOpen: true,
  storeClosedMessage: 'فروشگاه ناما در حال حاضر مشغول بروزرسانی موجودی انبار می‌باشد.',
  shippingNote: 'ارسال با بسته‌بندی ایمن و ضربه‌گیر به سراسر ایران از طریق شرکت ملی پست جمهوری اسلامی ایران (پست پیشتاز).',
  introEnabled: true,
  introBadge: 'محصولات غذایی اصیل و طبیعی',
  introTitle: 'فروشگاه مواد غذایی ناما',
  introSlogan: '«از نام و جان، برای طعمی ماندگار»',
  introSubtitle: 'دستچین اصیل‌ترین محصولات طبیعی ایران',
  introButtonText: 'ورود به فروشگاه',
  heroBadge: 'محصولات غذایی ۱۰۰٪ طبیعی، سالم و دستچین ایرانی',
  heroTitle: 'از نام و جان، برای طعمی ماندگار',
  heroSubtitle: 'سفره‌ای پربرکت با اصیل‌ترین خوراکی‌های سنتی، سالم و سلامت‌محور ایران؛ دستچین‌شده با تعهد به خلوص، کیفیت ممتاز و طعمی ماندگار.',
  promoBadge: 'جشنواره اصالت و سلامت ناما',
  promoTitle: 'از نام و جان، برای طعمی ماندگار',
  promoSubtitle: 'تعهد به سلامت و اصالت در «ناما»؛ دستچین شده بدون ذره‌ای شکر مصنوعی یا سموم شیمیایی، مستقیم از دستان کشاورزان و تولیدکنندگان امین ایران.',
  aboutText: 'فروشگاه تخصصی محصولات طبیعی و سالم ناما با پایبندی به شعار «از نام و جان برای طعمی ماندگار»، باکیفیت‌ترین خوراکی‌های اصیل و سنتی ایران را مستقیماً به سفره‌های پربرکت خانواده‌ها می‌رساند.',
  qualityBadge1: 'برگه آزمایش معتبر',
  qualityBadge2: 'تضمین ۱۰۰٪ اصالت',
  qualityBadge3: 'بسته‌بندی ایمن پستی',
  qualityBadge4: 'ارسال فوری سراسری',
  footerCopyright: 'تمامی حقوق متعلق به فروشگاه محصولات غذایی ناما (NAMA FOOD PRODUCTS) می‌باشد.',
  customCategories: [],
  discountCodes: [],
  zarinpalEnabled: false,
  zarinpalSandbox: true,
};

export const PROMO_ASSET_IMAGES = {
  superNeginSaffron: 'https://images.unsplash.com/photo-1615485500704-8e990f9900f7?auto=format&fit=crop&w=800&q=80',
};

export const PRESET_PRODUCT_IMAGES: { name: string; url: string; category: string }[] = [];

// Empty initial products - No fake or hardcoded mock products!
export const AUTHENTIC_DEFAULT_PRODUCTS: Product[] = [];

