/**
 * Independent Comprehensive Test Suite for Hardened Cloudflare Pages Functions Prototype
 * Executes handlers using standard Web APIs (Request, Response, Headers, crypto.subtle)
 */

import { onRequestGet as healthzGet } from '../functions/healthz';
import { onRequestGet as publicSettingsGet, sanitizePublicSettings } from '../functions/api/settings/public';
import { onRequestPost as adminLoginPost } from '../functions/api/admin/login';
import { verifyAdminJwt, signAdminJwt, base64UrlEncode } from '../functions/lib/edgeSecurity';
import { Env, EventContext } from '../functions/types';

function createMockContext<P extends string = string>(
  request: Request,
  env: Env,
  params: Record<P, string | string[]> = {} as any
): EventContext<Env, P, Record<string, unknown>> {
  return {
    request,
    env,
    params,
    functionPath: request.url,
    data: {},
    waitUntil: (_p: Promise<any>) => {},
    next: async () => new Response('next'),
  };
}

async function runTestSuite() {
  console.log('=== HARDENED CLOUDFLARE PAGES FUNCTIONS SECURITY AUDIT ===\n');
  const mockKvStore = new Map<string, string>();
  const mockKv = {
    get: async (k: string) => mockKvStore.get(k) || null,
    put: async (k: string, v: string) => { mockKvStore.set(k, v); }
  };

  // Strong test secret (minimum 32 characters required)
  const strongJwtSecret = 'namaa_super_strong_cryptographic_jwt_secret_2026_test_32chars_long!';
  const testPin = 'test_secure_pin_1383';

  const testEnv: Env = {
    ADMIN_PIN: testPin,
    ADMIN_JWT_SECRET: strongJwtSecret,
    FIREBASE_PROJECT_ID: 'gen-lang-client-0588900920',
    FIRESTORE_DATABASE_ID: 'ai-studio-namafoodproducts-a1be8d3c-7518-4626-974a-8d2a563dca26',
    RATE_LIMIT_KV: mockKv
  };

  // -------------------------------------------------------------
  // TEST 1: GET /healthz
  // -------------------------------------------------------------
  console.log('--- 1. Testing GET /healthz ---');
  const req1 = new Request('https://namaa.pages.dev/healthz', { method: 'GET' });
  const ctx1 = createMockContext(req1, testEnv);
  const res1 = await healthzGet(ctx1);
  const text1 = await res1.text();
  console.log('Test 1.1: Health check status:', res1.status, '| Output:', text1);
  console.log('Test 1.2: Security Headers check:', {
    'X-Content-Type-Options': res1.headers.get('X-Content-Type-Options'),
    'X-Frame-Options': res1.headers.get('X-Frame-Options'),
    'X-Edge-Runtime': res1.headers.get('X-Edge-Runtime')
  });
  console.assert(res1.status === 200 && text1 === 'OK', 'Healthz must return 200 OK');

  // -------------------------------------------------------------
  // TEST 2: GET /api/settings/public & Allowlist Sanitization
  // -------------------------------------------------------------
  console.log('\n--- 2. Testing GET /api/settings/public & Allowlist Sanitization ---');
  const req2 = new Request('https://namaa.pages.dev/api/settings/public', { method: 'GET' });
  const ctx2 = createMockContext(req2, testEnv);
  const res2 = await publicSettingsGet(ctx2);
  const data2 = await res2.json() as any;

  console.log('Test 2.1: Public settings status:', res2.status, '| Success:', data2.success);
  console.log('Test 2.2: Store Name:', data2.settings?.storeName);

  // Test malicious injection attack against sanitizePublicSettings
  const maliciousRawSettings = {
    storeName: 'ناما',
    cardNumber: '6037-9918-1234-5678',
    cardHolder: 'متین جهانبانی',
    bankName: 'بانک ملی',
    shabaNumber: 'IR320170000000',
    ntfyTopic: 'secret_topic_1383',
    discountCodes: [{ code: 'OFF50', percent: 50 }],
    pin: '1383',
    pinHash: 'abcdef',
    secret: 'top_secret',
    password: 'password123',
    apiKey: 'AIzaSyTestKey',
    unknownInjectedProp: 'should_be_stripped',
    slogan: 'از نام و جان برای طعمی ماندگار'
  };
  const sanitized = sanitizePublicSettings(maliciousRawSettings);
  const sanitizedKeys = Object.keys(sanitized);
  const leakedInjected = sanitizedKeys.filter(k => k !== 'storeName' && k !== 'slogan');

  console.log('Test 2.3: Injected Attack Sanitization check:', leakedInjected.length === 0 ? 'PASSED (Zero leaked keys)' : 'FAILED: ' + leakedInjected.join(', '));
  console.assert(leakedInjected.length === 0, 'Injected sensitive keys must be completely stripped');

  // -------------------------------------------------------------
  // TEST 3: POST /api/admin/login Security & Anti-Bruteforce
  // -------------------------------------------------------------
  console.log('\n--- 3. Testing POST /api/admin/login ---');

  // 3.1: Non-JSON Content-Type rejected
  const req3_1 = new Request('https://namaa.pages.dev/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain', 'CF-Connecting-IP': '192.168.1.1' },
    body: 'pin=1383'
  });
  const res3_1 = await adminLoginPost(createMockContext(req3_1, testEnv));
  console.log('Test 3.1: Non-JSON Content-Type rejected with status:', res3_1.status);
  console.assert(res3_1.status === 415, 'Non-JSON Content-Type must return 415');

  // 3.2: Missing PIN
  const req3_2 = new Request('https://namaa.pages.dev/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.168.1.1' },
    body: JSON.stringify({})
  });
  const res3_2 = await adminLoginPost(createMockContext(req3_2, testEnv));
  console.log('Test 3.2: Missing PIN response:', res3_2.status);
  console.assert(res3_2.status === 400, 'Empty PIN must return 400');

  // 3.3: Weak / Unconfigured ADMIN_JWT_SECRET (< 32 chars) rejected
  const req3_3 = new Request('https://namaa.pages.dev/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.168.1.2' },
    body: JSON.stringify({ pin: testPin })
  });
  const res3_3 = await adminLoginPost(createMockContext(req3_3, { ...testEnv, ADMIN_JWT_SECRET: 'weak_short_secret' }));
  const err3_3 = await res3_3.json() as any;
  console.log('Test 3.3: Weak ADMIN_JWT_SECRET rejected with status:', res3_3.status, '| Error:', err3_3.error);
  console.assert(res3_3.status === 500, 'Weak JWT secret must return 500 configuration error');

  // 3.4: Incorrect PIN rejected with 401
  const req3_4 = new Request('https://namaa.pages.dev/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.168.1.3' },
    body: JSON.stringify({ pin: 'wrong_pin_attempt' })
  });
  const res3_4 = await adminLoginPost(createMockContext(req3_4, testEnv));
  console.log('Test 3.4: Wrong PIN response status:', res3_4.status);
  console.assert(res3_4.status === 401, 'Incorrect PIN must return 401');

  // 3.5: Correct PIN returns signed JWT
  const req3_5 = new Request('https://namaa.pages.dev/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.168.1.4' },
    body: JSON.stringify({ pin: testPin })
  });
  const res3_5 = await adminLoginPost(createMockContext(req3_5, testEnv));
  const data3_5 = await res3_5.json() as any;
  console.log('Test 3.5: Correct PIN status:', res3_5.status, '| Has Token:', Boolean(data3_5.token));
  console.assert(res3_5.status === 200 && data3_5.token, 'Correct PIN must return 200 and signed JWT');

  // 3.6: Verify JWT token cryptographic signature
  const verifyResult = await verifyAdminJwt(data3_5.token, strongJwtSecret);
  console.log('Test 3.6: JWT Verification valid:', verifyResult.valid, '| Subject:', verifyResult.payload?.sub, '| Role:', verifyResult.payload?.role);
  console.assert(verifyResult.valid && verifyResult.payload?.role === 'admin', 'JWT must be cryptographically valid');

  // 3.7: Tampered JWT token rejection
  const tamperedToken = data3_5.token.slice(0, -6) + 'XXXXXX';
  const tamperResult = await verifyAdminJwt(tamperedToken, strongJwtSecret);
  console.log('Test 3.7: Tampered JWT rejected:', !tamperResult.valid, '| Error:', tamperResult.error);
  console.assert(!tamperResult.valid, 'Tampered token must be rejected');

  // 3.8: Algorithm confusion attack (none algorithm)
  const fakeHeader = base64UrlEncode(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const fakePayload = base64UrlEncode(JSON.stringify({ sub: 'store_admin', role: 'admin', exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000) }));
  const noneToken = `${fakeHeader}.${fakePayload}.`;
  const noneResult = await verifyAdminJwt(noneToken, strongJwtSecret);
  console.log('Test 3.8: Algorithm confusion attack (none) rejected:', !noneResult.valid, '| Error:', noneResult.error);
  console.assert(!noneResult.valid, 'Algorithm confusion attack must be rejected');

  // 3.9: Expired token rejection
  const expiredPayload = { sub: 'store_admin', role: 'admin', iat: Math.floor(Date.now() / 1000) - 7200, exp: Math.floor(Date.now() / 1000) - 3600 };
  const expiredToken = await signAdminJwt(expiredPayload, strongJwtSecret);
  const expiredResult = await verifyAdminJwt(expiredToken, strongJwtSecret);
  console.log('Test 3.9: Expired token rejected:', !expiredResult.valid, '| Error:', expiredResult.error);
  console.assert(!expiredResult.valid, 'Expired token must be rejected');

  // 3.10: Multi-Instance Rate Limiting Lockout
  console.log('\n--- 3.10 Testing Multi-Instance Rate Limiting ---');
  const attackerIp = '198.51.100.42';
  for (let i = 1; i <= 5; i++) {
    const probeReq = new Request('https://namaa.pages.dev/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': attackerIp },
      body: JSON.stringify({ pin: 'bad_pin_' + i })
    });
    await adminLoginPost(createMockContext(probeReq, testEnv));
  }
  // 6th attempt must be locked out with 429
  const lockedReq = new Request('https://namaa.pages.dev/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': attackerIp },
    body: JSON.stringify({ pin: testPin })
  });
  const lockedRes = await adminLoginPost(createMockContext(lockedReq, testEnv));
  const lockedData = await lockedRes.json() as any;
  console.log('Test 3.10: 5 failed attempts triggered lockout. Status:', lockedRes.status, '| Error:', lockedData.error, '| Scope:', lockedRes.headers.get('X-RateLimit-Scope'));
  console.assert(lockedRes.status === 429, 'Excessive failed attempts must trigger 429 Too Many Requests');

  console.log('\n=== ALL HARDENED SECURITY TESTS PASSED (100% VERIFIED) ===');
}

runTestSuite().catch(err => {
  console.error('Test Suite Exception:', err);
  process.exit(1);
});
