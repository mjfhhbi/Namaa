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
import firebaseConfig from './firebase-applet-config.json';
import { 
  initAdminSecurity, 
  verifyAdminPin, 
  validateSessionToken, 
  changeAdminPin, 
  isPinConfigured,
  revokeSession
} from './src/server/adminSecurity';
import { processOrderCreation } from './src/server/orderManager';
import { validateTestTargetProject } from './src/server/testEnvironmentGuard';

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

  // If cache is empty, add authentic saffron test product
  if (serverProductsCache.size === 0) {
    const authenticProduct = {
      id: 'prod_saffron_super_negin',
      name: 'زعفران سوپر نگین اعلای قائنات',
      category: 'saffron',
      categoryLabel: 'زعفران و زرشک اعلا',
      price: 495000,
      originalPrice: 550000,
      weight: 'یک مثقال (۴.۶ گرم)',
      description: 'زعفران اصیل و دستچین سوپر نگین قائنات خراسان، بدون هیچ‌گونه خامه و ناخالصی با بالاترین درجه رنگ‌دهی طبیعی، عطر گیرا و تاییدیه آزمایشگاه تخصصی ناما.',
      shortDesc: 'زعفران اعلای سوپر نگین قائنات با تضمین آزمایشگاهی خلوص و عطر',
      benefits: [
        'بالاترین عیار کروسین (قدرت رنگ‌دهی طبیعی)',
        'دستچین شده از مزارع ممتاز قائنات خراسان',
        'بسته‌بندی کریستالی پلمپ ضد رطوبت و نور',
        'تضمین ۱۰۰٪ اصالت و بازگشت وجه بی‌قید و شرط'
      ],
      origin: 'خراسان جنوبی، قائنات',
      stock: 50,
      image: 'https://images.unsplash.com/photo-1615485500704-8e990f9900f7?auto=format&fit=crop&w=800&q=80',
      isPopular: true,
      isOrganic: true,
      isFeatured: true,
      isNewArrival: true,
      badge: 'صادراتی اعلا',
      rating: 5,
      harvestYear: '۱۴۰۳',
      createdAt: '2026-10-24T00:00:00.000Z'
    };
    serverProductsCache.set(authenticProduct.id, authenticProduct);
  }

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
    customCategories: [
      { id: 'saffron', name: 'زعفران و زرشک اعلا', icon: '✨', description: 'زعفران سوپر نگین قائنات و زرشک اناری تازه' },
      { id: 'tea', name: 'چای و دمنوش‌های گیاهی', icon: '🍵', description: 'چای بهاره دستچین و دمنوش‌های میوه‌ای طبیعی' },
      { id: 'spices', name: 'هل و ادویه‌جات ناب', icon: '🧂', description: 'ادویه‌جات تازه آسیاب‌شده بدون ناخالصی' },
      { id: 'distillates', name: 'گلاب و عرقیات سنتی', icon: '🌸', description: 'عرقیات دوآتشه و گلاب ناب سنتی' },
      { id: 'nuts', name: 'خشکبار و آجیل دستچین', icon: '🥜', description: 'پسته، گردو و مغزیجات تازه ایرانی' },
      { id: 'herbal', name: 'گیاهان دارویی و سلامت', icon: '🌿', description: 'گیاهان دارویی بکر مناطق کوهستانی ایران' },
      { id: 'other', name: 'سایر محصولات اصیل ناما', icon: '🍯', description: 'سایر خوراکی‌ها و سوغات ممتاز محلی' },
    ]
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

/**
 * 2. POST /api/orders/track
 * Secure customer tracking lookup:
 * - Requires matching Order ID AND Customer Mobile Phone (Mandatory)
 * - Anti brute-force: locks out both abusive IP and targeted Order ID
 * - Strictly enforces full 11-digit Iranian mobile comparison
 * - Minimizes customer PII returned (omits address, phone, notes, card data)
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

  // Rate limit: Max 10 tracking queries per minute per IP
  if (rate.count > 10) {
    return res.status(429).json({
      error: 'تعداد استعلام‌های پیگیری سفارش بیش از حد مجاز است. لطفاً یک دقیقه دیگر تلاش فرمایید.'
    });
  }

  try {
    const { orderId, phone } = req.body;

    if (!orderId || typeof orderId !== 'string' || orderId.trim().length === 0 || orderId.trim().length > 64) {
      return res.status(400).json({ error: 'شناسه سفارش الزامی و حداکثر ۶۴ کاراکتر است.' });
    }

    const cleanId = orderId.trim().toUpperCase();
    const cleanPhone = normalizeIranianPhone(phone || '');

    // Strict validation of Iranian mobile format (11 digits, starts with 09)
    if (!cleanPhone || !isValidIranianMobile(cleanPhone)) {
      return res.status(400).json({
        error: 'شماره تلفن همراه معتبر ۱۱ رقمی (مثال: ۰۹۱۲۳۴۵۶۷۸۹) جهت پیگیری سفارش الزامی است.'
      });
    }

    // Per-order ID brute-force protection
    const orderLock = orderTrackingLockouts.get(cleanId);
    if (orderLock?.lockedUntil && orderLock.lockedUntil > now) {
      const remainingMinutes = Math.ceil((orderLock.lockedUntil - now) / 60000);
      return res.status(429).json({
        error: `استعلام این سفارش به دلیل تلاش‌های ناموفق مکرر موقتاً مسدود شده است. لطفاً ${remainingMinutes} دقیقه دیگر تلاش فرمایید.`
      });
    }

    let orderData = serverOrdersCache.get(cleanId);
    if (!orderData) {
      try {
        const orderRef = doc(db, 'orders', cleanId);
        const orderSnap = await getDoc(orderRef);
        if (orderSnap.exists()) {
          orderData = orderSnap.data();
          persistServerOrder(orderData);
        }
      } catch (_e) {}
    }

    if (!orderData) {
      rate.failedCount = (rate.failedCount || 0) + 1;
      if (rate.failedCount >= 5) {
        rate.lockedUntil = now + 15 * 60 * 1000; // 15 minute lockout
      }
      trackingAttempts.set(clientIp, rate);

      const ordLock = orderTrackingLockouts.get(cleanId) || { failedCount: 0 };
      ordLock.failedCount += 1;
      if (ordLock.failedCount >= 5) {
        ordLock.lockedUntil = now + 15 * 60 * 1000;
      }
      orderTrackingLockouts.set(cleanId, ordLock);

      return res.status(404).json({ error: 'سفارشی با این شناسه در سامانه یافت نشد.' });
    }

    const storedPhone = normalizeIranianPhone(orderData.customerPhone || '');

    // Full 11-digit normalized phone comparison - strict equality check (never partial or last 8 digits)
    if (!storedPhone || cleanPhone !== storedPhone) {
      rate.failedCount = (rate.failedCount || 0) + 1;
      if (rate.failedCount >= 5) {
        rate.lockedUntil = now + 15 * 60 * 1000;
      }
      trackingAttempts.set(clientIp, rate);

      const ordLock = orderTrackingLockouts.get(cleanId) || { failedCount: 0 };
      ordLock.failedCount += 1;
      if (ordLock.failedCount >= 5) {
        ordLock.lockedUntil = now + 15 * 60 * 1000;
      }
      orderTrackingLockouts.set(cleanId, ordLock);

      return res.status(403).json({
        error: 'شماره تلفن همراه وارد شده با شماره ثبت شده در این سفارش مطابقت ندارد.'
      });
    }

    // Reset failed counters upon successful match
    rate.failedCount = 0;
    trackingAttempts.set(clientIp, rate);
    orderTrackingLockouts.delete(cleanId);

    // Return strictly minimized public tracking info (omits phone, full address, notes, payment secrets)
    return res.status(200).json({
      success: true,
      order: {
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
          image: i.image,
        })),
        createdAt: orderData.createdAt,
        updatedAt: orderData.updatedAt,
      }
    });
  } catch (err: any) {
    console.error('Track order error:', err);
    return res.status(500).json({ error: 'خطا در پیگیری سفارش.' });
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
      'heroBadge', 'heroTitle', 'heroSubtitle', 'heroButtonText',
      'promoBadge', 'promoTitle', 'promoSubtitle', 'aboutText',
      'qualityBadge1', 'qualityBadge2', 'qualityBadge3', 'qualityBadge4',
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

    // Synchronize to Firestore if adminDb is available
    if (adminDb) {
      try {
        await adminDb.collection('settings').doc('public').set(newPublic, { merge: true });
        await adminDb.collection('settings').doc('private').set(newPrivate, { merge: true });
      } catch (dbErr: any) {
        console.error('Firestore adminDb settings update error:', dbErr);
        return res.status(500).json({ error: 'خطا در ذخیره تنظیمات در پایگاه داده: ' + dbErr.message });
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

// Update order status & tracking
app.post('/api/admin/orders/update', requireAdminAuth, async (req, res) => {
  try {
    const { orderId, status, trackingCode } = req.body;
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
