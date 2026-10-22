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
import { Product, Order, StoreSettings, OrderStatus } from '../types';
import { DEFAULT_PRODUCTS, DEFAULT_SETTINGS, SAMPLE_ORDERS } from '../data/defaultProducts';
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

      // If categories still contain old honey/dates mock items
      if (Array.isArray(parsed.customCategories)) {
        parsed.customCategories = parsed.customCategories.filter(
          (c: any) => c.id !== 'honey' && c.id !== 'dates' && !c.name?.includes('عسل') && !c.name?.includes('خرما')
        );
      }
      if (!parsed.customCategories) {
        parsed.customCategories = [];
      }

      // Sanitize subtitle texts if they contain legacy honey/dates references
      if (parsed.heroSubtitle && (parsed.heroSubtitle.includes('عسل') || parsed.heroSubtitle.includes('خرما'))) {
        parsed.heroSubtitle = DEFAULT_SETTINGS.heroSubtitle;
      }
      if (parsed.promoSubtitle && (parsed.promoSubtitle.includes('عسل') || parsed.promoSubtitle.includes('خرما'))) {
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
        const legacyMockIds = new Set(['prod-1','prod-2','prod-3','prod-4','prod-5','prod-6','prod-7','prod-8','prod-9','prod-10','prod-11','prod-12']);
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
    localStorage.setItem(LS_PRODUCTS_KEY, JSON.stringify(products));
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

// Fetch public settings from Firestore settings/public (accessible to all customers)
export async function fetchStoreSettings(): Promise<StoreSettings> {
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

// Fetch products from Firestore (zero mock products)
export async function fetchProducts(): Promise<Product[]> {
  const path = 'products';
  try {
    const querySnapshot = await getDocs(collection(db, path));
    if (!querySnapshot.empty) {
      const list: Product[] = [];
      querySnapshot.forEach(docSnap => {
        const prod = docSnap.data() as Product;
        // Purge old mock products (prod-1 to prod-12) if they were created earlier
        if (prod.id && prod.id.startsWith('prod-') && ['prod-1','prod-2','prod-3','prod-4','prod-5','prod-6','prod-7','prod-8','prod-9','prod-10','prod-11','prod-12'].includes(prod.id)) {
          deleteDoc(doc(db, path, prod.id)).catch(() => {});
          return;
        }
        list.push(prod);
      });
      saveLocalProducts(list);
      return list;
    } else {
      saveLocalProducts([]);
      return [];
    }
  } catch (error) {
    console.warn('Firestore products fetch notice, using cached products:', error);
    return getLocalProducts();
  }
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

// Lookup order securely by Order ID and Phone Number
export async function searchOrder(orderIdQuery: string, phoneQuery?: string): Promise<Order | null> {
  const cleanId = orderIdQuery.trim().toUpperCase();
  const cleanPhone = (phoneQuery || '').trim();

  // 1. Try secure server-side tracking endpoint (checks phone matching to prevent data leak)
  try {
    const res = await fetch('/api/orders/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: cleanId, phone: cleanPhone })
    });

    if (res.ok) {
      const data = await res.json();
      if (data?.success && data?.order) {
        return data.order as Order;
      }
    } else {
      const errRes = await res.json().catch(() => null);
      if (errRes?.error) {
        throw new Error(errRes.error);
      }
    }
  } catch (err: any) {
    if (err.message && (err.message.includes('مطابقت ندارد') || err.message.includes('یافت نشد'))) {
      throw err;
    }
    console.warn('API tracking endpoint notice:', err);
  }

  // 2. Check local orders placed on this device
  const myOrders = getMyPlacedOrders();
  const localMatch = myOrders.find(o => 
    o.id.toUpperCase() === cleanId || 
    (cleanPhone && o.customerPhone.replace(/[\s-]/g, '').endsWith(cleanPhone.replace(/[\s-]/g, '').slice(-7)))
  );
  if (localMatch) return localMatch;

  return null;
}

// -------------------------------------------------------------
// NTFY PUSH NOTIFICATION SENDER
// -------------------------------------------------------------
export interface NtfyPayload {
  topic: string;
  title: string;
  message: string;
  tags?: string[];
  priority?: number; // 1 = min, 3 = default, 4 = high, 5 = urgent
  clickUrl?: string;
}

export async function sendNtfyNotification(payload: NtfyPayload): Promise<{ success: boolean; status: number; text: string }> {
  const cleanTopic = payload.topic.trim().replace(/^https?:\/\/ntfy\.sh\//, '');
  if (!cleanTopic) {
    return { success: false, status: 400, text: 'نام تاپیک ntfy خالی است' };
  }

  try {
    const headers: Record<string, string> = {
      'Title': encodeURIComponent(payload.title),
      'Priority': String(payload.priority || 3),
    };

    if (payload.tags && payload.tags.length > 0) {
      headers['Tags'] = payload.tags.join(',');
    }

    if (payload.clickUrl) {
      headers['Click'] = payload.clickUrl;
    }

    const res = await fetch(`https://ntfy.sh/${cleanTopic}`, {
      method: 'POST',
      body: payload.message,
      headers,
    });

    const resText = await res.text();
    return {
      success: res.ok,
      status: res.status,
      text: res.ok ? 'ارسال شد' : resText
    };
  } catch (err: any) {
    console.error('Failed to dispatch ntfy push notification:', err);
    return {
      success: false,
      status: 500,
      text: err.message || 'خطا در برقراری ارتباط با سرور ntfy'
    };
  }
}

// -------------------------------------------------------------
// REAL-TIME LISTENERS (برای همگام‌سازی لحظه‌ای میان تمام گوشی‌ها)
// -------------------------------------------------------------

export function subscribeToProducts(callback: (products: Product[]) => void): () => void {
  const path = 'products';
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      const list: Product[] = [];
      snapshot.forEach((docSnap) => {
        const prod = docSnap.data() as Product;
        if (!['prod-1','prod-2','prod-3','prod-4','prod-5','prod-6','prod-7','prod-8','prod-9','prod-10','prod-11','prod-12'].includes(prod.id)) {
          list.push(prod);
        }
      });
      saveLocalProducts(list);
      callback(list);
    },
    (error) => {
      console.warn('Real-time products sync notice:', error);
      callback(getLocalProducts());
    }
  );
}


export function subscribeToOrders(callback: (orders: Order[]) => void): () => void {
  const path = 'orders';
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      const list: Order[] = [];
      snapshot.forEach((docSnap) => {
        list.push(docSnap.data() as Order);
      });
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      saveLocalOrders(list);
      callback(list);
    },
    (error) => {
      console.warn('Real-time orders sync notice:', error);
      callback(getLocalOrders());
    }
  );
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
