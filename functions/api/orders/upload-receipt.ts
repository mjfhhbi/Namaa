import { PagesFunction, Env } from '../../types';
import { FirestoreRestClient, toFirestoreValue } from '../../lib/firestoreRest';
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
 * POST /api/orders/upload-receipt
 * Cloudflare Pages Functions Payment Receipt Upload Endpoint
 * - Strictly verifies order ownership via 11-digit phone match
 * - Enforces order eligibility (pending_receipt or paid_pending_approval only)
 * - Strict image MIME validation and 500KB size cap (prevents Firestore 1MB document limit breach)
 * - Never auto-approves payment; strictly transitions to paid_pending_approval
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  let body: any;
  try {
    body = await context.request.json();
  } catch {
    return new Response(JSON.stringify({
      error: 'ساختار داده‌های ارسالی نامعتبر است. ارسال JSON الزامی است.'
    }), {
      status: 400,
      headers: SECURITY_HEADERS
    });
  }

  const { orderId, phone, receiptImage, cardLast4, paymentReference } = body || {};

  if (!orderId || !phone || !receiptImage) {
    return new Response(JSON.stringify({
      error: 'شناسه سفارش، شماره همراه و تصویر فیش واریزی الزامی است.'
    }), {
      status: 400,
      headers: SECURITY_HEADERS
    });
  }

  const cleanId = String(orderId).trim().toUpperCase();
  const cleanPhone = normalizeIranianPhone(phone);
  if (!isValidIranianMobile(cleanPhone)) {
    return new Response(JSON.stringify({
      error: 'شماره تلفن همراه ۱۱ رقمی ثبت شده در سفارش الزامی است.'
    }), {
      status: 400,
      headers: SECURITY_HEADERS
    });
  }

  // 1. Validate image format
  if (typeof receiptImage !== 'string' || !receiptImage.startsWith('data:image/')) {
    return new Response(JSON.stringify({
      error: 'فرمت تصویر فیش نامعتبر است. لطفاً فایل تصویری (JPG، PNG، WEBP) ارسال فرمایید.'
    }), {
      status: 400,
      headers: SECURITY_HEADERS
    });
  }

  // 2. Enforce 500KB size limit to keep Firestore documents safely within 1MB cap
  if (receiptImage.length > 500 * 1024) {
    return new Response(JSON.stringify({
      error: 'حجم تصویر فیش واریز بیش از حد مجاز (حداکثر ۵۰۰ کیلوبایت) است. لطفاً تصویر فشرده‌تری انتخاب فرمایید.'
    }), {
      status: 400,
      headers: SECURITY_HEADERS
    });
  }

  const cleanLast4 = cardLast4 ? String(cardLast4).trim().slice(0, 4) : undefined;
  if (cleanLast4 && !/^\d{4}$/.test(cleanLast4)) {
    return new Response(JSON.stringify({
      error: '۴ رقم آخر شماره کارت باید دقیقاً ۴ رقم عددی باشد.'
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
  const databasePath = `projects/${projectId}/databases/${databaseId}`;

  const firestoreClient = new FirestoreRestClient({
    projectId,
    databaseId,
    clientEmail: context.env.FIREBASE_CLIENT_EMAIL,
    privateKeyPem: context.env.FIREBASE_PRIVATE_KEY
  });

  try {
    const docSnap = await firestoreClient.getDocument(`orders/${cleanId}`);
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

    // Ownership check
    if (!storedPhone || cleanPhone !== storedPhone) {
      return new Response(JSON.stringify({
        error: 'شماره تلفن همراه وارد شده با شماره ثبت شده در این سفارش مطابقت ندارد.'
      }), {
        status: 403,
        headers: SECURITY_HEADERS
      });
    }

    // Eligibility check
    if (!['pending_receipt', 'paid_pending_approval'].includes(orderData.status)) {
      return new Response(JSON.stringify({
        error: `ثبت فیش برای سفارشی که در وضعیت «${orderData.status}» قرار دارد امکان‌پذیر نمی‌باشد.`
      }), {
        status: 400,
        headers: SECURITY_HEADERS
      });
    }

    // Prepare updated order fields
    // NOTE: Status is strictly changed to 'paid_pending_approval', NEVER 'approved'
    const nowIso = new Date().toISOString();
    const updatedOrder = {
      ...orderData,
      receiptImage,
      cardLast4: cleanLast4 || orderData.cardLast4,
      paymentReference: paymentReference ? String(paymentReference).trim().slice(0, 50) : orderData.paymentReference,
      status: 'paid_pending_approval',
      updatedAt: nowIso
    };

    const updatedFields: Record<string, any> = {};
    for (const [k, v] of Object.entries(updatedOrder)) {
      if (v !== undefined) {
        updatedFields[k] = toFirestoreValue(v);
      }
    }

    const txId = await firestoreClient.beginTransaction();
    const writeOp = {
      update: {
        name: `${databasePath}/documents/orders/${cleanId}`,
        fields: updatedFields
      }
    };

    const commitSuccess = await firestoreClient.commit(txId, [writeOp]);
    if (!commitSuccess) {
      return new Response(JSON.stringify({
        error: 'خطا در ثبت تراکنشی فیش واریزی در پایگاه داده.'
      }), {
        status: 500,
        headers: SECURITY_HEADERS
      });
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'فیش واریزی با موفقیت ثبت شد و در صف بررسی مدیر قرار گرفت.'
    }), {
      status: 200,
      headers: SECURITY_HEADERS
    });
  } catch (err: any) {
    return new Response(JSON.stringify({
      error: 'خطا در برقراری ارتباط با پایگاه داده.'
    }), {
      status: 500,
      headers: SECURITY_HEADERS
    });
  }
};
