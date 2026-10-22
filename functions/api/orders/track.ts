import { PagesFunction, Env } from '../../types';
import { FirestoreRestClient } from '../../lib/firestoreRest';
import { normalizeIranianPhone, isValidIranianMobile } from '../../lib/orderEngine';

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
 * POST /api/orders/track
 * Cloudflare Pages Functions Privacy-Preserving Order Tracking
 * - Requires both exact orderId and 11-digit Iranian mobile number
 * - Returns ONLY minimal tracking status
 * - Strictly strips address, phone, payment cards and receipt images
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  let body: any;
  try {
    body = await context.request.json();
  } catch {
    return new Response(JSON.stringify({
      error: 'ساختار درخواست نامعتبر است. ارسال JSON الزامی است.'
    }), {
      status: 400,
      headers: SECURITY_HEADERS
    });
  }

  const orderId = String(body?.orderId || '').trim().toUpperCase();
  const phone = String(body?.phone || '').trim();

  if (!orderId || !phone) {
    return new Response(JSON.stringify({
      error: 'کد پیگیری سفارش و شماره همراه ثبت شده در سفارش الزامی است.'
    }), {
      status: 400,
      headers: SECURITY_HEADERS
    });
  }

  const cleanPhone = normalizeIranianPhone(phone);
  if (!isValidIranianMobile(cleanPhone)) {
    return new Response(JSON.stringify({
      error: 'شماره تلفن همراه ۱۱ رقمی نامعتبر است.'
    }), {
      status: 400,
      headers: SECURITY_HEADERS
    });
  }

  const projectId = context.env.FIREBASE_PROJECT_ID;
  if (!projectId) {
    return new Response(JSON.stringify({
      error: 'سرویس پایگاه داده فروشگاه در متغیرهای سرور کلودفلر پیکربندی نشده است.'
    }), {
      status: 503,
      headers: SECURITY_HEADERS
    });
  }

  const databaseId = context.env.FIRESTORE_DATABASE_ID || '(default)';
  const firestoreClient = new FirestoreRestClient({
    projectId,
    databaseId,
    clientEmail: context.env.FIREBASE_CLIENT_EMAIL,
    privateKeyPem: context.env.FIREBASE_PRIVATE_KEY
  });

  try {
    const docSnap = await firestoreClient.getDocument(`orders/${orderId}`);
    if (!docSnap.exists || !docSnap.data) {
      return new Response(JSON.stringify({
        error: 'سفارشی با این مشخصات یافت نشد.'
      }), {
        status: 404,
        headers: SECURITY_HEADERS
      });
    }

    const orderData = docSnap.data;
    const storedPhone = normalizeIranianPhone(orderData.customerPhone || '');

    // Strict equality check between stored phone and provided phone
    if (!storedPhone || cleanPhone !== storedPhone) {
      return new Response(JSON.stringify({
        error: 'شماره تلفن همراه وارد شده با شماره ثبت شده در این سفارش مطابقت ندارد.'
      }), {
        status: 403,
        headers: SECURITY_HEADERS
      });
    }

    // Minimized sanitized tracking data (zero personal address, phone, or card leaks)
    const safeOrder = {
      id: orderData.id,
      customerName: orderData.customerName,
      status: orderData.status,
      trackingCode: orderData.trackingCode || null,
      totalAmount: orderData.totalAmount,
      shippingCost: orderData.shippingCost,
      items: (orderData.items || []).map((i: any) => ({
        name: i.name,
        weight: i.weight,
        quantity: i.quantity,
        price: i.price,
        image: i.image
      })),
      createdAt: orderData.createdAt,
      updatedAt: orderData.updatedAt
    };

    return new Response(JSON.stringify({
      success: true,
      order: safeOrder
    }), {
      status: 200,
      headers: SECURITY_HEADERS
    });
  } catch (err: any) {
    return new Response(JSON.stringify({
      error: 'خطا در استعلام سفارش از پایگاه داده.'
    }), {
      status: 500,
      headers: SECURITY_HEADERS
    });
  }
};
