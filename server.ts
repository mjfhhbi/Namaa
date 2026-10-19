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

const app = express();
// Enable secure reverse proxy support (Cloud Run / Nginx / Docker)
app.set('trust proxy', 1);

const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';

// Initialize Firebase for server-side trusted validations
const firebaseApp = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

// Initialize Firebase Admin SDK for cryptographic token verification
const adminApp = !getAdminApps().length
  ? initAdminApp({ projectId: firebaseConfig.projectId })
  : getAdminApps()[0];
const adminAuth = getAdminAuth(adminApp);

// Optional: Initialize Admin Firestore if service account key is injected via environment
let adminDb: any = null;
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    const cred = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    const saApp = initAdminApp({ credential: cert(cred), projectId: firebaseConfig.projectId }, 'saApp');
    adminDb = getAdminFirestore(saApp, firebaseConfig.firestoreDatabaseId);
    console.log('[Auth] Admin Firestore initialized with service account.');
  }
} catch (e: any) {
  console.warn('[Auth] Service account key notice:', e.message);
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
// SERVER-SIDE STORE SETTINGS (Separation of Public and Private Data)
// -------------------------------------------------------------
const SETTINGS_STORAGE_FILE = path.join(process.cwd(), 'data', 'server_settings.json');

interface ServerSettingsState {
  public: Record<string, any>;
  private: Record<string, any>;
}

let serverSettingsCache: ServerSettingsState = {
  public: {
    storeName: 'ناما | NAMA',
    slogan: 'از نام و جان برای طعمی ماندگار',
    shippingCost: 0,
    freeShippingThreshold: 600000,
    supportPhone: '09166449409',
    supportWhatsApp: '09166449409',
    supportInstagram: 'nama_naturalfood',
    supportTelegram: 'nama_food_support',
    supportAddress: '',
    announcement: '🌿 از نام و جان برای طعمی ماندگار | ضمانت اصالت ۱۰۰٪ طبیعی تمام محصولات با برگه آزمایش معتبر + ارسال رایگان خریدهای بالای ۶۰۰ هزار تومان',
    isStoreOpen: true,
    heroBadge: 'محصولات غذایی ۱۰۰٪ طبیعی، سالم و دستچین ایرانی',
    heroTitle: 'از نام و جان، برای طعمی ماندگار',
    heroSubtitle: 'سفره‌ای پربرکت با اصیل‌ترین طعم‌های دیار ایران؛ از عسل‌های بکر سبلان و خرمای شکلاتی پیارم تا دوشاب ناب ملایر و زعفران نگین قائنات، بدون مواد افزودنی و با تضمین بازگشت وجه.',
    heroButtonText: 'مشاهده و خرید محصولات',
    promoBadge: 'جشنواره اصالت و سلامت ناما',
    promoTitle: 'از نام و جان، برای طعمی ماندگار',
    promoSubtitle: 'هر قطره عسل کوهستان و هر دانه خرمای لوکس پیارم در «ناما»، تجلی تعهد به سلامتی و اصالت است. دستچین شده بدون ذره‌ای شکر مصنوعی یا سموم شیمیایی، مستقیم از دستان کشاورزان و زنبورداران امین ایران.',
    aboutText: 'فروشگاه تخصصی مواد غذایی ارگانیک و سنتی ناما با پایبندی به شعار «از نام و جان برای طعمی ماندگار»، برترین محصولات سالم مزارع، کوهپایه‌ها و نخلستان‌های ایران را مستقیماً به سفره‌های گرم خانواده‌ها می‌رساند.',
    qualityBadge1: 'برگه آزمایش معتبر',
    qualityBadge2: 'تضمین ۱۰۰٪ اصالت',
    qualityBadge3: 'بسته‌بندی ایمن پستی',
    qualityBadge4: 'ارسال فوری سراسری',
    customCategories: [
      {
        id: 'cat_1791989577701',
        name: 'زعفران',
        icon: '✨',
        description: 'عسله لامصب '
      }
    ]
  },
  private: {
    cardNumber: '6037-9918-4521-8763',
    cardHolder: 'متین جهانبانی (ناما فود)',
    bankName: 'بانک ملی ایران',
    shabaNumber: 'IR320170000000108923456001',
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
export async function requireAdminAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
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
      persistServerOrder
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

    if (!orderId || typeof orderId !== 'string') {
      return res.status(400).json({ error: 'شناسه سفارش الزامی است.' });
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

    if (!orderId || !receiptImage) {
      return res.status(400).json({ error: 'شناسه سفارش و تصویر فیش الزامی است.' });
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

    orderData.receiptImage = receiptImage;
    if (cardLast4) orderData.cardLast4 = toEnglishDigits(String(cardLast4)).replace(/\D/g, '').slice(0, 4);
    if (paymentReference) orderData.paymentReference = toEnglishDigits(String(paymentReference)).trim();
    orderData.status = 'paid_pending_approval';
    orderData.updatedAt = new Date().toISOString();
    persistServerOrder(orderData);

    try {
      await updateDoc(doc(db, 'orders', cleanId), {
        receiptImage: orderData.receiptImage,
        cardLast4: orderData.cardLast4,
        paymentReference: orderData.paymentReference,
        status: 'paid_pending_approval',
        updatedAt: orderData.updatedAt
      });
    } catch (_fErr) {}

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

// Save or update product
app.post('/api/admin/products/save', requireAdminAuth, async (req, res) => {
  try {
    const product = req.body;
    if (!product || !product.id || !product.name || product.price === undefined) {
      return res.status(400).json({ error: 'اطلاعات محصول ناقص است.' });
    }
    const cleanProduct: Record<string, any> = {
      ...product,
      price: Number(product.price),
      stock: Number(product.stock ?? 10),
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

    if (adminDb) {
      try {
        await adminDb.collection('products').doc(cleanProduct.id).set(cleanProduct);
      } catch (dbErr: any) {
        console.error('Database product write error:', dbErr);
        return res.status(500).json({ error: 'خطا در ذخیره محصول در پایگاه داده: ' + dbErr.message });
      }
    }
    return res.status(200).json({ success: true, product: cleanProduct });
  } catch (err: any) {
    console.error('Server save product error:', err);
    return res.status(500).json({ error: 'خطا در ذخیره محصول: ' + err.message });
  }
});

// Delete product
app.post('/api/admin/products/delete', requireAdminAuth, async (req, res) => {
  try {
    const { productId } = req.body;
    if (!productId) {
      return res.status(400).json({ error: 'شناسه محصول الزامی است.' });
    }
    if (adminDb) {
      try {
        await adminDb.collection('products').doc(productId).delete();
      } catch (dbErr: any) {
        return res.status(500).json({ error: 'خطا در حذف محصول از پایگاه داده: ' + dbErr.message });
      }
    }
    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error('Server delete product error:', err);
    return res.status(500).json({ error: 'خطا در حذف محصول: ' + err.message });
  }
});

// Clear all products
app.post('/api/admin/products/clear', requireAdminAuth, async (_req, res) => {
  try {
    if (adminDb) {
      try {
        const snap = await adminDb.collection('products').get();
        for (const d of snap.docs) {
          await d.ref.delete();
        }
      } catch (dbErr: any) {
        return res.status(500).json({ error: 'خطا در پاک‌سازی کاتالوگ از پایگاه داده: ' + dbErr.message });
      }
    }
    return res.status(200).json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: 'خطا در پاک‌سازی کاتالوگ: ' + err.message });
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

// Update order status & tracking
app.post('/api/admin/orders/update', requireAdminAuth, async (req, res) => {
  try {
    const { orderId, status, trackingCode } = req.body;
    if (!orderId || !status) {
      return res.status(400).json({ error: 'شناسه سفارش و وضعیت جدید الزامی است.' });
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
        return res.status(500).json({ error: 'خطا در بروزرسانی سفارش در پایگاه داده: ' + dbErr.message });
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
        return res.status(500).json({ error: 'خطا در حذف سفارش از پایگاه داده: ' + dbErr.message });
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
        return res.status(500).json({ error: 'خطا در پاکسازی سفارشات از پایگاه داده: ' + dbErr.message });
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
    // Serve production static files from dist directory
    app.use(express.static(distPath));

    // Handle SPA routing: serve index.html for all remaining routes
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    // In development mode, mount Vite middleware
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } catch {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, HOST, () => {
    console.log(`Server is running at http://${HOST}:${PORT}`);
  });
}

setupServer();
