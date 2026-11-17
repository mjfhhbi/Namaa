import { PagesFunction, Env } from '../../types';
import { processAtomicOrder } from '../../lib/orderEngine';
import { createEdgeFirestoreClient } from '../../lib/adminAuth';

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
      'Access-Control-Allow-Headers': 'Content-Type, Idempotency-Key',
      'Access-Control-Max-Age': '86400',
      ...SECURITY_HEADERS
    }
  });
};

async function dispatchEdgeOrderNtfy(order: any, ntfyTopic?: string) {
  const topic = (ntfyTopic || 'nama_store_orders_1383').trim();
  if (!topic) return;
  try {
    const itemsSummary = (order.items || [])
      .map((i: any) => `• ${i.name} (${i.quantity} عدد) - ${(Number(i.price) * Number(i.quantity)).toLocaleString('fa-IR')} تومان`)
      .join('\n');
    const bodyText = [
      `سفارش جدید: ${order.id} (کد پیگیری: ${order.shortCode || order.id})`,
      `خریدار: ${order.customerName}`,
      `تلفن: ${order.customerPhone}`,
      `مقصد: ${order.province || ''} ${order.city || ''}`,
      `مبلغ کل: ${Number(order.totalAmount || 0).toLocaleString('fa-IR')} تومان`,
      `وضعیت: ${order.status === 'paid_pending_approval' ? 'فیش ارسال شده - منتظر تایید' : 'منتظر ارسال فیش'}`,
      itemsSummary
    ].join('\n');

    await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
      method: 'POST',
      headers: {
        'Title': `سفارش جدید ناما (${order.shortCode || order.id})`,
        'Priority': '4',
        'Tags': 'shopping_bags,white_check_mark',
        'Content-Type': 'text/plain; charset=utf-8'
      },
      body: bodyText
    });
  } catch {
    // Non-blocking notification failure must never abort successful order creation
  }
}

/**
 * POST /api/orders/create
 * Cloudflare Pages Functions Atomic Order Placement
 * - Server-authoritative price, shipping, discount & stock recalculation
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
  if (contentLength > 1024 * 1024) {
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
  const dbCheck = createEdgeFirestoreClient(context.env);
  if (!dbCheck.ok) {
    return dbCheck.response;
  }

  const headerIdempotencyKey = context.request.headers.get('idempotency-key') || undefined;

  // 3. Load authoritative shipping & discount settings from Firestore
  let shippingCost = 45000;
  let freeShippingThreshold = 600000;
  let discountCodes: any[] = [];
  let ntfyTopic: string | undefined;

  try {
    const [publicSnap, privateSnap] = await Promise.all([
      dbCheck.client.getDocument('settings/public'),
      dbCheck.client.getDocument('settings/private')
    ]);
    if (publicSnap.exists && publicSnap.data) {
      if (publicSnap.data.shippingCost !== undefined) {
        shippingCost = Number(publicSnap.data.shippingCost) || 0;
      }
      if (publicSnap.data.freeShippingThreshold !== undefined) {
        freeShippingThreshold = Number(publicSnap.data.freeShippingThreshold) || 0;
      }
    }
    if (privateSnap.exists && privateSnap.data) {
      if (Array.isArray(privateSnap.data.discountCodes)) {
        discountCodes = privateSnap.data.discountCodes;
      }
      if (typeof privateSnap.data.ntfyTopic === 'string') {
        ntfyTopic = privateSnap.data.ntfyTopic;
      }
    }
  } catch {
    // Proceed with safe defaults if settings doc not yet created
  }

  // 4. Execute atomic order transaction
  const result = await processAtomicOrder(
    { ...body, idempotencyKey: body?.idempotencyKey || headerIdempotencyKey },
    dbCheck.client,
    dbCheck.databasePath,
    { shippingCost, freeShippingThreshold, discountCodes }
  );

  if (result.success && !result.isDuplicate && result.order) {
    context.waitUntil(dispatchEdgeOrderNtfy(result.order, ntfyTopic));
  }

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
