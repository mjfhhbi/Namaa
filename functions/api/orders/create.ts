import { PagesFunction, Env } from '../../types';
import { FirestoreRestClient } from '../../lib/firestoreRest';
import { processAtomicOrder } from '../../lib/orderEngine';

const SECURITY_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Edge-Runtime': 'cloudflare-pages'
};

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      ...SECURITY_HEADERS
    }
  });
};

/**
 * POST /api/orders/create
 * Cloudflare Pages Functions Atomic Order Placement
 * - Server-authoritative price & stock recalculation
 * - Real Firestore REST API atomic transaction (read-check-write)
 * - Anti-overselling & atomic inventory decrement
 * - Idempotent order placement
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  // 1. Content-Type and payload size checks
  const contentType = context.request.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return new Response(JSON.stringify({
      error: 'نوع محتوای ارسالی نامعتبر است. فرمت application/json الزامی است.'
    }), {
      status: 415,
      headers: SECURITY_HEADERS
    });
  }

  const contentLength = Number(context.request.headers.get('content-length') || 0);
  if (contentLength > 25 * 1024) {
    return new Response(JSON.stringify({
      error: 'حجم داده‌های سبد خرید بیش از حد مجاز است.'
    }), {
      status: 413,
      headers: SECURITY_HEADERS
    });
  }

  let body: any;
  try {
    body = await context.request.json();
  } catch {
    return new Response(JSON.stringify({
      error: 'داده‌های ارسالی نامعتبر است. لطفاً ساختار JSON ارسال فرمایید.'
    }), {
      status: 400,
      headers: SECURITY_HEADERS
    });
  }

  // 2. Ensure Firestore credentials are bound
  const projectId = context.env.FIREBASE_PROJECT_ID;
  if (!projectId) {
    return new Response(JSON.stringify({
      error: 'سرویس پایگاه داده فروشگاه در متغیرهای محیطی کلودفلر پیکربندی نشده است.'
    }), {
      status: 503,
      headers: SECURITY_HEADERS
    });
  }

  const databaseId = context.env.FIRESTORE_DATABASE_ID || '(default)';
  const databasePath = `projects/${projectId}/databases/${databaseId}`;

  const firestoreClient = new FirestoreRestClient({
    projectId,
    databaseId,
    clientEmail: context.env.FIREBASE_CLIENT_EMAIL,
    privateKeyPem: context.env.FIREBASE_PRIVATE_KEY
  });

  // 3. Execute atomic order transaction
  const result = await processAtomicOrder(body, firestoreClient, databasePath);

  return new Response(JSON.stringify(result.success ? {
    success: true,
    isDuplicate: result.isDuplicate,
    order: result.order,
    message: result.isDuplicate 
      ? 'سفارش قبلاً ثبت گردیده بود و اطلاعات سفارش پیشین بازگردانده شد.'
      : 'سفارش شما با موفقیت در سیستم ثبت گردید.'
  } : {
    success: false,
    error: result.error
  }), {
    status: result.status,
    headers: SECURITY_HEADERS
  });
};
