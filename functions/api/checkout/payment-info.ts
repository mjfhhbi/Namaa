import { PagesFunction, Env } from '../../types';
import { createEdgeFirestoreClient } from '../../lib/adminAuth';
import { isValidIranianMobile } from '../../lib/orderEngine';

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
 * POST /api/checkout/payment-info
 * Provides store bank details to an active customer with a valid Iranian mobile number.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  let body: any;
  try {
    body = await context.request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'درخواست نامعتبر است.' }),
      { status: 400, headers: SECURITY_HEADERS }
    );
  }

  const customerPhone = String(body?.customerPhone || '').trim();
  if (!customerPhone || !isValidIranianMobile(customerPhone)) {
    return new Response(
      JSON.stringify({ error: 'شماره تلفن همراه معتبر جهت دریافت اطلاعات کارت الزامی است.' }),
      { status: 400, headers: SECURITY_HEADERS }
    );
  }

  let bankInfo = {
    bankName: 'بانک ملی ایران',
    cardNumber: '۶۰۳۷۹۹۸۱۴۵۲۳۸۷۱۶',
    cardHolder: 'متین جهانبانی',
    shabaNumber: 'IR120170000000109283746501'
  };

  const dbCheck = createEdgeFirestoreClient(context.env);
  if (dbCheck.ok) {
    try {
      const privateSnap = await dbCheck.client.getDocument('settings/private');
      if (privateSnap.exists && privateSnap.data) {
        bankInfo = {
          bankName: privateSnap.data.bankName || bankInfo.bankName,
          cardNumber: privateSnap.data.cardNumber || bankInfo.cardNumber,
          cardHolder: privateSnap.data.cardHolder || bankInfo.cardHolder,
          shabaNumber: privateSnap.data.shabaNumber || bankInfo.shabaNumber
        };
      }
    } catch {
      // Fallback safely if settings/private cannot be read
    }
  }

  return new Response(
    JSON.stringify({ success: true, bankInfo }),
    { status: 200, headers: SECURITY_HEADERS }
  );
};
