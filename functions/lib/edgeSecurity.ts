/**
 * Edge Security Module for Cloudflare Pages Functions
 * Built 100% on standard Web Crypto API (SubtleCrypto)
 * Zero Node.js dependencies, zero local filesystem access
 */

// Constant-time string comparison using SHA-256 pre-hashing
// Eliminates string-length timing leaks because both SHA-256 hashes are always exactly 32 bytes.
export async function constantTimeCompare(a: string, b: string): Promise<boolean> {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const enc = new TextEncoder();
  const hashA = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(a)));
  const hashB = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(b)));

  let diff = 0;
  for (let i = 0; i < 32; i++) {
    diff |= hashA[i] ^ hashB[i];
  }
  return diff === 0;
}

// Convert ArrayBuffer to Hex string
export function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Base64Url encoder/decoder for Edge JWT
export function base64UrlEncode(str: string): string {
  const base64 = btoa(str);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return atob(base64);
}

// PBKDF2 Hashing using standard Web Crypto API
export async function hashPinWeb(pin: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(pin.trim()),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: enc.encode(salt),
      iterations: 100000,
      hash: 'SHA-512',
    },
    keyMaterial,
    512
  );
  return bufferToHex(derived);
}

// Cryptographically Sign an Edge JWT token using HMAC-SHA256
export async function signAdminJwt(payload: Record<string, any>, secret: string): Promise<string> {
  if (!secret || typeof secret !== 'string' || secret.trim().length < 32) {
    throw new Error('ADMIN_JWT_SECRET must be at least 32 characters long for cryptographic security.');
  }

  const enc = new TextEncoder();
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const dataToSign = `${encodedHeader}.${encodedPayload}`;

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret.trim()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(dataToSign));
  const encodedSignature = base64UrlEncode(
    String.fromCharCode(...new Uint8Array(signature))
  );

  return `${dataToSign}.${encodedSignature}`;
}

// Cryptographically Verify an Edge JWT token
export async function verifyAdminJwt(
  token: string,
  secret: string
): Promise<{ valid: boolean; payload?: any; error?: string }> {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'توکن نامعتبر است.' };
  }

  if (!secret || typeof secret !== 'string' || secret.trim().length < 32) {
    return { valid: false, error: 'کلید امضای سرور معتبر نمی‌باشد (حداقل ۳۲ کاراکتر الزامی است).' };
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return { valid: false, error: 'فرمت توکن نشست نامعتبر است.' };
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;

  // 1. Explicitly decode and validate header to prevent algorithm confusion/none attack
  try {
    const headerJson = base64UrlDecode(encodedHeader);
    const header = JSON.parse(headerJson);
    if (header.alg !== 'HS256' || header.typ !== 'JWT') {
      return { valid: false, error: 'الگوریتم یا نوع توکن نامعتبر است (تنها HS256 مجاز است).' };
    }
  } catch {
    return { valid: false, error: 'سرآیند توکن نامعتبر است.' };
  }

  const dataToSign = `${encodedHeader}.${encodedPayload}`;
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret.trim()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

  // Reconstruct signature bytes
  let sigBytes: Uint8Array;
  try {
    const sigBinary = atob(encodedSignature.replace(/-/g, '+').replace(/_/g, '/'));
    sigBytes = new Uint8Array(sigBinary.length);
    for (let i = 0; i < sigBinary.length; i++) {
      sigBytes[i] = sigBinary.charCodeAt(i);
    }
  } catch {
    return { valid: false, error: 'امضای باینری توکن مخدوش است.' };
  }

  const isVerified = await crypto.subtle.verify(
    'HMAC',
    cryptoKey,
    sigBytes as any,
    enc.encode(dataToSign)
  );

  if (!isVerified) {
    return { valid: false, error: 'امضای رمزنگاری‌شده توکن معتبر نمی‌باشد.' };
  }

  // 2. Decode and validate payload claims
  try {
    const payloadJson = base64UrlDecode(encodedPayload);
    const payload = JSON.parse(payloadJson);
    const nowSec = Math.floor(Date.now() / 1000);

    // Validate exp
    if (typeof payload.exp !== 'number' || isNaN(payload.exp)) {
      return { valid: false, error: 'زمان انقضای توکن نامعتبر است.' };
    }
    if (payload.exp < nowSec) {
      return { valid: false, error: 'نشست مدیریت منقضی شده است. لطفاً مجدداً وارد شوید.' };
    }

    // Validate iat
    if (typeof payload.iat !== 'number' || isNaN(payload.iat)) {
      return { valid: false, error: 'زمان صدور توکن نامعتبر است.' };
    }
    if (payload.iat > nowSec + 60) {
      return { valid: false, error: 'زمان صدور توکن در آینده است.' };
    }

    // Maximum validity cap: 24 hours
    if (payload.exp - payload.iat > 24 * 3600) {
      return { valid: false, error: 'مدت اعتبار توکن بیش از حد مجاز است.' };
    }

    // Validate subject and role
    if (payload.sub !== 'store_admin' || payload.role !== 'admin') {
      return { valid: false, error: 'دسترسی غیرمجاز. سطح دسترسی کاربر مدیر نمی‌باشد.' };
    }

    return { valid: true, payload };
  } catch {
    return { valid: false, error: 'رمزگشایی بدنه توکن ناموفق بود.' };
  }
}

// Rate Limiting Model
interface RateLimitRecord {
  attempts: number;
  lockedUntil?: number;
  resetAt: number;
}

// Local isolate fallback memory map.
// IMPORTANT SECURITY NOTICE:
// In Cloudflare Workers, memory is isolate-local and ephemeral.
// This in-memory map ONLY protects against rapid attempts hitting the exact same worker isolate.
// True multi-instance distributed rate limiting REQUIRES Cloudflare KV (RATE_LIMIT_KV).
const memoryRateLimit = new Map<string, RateLimitRecord>();

export async function checkAdminLoginRateLimit(
  ip: string,
  kv?: any
): Promise<{ allowed: boolean; remainingMinutes?: number; error?: string; isGlobal: boolean }> {
  const now = Date.now();
  const key = `rate_limit_login_${ip}`;
  const isGlobal = Boolean(kv);

  let record: RateLimitRecord;

  if (kv) {
    try {
      const raw = await kv.get(key);
      record = raw ? JSON.parse(raw) : { attempts: 0, resetAt: now + 15 * 60 * 1000 };
    } catch {
      record = memoryRateLimit.get(key) || { attempts: 0, resetAt: now + 15 * 60 * 1000 };
    }
  } else {
    record = memoryRateLimit.get(key) || { attempts: 0, resetAt: now + 15 * 60 * 1000 };
  }

  if (record.lockedUntil && record.lockedUntil > now) {
    const remainingMinutes = Math.ceil((record.lockedUntil - now) / 60000);
    return {
      allowed: false,
      remainingMinutes,
      isGlobal,
      error: `به دلیل تلاش‌های مکرر ناموفق، ورود موقتاً مسدود است. لطفاً ${remainingMinutes} دقیقه دیگر تلاش فرمایید.`
    };
  }

  return { allowed: true, isGlobal };
}

export async function recordFailedLoginAttempt(
  ip: string,
  kv?: any
): Promise<{ locked: boolean; remainingMinutes?: number; isGlobal: boolean }> {
  const now = Date.now();
  const key = `rate_limit_login_${ip}`;
  const isGlobal = Boolean(kv);

  let record: RateLimitRecord = kv
    ? JSON.parse((await kv.get(key)) || '{"attempts":0,"resetAt":0}')
    : memoryRateLimit.get(key) || { attempts: 0, resetAt: now + 15 * 60 * 1000 };

  if (now > record.resetAt) {
    record.attempts = 0;
    record.resetAt = now + 15 * 60 * 1000;
  }

  record.attempts += 1;
  let locked = false;

  if (record.attempts >= 5) {
    record.lockedUntil = now + 15 * 60 * 1000; // 15 min lockout
    locked = true;
  }

  if (kv) {
    try {
      await kv.put(key, JSON.stringify(record), { expirationTtl: 15 * 60 });
    } catch {
      memoryRateLimit.set(key, record);
    }
  } else {
    memoryRateLimit.set(key, record);
  }

  return {
    locked,
    remainingMinutes: locked ? 15 : undefined,
    isGlobal
  };
}

export async function clearFailedLoginAttempts(ip: string, kv?: any): Promise<void> {
  const key = `rate_limit_login_${ip}`;
  if (kv) {
    try {
      await kv.put(key, JSON.stringify({ attempts: 0, resetAt: Date.now() + 15 * 60 * 1000 }), { expirationTtl: 60 });
    } catch {
      memoryRateLimit.delete(key);
    }
  } else {
    memoryRateLimit.delete(key);
  }
}
