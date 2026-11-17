import { PagesFunction, Env } from '../../types';
import { fromFirestoreFields } from '../../lib/firestoreRest';

const SECURITY_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'public, max-age=60, s-maxage=300',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Edge-Runtime': 'cloudflare-pages'
};

// Strict Allowlist: ONLY these fields are permitted in public responses
const ALLOWED_PUBLIC_KEYS = new Set([
  'storeName',
  'slogan',
  'shippingCost',
  'freeShippingThreshold',
  'supportPhone',
  'supportWhatsApp',
  'supportInstagram',
  'supportTelegram',
  'supportAddress',
  'announcement',
  'isStoreOpen',
  'storeClosedMessage',
  'shippingNote',
  'introEnabled',
  'introBadge',
  'introTitle',
  'introSlogan',
  'introSubtitle',
  'introButtonText',
  'footerCopyright',
  'heroBadge',
  'heroTitle',
  'heroSubtitle',
  'heroButtonText',
  'promoBadge',
  'promoTitle',
  'promoSubtitle',
  'aboutText',
  'qualityBadge1',
  'qualityBadge2',
  'qualityBadge3',
  'qualityBadge4',
  'refundPolicyTitle',
  'refundPolicyText',
  'adminLoginButtonText',
  'checkoutTitle',
  'checkoutSubtitle',
  'checkoutSubmitButtonText',
  'trackingModalTitle',
  'trackingModalSubtitle',
  'trackingInputPlaceholder',
  'footerAboutTitle',
  'footerAboutText',
  'footerTrustTitle',
  'footerTrustText',
  'footerContactTitle',
  'cartTitle',
  'cartEmptyMessage',
  'customCategories',
  'zarinpalEnabled',
  'zarinpalSandbox'
]);

// Explicit forbidden blacklist for defense-in-depth
const FORBIDDEN_SENSITIVE_KEYS = new Set([
  'cardNumber',
  'cardHolder',
  'bankName',
  'shabaNumber',
  'ntfyTopic',
  'discountCodes',
  'pin',
  'pinHash',
  'pinSalt',
  'token',
  'adminToken',
  'zarinpalMerchantId',
  'secret',
  'password',
  'email',
  'apiKey'
]);

const DEFAULT_PUBLIC_SETTINGS: Record<string, any> = {
  storeName: 'محصولات غذایی ناما',
  slogan: 'از نام و جان، برای طعمی ماندگار',
  shippingCost: 45000,
  freeShippingThreshold: 600000,
  supportPhone: '+98 916 644 9409',
  supportWhatsApp: '+98 916 644 9409',
  supportInstagram: 'namafoods_',
  supportAddress: '',
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
  refundPolicyTitle: 'شرایط ضمانت و بازگشت وجه',
  refundPolicyText: 'ضمانت ۷ روزه بازگشت بی‌قیدوشرط وجه در صورت هرگونه عدم رضایت از کیفیت، عطر، طعم یا سلامت بسته‌بندی محصولات ناما.',
  adminLoginButtonText: 'ورود با رمز',
  checkoutTitle: 'اطلاعات ارسال و تحویل‌گیرنده',
  checkoutSubtitle: 'لطفاً مشخصات دقیق پستی را جهت ارسال سریع مرسوله با پست پیشتاز وارد نمایید.',
  checkoutSubmitButtonText: 'تکمیل و ثبت نهایی سفارش',
  trackingModalTitle: 'پیگیری وضعیت سفارش',
  trackingModalSubtitle: 'استعلام لحظه‌ای وضعیت سفارش با کد پیگیری ۶ رقمی یا کد مرسوله پستی',
  trackingInputPlaceholder: 'کد پیگیری ۶ رقمی سفارش (مثال: ۱۲۳۴۵۶)',
  footerAboutTitle: 'درباره محصولات غذایی ناما',
  footerAboutText: 'فروشگاه تخصصی محصولات طبیعی و سالم ناما با تعهد به خلوص و اصالت، مرغوب‌ترین خوراکی‌های سنتی ایران را مستقیم عرضه می‌کند.',
  footerTrustTitle: 'ضمانت اصالت و سلامت',
  footerTrustText: 'تمامی محصولات ناما با برگه آزمایش، تضمین ۱۰۰٪ اصالت و بسته‌بندی بهداشتی ایمن ارسال می‌گردند.',
  footerContactTitle: 'ارتباط و پشتیبانی',
  cartTitle: 'سبد خرید شما',
  cartEmptyMessage: 'سبد خرید شما در حال حاضر خالی است.',
  customCategories: [],
  zarinpalEnabled: false,
  zarinpalSandbox: true
};

export function sanitizePublicSettings(raw: Record<string, any>): Record<string, any> {
  const safe: Record<string, any> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (ALLOWED_PUBLIC_KEYS.has(key) && !FORBIDDEN_SENSITIVE_KEYS.has(key) && value !== undefined) {
      safe[key] = value;
    }
  }
  return safe;
}

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      ...SECURITY_HEADERS
    }
  });
};

/**
 * GET /api/settings/public
 * Serves public store branding and CMS texts.
 * Strictly enforces an allowlist to ensure zero private or sensitive settings are ever returned.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  let publicSettings = { ...DEFAULT_PUBLIC_SETTINGS };

  const projectId = context.env.FIREBASE_PROJECT_ID;
  const databaseId = context.env.FIRESTORE_DATABASE_ID || '(default)';

  if (projectId) {
    try {
      const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}/documents/settings/public`;
      const res = await fetch(firestoreUrl, {
        headers: { 'Accept': 'application/json' }
      });
      if (res.ok) {
        const docData = await res.json() as any;
        if (docData && docData.fields) {
          const parsed = fromFirestoreFields(docData.fields);
          publicSettings = { ...publicSettings, ...parsed };
        }
      }
    } catch {
      // Safe fallback to default public settings without exposing errors
    }
  }

  const safeSettings = sanitizePublicSettings(publicSettings);

  return new Response(JSON.stringify({
    success: true,
    settings: safeSettings
  }), {
    status: 200,
    headers: SECURITY_HEADERS
  });
};
