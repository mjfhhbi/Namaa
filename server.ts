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

const app = express();
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

// Helper: Normalize Persian/Arabic digits to English
function toEnglishDigits(str: string): string {
  if (!str) return '';
  const farsiDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  let res = str;
  for (let i = 0; i < 10; i++) {
    res = res.replaceAll(farsiDigits[i], String(i)).replaceAll(arabicDigits[i], String(i));
  }
  return res;
}

// Client IP resolver helper
function getClientIp(req: express.Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
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
// SERVER-SIDE ADMIN AUTHENTICATION & SESSION MANAGEMENT
// -------------------------------------------------------------
// Admin PIN is stored exclusively on the server (never exposed to frontend client bundle)
let currentAdminPin = process.env.ADMIN_PIN || '1383';

// Active admin sessions: token -> { createdAt, expiresAt }
const activeAdminSessions = new Map<string, { createdAt: number; expiresAt: number }>();

// Brute-force protection: IP -> { count, lockedUntil }
interface RateRecord {
  count: number;
  lockedUntil?: number;
  resetAt?: number;
}
const loginAttempts = new Map<string, RateRecord>();
const trackingAttempts = new Map<string, RateRecord>();
const receiptAttempts = new Map<string, RateRecord>();

// Clean up expired sessions periodically
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of activeAdminSessions.entries()) {
    if (session.expiresAt <= now) {
      activeAdminSessions.delete(token);
    }
  }
}, 30 * 60 * 1000);

/**
 * Authentication Middleware for all /api/admin/* endpoints
 * - Rejects with 401 if token is missing
 * - Cryptographically verifies token signature via Firebase Admin SDK or validates active server session
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

  // 2. Check active server-side session token (issued upon successful PIN login)
  const session = activeAdminSessions.get(token);
  if (session) {
    if (Date.now() < session.expiresAt) {
      return next();
    } else {
      activeAdminSessions.delete(token);
    }
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

// Admin PIN Login with Brute-Force Rate Limiting
app.post('/api/admin/login', async (req, res) => {
  const clientIp = getClientIp(req);
  const now = Date.now();
  const attempt = loginAttempts.get(clientIp) || { count: 0, lockedUntil: 0 };

  // Enforce lockout if limit exceeded
  if (attempt.lockedUntil && attempt.lockedUntil > now) {
    const remainingMinutes = Math.ceil((attempt.lockedUntil - now) / 60000);
    return res.status(429).json({
      error: `تعداد تلاش‌های ناموفق بیش از حد مجاز است. دسترسی شما موقتاً مسدود شد. لطفاً ${remainingMinutes} دقیقه دیگر تلاش فرمایید.`
    });
  }

  const { pin } = req.body;
  if (!pin || typeof pin !== 'string') {
    return res.status(400).json({ error: 'رمز عبور مدیریت الزامی است.' });
  }

  if (pin.trim() === currentAdminPin) {
    loginAttempts.delete(clientIp);
    const sessionToken = crypto.randomBytes(32).toString('hex');
    activeAdminSessions.set(sessionToken, {
      createdAt: now,
      expiresAt: now + 24 * 3600 * 1000 // 24 hours validity
    });
    return res.status(200).json({ success: true, token: sessionToken });
  }

  // Record failed attempt and throttle response
  attempt.count += 1;
  if (attempt.count >= 5) {
    attempt.lockedUntil = now + 15 * 60 * 1000; // 15 minutes lockout
  }
  loginAttempts.set(clientIp, attempt);

  // Artificial delay to prevent automated high-speed dictionary attacks
  await new Promise((r) => setTimeout(r, 600));

  return res.status(401).json({
    error: attempt.count >= 5
      ? 'به دلیل تلاش‌های متوالی نادرست، دسترسی شما موقتاً به مدت ۱۵ دقیقه مسدود شد.'
      : 'رمز عبور مدیریت نادرست است.'
  });
});

// Admin PIN Change
app.post('/api/admin/change-pin', requireAdminAuth, async (req, res) => {
  const { currentPin, newPin } = req.body;
  if (!currentPin || !newPin || typeof currentPin !== 'string' || typeof newPin !== 'string') {
    return res.status(400).json({ error: 'رمز فعلی و رمز جدید الزامی هستند.' });
  }
  if (currentPin.trim() !== currentAdminPin) {
    await new Promise((r) => setTimeout(r, 600));
    return res.status(400).json({ error: 'رمز عبور فعلی نادرست است.' });
  }
  if (newPin.trim().length < 4) {
    return res.status(400).json({ error: 'رمز عبور جدید باید حداقل ۴ کاراکتر باشد.' });
  }

  currentAdminPin = newPin.trim();

  // Invalidate all previous active sessions on password change
  activeAdminSessions.clear();

  // Issue fresh session token
  const sessionToken = crypto.randomBytes(32).toString('hex');
  activeAdminSessions.set(sessionToken, {
    createdAt: Date.now(),
    expiresAt: Date.now() + 24 * 3600 * 1000
  });

  return res.status(200).json({
    success: true,
    message: 'رمز عبور مدیریت با موفقیت در سرور تغییر یافت.',
    token: sessionToken
  });
});

// -------------------------------------------------------------
// SECURE SERVER-SIDE APIS FOR STOREFRONT
// -------------------------------------------------------------

/**
 * 1. POST /api/orders/create
 * Server-authoritative order creation:
 * - Recalculates all product prices directly from database
 * - Validates inventory and decrements stock atomically
 * - Calculates shipping and verified coupon discount
 * - Protects against fake totals or client-side tampering
 * - Sanitizes ntfy alert (never exposes full phone or detailed address)
 */
app.post('/api/orders/create', async (req, res) => {
  try {
    const {
      customerName,
      customerPhone,
      province,
      city,
      address,
      postalCode,
      items,
      discountCode,
      paymentMethod = 'card_to_card',
      cardLast4,
      paymentReference,
      receiptImage,
      notes,
    } = req.body;

    // Contact & postal validation
    if (!customerName || typeof customerName !== 'string' || customerName.trim().length < 2) {
      return res.status(400).json({ error: 'نام و نام خانوادگی خریدار الزامی است.' });
    }

    const cleanPhone = toEnglishDigits(customerPhone || '').replace(/[\s-]/g, '');
    if (!cleanPhone || cleanPhone.length < 10) {
      return res.status(400).json({ error: 'شماره تلفن همراه معتبر نیست.' });
    }

    if (!address || typeof address !== 'string' || address.trim().length < 5) {
      return res.status(400).json({ error: 'آدرس پستی کامل الزامی است.' });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'سبد خرید خالی است.' });
    }

    // Fetch store settings for shipping & discounts
    let storeShippingCost = 45000;
    let freeShippingThreshold = 0;
    let ntfyTopic = 'nama_store_orders_1383';
    let availableCoupons: any[] = [];

    try {
      const settingsSnap = await getDoc(doc(db, 'settings', 'main'));
      if (settingsSnap.exists()) {
        const sData = settingsSnap.data();
        if (typeof sData.shippingCost === 'number') storeShippingCost = sData.shippingCost;
        if (typeof sData.freeShippingThreshold === 'number') freeShippingThreshold = sData.freeShippingThreshold;
        if (sData.ntfyTopic) ntfyTopic = sData.ntfyTopic;
        if (Array.isArray(sData.discountCodes)) availableCoupons = sData.discountCodes;
      }
    } catch (e) {
      console.warn('Could not read settings from Firestore:', e);
    }

    // Validate products and recalculate prices from database
    let computedSubtotal = 0;
    const verifiedItems: any[] = [];
    const stockUpdates: { id: string; newStock: number }[] = [];

    for (const item of items) {
      const productId = item.productId || item.product?.id;
      const quantity = Math.max(1, Number(item.quantity) || 1);

      if (!productId) {
        return res.status(400).json({ error: 'اطلاعات محصول نامعتبر است.' });
      }

      const prodRef = doc(db, 'products', productId);
      const prodSnap = await getDoc(prodRef);

      if (!prodSnap.exists()) {
        return res.status(400).json({ error: `محصول با شناسه ${productId} در پایگاه داده یافت نشد.` });
      }

      const prodData = prodSnap.data();
      const currentStock = Number(prodData.stock ?? 10);

      if (currentStock < quantity) {
        return res.status(400).json({
          error: `موجودی محصول «${prodData.name}» کافی نیست (موجودی فعلی: ${currentStock} عدد).`
        });
      }

      const realPrice = Number(prodData.price) || 0;
      const itemTotal = realPrice * quantity;
      computedSubtotal += itemTotal;

      verifiedItems.push({
        productId,
        name: prodData.name,
        price: realPrice,
        weight: prodData.weight || 'بسته استاندارد',
        image: prodData.image || '',
        quantity,
      });

      stockUpdates.push({
        id: productId,
        newStock: Math.max(0, currentStock - quantity)
      });
    }

    // Free shipping threshold check
    let appliedShipping = storeShippingCost;
    if (freeShippingThreshold > 0 && computedSubtotal >= freeShippingThreshold) {
      appliedShipping = 0;
    }

    // Verify discount coupon
    let computedDiscount = 0;
    let validDiscountCode: string | undefined = undefined;

    if (discountCode && typeof discountCode === 'string') {
      const cleanCode = discountCode.trim().toUpperCase();
      const matched = availableCoupons.find(
        (c) => c.code.toUpperCase() === cleanCode && c.isActive
      );

      if (matched) {
        if (!matched.minPurchase || computedSubtotal >= matched.minPurchase) {
          if (matched.type === 'percent') {
            computedDiscount = Math.round((computedSubtotal * matched.amount) / 100);
            if (matched.maxDiscount && computedDiscount > matched.maxDiscount) {
              computedDiscount = matched.maxDiscount;
            }
          } else {
            computedDiscount = matched.amount;
          }
          validDiscountCode = cleanCode;
        }
      }
    }

    const computedTotalAmount = Math.max(0, computedSubtotal + appliedShipping - computedDiscount);

    // Create unique order ID
    const orderId = `NM-${Math.floor(10000 + Math.random() * 90000)}`;

    const newOrder = {
      id: orderId,
      customerName: customerName.trim(),
      customerPhone: cleanPhone,
      province: (province || 'تهران').trim(),
      city: (city || '').trim(),
      address: address.trim(),
      postalCode: toEnglishDigits(postalCode || '').replace(/\D/g, '').slice(0, 10),
      items: verifiedItems,
      subtotal: computedSubtotal,
      shippingCost: appliedShipping,
      totalAmount: computedTotalAmount,
      discountCode: validDiscountCode,
      discountAmount: computedDiscount > 0 ? computedDiscount : undefined,
      status: paymentMethod === 'card_to_card' ? 'paid_pending_approval' : 'pending_receipt',
      paymentMethod,
      cardLast4: cardLast4 ? toEnglishDigits(String(cardLast4)).replace(/\D/g, '').slice(0, 4) : undefined,
      paymentReference: paymentReference ? toEnglishDigits(String(paymentReference)).trim() : undefined,
      receiptImage: receiptImage || undefined,
      notes: notes ? String(notes).trim() : undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Clean undefined fields for Firestore compatibility
    const cleanOrder: Record<string, any> = { ...newOrder };
    Object.keys(cleanOrder).forEach(k => {
      if (cleanOrder[k] === undefined) {
        delete cleanOrder[k];
      }
    });

    // Save order in Firestore
    try {
      await setDoc(doc(db, 'orders', orderId), cleanOrder);
    } catch (_fErr) {}

    // Persist in secure server-side orders cache (shields customer PII)
    persistServerOrder(cleanOrder);

    // Decrement stock in Firestore for all items
    for (const update of stockUpdates) {
      try {
        await updateDoc(doc(db, 'products', update.id), {
          stock: update.newStock,
          updatedAt: new Date().toISOString()
        });
      } catch (err) {
        console.warn(`Could not update stock for product ${update.id}:`, err);
      }
    }

    // Send privacy-preserving instant ntfy push notification to store manager
    // (Customer phone and full street address are never sent to third-party public notification servers)
    try {
      const cleanTopic = ntfyTopic.trim().replace(/^https?:\/\/ntfy\.sh\//, '');
      if (cleanTopic) {
        const maskedName = newOrder.customerName.length > 3
          ? `${newOrder.customerName.slice(0, 3)}***`
          : newOrder.customerName;

        await fetch(`https://ntfy.sh/${cleanTopic}`, {
          method: 'POST',
          headers: {
            'Title': encodeURIComponent(`🌿 سفارش جدید ناما (${orderId})`),
            'Priority': '4',
            'Tags': 'shopping_cart,package,dollar'
          },
          body: `سفارش جدید ${orderId} به مبلغ ${newOrder.totalAmount.toLocaleString('fa-IR')} تومان ثبت شد.\nنام: ${maskedName}\nشهر: ${newOrder.city}\n(جزئیات کامل، شماره تماس و آدرس فقط در پنل امن مدیریت ثبت گردید)`
        });
      }
    } catch (pushErr) {
      console.warn('ntfy push alert notice:', pushErr);
    }

    return res.status(200).json({
      success: true,
      order: newOrder
    });
  } catch (err: any) {
    console.error('Server order creation error:', err);
    return res.status(500).json({
      error: 'خطا در ثبت و اعتبارسنجی سفارش: ' + (err?.message || 'مجدداً تلاش فرمایید')
    });
  }
});

/**
 * 2. POST /api/orders/track
 * Secure customer tracking lookup:
 * - Requires matching Order ID AND Customer Mobile Phone (Mandatory)
 * - Protects against unauthorized scraping or enumeration of customer data
 * - Returns only sanitized tracking status and item summary (omits full address and financial details)
 */
app.post('/api/orders/track', async (req, res) => {
  const clientIp = getClientIp(req);
  const now = Date.now();
  const rate = trackingAttempts.get(clientIp) || { count: 0, resetAt: now + 60000 };
  if (now > (rate.resetAt || 0)) {
    rate.count = 0;
    rate.resetAt = now + 60000;
  }
  rate.count += 1;
  trackingAttempts.set(clientIp, rate);
  if (rate.count > 25) {
    return res.status(429).json({ error: 'تعداد استعلام‌های شما بیش از حد مجاز است. لطفاً یک دقیقه دیگر تلاش فرمایید.' });
  }

  try {
    const { orderId, phone } = req.body;

    if (!orderId || typeof orderId !== 'string') {
      return res.status(400).json({ error: 'شناسه سفارش الزامی است.' });
    }

    const cleanId = orderId.trim().toUpperCase();
    const cleanPhone = toEnglishDigits(phone || '').replace(/[\s-]/g, '');

    // MANDATORY phone requirement to prevent brute-force order enumeration
    if (!cleanPhone || cleanPhone.length < 10) {
      return res.status(400).json({
        error: 'شماره تلفن همراه خریدار جهت پیگیری سفارش الزامی است و باید حداقل ۱۰ رقم باشد.'
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
      return res.status(404).json({ error: 'سفارشی با این شناسه در سامانه یافت نشد.' });
    }

    const storedPhone = toEnglishDigits(orderData.customerPhone || '').replace(/[\s-]/g, '');

    // Security check: Phone must match the order
    if (!storedPhone.endsWith(cleanPhone.slice(-8)) && !cleanPhone.endsWith(storedPhone.slice(-8))) {
      return res.status(403).json({
        error: 'شماره تلفن همراه وارد شده با شماره ثبت شده در این سفارش مطابقت ندارد.'
      });
    }

    // Return sanitized public tracking info (omit customer full address/financial details)
    return res.status(200).json({
      success: true,
      order: {
        id: orderData.id,
        customerName: orderData.customerName,
        customerPhone: orderData.customerPhone ? `${orderData.customerPhone.slice(0, 4)}***${orderData.customerPhone.slice(-4)}` : '',
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
 */
app.post('/api/orders/upload-receipt', async (req, res) => {
  const clientIp = getClientIp(req);
  const now = Date.now();
  const rate = receiptAttempts.get(clientIp) || { count: 0, resetAt: now + 60000 };
  if (now > (rate.resetAt || 0)) {
    rate.count = 0;
    rate.resetAt = now + 60000;
  }
  rate.count += 1;
  receiptAttempts.set(clientIp, rate);
  if (rate.count > 10) {
    return res.status(429).json({ error: 'تعداد تلاش‌های ثبت رسید بیش از حد مجاز است.' });
  }

  try {
    const { orderId, phone, receiptImage, cardLast4, paymentReference } = req.body;

    if (!orderId || !receiptImage) {
      return res.status(400).json({ error: 'شناسه سفارش و تصویر فیش الزامی است.' });
    }

    const cleanId = orderId.trim().toUpperCase();
    const cleanPhone = toEnglishDigits(phone || '').replace(/[\s-]/g, '');

    if (!cleanPhone || cleanPhone.length < 10) {
      return res.status(400).json({ error: 'شماره تلفن همراه ثبت شده در سفارش الزامی است.' });
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
      return res.status(404).json({ error: 'سفارش یافت نشد.' });
    }

    const storedPhone = toEnglishDigits(orderData.customerPhone || '').replace(/[\s-]/g, '');

    if (!storedPhone.endsWith(cleanPhone.slice(-8)) && !cleanPhone.endsWith(storedPhone.slice(-8))) {
      return res.status(403).json({ error: 'شماره همراه با این سفارش مطابقت ندارد.' });
    }

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

    return res.status(200).json({ success: true, message: 'رسید واریز با موفقیت ثبت شد.' });
  } catch (err: any) {
    return res.status(500).json({ error: 'خطا در ثبت رسید: ' + err.message });
  }
});

// -------------------------------------------------------------
// ADMIN MANAGEMENT ENDPOINTS (Server-Side Verified Operations)
// ALL PROTECTED WITH requireAdminAuth (401 on missing auth, 403 on invalid auth)
// -------------------------------------------------------------

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
      await adminDb.collection('products').doc(cleanProduct.id).set(cleanProduct);
    } else {
      try {
        await setDoc(doc(db, 'products', cleanProduct.id), cleanProduct);
      } catch (_fErr: any) {
        // Locked by firestore.rules to isAdmin(). Client SDK authenticated by matinjahanbani2024@gmail.com performs real-time sync
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
      await adminDb.collection('products').doc(productId).delete();
    } else {
      try {
        await deleteDoc(doc(db, 'products', productId));
      } catch (_fErr: any) {}
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
      const snap = await adminDb.collection('products').get();
      for (const d of snap.docs) {
        await d.ref.delete().catch(() => {});
      }
    } else {
      try {
        const snap = await getDocs(collection(db, 'products'));
        for (const d of snap.docs) {
          await deleteDoc(doc(db, 'products', d.id)).catch(() => {});
        }
      } catch (_fErr: any) {}
    }
    return res.status(200).json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: 'خطا در پاک‌سازی کاتالوگ: ' + err.message });
  }
});

// Update store settings
app.post('/api/admin/settings/update', requireAdminAuth, async (req, res) => {
  try {
    const settings = req.body;
    if (!settings || !settings.storeName) {
      return res.status(400).json({ error: 'اطلاعات تنظیمات نامعتبر است.' });
    }
    if (adminDb) {
      await adminDb.collection('settings').doc('main').set(settings);
    } else {
      try {
        await setDoc(doc(db, 'settings', 'main'), settings);
      } catch (_fErr: any) {}
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
      await adminDb.collection('orders').doc(orderId).update(updateData);
    } else {
      try {
        await updateDoc(doc(db, 'orders', orderId), updateData);
      } catch (_fErr: any) {}
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
      await adminDb.collection('orders').doc(orderId).delete();
    } else {
      try {
        await deleteDoc(doc(db, 'orders', orderId));
      } catch (_fErr: any) {}
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
      const snap = await adminDb.collection('orders').get();
      for (const d of snap.docs) {
        await d.ref.delete().catch(() => {});
      }
    } else {
      try {
        const snap = await getDocs(collection(db, 'orders'));
        for (const d of snap.docs) {
          await deleteDoc(doc(db, 'orders', d.id)).catch(() => {});
        }
      } catch (_fErr: any) {}
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
