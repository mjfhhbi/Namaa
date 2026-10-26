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
  customCategories: [
    { id: 'saffron', name: 'زعفران و زرشک اعلا', icon: '✨', description: 'زعفران سوپر نگین قائنات و زرشک اناری تازه' },
  ],
  discountCodes: [],
  zarinpalEnabled: false,
  zarinpalSandbox: true,
};

export const PROMO_ASSET_IMAGES = {
  superNeginSaffron: 'https://images.unsplash.com/photo-1615485500704-8e990f9900f7?auto=format&fit=crop&w=800&q=80',
};

export const PRESET_PRODUCT_IMAGES: { name: string; url: string; category: string }[] = [
  {
    name: 'زعفران سوپر نگین اعلا',
    url: 'https://images.unsplash.com/photo-1615485500704-8e990f9900f7?auto=format&fit=crop&w=800&q=80',
    category: 'saffron',
  },
  {
    name: 'رشته‌های زعفران قائنات',
    url: 'https://images.unsplash.com/photo-1599305090598-fe179d501227?auto=format&fit=crop&w=800&q=80',
    category: 'saffron',
  },
];

export const AUTHENTIC_DEFAULT_PRODUCTS: Product[] = [
  {
    id: 'prod_saffron_super_negin',
    name: 'زعفران سوپر نگین اعلای قائنات',
    category: 'saffron',
    categoryLabel: 'زعفران و زرشک اعلا',
    price: 495000,
    originalPrice: 550000,
    weight: 'یک مثقال (۴.۶ گرم)',
    description: 'زعفران اصیل و دستچین سوپر نگین قائنات خراسان، بدون هیچ‌گونه خامه و ناخالصی با بالاترین درجه رنگ‌دهی طبیعی، عطر گیرا و تاییدیه آزمایشگاه تخصصی ناما.',
    shortDesc: 'زعفران اعلای سوپر نگین قائنات با تضمین آزمایشگاهی خلوص و عطر',
    benefits: [
      'بالاترین عیار کروسین (قدرت رنگ‌دهی طبیعی)',
      'دستچین شده از مزارع ممتاز قائنات خراسان',
      'بسته‌بندی کریستالی پلمپ ضد رطوبت و نور',
      'تضمین ۱۰۰٪ اصالت و بازگشت وجه بی‌قید و شرط'
    ],
    origin: 'خراسان جنوبی، قائنات',
    stock: 50,
    image: 'https://images.unsplash.com/photo-1615485500704-8e990f9900f7?auto=format&fit=crop&w=800&q=80',
    isPopular: true,
    isOrganic: true,
    isFeatured: true,
    isNewArrival: true,
    badge: 'صادراتی اعلا',
    rating: 5,
    harvestYear: '۱۴۰۳',
    createdAt: '2026-10-24T00:00:00.000Z'
  }
];

