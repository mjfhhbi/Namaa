import { Env } from '../types';
import { verifyAdminJwt } from './edgeSecurity';
import { FirestoreRestClient } from './firestoreRest';

export const ADMIN_SECURITY_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Edge-Runtime': 'cloudflare-pages'
};

export function createCorsPreflightResponse(methods: string = 'POST, OPTIONS'): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Methods': methods,
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-token',
      'Access-Control-Max-Age': '86400',
      ...ADMIN_SECURITY_HEADERS
    }
  });
}

export function extractAdminToken(request: Request): string | null {
  const customHeader = request.headers.get('x-admin-token');
  if (customHeader && customHeader.trim()) {
    return customHeader.trim();
  }
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }
  return null;
}

export async function requireEdgeAdminAuth(
  request: Request,
  env: Env
): Promise<{ authorized: true; payload: any } | { authorized: false; response: Response }> {
  const token = extractAdminToken(request);
  if (!token) {
    return {
      authorized: false,
      response: new Response(
        JSON.stringify({
          error: 'احراز هویت الزامی است. لطفاً ابتدا به پنل مدیریت وارد شوید.'
        }),
        { status: 401, headers: ADMIN_SECURITY_HEADERS }
      )
    };
  }

  const jwtSecret = env.ADMIN_JWT_SECRET?.trim();
  if (!jwtSecret || jwtSecret.length < 32) {
    return {
      authorized: false,
      response: new Response(
        JSON.stringify({
          error: 'پیکربندی کلید امنیتی نشست (ADMIN_JWT_SECRET) در سرور انجام نشده است یا طول آن کمتر از ۳۲ کاراکتر است.'
        }),
        { status: 500, headers: ADMIN_SECURITY_HEADERS }
      )
    };
  }

  const verification = await verifyAdminJwt(token, jwtSecret);
  if (!verification.valid) {
    return {
      authorized: false,
      response: new Response(
        JSON.stringify({
          error: verification.error || 'دسترسی غیرمجاز. نشست مدیریت نامعتبر است یا منقضی شده است.'
        }),
        { status: 403, headers: ADMIN_SECURITY_HEADERS }
      )
    };
  }

  return { authorized: true, payload: verification.payload };
}

export function createEdgeFirestoreClient(
  env: Env
): { ok: true; client: FirestoreRestClient; databasePath: string } | { ok: false; response: Response } {
  const projectId = env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKeyRaw = env.FIREBASE_PRIVATE_KEY?.trim();

  if (!projectId || !clientEmail || !privateKeyRaw) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({
          error: 'اعتبارنامه حساب سرویس پایگاه داده (FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY) در متغیرهای محیطی سرور پیکربندی نشده است.'
        }),
        { status: 503, headers: ADMIN_SECURITY_HEADERS }
      )
    };
  }

  const databaseId = env.FIRESTORE_DATABASE_ID?.trim() || '(default)';
  const databasePath = `projects/${projectId}/databases/${databaseId}`;
  const privateKeyPem = privateKeyRaw.replace(/\\n/g, '\n');

  const client = new FirestoreRestClient({
    projectId,
    databaseId,
    clientEmail,
    privateKeyPem
  });

  return { ok: true, client, databasePath };
}

export function isValidFirestoreDocId(id: unknown): id is string {
  return typeof id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(id);
}

export function cleanNumericValue(v: unknown): number {
  if (v === undefined || v === null || v === '') return 0;
  let s = String(v);
  const farsiDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  for (let i = 0; i < 10; i++) {
    s = s.replaceAll(farsiDigits[i], String(i)).replaceAll(arabicDigits[i], String(i));
  }
  s = s.replace(/[^0-9.]/g, '');
  const parsed = parseFloat(s);
  return isNaN(parsed) ? 0 : parsed;
}

export function sanitizeProductPayload(rawProduct: any): { ok: true; product: Record<string, any> } | { ok: false; error: string } {
  if (!rawProduct || typeof rawProduct !== 'object') {
    return { ok: false, error: 'اطلاعات محصول نامعتبر است.' };
  }

  const productId = typeof rawProduct.id === 'string' ? rawProduct.id.trim() : '';
  if (!isValidFirestoreDocId(productId)) {
    return { ok: false, error: 'شناسه محصول نامعتبر است (فقط حروف لاتین، اعداد، خط تیره و زیرخط مجاز است).' };
  }

  const name = typeof rawProduct.name === 'string' ? rawProduct.name.trim() : '';
  if (!name || rawProduct.price === undefined) {
    return { ok: false, error: 'نام و قیمت محصول الزامی است.' };
  }

  const priceNum = cleanNumericValue(rawProduct.price);
  if (priceNum <= 0) {
    return { ok: false, error: 'قیمت محصول باید یک عدد مثبت و معتبر باشد.' };
  }

  const stockNum = Math.max(0, Math.floor(cleanNumericValue(rawProduct.stock !== undefined ? rawProduct.stock : 10)));

  const cleanProduct: Record<string, any> = {};
  for (const [k, v] of Object.entries(rawProduct)) {
    if (v !== undefined) {
      cleanProduct[k] = v;
    }
  }

  cleanProduct.id = productId;
  cleanProduct.name = name;
  cleanProduct.price = priceNum;
  cleanProduct.stock = stockNum;
  cleanProduct.updatedAt = new Date().toISOString();
  if (!cleanProduct.createdAt) {
    cleanProduct.createdAt = cleanProduct.updatedAt;
  }

  if (rawProduct.originalPrice !== undefined && Number(cleanNumericValue(rawProduct.originalPrice)) > 0) {
    cleanProduct.originalPrice = Number(cleanNumericValue(rawProduct.originalPrice));
  } else {
    delete cleanProduct.originalPrice;
  }

  if (!cleanProduct.badge) {
    delete cleanProduct.badge;
  }

  return { ok: true, product: cleanProduct };
}
