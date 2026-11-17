import { PagesFunction, Env } from '../../../types';

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

export const onRequestPost: PagesFunction<Env> = async () => {
  return new Response(
    JSON.stringify({
      error: 'سامانه ارسال پیامک کد تأیید موقتاً تا زمان اتصال رسمی وب‌سرویس پیامکی غیرفعال است. لطفاً مستقیماً از کد اختصاصی سفارش (مانند NM-...) جهت پیگیری وضعیت استفاده فرمایید.'
    }),
    { status: 403, headers: SECURITY_HEADERS }
  );
};
