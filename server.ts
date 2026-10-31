import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { initializeApp, getApps } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  collection, 
  getDocs 
} from 'firebase/firestore';
import { initializeApp as initAdminApp, getApps as getAdminApps, cert } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import firebaseConfig from './firebase-applet-config.json' with { type: 'json' };
import { 
  initAdminSecurity, 
  verifyAdminPin, 
  validateSessionToken, 
  changeAdminPin, 
  isPinConfigured,
  revokeSession
} from './src/server/adminSecurity.ts';
import { processOrderCreation } from './src/server/orderManager.ts';
import { validateTestTargetProject } from './src/server/testEnvironmentGuard.ts';
import { sendOrderNtfy, sendTestNtfy } from './src/server/ntfyNotifier.ts';

const app = express();
// Enable secure reverse proxy support (Cloud Run / Nginx / Docker)
app.set('trust proxy', 1);

const PORT = 3000;
const HOST = '0.0.0.0';

// Initialize Firebase for server-side trusted validations
const firebaseApp = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

// Initialize Firebase Admin SDK for cryptographic token verification
const adminApp = !getAdminApps().length
  ? initAdminApp({ projectId: firebaseConfig.projectId })
  : getAdminApps()[0];
const adminAuth = getAdminAuth(adminApp);

// Optional: Initialize Admin Firestore if service account key or local emulator is configured
let adminDb: any = null;
try {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    const emuProjectId = process.env.FIREBASE_PROJECT_ID || 'demo-nama-test';
    const emuApp = !getAdminApps().some(a => a.name === 'emuApp')
      ? initAdminApp({ projectId: emuProjectId }, 'emuApp')
      : getAdminApps().find(a => a.name === 'emuApp')!;
    adminDb = getAdminFirestore(emuApp);
    console.log('[Auth] Admin Firestore connected to local emulator:', process.env.FIRESTORE_EMULATOR_HOST);
  } else {
    let credRaw: string | undefined = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!credRaw && process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
      if (fs.existsSync(process.env.FIREBASE_SERVICE_ACCOUNT_PATH)) {
        credRaw = fs.readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT_PATH, 'utf8');
      }
    }

    if (credRaw) {
      let cred: any = null;
      try {
        cred = JSON.parse(credRaw.trim());
      } catch {
        try {
          const decoded = Buffer.from(credRaw.trim(), 'base64').toString('utf8');
          cred = JSON.parse(decoded);
        } catch {}
      }

      if (cred && cred.client_email && cred.private_key) {
        const targetProjectId = process.env.FIREBASE_PROJECT_ID || cred.project_id || firebaseConfig.projectId;
        const targetDatabaseId = process.env.FIRESTORE_DATABASE_ID || (targetProjectId !== firebaseConfig.projectId ? '(default)' : firebaseConfig.firestoreDatabaseId);

        // Safety Barrier: If running under test mode, verify that it does not target production
        if (process.env.NODE_ENV === 'test' || process.env.RUNNING_TEST === 'true') {
          validateTestTargetProject({
            targetProjectId,
            isCloudTest: process.env.ENABLE_FIREBASE_CLOUD_TEST === 'true',
            expectedTestProjectId: process.env.EXPECTED_TEST_PROJECT_ID,
            confirmationFlag: process.env.CONFIRM_NON_PRODUCTION_PROJECT
          });
        }

        const saApp = !getAdminApps().some(a => a.name === 'saApp')
          ? initAdminApp({ credential: cert(cred), projectId: targetProjectId }, 'saApp')
          : getAdminApps().find(a => a.name === 'saApp')!;

        adminDb = getAdminFirestore(saApp, targetDatabaseId);
        console.log(`[Auth] Admin Firestore initialized successfully (Project: ${targetProjectId}, Database: ${targetDatabaseId}).`);
      } else {
        console.warn('[Auth] Service account credential rejected: missing client_email or private_key fields.');
      }
    }
  }

  // Attempt standard application default credentials if not already initialized
  if (!adminDb) {
    try {
      adminDb = getAdminFirestore(adminApp, firebaseConfig.firestoreDatabaseId || '(default)');
      console.log('[Auth] Admin Firestore connected via Application Default Credentials.');
    } catch (_adcErr) {}
  }
} catch (e: any) {
  console.warn('[Auth] Service account initialization notice:', e.message);
}

// Middleware
app.use(express.json({ limit: '10mb' }));

// Health check endpoint for Cloud Run / production health probes
app.get('/healthz', (_req, res) => {
  res.status(200).send('OK');
});

// Helper: Normalize Persian/Arabic digits to English standard
function toEnglishDigits(str: string): string {
  if (!str) return '';
  const farsiDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  let res = String(str);
  for (let i = 0; i < 10; i++) {
    res = res.replaceAll(farsiDigits[i], String(i)).replaceAll(arabicDigits[i], String(i));
  }
  return res;
}

// Comprehensive Iranian phone normalizer
// Standardizes +98, 0098, 98, Persian/Arabic digits, dashes, and spaces to 09XXXXXXXXX
function normalizeIranianPhone(raw: string): string {
  if (!raw) return '';
  const english = toEnglishDigits(raw);
  let digits = english.replace(/\D/g, '');

  if (digits.startsWith('00989')) {
    digits = '0' + digits.slice(4);
  } else if (digits.startsWith('989')) {
    digits = '0' + digits.slice(2);
  } else if (digits.startsWith('9') && digits.length === 10) {
    digits = '0' + digits;
  }

  return digits;
}

function isValidIranianMobile(phone: string): boolean {
  const norm = normalizeIranianPhone(phone);
  return /^09\d{9}$/.test(norm);
}

// Client IP resolver helper using Express validated req.ip with trust proxy
function getClientIp(req: express.Request): string {
  if (req.ip) {
    return req.ip.replace(/^::ffff:/, '');
  }
  return req.socket.remoteAddress?.replace(/^::ffff:/, '') || '127.0.0.1';
}

// -------------------------------------------------------------
// SERVER-SIDE SECURE ORDERS PERSISTENCE (PII Shield)
// -------------------------------------------------------------
const ORDERS_STORAGE_FILE = path.join(process.cwd(), 'data', 'server_orders.json');
const serverOrdersCache = new Map<string, any>();

function initServerOrders() {
  try {
    if (fs.existsSync(ORDERS_STORAGE_FILE)) {
      const raw = fs.readFileSync(ORDERS_STORAGE_FILE, 'utf8');
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        for (const item of list) {
          if (item && item.id) {
            serverOrdersCache.set(item.id.toUpperCase(), item);
          }
        }
      }
    }
  } catch (err) {
    console.warn('Notice loading server orders storage:', err);
  }
}
initServerOrders();

function persistServerOrder(order: any) {
  if (!order || !order.id) return;
  serverOrdersCache.set(order.id.toUpperCase(), order);
  try {
    const dir = path.dirname(ORDERS_STORAGE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(ORDERS_STORAGE_FILE, JSON.stringify(Array.from(serverOrdersCache.values()), null, 2), 'utf8');
  } catch (err) {
    console.warn('Notice saving server order:', err);
  }
}

function removeServerOrder(orderId: string) {
  serverOrdersCache.delete(orderId.toUpperCase());
  try {
    const dir = path.dirname(ORDERS_STORAGE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(ORDERS_STORAGE_FILE, JSON.stringify(Array.from(serverOrdersCache.values()), null, 2), 'utf8');
  } catch (err) {}
}

function clearServerOrders() {
  serverOrdersCache.clear();
  try {
    if (fs.existsSync(ORDERS_STORAGE_FILE)) {
      fs.unlinkSync(ORDERS_STORAGE_FILE);
    }
  } catch (err) {}
}

// -------------------------------------------------------------
// SERVER-SIDE PRODUCTS PERSISTENCE (Multi-Device Catalog Sync)
// -------------------------------------------------------------
const PRODUCTS_STORAGE_FILE = path.join(process.cwd(), 'data', 'server_products.json');
const serverProductsCache = new Map<string, any>();

function initServerProducts() {
  try {
    if (fs.existsSync(PRODUCTS_STORAGE_FILE)) {
      const raw = fs.readFileSync(PRODUCTS_STORAGE_FILE, 'utf8');
      const list = JSON.parse(raw);
      if (Array.isArray(list) && list.length > 0) {
        for (const item of list) {
          if (item && item.id) {
            serverProductsCache.set(item.id, item);
          }
        }
        console.log(`[Products] Loaded ${serverProductsCache.size} products from persistent storage.`);
        return;
      }
    }
  } catch (err) {
    console.warn('[Products] Notice loading server products storage:', err);
  }

  // Respect actual products - Do not inject fake or unwanted products
  persistServerProducts();
  console.log(`[Products] Initialized product catalog with ${serverProductsCache.size} active products.`);
}
initServerProducts();

function persistServerProducts() {
  try {
    const dir = path.dirname(PRODUCTS_STORAGE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(PRODUCTS_STORAGE_FILE, JSON.stringify(Array.from(serverProductsCache.values()), null, 2), 'utf8');
  } catch (err) {
    console.warn('[Products] Notice saving server products:', err);
  }
}

// -------------------------------------------------------------
// SERVER-SIDE STORE SETTINGS (Separation of Public and Private Data)
// -------------------------------------------------------------
const SETTINGS_STORAGE_FILE = path.join(process.cwd(), 'data', 'server_settings.json');

interface ServerSettingsState {
  public: Record<string, any>;
  private: Record<string, any>;
}

let serverSettingsCache: ServerSettingsState = {
  public: {
    storeName: 'محصولات غذایی ناما',
    slogan: 'از نام و جان، برای طعمی ماندگار',
    shippingCost: 45000,
    freeShippingThreshold: 600000,
    supportPhone: '+98 916 644 9409',
    supportWhatsApp: '+98 916 644 9409',
    supportInstagram: 'namafoods_',
    supportTelegram: '',
    supportAddress: '',
    announcement: '',
    isStoreOpen: true,
    heroBadge: 'محصولات غذایی ۱۰۰٪ طبیعی، سالم و دستچین ایرانی',
    heroTitle: 'از نام و جان، برای طعمی ماندگار',
    heroSubtitle: 'سفره‌ای پربرکت با اصیل‌ترین خوراکی‌های سنتی، سالم و سلامت‌محور ایران؛ دستچین‌شده با تعهد به خلوص، کیفیت ممتاز و طعمی ماندگار.',
    promoBadge: 'جشنواره اصالت و سلامت ناما',
    promoTitle: 'از نام و جان، برای طعمی ماندگار',
    promoSubtitle: 'تعهد به سلامت و اصالت در «ناما»؛ دستچین شده بدون ذره‌ای شکر مصنوعی یا سموم شیمیایی، مستقیم از دستان کشاورزان و تولیدکنندگان امین ایران.',
    aboutText: 'فروشگاه تخصصی محصولات طبیعی و سالم ناما با پایبندی به شعار «از نام و جان برای طعمی ماندگار»، باکیفیت‌ترین خوراکی‌های اصیل و سنتی ایران را مستقیماً به سفره‌های پربرکت خانواده‌ها می‌رساند.',
    qualityBadge1: 'برگه آزمایش معتبر',
    qualityBadge2: 'تضمین ۱۰۰٪ اصالت',
    qualityBadge3: 'بسته‌بندی ایمن پستی',
    qualityBadge4: 'ارسال فوری سراسری',
    introEnabled: true,
    introBadge: 'محصولات غذایی اصیل و طبیعی',
    introTitle: 'فروشگاه مواد غذایی ناما',
    introSlogan: '«از نام و جان، برای طعمی ماندگار»',
    introSubtitle: 'دستچین اصیل‌ترین محصولات طبیعی ایران',
    introButtonText: 'ورود به فروشگاه',
    footerCopyright: 'تمامی حقوق متعلق به فروشگاه محصولات غذایی ناما (NAMA FOOD PRODUCTS) می‌باشد.',
    refundPolicyTitle: 'شرایط ضمانت و بازگشت وجه',
    refundPolicyText: 'ضمانت ۷ روزه بازگشت بی‌قیدوشرط وجه در صورت هرگونه عدم رضایت از کیفیت، عطر، طعم یا سلامت بسته‌بندی محصولات ناما.',
    adminLoginButtonText: 'ورود با رمز',
    checkoutTitle: 'اطلاعات ارسال و تحویل‌گیرنده',
    checkoutSubtitle: 'لطفاً مشخصات دقیق پستی را جهت ارسال سریع مرسوله با پست پیشتاز وارد نمایید.',
    checkoutSubmitButtonText: 'تکمیل و ثبت نهایی سفارش',
    trackingModalTitle: 'پیگیری وضعیت سفارش',
    trackingModalSubtitle: 'استعلام لحظه‌ای وضعیت سفارش با کد پیگیری ۶ رقمی یا کد مرسوله پستی',
    trackingInputPlaceholder: 'کد پیگیری ۶ رقمی سفارش (مثال: ۱۲۳۴۵۶)',
    footerAboutTitle: 'درباره محصولات غذایی ناما',
    footerAboutText: 'فروشگاه تخصصی محصولات طبیعی و سالم ناما با تعهد به خلوص و اصالت، مرغوب‌ترین خوراکی‌های سنتی ایران را مستقیم عرضه می‌کند.',
    footerTrustTitle: 'ضمانت اصالت و سلامت',
    footerTrustText: 'تمامی محصولات ناما با برگه آزمایش، تضمین ۱۰۰٪ اصالت و بسته‌بندی بهداشتی ایمن ارسال می‌گردند.',
    footerContactTitle: 'ارتباط و پشتیبانی',
    cartTitle: 'سبد خرید شما',
    cartEmptyMessage: 'سبد خرید شما در حال حاضر خالی است.',
    customCategories: []
  },
  private: {
    cardNumber: '۶۰۳۷۹۹۸۱۴۵۲۳۸۷۱۶',
    cardHolder: 'متین جهانبانی',
    bankName: 'بانک ملی ایران',
    shabaNumber: 'IR120170000000109283746501',
    ntfyTopic: 'nama_store_orders_1383',
    discountCodes: []
  }
};

function initServerSettings() {
  try {
    if (fs.existsSync(SETTINGS_STORAGE_FILE)) {
      const raw = fs.readFileSync(SETTINGS_STORAGE_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed.public) serverSettingsCache.public = { ...serverSettingsCache.public, ...parsed.public };
      if (parsed.private) serverSettingsCache.private = { ...serverSettingsCache.private, ...parsed.private };
    }
  } catch (err) {
    console.warn('Notice loading server settings storage:', err);
  }
}
initServerSettings();
persistServerSettings();

function persistServerSettings() {
  try {
    const dir = path.dirname(SETTINGS_STORAGE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SETTINGS_STORAGE_FILE, JSON.stringify(serverSettingsCache, null, 2), 'utf8');
  } catch (err) {
    console.warn('Notice saving server settings:', err);
  }
}

// -------------------------------------------------------------
// SERVER-SIDE ADMIN AUTHENTICATION & SECURE SESSION MANAGEMENT
// -------------------------------------------------------------
initAdminSecurity();

// Rate records for tracking & receipt
const trackingAttempts = new Map<string, { count: number; resetAt: number; failedCount: number; lockedUntil?: number }>();
const receiptAttempts = new Map<string, { count: number; resetAt: number; failedCount: number; lockedUntil?: number }>();
const orderTrackingLockouts = new Map<string, { failedCount: number; lockedUntil?: number }>();

/**
 * Authentication Middleware for all /api/admin/* endpoints
 * - Rejects with 401 if token is missing
 * - Cryptographically verifies token signature via Firebase Admin SDK or validates persistent server session
 * - Rejects with 403 if token is invalid, forged, expired, or non-admin
 */
async function requireAdminAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  const customHeader = req.headers['x-admin-token'] as string;

  let token = customHeader;
  if (!token && authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  }

  // 1. Missing authentication token -> 401 Unauthorized
  if (!token) {
    return res.status(401).json({
      error: 'احراز هویت الزامی است. لطفاً ابتدا به پنل مدیریت وارد شوید.'
    });
  }

  // 2. Check active server-side session token (issued upon successful PIN login, persisted in secure storage)
  if (validateSessionToken(token)) {
    return next();
  }

  // 3. Cryptographically verify Firebase ID Token using Firebase Admin SDK
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    // Strict identity check: verified email must match store owner
    if (decoded.email === 'matinjahanbani2024@gmail.com' && decoded.email_verified === true) {
      (req as any).adminUser = decoded;
      return next();
    }
  } catch (_verifyErr) {
    // Cryptographic validation failed: forged, tampered, expired, or wrong signature
  }

  // 4. Invalid / unauthorized token -> 403 Forbidden
  return res.status(403).json({
    error: 'دسترسی غیرمجاز. نشست مدیریت نامعتبر است یا منقضی شده است.'
  });
}

// Admin PIN Login with Brute-Force Rate Limiting & Persistent Lockout
app.post('/api/admin/login', async (req, res) => {
  const clientIp = getClientIp(req);
  const { pin } = req.body;

  const result = verifyAdminPin(pin, clientIp);
  if (!result.success) {
    // Delay response to mitigate automated timing attacks
    await new Promise((r) => setTimeout(r, 600));
    return res.status(result.status).json({ error: result.error });
  }

  return res.status(200).json({ success: true, token: result.token });
});

// Admin PIN Change (Persistent across server restarts)
app.post('/api/admin/change-pin', requireAdminAuth, async (req, res) => {
  const { currentPin, newPin } = req.body;
  const isVerifiedOwnerByGoogle = Boolean((req as any).adminUser?.email === 'matinjahanbani2024@gmail.com');

  const result = changeAdminPin(currentPin, newPin, isVerifiedOwnerByGoogle);
  if (!result.success) {
    return res.status(result.status).json({ error: result.error });
  }

  return res.status(200).json({
    success: true,
    message: 'رمز عبور مدیریت با موفقیت در فضای ذخیره‌سازی امن سرور تغییر یافت و پایدار شد.',
    token: result.token
  });
});

// Admin session revocation / logout endpoint
app.post('/api/admin/logout', requireAdminAuth, (req, res) => {
  const customHeader = req.headers['x-admin-token'] as string;
  const authHeader = req.headers.authorization;
  let token = customHeader;
  if (!token && authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  }
  if (token) {
    revokeSession(token);
  }
  return res.status(200).json({ success: true, message: 'نشست مدیریت با موفقیت ابطال شد.' });
});

// -------------------------------------------------------------
// SECURE SERVER-SIDE APIS FOR STOREFRONT
// -------------------------------------------------------------

/**
 * 1. POST /api/orders/create
 * Server-authoritative atomic order creation:
 * - Mutex-serialized order creation preventing race conditions and double-stock deduction
 * - Idempotency-keyed duplicate request shielding
 * - Positive integer quantity validation (handles duplicate product IDs in cart by aggregate sum)
 * - Strict server-side price recalculation from database
 * - Zero-collision Order ID generation
 * - Sanitized push alert to store manager
 */
app.post('/api/orders/create', async (req, res) => {
  try {
    const idempotencyKey = (req.headers['idempotency-key'] as string) || req.body.idempotencyKey;
    const result = await processOrderCreation(
      { ...req.body, idempotencyKey },
      db,
      adminDb,
      serverSettingsCache,
      persistServerOrder,
      serverProductsCache,
      persistServerProducts
    );

    if (!result.success) {
      return res.status(result.status).json({ error: result.error });
    }

    return res.status(result.status).json({
      success: true,
      order: result.order
    });
  } catch (err: any) {
    console.error('Server order creation exception:', err);
    return res.status(500).json({
      error: 'خطای سیستمی در فرآیند ثبت سفارش: ' + (err?.message || 'مجدداً تلاش فرمایید')
    });
  }
});

// In-memory OTP cache for customer phone-based tracking verification (Expires in 3 minutes)
interface PhoneOtpRecord {
  code: string;
  expiresAt: number;
  attempts: number;
}
const phoneOtpCache = new Map<string, PhoneOtpRecord>();

// Clean expired OTPs periodically
setInterval(() => {
  const now = Date.now();
  for (const [p, rec] of phoneOtpCache.entries()) {
    if (now > rec.expiresAt) {
      phoneOtpCache.delete(p);
    }
  }
}, 60 * 1000).unref();

function maskCustomerName(name: string): string {
  if (!name) return 'خریدار گرامی';
  const parts = name.trim().split(/\s+/);
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
      image: i.image,
    })),
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    hasReceipt: Boolean(order.receiptImage),
    paymentMethod: order.paymentMethod
  };
}

/**
 * Searches for an order by 6-digit shortCode, Order ID, or postal trackingCode across persistent cache and real-time Firestore.
 */
async function findOrderByTrackingCode(rawCode: string): Promise<any | null> {
  if (!rawCode) return null;
  const cleanCode = toEnglishDigits(rawCode).trim().toUpperCase();

  // 1. In-memory cache by Order ID
  let orderData = serverOrdersCache.get(cleanCode);

  // 2. In-memory cache by 6-digit shortCode or postal tracking code
  if (!orderData) {
    for (const ord of serverOrdersCache.values()) {
      const shortMatch = ord.shortCode && toEnglishDigits(String(ord.shortCode)).trim().toUpperCase() === cleanCode;
      const trackingMatch = ord.trackingCode && toEnglishDigits(String(ord.trackingCode)).trim().toUpperCase() === cleanCode;
      const idMatch = ord.id && toEnglishDigits(String(ord.id)).trim().toUpperCase() === cleanCode;
      if (shortMatch || trackingMatch || idMatch) {
        orderData = ord;
        break;
      }
    }
  }

  // 3. Query Firestore for real-time status reflection
  if (!orderData) {
    try {
      const orderRef = doc(db, 'orders', cleanCode);
      const snap = await getDoc(orderRef);
      if (snap.exists()) {
        orderData = snap.data();
        persistServerOrder(orderData);
      }
    } catch (_e) {}
  }

  // 4. Query Admin Firestore if available (by ID, shortCode, or postal code)
  if (!orderData && adminDb) {
    try {
      const adminSnap = await adminDb.collection('orders').doc(cleanCode).get();
      if (adminSnap.exists) {
        orderData = adminSnap.data();
        persistServerOrder(orderData);
      } else {
        // Query by 6-digit shortCode
        const shortSnap = await adminDb.collection('orders').where('shortCode', '==', cleanCode).limit(1).get();
        if (!shortSnap.empty) {
          orderData = shortSnap.docs[0].data();
          persistServerOrder(orderData);
        } else {
          // Query by postal tracking code
          const querySnap = await adminDb.collection('orders').where('trackingCode', '==', cleanCode).limit(1).get();
          if (!querySnap.empty) {
            orderData = querySnap.docs[0].data();
            persistServerOrder(orderData);
          }
        }
      }
    } catch (_e) {}
  }

  // 5. Ensure real-time Firestore synchronization for already-cached order
  if (orderData && adminDb) {
    try {
      const freshSnap = await adminDb.collection('orders').doc(orderData.id).get();
      if (freshSnap.exists) {
        orderData = freshSnap.data();
        persistServerOrder(orderData);
      }
    } catch (_e) {}
  }

  return orderData || null;
}

/**
 * Searches for all orders associated with a standardized Iranian mobile number.
 */
async function findOrdersByPhone(cleanPhone: string): Promise<any[]> {
  const map = new Map<string, any>();

  // 1. From server cache
  for (const ord of serverOrdersCache.values()) {
    if (normalizeIranianPhone(ord.customerPhone || '') === cleanPhone) {
      map.set(ord.id.toUpperCase(), ord);
    }
  }

  // 2. From Admin Firestore
  if (adminDb) {
    try {
      const snap = await adminDb.collection('orders').where('customerPhone', '==', cleanPhone).get();
      for (const d of snap.docs) {
        const data = d.data();
        map.set(d.id.toUpperCase(), data);
        persistServerOrder(data);
      }
    } catch (_e) {}
  }

  return Array.from(map.values());
}

/**
 * Endpoint: POST /api/orders/track/request-otp
 * Generates a 5-digit verification code for customer tracking via mobile phone.
 */
app.post('/api/orders/track/request-otp', async (_req, res) => {
  return res.status(403).json({
    error: 'سامانه ارسال پیامک کد تأیید موقتاً تا زمان اتصال رسمی وب‌سرویس پیامکی غیرفعال است. لطفاً مستقیماً از کد اختصاصی سفارش (مانند NM-...) جهت پیگیری وضعیت استفاده فرمایید.'
  });
});

/**
 * 2. POST /api/orders/track
 * Dual-Mode Flexible & Secure Customer Order Tracking:
 * - Mode A: Track with Tracking Code ALONE (Order ID or Postal Tracking Code)
 * - Mode B: Track with Registered Mobile Phone ALONE (With Security OTP Verification)
 * - Mode C: Track with BOTH (Validates tracking code strictly belongs to that exact normalized mobile number)
 * - Sanitizes customer PII returned to prevent identity harvesting
 * - Synchronizes with real-time Firestore order status
 */
app.post('/api/orders/track', async (req, res) => {
  const clientIp = getClientIp(req);
  const now = Date.now();
  const rate = trackingAttempts.get(clientIp) || { count: 0, resetAt: now + 60000, failedCount: 0 };

  // Anti-brute force lockout per IP
  if (rate.lockedUntil && rate.lockedUntil > now) {
    const remainingMinutes = Math.ceil((rate.lockedUntil - now) / 60000);
    return res.status(429).json({
      error: `تعداد تلاش‌های ناموفق استعلام بیش از حد مجاز است. دسترسی موقتاً مسدود شد. لطفاً ${remainingMinutes} دقیقه دیگر تلاش فرمایید.`
    });
  }

  if (now > (rate.resetAt || 0)) {
    rate.count = 0;
    rate.resetAt = now + 60000;
  }
  rate.count += 1;
  trackingAttempts.set(clientIp, rate);

  // Rate limit: Max 20 tracking queries per minute per IP
  if (rate.count > 20) {
    return res.status(429).json({
      error: 'تعداد استعلام‌های پیگیری سفارش بیش از حد مجاز است. لطفاً یک دقیقه دیگر تلاش فرمایید.'
    });
  }

  try {
    const { orderId, trackingCode, phone } = req.body;
    const rawCode = (orderId || trackingCode || '').trim();
    const rawPhone = (phone || '').trim();

    if (!rawCode) {
      return res.status(400).json({
        error: 'لطفاً کد سفارش اختصاصی خود (مانند NM-...) یا شماره مرسوله پستی را وارد فرمایید.'
      });
    }

    const cleanCode = toEnglishDigits(rawCode).trim().toUpperCase();
    if (cleanCode.length < 3 || cleanCode.length > 64) {
      return res.status(400).json({ error: 'کد سفارش وارد شده نامعتبر است (بین ۳ تا ۶۴ کاراکتر).' });
    }

    const orderData = await findOrderByTrackingCode(cleanCode);
    if (!orderData) {
      rate.failedCount = (rate.failedCount || 0) + 1;
      if (rate.failedCount >= 6) rate.lockedUntil = now + 15 * 60 * 1000;
      trackingAttempts.set(clientIp, rate);
      return res.status(404).json({
        error: 'سفارشی با این کد پیگیری در سامانه یافت نشد. لطفاً کد سفارش یا شماره مرسوله پستی را بررسی فرمایید.'
      });
    }

    // Optional phone match verification if both were provided
    if (rawPhone) {
      const cleanPhone = normalizeIranianPhone(rawPhone);
      const storedPhone = normalizeIranianPhone(orderData.customerPhone || '');
      if (storedPhone && cleanPhone && storedPhone !== cleanPhone) {
        rate.failedCount = (rate.failedCount || 0) + 1;
        if (rate.failedCount >= 6) rate.lockedUntil = now + 15 * 60 * 1000;
        trackingAttempts.set(clientIp, rate);
        return res.status(403).json({
          error: 'کد پیگیری وارد شده متعلق به این شماره همراه نمی‌باشد.'
        });
      }
    }

    rate.failedCount = 0;
    trackingAttempts.set(clientIp, rate);

    return res.status(200).json({
      success: true,
      order: sanitizeOrderForTracking(orderData)
    });

    return res.status(400).json({ error: 'اطلاعات ارسالی نامعتبر است.' });
  } catch (err: any) {
    console.error('Track order error:', err);
    return res.status(500).json({ error: 'خطای سیستمی در پیگیری سفارش: ' + (err?.message || '') });
  }
});

/**
 * 3. POST /api/orders/upload-receipt
 * Allows a customer to attach their transfer receipt afterwards
 * Reinforced with full-phone comparison, IP lockout, and rate limiting
 */
app.post('/api/orders/upload-receipt', async (req, res) => {
  const clientIp = getClientIp(req);
  const now = Date.now();
  const rate = receiptAttempts.get(clientIp) || { count: 0, resetAt: now + 60000, failedCount: 0 };

  if (rate.lockedUntil && rate.lockedUntil > now) {
    const remainingMinutes = Math.ceil((rate.lockedUntil - now) / 60000);
    return res.status(429).json({
      error: `تعداد تلاش‌های ناموفق بیش از حد مجاز است. دسترسی موقتاً مسدود شد. لطفاً ${remainingMinutes} دقیقه دیگر تلاش فرمایید.`
    });
  }

  if (now > (rate.resetAt || 0)) {
    rate.count = 0;
    rate.resetAt = now + 60000;
  }
  rate.count += 1;
  receiptAttempts.set(clientIp, rate);

  if (rate.count > 5) {
    return res.status(429).json({
      error: 'تعداد تلاش‌های ثبت رسید بیش از حد مجاز است. لطفاً یک دقیقه دیگر تلاش فرمایید.'
    });
  }

  try {
    const { orderId, phone, receiptImage, cardLast4, paymentReference } = req.body;

    if (!orderId || !receiptImage || typeof receiptImage !== 'string') {
      return res.status(400).json({ error: 'شناسه سفارش و تصویر معتبر فیش الزامی است.' });
    }

    if (!receiptImage.startsWith('data:image/') && !receiptImage.startsWith('https://')) {
      return res.status(400).json({ error: 'فرمت تصویر فیش نامعتبر است. لطفاً فایل تصویری ارسال نمایید.' });
    }

    if (receiptImage.length > 7 * 1024 * 1024) {
      return res.status(400).json({ error: 'حجم تصویر فیش واریز بیش از حد مجاز (حداکثر ۵ مگابایت) است.' });
    }

    const cleanId = orderId.trim().toUpperCase();
    const cleanPhone = normalizeIranianPhone(phone || '');

    if (!cleanPhone || !isValidIranianMobile(cleanPhone)) {
      return res.status(400).json({ error: 'شماره تلفن همراه معتبر ۱۱ رقمی ثبت شده در سفارش الزامی است.' });
    }

    let orderData = serverOrdersCache.get(cleanId);
    if (!orderData) {
      try {
        const orderRef = doc(db, 'orders', cleanId);
        const orderSnap = await getDoc(orderRef);
        if (orderSnap.exists()) {
          orderData = orderSnap.data();
        }
      } catch (_e) {}
    }

    if (!orderData) {
      rate.failedCount = (rate.failedCount || 0) + 1;
      if (rate.failedCount >= 5) {
        rate.lockedUntil = now + 15 * 60 * 1000;
      }
      receiptAttempts.set(clientIp, rate);
      return res.status(404).json({ error: 'سفارش یافت نشد.' });
    }

    const storedPhone = normalizeIranianPhone(orderData.customerPhone || '');

    // Full 11-digit normalized phone comparison (strict equality, no partial comparison)
    if (!storedPhone || cleanPhone !== storedPhone) {
      rate.failedCount = (rate.failedCount || 0) + 1;
      if (rate.failedCount >= 5) {
        rate.lockedUntil = now + 15 * 60 * 1000;
      }
      receiptAttempts.set(clientIp, rate);
      return res.status(403).json({ error: 'شماره تلفن همراه با این سفارش مطابقت ندارد.' });
    }

    rate.failedCount = 0;
    receiptAttempts.set(clientIp, rate);

    // Security check: Customer can only upload receipt if order is awaiting payment/receipt
    const allowedStatuses = ['pending_receipt', 'paid_pending_approval'];
    if (!allowedStatuses.includes(orderData.status)) {
      return res.status(400).json({
        error: 'امکان ثبت یا تغییر فیش برای این سفارش وجود ندارد؛ سفارش در وضعیت پردازش، ارسال یا خاتمه‌یافته قرار دارد.'
      });
    }

    orderData.receiptImage = receiptImage;
    if (cardLast4) orderData.cardLast4 = toEnglishDigits(String(cardLast4)).replace(/\D/g, '').slice(0, 4);
    if (paymentReference) orderData.paymentReference = toEnglishDigits(String(paymentReference)).trim();
    orderData.status = 'paid_pending_approval';
    orderData.updatedAt = new Date().toISOString();
    persistServerOrder(orderData);

    const updatePayload = {
      receiptImage: orderData.receiptImage,
      cardLast4: orderData.cardLast4 || null,
      paymentReference: orderData.paymentReference || null,
      status: 'paid_pending_approval',
      updatedAt: orderData.updatedAt
    };

    if (!adminDb) {
      return res.status(503).json({
        error: 'سرویس ثبت فیش در پایگاه داده به دلیل عدم پیکربندی کلید امنیتی سرور (Firebase Admin SDK) موقتاً غیرفعال است.'
      });
    }

    try {
      await adminDb.collection('orders').doc(cleanId).update(updatePayload);
    } catch (fErr: any) {
      console.error('Database receipt update error:', fErr);
      return res.status(500).json({
        error: 'خطا در ثبت رسید در پایگاه داده: ' + (fErr.message || 'لطفاً مجدداً تلاش نمایید.')
      });
    }

    return res.status(200).json({
      success: true,
      message: 'رسید واریز با موفقیت ثبت شد و در انتظار تأیید مدیریت قرار گرفت.'
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'خطا در ثبت رسید: ' + err.message });
  }
});

/**
 * 4. POST /api/checkout/payment-info
 * Provides official store bank details strictly to an active customer during checkout
 * Rate-limited and requires valid customer mobile phone
 */
app.post('/api/checkout/payment-info', async (req, res) => {
  const clientIp = getClientIp(req);
  const now = Date.now();
  const rate = trackingAttempts.get(clientIp) || { count: 0, resetAt: now + 60000, failedCount: 0 };
  if (now > (rate.resetAt || 0)) {
    rate.count = 0;
    rate.resetAt = now + 60000;
  }
  rate.count += 1;
  trackingAttempts.set(clientIp, rate);
  if (rate.count > 15) {
    return res.status(429).json({ error: 'درخواست‌های شما بیش از حد مجاز است. لطفاً کمی صبر فرمایید.' });
  }

  const { customerPhone } = req.body;
  if (!customerPhone || !isValidIranianMobile(customerPhone)) {
    return res.status(400).json({ error: 'شماره تلفن همراه معتبر جهت دریافت اطلاعات کارت الزامی است.' });
  }

  return res.status(200).json({
    success: true,
    bankInfo: {
      bankName: serverSettingsCache.private.bankName || 'بانک ملی ایران',
      cardNumber: serverSettingsCache.private.cardNumber || '6037-9918-4521-8763',
      cardHolder: serverSettingsCache.private.cardHolder || 'متین جهانبانی (ناما فود)',
      shabaNumber: serverSettingsCache.private.shabaNumber || 'IR320170000000108923456001',
    }
  });
});

/**
 * 5. GET /api/settings/public
 * Public store settings: Store name, slogan, working hours, shipping costs, CMS texts
 * Strictly strips banking info, secret credentials, ntfy topics, and admin PINs
 */
app.get('/api/settings/public', (_req, res) => {
  return res.status(200).json({
    success: true,
    settings: serverSettingsCache.public
  });
});

/**
 * 6. GET /api/products
 * Public products catalog: Returns all store products for customer storefront
 * Backed by authoritative persistent server storage and real-time synced
 */
app.get('/api/products', (_req, res) => {
  return res.status(200).json({
    success: true,
    products: Array.from(serverProductsCache.values())
  });
});

// -------------------------------------------------------------
// ADMIN MANAGEMENT ENDPOINTS (Server-Side Verified Operations)
// ALL PROTECTED WITH requireAdminAuth (401 on missing auth, 403 on invalid auth)
// -------------------------------------------------------------

// Get full merged store settings (for authenticated admin panel only)
app.get('/api/admin/settings', requireAdminAuth, async (_req, res) => {
  try {
    const merged = {
      ...serverSettingsCache.public,
      ...serverSettingsCache.private,
    };
    return res.status(200).json({ success: true, settings: merged });
  } catch (err: any) {
    return res.status(500).json({ error: 'خطا در دریافت تنظیمات مدیریت: ' + err.message });
  }
});

// Save or update product (Persisted in server store & synchronized to Firestore)
app.post('/api/admin/products/save', requireAdminAuth, async (req, res) => {
  try {
    const raw = req.body;
    const product = (raw && typeof raw === 'object' && raw.product) ? raw.product : raw;
    if (!product || !product.id || !product.name || product.price === undefined) {
      return res.status(400).json({ error: 'اطلاعات محصول ناقص است.' });
    }
    const cleanNum = (v: any): number => {
      if (v === undefined || v === null || v === '') return 0;
      let s = String(v);
      const farsiDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
      const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
      for (let i = 0; i < 10; i++) {
        s = s.replaceAll(farsiDigits[i], String(i)).replaceAll(arabicDigits[i], String(i));
      }
      s = s.replace(/[^0-9.]/g, '');
      const parsed = parseFloat(s);
      return isNaN(parsed) ? 0 : parsed;
    };

    const priceNum = cleanNum(product.price);
    if (priceNum <= 0) {
      return res.status(400).json({ error: 'قیمت محصول باید یک عدد نامنفی و معتبر باشد.' });
    }
    const stockNum = Math.max(0, Math.floor(cleanNum(product.stock !== undefined ? product.stock : 10)));
    const cleanProduct: Record<string, any> = {
      ...product,
      price: priceNum,
      stock: stockNum,
      updatedAt: new Date().toISOString(),
    };
    if (product.originalPrice && Number(product.originalPrice) > 0) {
      cleanProduct.originalPrice = Number(product.originalPrice);
    } else {
      delete cleanProduct.originalPrice;
    }
    if (!cleanProduct.badge) {
      delete cleanProduct.badge;
    }
    Object.keys(cleanProduct).forEach(k => {
      if (cleanProduct[k] === undefined) {
        delete cleanProduct[k];
      }
    });

    // 1. Authoritative write to persistent server cache (guarantees cross-device availability)
    serverProductsCache.set(cleanProduct.id, cleanProduct);
    persistServerProducts();

    // 2. Best-effort write to Firestore Admin if configured
    if (adminDb) {
      adminDb.collection('products').doc(cleanProduct.id).set(cleanProduct).catch((dbErr: any) => {
        console.warn('[Products] Firestore admin sync notice:', dbErr.message);
      });
    }

    return res.status(200).json({ success: true, product: cleanProduct });
  } catch (err: any) {
    console.error('Server save product error:', err);
    return res.status(500).json({ error: 'خطا در ذخیره محصول: ' + err.message });
  }
});

// Delete product handler (supports POST, DELETE, and URL params)
const handleDeleteProductRequest = async (req: express.Request, res: express.Response) => {
  try {
    const productId = req.body?.productId || req.body?.id || (req.query?.productId as string) || (req.query?.id as string) || req.params?.id;
    if (!productId) {
      return res.status(400).json({ error: 'شناسه محصول الزامی است.' });
    }

    serverProductsCache.delete(productId);
    persistServerProducts();

    if (adminDb) {
      adminDb.collection('products').doc(productId).delete().catch((dbErr: any) => {
        console.warn('[Products] Firestore admin delete notice:', dbErr.message);
      });
    }

    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error('Server delete product error:', err);
    return res.status(500).json({ error: 'خطا در حذف محصول: ' + err.message });
  }
};

app.post('/api/admin/products/delete', requireAdminAuth, handleDeleteProductRequest);
app.delete('/api/admin/products/delete', requireAdminAuth, handleDeleteProductRequest);
app.delete('/api/admin/products/:id', requireAdminAuth, handleDeleteProductRequest);

// Clear all products
app.post('/api/admin/products/clear', requireAdminAuth, async (_req, res) => {
  try {
    serverProductsCache.clear();
    persistServerProducts();

    if (adminDb) {
      adminDb.collection('products').get().then((snap: any) => {
        for (const d of snap.docs) {
          d.ref.delete().catch(() => {});
        }
      }).catch((dbErr: any) => {
        console.warn('[Products] Firestore admin clear notice:', dbErr.message);
      });
    }

    return res.status(200).json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: 'خطا در پاک‌سازی کاتالوگ: ' + err.message });
  }
});

// Clear / reset catalog
app.post('/api/admin/products/reset-samples', requireAdminAuth, async (_req, res) => {
  try {
    serverProductsCache.clear();
    persistServerProducts();

    return res.status(200).json({ success: true, products: [] });
  } catch (err: any) {
    return res.status(500).json({ error: 'خطا در بازنشانی کاتالوگ: ' + err.message });
  }
});

// Update store settings (strictly separates public and private data)
app.post('/api/admin/settings/update', requireAdminAuth, async (req, res) => {
  try {
    const settings = req.body;
    if (!settings || !settings.storeName) {
      return res.status(400).json({ error: 'اطلاعات تنظیمات نامعتبر است.' });
    }

    const publicKeys = [
      'storeName', 'slogan', 'shippingCost', 'freeShippingThreshold', 'supportPhone',
      'supportWhatsApp', 'supportInstagram', 'supportTelegram', 'supportAddress',
      'announcement', 'isStoreOpen', 'storeClosedMessage', 'shippingNote',
      'introEnabled', 'introBadge', 'introTitle', 'introSlogan', 'introSubtitle', 'introButtonText',
      'footerCopyright',
      'heroBadge', 'heroTitle', 'heroSubtitle', 'heroButtonText',
      'promoBadge', 'promoTitle', 'promoSubtitle', 'aboutText',
      'qualityBadge1', 'qualityBadge2', 'qualityBadge3', 'qualityBadge4',
      'refundPolicyTitle', 'refundPolicyText', 'adminLoginButtonText',
      'checkoutTitle', 'checkoutSubtitle', 'checkoutSubmitButtonText',
      'trackingModalTitle', 'trackingModalSubtitle', 'trackingInputPlaceholder',
      'footerAboutTitle', 'footerAboutText', 'footerTrustTitle', 'footerTrustText', 'footerContactTitle',
      'cartTitle', 'cartEmptyMessage',
      'customCategories', 'zarinpalEnabled', 'zarinpalSandbox'
    ];

    const privateKeys = [
      'cardNumber', 'cardHolder', 'bankName', 'shabaNumber', 'ntfyTopic',
      'discountCodes', 'zarinpalMerchantId'
    ];

    const newPublic: Record<string, any> = {};
    for (const k of publicKeys) {
      if (settings[k] !== undefined) newPublic[k] = settings[k];
    }

    const newPrivate: Record<string, any> = {};
    for (const k of privateKeys) {
      if (settings[k] !== undefined) newPrivate[k] = settings[k];
    }

    serverSettingsCache.public = { ...serverSettingsCache.public, ...newPublic };
    serverSettingsCache.private = { ...serverSettingsCache.private, ...newPrivate };
    persistServerSettings();

    // Synchronize to Firestore for real-time customer reflection
    try {
      await setDoc(doc(db, 'settings', 'public'), newPublic);
    } catch (fErr: any) {
      console.warn('Firestore setDoc settings notice:', fErr.message);
    }

    if (adminDb) {
      try {
        await adminDb.collection('settings').doc('public').set(newPublic, { merge: true });
        await adminDb.collection('settings').doc('private').set(newPrivate, { merge: true });
      } catch (dbErr: any) {
        console.warn('Firestore adminDb settings update notice:', dbErr.message);
      }
    }

    return res.status(200).json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: 'خطا در ذخیره تنظیمات: ' + err.message });
  }
});

// Get all orders (strictly for authenticated admin)
app.get('/api/admin/orders', requireAdminAuth, async (_req, res) => {
  try {
    const ordersMap = new Map<string, any>();
    serverOrdersCache.forEach((ord, id) => {
      ordersMap.set(id, ord);
    });

    if (adminDb) {
      try {
        const snap = await adminDb.collection('orders').get();
        for (const docSnap of snap.docs) {
          ordersMap.set(docSnap.id, docSnap.data());
        }
      } catch (dbErr: any) {
        console.warn('adminDb orders fetch notice (using persistent store):', dbErr.message);
      }
    }

    const ordersList = Array.from(ordersMap.values());
    ordersList.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    return res.status(200).json({ success: true, orders: ordersList });
  } catch (err: any) {
    return res.status(500).json({ error: 'خطا در دریافت سفارشات: ' + err.message });
  }
});

// Update order status & tracking & refund notes
app.post('/api/admin/orders/update', requireAdminAuth, async (req, res) => {
  try {
    const { orderId, status, trackingCode, refundNotes, refundStatus, refundAmount } = req.body;
    if (!orderId || !status) {
      return res.status(400).json({ error: 'شناسه سفارش و وضعیت جدید الزامی است.' });
    }
    const VALID_ORDER_STATUSES = [
      'pending_receipt',
      'paid_pending_approval',
      'approved',
      'processing',
      'packaging',
      'shipped',
      'delivered',
      'refunded',
      'cancelled'
    ];
    if (!VALID_ORDER_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'وضعیت سفارش انتخاب شده نامعتبر است.' });
    }
    const updateData: any = {
      status,
      updatedAt: new Date().toISOString()
    };
    if (trackingCode !== undefined) {
      updateData.trackingCode = trackingCode;
    }
    if (refundNotes !== undefined) {
      updateData.refundNotes = refundNotes;
    }
    if (refundStatus !== undefined) {
      updateData.refundStatus = refundStatus;
    } else if (status === 'refunded') {
      updateData.refundStatus = 'refunded';
    }
    if (refundAmount !== undefined && Number(refundAmount) >= 0) {
      updateData.refundAmount = Number(refundAmount);
    }
    if (status === 'refunded' && !updateData.refundDate) {
      updateData.refundDate = new Date().toISOString();
    }

    const existing = serverOrdersCache.get(orderId.toUpperCase());
    if (existing) {
      Object.assign(existing, updateData);
      persistServerOrder(existing);
    }
    if (adminDb) {
      try {
        await adminDb.collection('orders').doc(orderId).update(updateData);
      } catch (dbErr: any) {
        console.warn('adminDb order update notice:', dbErr.message);
      }
    }
    return res.status(200).json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: 'خطا در بروزرسانی وضعیت سفارش: ' + err.message });
  }
});

// Delete order
app.post('/api/admin/orders/delete', requireAdminAuth, async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) {
      return res.status(400).json({ error: 'شناسه سفارش الزامی است.' });
    }
    removeServerOrder(orderId);
    if (adminDb) {
      try {
        await adminDb.collection('orders').doc(orderId).delete();
      } catch (dbErr: any) {
        console.warn('adminDb order delete notice:', dbErr.message);
      }
    }
    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error('Server delete order error:', err);
    return res.status(500).json({ error: 'خطا در حذف سفارش: ' + err.message });
  }
});

// Clear all orders
app.post('/api/admin/orders/clear', requireAdminAuth, async (_req, res) => {
  try {
    clearServerOrders();
    if (adminDb) {
      try {
        const snap = await adminDb.collection('orders').get();
        for (const d of snap.docs) {
          await d.ref.delete();
        }
      } catch (dbErr: any) {
        console.warn('adminDb clear orders notice:', dbErr.message);
      }
    }
    return res.status(200).json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: 'خطا در پاکسازی سفارشات: ' + err.message });
  }
});

// Admin: Re-send full order notification to ntfy (without creating duplicates)
app.post('/api/admin/orders/:id/resend-ntfy', requireAdminAuth, async (req, res) => {
  try {
    const orderId = (req.params.id || req.body?.orderId || '').trim();
    if (!orderId) {
      return res.status(400).json({ error: 'شناسه سفارش الزامی است.' });
    }

    const orderData = await findOrderByTrackingCode(orderId);
    if (!orderData) {
      return res.status(404).json({ error: 'سفارش مورد نظر در پایگاه داده یافت نشد.' });
    }

    const ntfyResult = await sendOrderNtfy(orderData, serverSettingsCache.private);
    orderData.ntfySent = ntfyResult.success;
    orderData.ntfySentAt = new Date().toISOString();
    if (!ntfyResult.success && ntfyResult.error) {
      orderData.ntfyError = ntfyResult.error;
    } else {
      delete orderData.ntfyError;
    }
    persistServerOrder(orderData);

    if (adminDb) {
      adminDb.collection('orders').doc(orderData.id).update({
        ntfySent: orderData.ntfySent,
        ntfySentAt: orderData.ntfySentAt,
        ntfyError: orderData.ntfyError || null
      }).catch(() => {});
    }

    if (!ntfyResult.success) {
      return res.status(502).json({
        success: false,
        error: ntfyResult.error || 'ارسال اعلان به تاپیک ntfy با خطا مواجه شد.'
      });
    }

    return res.status(200).json({
      success: true,
      message: `اعلان سفارش ${orderData.id} با تمامی مشخصات مجدداً به تاپیک ntfy ارسال گردید.`
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'خطا در ارسال مجدد اعلان: ' + err.message });
  }
});

// Admin: Test ntfy notification from server
app.post('/api/admin/notifications/test-ntfy', requireAdminAuth, async (req, res) => {
  try {
    const customMessage = req.body?.message;
    const result = await sendTestNtfy(serverSettingsCache.private, customMessage);
    if (!result.success) {
      return res.status(502).json({ error: result.error || 'ارسال اعلان تست به ntfy با شکست مواجه شد.' });
    }
    return res.status(200).json({
      success: true,
      message: 'اعلان تست با موفقیت از سرور به تاپیک اختصاصی ntfy ارسال شد.'
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'خطا در تست اعلان: ' + err.message });
  }
});


// -------------------------------------------------------------
// SERVER SETUP & STATIC / SPA MOUNTING
// -------------------------------------------------------------
async function setupServer() {
  const isProduction = process.env.NODE_ENV === 'production';
  const distPath = path.join(process.cwd(), 'dist');

  if (isProduction) {
    // Serve production static files from dist directory with HTML cache-busting
    app.use(express.static(distPath, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        }
      }
    }));

    // Handle SPA routing: serve index.html with strict zero-cache policy
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    // In development mode, mount Vite middleware
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true, hmr: false },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } catch {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, HOST, () => {
    console.log(`Server is running at http://${HOST}:${PORT}`);
  });
}

setupServer();
