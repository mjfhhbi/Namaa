import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot 
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Product, Order, StoreSettings, OrderStatus, DEFAULT_STORE_SETTINGS as DEFAULT_SETTINGS, AUTHENTIC_DEFAULT_PRODUCTS } from '../types';

const DEFAULT_PRODUCTS: Product[] = AUTHENTIC_DEFAULT_PRODUCTS;
const SAMPLE_ORDERS: Order[] = [];

import { normalizeIranianPhone, isValidIranianMobile } from '../utils/phone';

const LS_PRODUCTS_KEY = 'nama_store_products_v2';
const LS_ORDERS_KEY = 'nama_store_orders_v2';
const LS_SETTINGS_KEY = 'nama_store_settings_v2';
const LS_CATALOG_INIT_FLAG = 'nama_catalog_initialized_flag_v2';

// Local storage helpers for immediate responsive UI and fallback
export function getLocalSettings(): StoreSettings {
  try {
    const raw = localStorage.getItem(LS_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Sanitize legacy defaults
      if (parsed.supportInstagram === 'nama_naturalfood' || !parsed.supportInstagram) {
        parsed.supportInstagram = 'namafoods_';
      }
      if (parsed.supportPhone === '09120000000' || !parsed.supportPhone) {
        parsed.supportPhone = '+98 916 644 9409';
      }
      if (!parsed.supportWhatsApp) {
        parsed.supportWhatsApp = '+98 916 644 9409';
      }
      parsed.supportTelegram = undefined;

      // If categories still contain old honey/dates/saffron mock items
      if (Array.isArray(parsed.customCategories)) {
        parsed.customCategories = parsed.customCategories.filter(
          (c: any) => c.id !== 'honey' && c.id !== 'dates' && c.id !== 'saffron' && !c.name?.includes('عسل') && !c.name?.includes('خرما') && !c.name?.includes('زعفران')
        );
      }
      if (!parsed.customCategories) {
        parsed.customCategories = [];
      }

      // Sanitize subtitle texts if they contain legacy honey/dates/saffron references
      if (parsed.heroSubtitle && (parsed.heroSubtitle.includes('عسل') || parsed.heroSubtitle.includes('خرما') || parsed.heroSubtitle.includes('زعفران'))) {
        parsed.heroSubtitle = DEFAULT_SETTINGS.heroSubtitle;
      }
      if (parsed.promoSubtitle && (parsed.promoSubtitle.includes('عسل') || parsed.promoSubtitle.includes('خرما') || parsed.promoSubtitle.includes('زعفران'))) {
        parsed.promoSubtitle = DEFAULT_SETTINGS.promoSubtitle;
      }
      delete parsed.freeShippingThreshold;
      if (
        parsed.announcement && 
        (parsed.announcement.includes('۶۰۰') || 
         parsed.announcement.includes('آزمایش') || 
         parsed.announcement.includes('ضمانت') ||
         parsed.announcement.includes('اصیل'))
      ) {
        parsed.announcement = "";
      }

      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch (e) {
    console.error('Failed to read settings from localStorage', e);
  }
  return DEFAULT_SETTINGS;
}

export function saveLocalSettings(settings: StoreSettings): void {
  try {
    localStorage.setItem(LS_SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save settings to localStorage', e);
  }
}

export function getLocalProducts(): Product[] {
  try {
    const raw = localStorage.getItem(LS_PRODUCTS_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const legacyMockIds = new Set(['prod-1','prod-2','prod-3','prod-4','prod-5','prod-6','prod-7','prod-8','prod-9','prod-10','prod-11','prod-12','prod_saffron_super_negin']);
        return parsed.filter(
          (p: any) => p && p.id && !legacyMockIds.has(p.id)
        );
      }
    }
  } catch (e) {
    console.error('Failed to read products from localStorage', e);
  }
  return [];
}

export function saveLocalProducts(products: Product[]): void {
  try {
    const toSave = Array.isArray(products) ? products : [];
    localStorage.setItem(LS_PRODUCTS_KEY, JSON.stringify(toSave));
    localStorage.setItem(LS_CATALOG_INIT_FLAG, 'true');
  } catch (e) {
    console.error('Failed to save products to localStorage', e);
  }
}

export function getAdminAuthHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? sessionStorage.getItem('nama_admin_token') : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
}

export function getLocalOrders(): Order[] {
  // Customer privacy: orders are strictly accessed in real-time by authenticated admin and never persisted in browser localStorage
  return [];
}

export function saveLocalOrders(_orders: Order[]): void {
  // Never persist full customer order records in public browser localStorage
}

// -------------------------------------------------------------
// FIRESTORE API WITH LOCAL SYNC
// -------------------------------------------------------------

export function extractPublicSettings(s: StoreSettings): Record<string, any> {
  const publicKeys: (keyof StoreSettings)[] = [
    'storeName', 'slogan', 'shippingCost', 'freeShippingThreshold', 'supportPhone',
    'supportWhatsApp', 'supportInstagram', 'supportTelegram', 'supportAddress',
    'announcement', 'isStoreOpen', 'storeClosedMessage', 'shippingNote',
    'introEnabled', 'introBadge', 'introTitle', 'introSlogan', 'introSubtitle', 'introButtonText',
    'footerCopyright',
    'heroBadge', 'heroTitle', 'heroSubtitle', 'heroButtonText',
    'promoBadge', 'promoTitle', 'promoSubtitle', 'aboutText',
    'qualityBadge1', 'qualityBadge2', 'qualityBadge3', 'qualityBadge4',
    'customCategories', 'zarinpalEnabled', 'zarinpalSandbox'
  ];
  const res: Record<string, any> = {};
  for (const k of publicKeys) {
    if (s[k] !== undefined) res[k] = s[k];
  }
  return res;
}

// Fetch public settings from server & Firestore settings/public (accessible to all customers)
export async function fetchStoreSettings(): Promise<StoreSettings> {
  try {
    const res = await fetch('/api/settings/public');
    if (res.ok) {
      const data = await res.json();
      if (data?.success && data?.settings) {
        const current = getLocalSettings();
        const merged = { ...current, ...data.settings };
        saveLocalSettings(merged);
        return merged;
      }
    }
  } catch (e) {
    console.warn('Server public settings fetch notice:', e);
  }

  const path = 'settings';
  try {
    const docRef = doc(db, path, 'public');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const publicData = snap.data();
      const current = getLocalSettings();
      const merged = { ...current, ...publicData };
      saveLocalSettings(merged);
      return merged;
    }
  } catch (error) {
    console.warn('Firestore public settings fetch notice, using cached settings:', error);
  }
  return getLocalSettings();
}

// Fetch full settings including private banking/ntfy data (strictly for authenticated admin)
export async function fetchAdminSettings(): Promise<StoreSettings> {
  try {
    const res = await fetch('/api/admin/settings', {
      headers: getAdminAuthHeaders(),
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.success && data?.settings) {
        saveLocalSettings(data.settings);
        return data.settings as StoreSettings;
      }
    }
  } catch (e) {
    console.warn('Could not fetch admin settings from server:', e);
  }
  return getLocalSettings();
}

export async function updateStoreSettings(newSettings: StoreSettings): Promise<void> {
  saveLocalSettings(newSettings);
  const path = 'settings';

  // 1. Server-side authoritative save with admin auth (splits public and private data)
  const res = await fetch('/api/admin/settings/update', {
    method: 'POST',
    headers: getAdminAuthHeaders(),
    body: JSON.stringify(newSettings),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => null);
    throw new Error(errData?.error || 'خطا در ذخیره تنظیمات روی سرور');
  }

  // 2. Direct Firestore save to settings/public for real-time customer reflection
  try {
    const publicData = extractPublicSettings(newSettings);
    const docRef = doc(db, path, 'public');
    await setDoc(docRef, publicData, { merge: true });
  } catch (error) {
    console.warn('Direct Firestore public settings update notice:', error);
  }
}

// Fetch products from authoritative server storage & Firestore
export async function fetchProducts(): Promise<Product[]> {
  try {
    const res = await fetch('/api/products');
    if (res.ok) {
      const data = await res.json();
      if (data?.success && Array.isArray(data.products)) {
        saveLocalProducts(data.products);
        return data.products;
      }
    }
  } catch (e) {
    console.warn('Server /api/products fetch notice:', e);
  }

  // Fallback to Firestore
  const path = 'products';
  try {
    const querySnapshot = await getDocs(collection(db, path));
    if (!querySnapshot.empty) {
      const list: Product[] = [];
      querySnapshot.forEach(docSnap => {
        const prod = docSnap.data() as Product;
        const legacyMockIds = new Set(['prod-1','prod-2','prod-3','prod-4','prod-5','prod-6','prod-7','prod-8','prod-9','prod-10','prod-11','prod-12','prod_saffron_super_negin']);
        if (prod.id && !legacyMockIds.has(prod.id)) {
          list.push(prod);
        }
      });
      saveLocalProducts(list);
      return list;
    }
  } catch (error) {
    console.warn('Firestore products fetch notice, using cached products:', error);
  }

  const local = getLocalProducts();
  return local || [];
}

export function sanitizeForFirestore<T extends Record<string, any>>(obj: T): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        result[key] = sanitizeForFirestore(value);
      } else {
        result[key] = value;
      }
    }
  }
  return result;
}

export async function saveProduct(product: Product): Promise<void> {
  // Clean product of any undefined fields
  const cleanProduct = sanitizeForFirestore(product) as Product;
  let savedOnServer = false;

  // 1. Server-side authoritative write with admin auth
  try {
    const res = await fetch('/api/admin/products/save', {
      method: 'POST',
      headers: getAdminAuthHeaders(),
      body: JSON.stringify(cleanProduct),
    });
    if (res.ok) {
      savedOnServer = true;
    } else {
      const errData = await res.json().catch(() => null);
      if (errData?.error) throw new Error(errData.error);
    }
  } catch (err: any) {
    if (err.message && !err.message.includes('Failed to fetch')) {
      throw err;
    }
  }

  // 2. Direct client-side Firestore write for real-time propagation
  const path = 'products';
  try {
    await setDoc(doc(db, path, cleanProduct.id), cleanProduct);
  } catch (error: any) {
    if (!savedOnServer) {
      throw new Error('خطا در ذخیره محصول در پایگاه داده: ' + (error?.message || error));
    }
  }

  // Update local cache upon verified save
  const current = getLocalProducts();
  const index = current.findIndex(p => p.id === cleanProduct.id);
  let updated: Product[];
  if (index >= 0) {
    updated = [...current];
    updated[index] = cleanProduct;
  } else {
    updated = [cleanProduct, ...current];
  }
  saveLocalProducts(updated);
}

export async function deleteProduct(productId: string): Promise<void> {
  let deletedOnServer = false;

  // 1. Server-side delete with admin auth
  try {
    const res = await fetch('/api/admin/products/delete', {
      method: 'POST',
      headers: getAdminAuthHeaders(),
      body: JSON.stringify({ productId }),
    });
    if (res.ok) {
      deletedOnServer = true;
    } else {
      const errData = await res.json().catch(() => null);
      if (errData?.error) throw new Error(errData.error);
    }
  } catch (err: any) {
    if (err.message && !err.message.includes('Failed to fetch')) {
      throw err;
    }
  }

  // 2. Direct Firestore delete
  const path = 'products';
  try {
    await deleteDoc(doc(db, path, productId));
  } catch (error: any) {
    if (!deletedOnServer) {
      throw new Error('خطا در حذف محصول از پایگاه داده: ' + (error?.message || error));
    }
  }

  // Update local
  const current = getLocalProducts();
  saveLocalProducts(current.filter(p => p.id !== productId));
}

// Clear all products (wiping demo catalog in 1 click)
export async function clearAllProducts(): Promise<void> {
  const current = getLocalProducts();
  saveLocalProducts([]);
  localStorage.setItem(LS_CATALOG_INIT_FLAG, 'true');

  fetch('/api/admin/products/clear', {
    method: 'POST',
    headers: getAdminAuthHeaders()
  }).catch(() => {});

  const path = 'products';
  try {
    for (const prod of current) {
      await deleteDoc(doc(db, path, prod.id)).catch(() => {});
    }
  } catch (error) {
    console.warn('Notice while clearing products:', error);
  }
}

// Restore default sample products
export async function resetSampleProducts(): Promise<Product[]> {
  try {
    const res = await fetch('/api/admin/products/reset-samples', {
      method: 'POST',
      headers: getAdminAuthHeaders()
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.products) {
        saveLocalProducts(data.products);
        return data.products;
      }
    }
  } catch (e) {}

  saveLocalProducts(DEFAULT_PRODUCTS);
  localStorage.setItem(LS_CATALOG_INIT_FLAG, 'true');
  const path = 'products';
  try {
    for (const prod of DEFAULT_PRODUCTS) {
      await setDoc(doc(db, path, prod.id), prod).catch(() => {});
    }
  } catch (error) {
    console.warn('Notice while resetting sample products:', error);
  }
  return DEFAULT_PRODUCTS;
}

// Fetch Orders (strictly restricted to Admin)
export async function fetchOrders(): Promise<Order[]> {
  const authHeaders = getAdminAuthHeaders();
  // 1. If admin is authenticated, attempt server-side fetch with requireAdminAuth
  if (authHeaders['x-admin-token'] || authHeaders['Authorization']) {
    try {
      const res = await fetch('/api/admin/orders', {
        headers: authHeaders,
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.success && Array.isArray(data.orders)) {
          return data.orders;
        }
      }
    } catch (e) {
      console.warn('Server admin orders fetch notice:', e);
    }
  }

  // 2. Direct Firestore fetch (will succeed if user is verified owner/admin, or safely fail per rules)
  const path = 'orders';
  try {
    const querySnapshot = await getDocs(collection(db, path));
    if (!querySnapshot.empty) {
      const list: Order[] = [];
      querySnapshot.forEach(docSnap => {
        list.push(docSnap.data() as Order);
      });
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return list;
    }
    return [];
  } catch (error: any) {
    // If not signed in as admin, Firestore rules correctly deny listing orders
    if (error?.message?.includes('Missing or insufficient permissions') || error?.code === 'permission-denied') {
      return [];
    }
    console.warn('Orders fetch notice:', error);
    return [];
  }
}

// Delete an order permanently (Admin only)
export async function deleteOrder(orderId: string): Promise<void> {
  let serverDeleted = false;

  // 1. Server-side delete with admin auth
  try {
    const res = await fetch('/api/admin/orders/delete', {
      method: 'POST',
      headers: getAdminAuthHeaders(),
      body: JSON.stringify({ orderId }),
    });
    if (res.ok) {
      serverDeleted = true;
    } else {
      const errData = await res.json().catch(() => null);
      if (errData?.error) throw new Error(errData.error);
    }
  } catch (err: any) {
    if (err.message && !err.message.includes('Failed to fetch')) {
      throw err;
    }
  }

  // 2. Direct Firestore delete
  const path = 'orders';
  try {
    await deleteDoc(doc(db, path, orderId));
  } catch (error: any) {
    if (!serverDeleted) {
      throw new Error('خطا در حذف سفارش از پایگاه داده: ' + (error?.message || error));
    }
  }
}

// Clear all orders (Admin only)
export async function clearAllOrders(): Promise<void> {
  let serverCleared = false;

  try {
    const res = await fetch('/api/admin/orders/clear', {
      method: 'POST',
      headers: getAdminAuthHeaders()
    });
    if (res.ok) {
      serverCleared = true;
    } else {
      const errData = await res.json().catch(() => null);
      if (errData?.error) throw new Error(errData.error);
    }
  } catch (err: any) {
    if (err.message && !err.message.includes('Failed to fetch')) {
      throw err;
    }
  }

  const path = 'orders';
  try {
    const snap = await getDocs(collection(db, path));
    for (const d of snap.docs) {
      await deleteDoc(doc(db, path, d.id)).catch(() => {});
    }
  } catch (error: any) {
    if (!serverCleared) {
      throw new Error('خطا در پاک‌سازی سفارشات: ' + (error?.message || error));
    }
  }
}

// Save placed order locally for customer's own device history (sanitized, zero full address/card PII stored)
export function saveMyPlacedOrder(order: Order): void {
  try {
    const key = 'nama_my_recent_orders_v1';
    const raw = localStorage.getItem(key);
    const list: any[] = raw ? JSON.parse(raw) : [];
    // Sanitize customer PII: omit full street address, postal code, and payment card details from localStorage
    const safeOrder: Partial<Order> = {
      id: order.id,
      customerName: order.customerName,
      customerPhone: order.customerPhone ? `${order.customerPhone.slice(0, 4)}***${order.customerPhone.slice(-4)}` : '',
      province: order.province,
      city: order.city,
      items: order.items,
      subtotal: order.subtotal,
      shippingCost: order.shippingCost,
      totalAmount: order.totalAmount,
      status: order.status,
      paymentMethod: order.paymentMethod,
      trackingCode: order.trackingCode,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
    const filtered = list.filter(o => o.id !== order.id);
    localStorage.setItem(key, JSON.stringify([safeOrder, ...filtered].slice(0, 10)));
  } catch (e) {
    console.warn('Could not save order to local storage', e);
  }
}

export function getMyPlacedOrders(): Order[] {
  try {
    const key = 'nama_my_recent_orders_v1';
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// Create new customer order with server-authoritative atomic transaction & stock validation
export async function createOrder(order: Order, _settings: StoreSettings): Promise<Order> {
  const res = await fetch('/api/orders/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(order),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => null);
    throw new Error(errorData?.error || 'خطا در ثبت تراکنشی سفارش و بررسی موجودی در پایگاه داده.');
  }

  const data = await res.json();
  if (!data?.success || !data?.order) {
    throw new Error(data?.error || 'پاسخ نامعتبر از سرور پردازش سفارش.');
  }

  saveMyPlacedOrder(data.order);
  return data.order as Order;
}

// Submit payment receipt by customer for an existing order
export async function uploadOrderReceipt(
  orderId: string,
  phone: string,
  receiptImage: string,
  cardLast4?: string,
  paymentReference?: string
): Promise<void> {
  const res = await fetch('/api/orders/upload-receipt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderId,
      phone,
      receiptImage,
      cardLast4,
      paymentReference
    })
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => null);
    throw new Error(errData?.error || 'خطا در ثبت فیش واریزی در سرور.');
  }
}

// Update order status or postal tracking
export async function updateOrderStatus(
  orderId: string, 
  status: OrderStatus, 
  extras?: { trackingCode?: string; receiptImage?: string; notes?: string; cardLast4?: string; paymentReference?: string }
): Promise<void> {
  let serverUpdated = false;

  // 1. Server-side update with admin auth
  try {
    const res = await fetch('/api/admin/orders/update', {
      method: 'POST',
      headers: getAdminAuthHeaders(),
      body: JSON.stringify({ orderId, status, trackingCode: extras?.trackingCode }),
    });
    if (res.ok) {
      serverUpdated = true;
    } else {
      const errData = await res.json().catch(() => null);
      if (errData?.error) throw new Error(errData.error);
    }
  } catch (err: any) {
    if (err.message && !err.message.includes('Failed to fetch')) {
      throw err;
    }
  }

  // 2. Direct Firestore update
  const path = 'orders';
  try {
    await updateDoc(doc(db, path, orderId), {
      status,
      ...extras,
      updatedAt: new Date().toISOString()
    });
  } catch (error: any) {
    if (!serverUpdated) {
      throw new Error('خطا در بروزرسانی وضعیت سفارش در پایگاه داده: ' + (error?.message || error));
    }
  }
}

// Request security OTP for phone-based tracking
export async function requestTrackingOtp(phone: string): Promise<{ success: boolean; message: string; securityCode?: string }> {
  const res = await fetch('/api/orders/track/request-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone })
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || 'خطا در صدور کد تأیید امنیتی.');
  }

  return data;
}

export interface TrackingSearchParams {
  code?: string;
  phone?: string;
  otpCode?: string;
}

// Dual-Mode Flexible Order Tracking lookup
export async function searchOrderFlexible(params: TrackingSearchParams): Promise<{ order: Order | null; orders?: Order[] }> {
  const { code, phone, otpCode } = params;

  const res = await fetch('/api/orders/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderId: code?.trim(),
      phone: phone?.trim(),
      otpCode: otpCode?.trim()
    })
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || 'خطا در استعلام وضعیت سفارش.');
  }

  if (data?.success) {
    if (data.order) {
      saveMyPlacedOrder(data.order);
    }
    return {
      order: (data.order as Order) || null,
      orders: (data.orders as Order[]) || (data.order ? [data.order as Order] : [])
    };
  }

  return { order: null, orders: [] };
}

// Lookup order securely by Order ID or Phone Number (Backwards-compatible wrapper)
export async function searchOrder(orderIdQuery?: string, phoneQuery?: string, otpCode?: string): Promise<Order | null> {
  try {
    const res = await searchOrderFlexible({
      code: orderIdQuery,
      phone: phoneQuery,
      otpCode
    });
    if (res.order) return res.order;
  } catch (err: any) {
    // If exact API error was thrown, pass it through so UI displays clear message
    throw err;
  }

  // Check local orders placed on this device as fallback
  const myOrders = getMyPlacedOrders();
  const cleanId = (orderIdQuery || '').trim().toUpperCase();
  const cleanPhone = (phoneQuery || '').trim().replace(/\D/g, '');

  const localMatch = myOrders.find(o => 
    (cleanId && o.id.toUpperCase() === cleanId) || 
    (cleanPhone && cleanPhone.length >= 10 && o.customerPhone.replace(/\D/g, '').endsWith(cleanPhone.slice(-10)))
  );
  if (localMatch) return localMatch;

  return null;
}

// -------------------------------------------------------------
// SECURE SERVER-SIDE NTFY PUSH NOTIFICATIONS
// -------------------------------------------------------------
export interface NtfyPayload {
  topic?: string;
  title?: string;
  message?: string;
  tags?: string[];
  priority?: number;
  clickUrl?: string;
}

// Dispatches test notification through secure server proxy (never exposes ntfy secrets in browser)
export async function sendNtfyNotification(payload?: NtfyPayload): Promise<{ success: boolean; status: number; text: string }> {
  try {
    const res = await fetch('/api/admin/notifications/test-ntfy', {
      method: 'POST',
      headers: getAdminAuthHeaders(),
      body: JSON.stringify({ message: payload?.message })
    });

    const data = await res.json().catch(() => null);
    if (res.ok && data?.success) {
      return { success: true, status: 200, text: data.message || 'اعلان با موفقیت ارسال شد.' };
    } else {
      return { success: false, status: res.status, text: data?.error || 'خطا در ارسال اعلان به سرور ntfy' };
    }
  } catch (err: any) {
    return {
      success: false,
      status: 500,
      text: err.message || 'خطا در برقراری ارتباط با سرور'
    };
  }
}

// Re-sends full order notification from server
export async function resendOrderNotification(orderId: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}/resend-ntfy`, {
    method: 'POST',
    headers: getAdminAuthHeaders()
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || 'خطا در ارسال مجدد اعلان سفارش به ntfy.');
  }

  return data;
}

// -------------------------------------------------------------
// REAL-TIME LISTENERS (برای همگام‌سازی لحظه‌ای میان تمام گوشی‌ها)
// -------------------------------------------------------------

export function subscribeToProducts(callback: (products: Product[]) => void): () => void {
  const path = 'products';
  let unsubFirestore: (() => void) | null = null;
  try {
    unsubFirestore = onSnapshot(
      collection(db, path),
      (snapshot) => {
        const list: Product[] = [];
        snapshot.forEach((docSnap) => {
          const prod = docSnap.data() as Product;
          if (!['prod-1','prod-2','prod-3','prod-4','prod-5','prod-6','prod-7','prod-8','prod-9','prod-10','prod-11','prod-12'].includes(prod.id)) {
            list.push(prod);
          }
        });
        if (list.length > 0) {
          saveLocalProducts(list);
          callback(list);
        }
      },
      (error) => {
        console.warn('Real-time products sync notice:', error);
      }
    );
  } catch {}

  // Active polling to /api/products every 3.5 seconds to guarantee cross-device instant sync
  let lastProductsHash = '';
  const pollTimer = setInterval(async () => {
    try {
      const res = await fetch('/api/products');
      if (res.ok) {
        const data = await res.json();
        if (data?.success && Array.isArray(data.products)) {
          const hash = JSON.stringify(data.products.map((p: any) => `${p.id}:${p.price}:${p.stock}:${p.updatedAt || ''}:${p.name}`));
          if (hash !== lastProductsHash) {
            lastProductsHash = hash;
            saveLocalProducts(data.products);
            callback(data.products);
          }
        }
      }
    } catch {}
  }, 3500);

  return () => {
    if (unsubFirestore) unsubFirestore();
    clearInterval(pollTimer);
  };
}

export function subscribeToOrders(callback: (orders: Order[]) => void): () => void {
  const path = 'orders';
  let unsubFirestore: (() => void) | null = null;
  try {
    unsubFirestore = onSnapshot(
      collection(db, path),
      (snapshot) => {
        const list: Order[] = [];
        snapshot.forEach((docSnap) => {
          list.push(docSnap.data() as Order);
        });
        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        callback(list);
      },
      (error) => {
        console.warn('Real-time orders sync notice:', error);
      }
    );
  } catch {}

  // Active polling for admin when logged in to immediately receive orders placed from customers' phones
  let lastOrdersHash = '';
  const pollTimer = setInterval(async () => {
    const token = typeof window !== 'undefined' ? sessionStorage.getItem('nama_admin_token') : null;
    if (!token) return;
    try {
      const res = await fetch('/api/admin/orders', {
        headers: getAdminAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.success && Array.isArray(data.orders)) {
          const hash = JSON.stringify(data.orders.map((o: any) => `${o.id}:${o.status}:${o.updatedAt || ''}`));
          if (hash !== lastOrdersHash) {
            lastOrdersHash = hash;
            callback(data.orders);
          }
        }
      }
    } catch {}
  }, 3500);

  return () => {
    if (unsubFirestore) unsubFirestore();
    clearInterval(pollTimer);
  };
}

export function subscribeToSettings(callback: (settings: StoreSettings) => void): () => void {
  const path = 'settings';
  return onSnapshot(
    doc(db, path, 'public'),
    (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as Partial<StoreSettings>;
        const current = getLocalSettings();
        const merged = { ...current, ...data };
        saveLocalSettings(merged);
        callback(merged);
      }
    },
    (error) => {
      console.warn('Real-time settings sync notice:', error);
      callback(getLocalSettings());
    }
  );
}
