export type ProductCategory = 
  | 'all'
  | 'honey_medicinal'     // عسل‌های درمانی و خاص
  | 'dates_export'        // خرماهای صادراتی و لوکس
  | 'syrups_traditional'  // شیره‌ها و معجون‌های سنتی
  | 'saffron_gold'        // زعفران و طلای سرخ
  | 'oils_herbal';        // روغن‌های فرابکر و گیاهان دارویی

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
  paymentMethod: 'card_to_card';
  cardLast4?: string;
  paymentReference?: string;
  receiptImage?: string; // base64 or URL
  trackingCode?: string; // Postal tracking code
  notes?: string;
  createdAt: string;
  updatedAt: string;
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
  freeShippingThreshold: number;
  // پشتیبانی
  supportPhone: string;
  supportInstagram: string;
  supportTelegram: string;
  supportAddress?: string;
  // اعلان‌ها
  ntfyTopic: string;
  announcement: string;
  isStoreOpen: boolean;
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
}
