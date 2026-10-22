import { PagesFunction, Env } from '../../types';
import { 
  constantTimeCompare, 
  signAdminJwt, 
  checkAdminLoginRateLimit, 
  recordFailedLoginAttempt, 
  clearFailedLoginAttempts 
} from '../../lib/edgeSecurity';

const SECURITY_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin'
};

/**
 * Handle CORS preflight OPTIONS
 */
export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-token',
      'Access-Control-Max-Age': '86400',
      ...SECURITY_HEADERS
    }
  });
};

/**
 * POST /api/admin/login
 * Cloudflare Pages Functions Admin Authentication Endpoint
 * - Requires ADMIN_PIN and cryptographically strong ADMIN_JWT_SECRET (min 32 chars)
 * - Anti-tampering and timing-safe constant-time string comparison
 * - Strict IP extraction without trusting client-spoofed headers
 * - Multi-instance rate limiting via KV (with transparent scope reporting)
 * - Maximum payload size enforcement (10KB limit)
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  // 1. Safe IP Extraction (CF-Connecting-IP is set by Cloudflare edge and cannot be spoofed)
  const clientIp = context.request.headers.get('CF-Connecting-IP') || '127.0.0.1';

  // 2. Multi-instance rate-limiting check
  const rateLimitCheck = await checkAdminLoginRateLimit(clientIp, context.env.RATE_LIMIT_KV);
  if (!rateLimitCheck.allowed) {
    return new Response(JSON.stringify({
      error: rateLimitCheck.error
    }), {
      status: 429,
      headers: {
        ...SECURITY_HEADERS,
        'Retry-After': String((rateLimitCheck.remainingMinutes || 15) * 60),
        'X-RateLimit-Scope': rateLimitCheck.isGlobal ? 'cloudflare-kv-global' : 'isolate-local'
      }
    });
  }

  // 3. Ensure server environment has ADMIN_PIN configured
  const serverPin = context.env.ADMIN_PIN?.trim();
  if (!serverPin) {
    return new Response(JSON.stringify({
      error: 'ورود با PIN در سرور پیکربندی نشده است. لطفاً متغیر ADMIN_PIN را در داشبورد کلودفلر تنظیم فرمایید.'
    }), {
      status: 403,
      headers: SECURITY_HEADERS
    });
  }

  // 4. Validate ADMIN_JWT_SECRET presence and strength (MUST be at least 32 characters, never fallback to PIN)
  const jwtSecret = context.env.ADMIN_JWT_SECRET?.trim();
  if (!jwtSecret || jwtSecret.length < 32) {
    return new Response(JSON.stringify({
      error: 'پیکربندی کلید امنیتی نشست (ADMIN_JWT_SECRET) در سرور انجام نشده است یا طول آن کمتر از ۳۲ کاراکتر است.'
    }), {
      status: 500,
      headers: SECURITY_HEADERS
    });
  }

  // 5. Payload size and Content-Type inspection
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
  if (contentLength > 10 * 1024) {
    return new Response(JSON.stringify({
      error: 'حجم داده‌های ورودی بیش از حد مجاز است.'
    }), {
      status: 413,
      headers: SECURITY_HEADERS
    });
  }

  // 6. Parse and validate JSON request body
  let pin: string;
  try {
    const body = await context.request.json() as any;
    pin = body?.pin;
  } catch {
    return new Response(JSON.stringify({
      error: 'داده‌های درخواست نامعتبر است. ساختار JSON الزامی است.'
    }), {
      status: 400,
      headers: SECURITY_HEADERS
    });
  }

  if (!pin || typeof pin !== 'string' || pin.trim().length === 0) {
    return new Response(JSON.stringify({
      error: 'رمز عبور مدیریت الزامی است.'
    }), {
      status: 400,
      headers: SECURITY_HEADERS
    });
  }

  // 7. Timing-safe comparison using SHA-256 pre-hashed buffers
  const isMatch = await constantTimeCompare(pin.trim(), serverPin);

  if (!isMatch) {
    const failRecord = await recordFailedLoginAttempt(clientIp, context.env.RATE_LIMIT_KV);
    
    // Artificial jitter delay to mitigate high-frequency automated probes
    await new Promise((r) => setTimeout(r, 400));

    return new Response(JSON.stringify({
      error: failRecord.locked
        ? `به دلیل ۵ بار تلاش ناموفق متوالی، دسترسی شما موقتاً به مدت ۱۵ دقیقه مسدود شد.`
        : 'رمز عبور مدیریت نادرست است.'
    }), {
      status: 401,
      headers: {
        ...SECURITY_HEADERS,
        'X-RateLimit-Scope': failRecord.isGlobal ? 'cloudflare-kv-global' : 'isolate-local'
      }
    });
  }

  // 8. Successful login: Clear failed counter for this IP
  await clearFailedLoginAttempts(clientIp, context.env.RATE_LIMIT_KV);

  // 9. Issue cryptographically signed Edge JWT token valid for 12 hours
  const nowSec = Math.floor(Date.now() / 1000);
  const payload = {
    sub: 'store_admin',
    role: 'admin',
    iat: nowSec,
    exp: nowSec + 12 * 3600, // 12 hours
    jti: crypto.randomUUID()
  };

  const token = await signAdminJwt(payload, jwtSecret);

  return new Response(JSON.stringify({
    success: true,
    token,
    message: 'ورود مدیر با موفقیت انجام شد و نشست امضاشده صادر گردید.'
  }), {
    status: 200,
    headers: {
      ...SECURITY_HEADERS,
      'X-RateLimit-Scope': rateLimitCheck.isGlobal ? 'cloudflare-kv-global' : 'isolate-local'
    }
  });
};
