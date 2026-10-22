import { PagesFunction, Env } from '../../types';

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
  'aboutText',
  'heroBadge',
  'heroTitle',
  'heroSubtitle',
  'heroButtonText',
  'promoBadge',
  'promoTitle',
  'promoSubtitle',
  'qualityBadge1',
  'qualityBadge2',
  'qualityBadge3',
  'qualityBadge4',
  'customCategories'
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
  storeName: 'ناما | NAMA',
  slogan: 'از نام و جان برای طعمی ماندگار',
  shippingCost: 0,
  freeShippingThreshold: 600000,
  supportPhone: '09166449409',
  supportWhatsApp: '09166449409',
  supportInstagram: 'namafoods_',
  supportAddress: '',
  announcement: '🌿 از نام و جان برای طعمی ماندگار | ضمانت اصالت ۱۰۰٪ طبیعی تمام محصولات ناما + ارسال رایگان خریدهای بالای ۶۰۰ هزار تومان',
  isStoreOpen: true,
  heroBadge: 'محصولات غذایی ۱۰۰٪ طبیعی، سالم و دستچین ایرانی',
  heroTitle: 'از نام و جان، برای طعمی ماندگار',
  heroSubtitle: 'سفره‌ای پربرکت با اصیل‌ترین طعم‌های دیار ایران؛ دستچین شده بدون مواد افزودنی و با تضمین بازگشت وجه.',
  heroButtonText: 'مشاهده و خرید محصولات',
  promoBadge: 'جشنواره اصالت و سلامت ناما',
  promoTitle: 'از نام و جان، برای طعمی ماندگار',
  promoSubtitle: 'تجلی تعهد به سلامتی و اصالت؛ دستچین شده از دستان کشاورزان و زنبورداران امین ایران.',
  aboutText: 'فروشگاه تخصصی مواد غذایی ارگانیک و سنتی ناما، برترین محصولات سالم مزارع، کوهپایه‌ها و نخلستان‌های ایران را مستقیماً به سفره‌های گرم خانواده‌ها می‌رساند.',
  qualityBadge1: 'برگه آزمایش معتبر',
  qualityBadge2: 'تضمین ۱۰۰٪ اصالت',
  qualityBadge3: 'بسته‌بندی ایمن پستی',
  qualityBadge4: 'ارسال فوری سراسری',
  customCategories: [
    {
      id: 'cat_saffron',
      name: 'زعفران و هل',
      icon: '✨',
      description: 'زعفران سرگل و نگین قائنات و هل اعلا'
    }
  ]
};

export function sanitizePublicSettings(raw: Record<string, any>): Record<string, any> {
  const safe: Record<string, any> = {};
  for (const [key, value] of Object.entries(raw)) {
    // Defense-in-depth: Must be in allowlist AND must NOT be in forbidden blacklist
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

  // Attempt to read from Firestore REST API if environment is bound
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
          const parsed: Record<string, any> = {};
          for (const [key, fieldObj] of Object.entries<any>(docData.fields)) {
            if (fieldObj.stringValue !== undefined) parsed[key] = fieldObj.stringValue;
            else if (fieldObj.integerValue !== undefined) parsed[key] = Number(fieldObj.integerValue);
            else if (fieldObj.doubleValue !== undefined) parsed[key] = Number(fieldObj.doubleValue);
            else if (fieldObj.booleanValue !== undefined) parsed[key] = fieldObj.booleanValue;
          }
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
