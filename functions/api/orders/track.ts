import { PagesFunction, Env } from '../../types';
import { createEdgeFirestoreClient } from '../../lib/adminAuth';
import { normalizeIranianPhone, toEnglishDigits } from '../../lib/orderEngine';

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

function maskCustomerName(name: string): string {
  if (!name) return 'خریدار گرامی';
  const parts = String(name).trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].length > 3 ? `${parts[0].slice(0, 2)}***` : parts[0];
  }
  return `${parts[0]} ${parts[1].slice(0, 1)}***`;
}

function sanitizeOrderForTracking(order: any) {
  return {
    id: order.id,
    shortCode: order.shortCode || order.id,
    customerName: maskCustomerName(order.customerName),
    status: order.status,
    trackingCode: order.trackingCode || null,
    refundStatus: order.refundStatus || (order.status === 'refunded' ? 'refunded' : undefined),
    refundNotes: order.refundNotes || undefined,
    totalAmount: order.totalAmount,
    subtotal: order.subtotal,
    shippingCost: order.shippingCost,
    province: order.province,
    city: order.city,
    items: (order.items || []).map((i: any) => ({
      name: i.name,
      weight: i.weight,
      quantity: i.quantity,
      price: i.price,
      image: i.image
    })),
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    hasReceipt: Boolean(order.receiptImage),
    paymentMethod: order.paymentMethod
  };
}

/**
 * POST /api/orders/track
 * Cloudflare Pages Functions Privacy-Preserving Order Tracking
 * - Supports 6-digit shortCode, Order ID (NM-...), or Iran Post trackingCode
 * - Optional strict 11-digit Iranian mobile number match when phone is provided
 * - Strictly strips full address, phone, payment cards and receipt images
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

  const rawCode = String(body?.orderId || body?.trackingCode || '').trim();
  const rawPhone = String(body?.phone || '').trim();

  if (!rawCode) {
    return new Response(JSON.stringify({
      error: 'لطفاً کد ۶ رقمی سفارش، کد اختصاصی سفارش (مانند NM-...) یا شماره مرسوله پستی را وارد فرمایید.'
    }), {
      status: 400,
      headers: SECURITY_HEADERS
    });
  }

  const cleanCode = toEnglishDigits(rawCode).trim().toUpperCase();
  if (cleanCode.length < 3 || cleanCode.length > 64) {
    return new Response(JSON.stringify({
      error: 'کد سفارش وارد شده نامعتبر است (بین ۳ تا ۶۴ کاراکتر).'
    }), {
      status: 400,
      headers: SECURITY_HEADERS
    });
  }

  const dbCheck = createEdgeFirestoreClient(context.env);
  if (!dbCheck.ok) {
    return dbCheck.response;
  }

  try {
    let orderData: any = null;

    // 1. Direct lookup via short_codes/{code}
    const shortCodeSnap = await dbCheck.client.getDocument(`short_codes/${cleanCode}`);
    if (shortCodeSnap.exists && shortCodeSnap.data?.orderId) {
      const ordSnap = await dbCheck.client.getDocument(`orders/${shortCodeSnap.data.orderId}`);
      if (ordSnap.exists && ordSnap.data) {
        orderData = ordSnap.data;
      }
    }

    // 2. Direct lookup via orders/{cleanCode}
    if (!orderData) {
      const directSnap = await dbCheck.client.getDocument(`orders/${cleanCode}`);
      if (directSnap.exists && directSnap.data) {
        orderData = directSnap.data;
      }
    }

    // 3. Fallback search across orders by shortCode or postal trackingCode
    if (!orderData) {
      const allOrders = await dbCheck.client.listDocuments('orders');
      const matched = allOrders.find((d) => {
        const sc = d.data?.shortCode ? toEnglishDigits(String(d.data.shortCode)).trim().toUpperCase() : '';
        const tc = d.data?.trackingCode ? toEnglishDigits(String(d.data.trackingCode)).trim().toUpperCase() : '';
        const id = d.data?.id ? toEnglishDigits(String(d.data.id)).trim().toUpperCase() : d.id.toUpperCase();
        return sc === cleanCode || tc === cleanCode || id === cleanCode;
      });
      if (matched) {
        orderData = matched.data;
      }
    }

    if (!orderData) {
      return new Response(JSON.stringify({
        error: 'سفارشی با این کد پیگیری در سامانه یافت نشد. لطفاً کد سفارش یا شماره مرسوله پستی را بررسی فرمایید.'
      }), {
        status: 404,
        headers: SECURITY_HEADERS
      });
    }

    // Optional phone match verification when phone is provided
    if (rawPhone) {
      const cleanPhone = normalizeIranianPhone(rawPhone);
      const storedPhone = normalizeIranianPhone(orderData.customerPhone || '');
      if (!storedPhone || cleanPhone !== storedPhone) {
        return new Response(JSON.stringify({
          error: 'کد پیگیری وارد شده متعلق به این شماره همراه نمی‌باشد.'
        }), {
          status: 403,
          headers: SECURITY_HEADERS
        });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      order: sanitizeOrderForTracking(orderData)
    }), {
      status: 200,
      headers: SECURITY_HEADERS
    });
  } catch {
    return new Response(JSON.stringify({
      error: 'خطا در استعلام سفارش از پایگاه داده.'
    }), {
      status: 500,
      headers: SECURITY_HEADERS
    });
  }
};
