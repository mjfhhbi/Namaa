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
  adminPassword: string; // default "1383"
  // اطلاعات کارت بانکی
  cardNumber: string;
  cardHolder: string;
  bankName: string;
  shabaNumber: string;
  // هزینه‌ها
  shippingCost: number;
  freeShippingThreshold?: number;
  // پشتیبانی
  supportPhone: string;
  supportWhatsApp: string;
  supportInstagram: string;
  supportTelegram?: string;
  supportAddress?: string;
  // اعلان‌ها
  ntfyTopic: string;
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
