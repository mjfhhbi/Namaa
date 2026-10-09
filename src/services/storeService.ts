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

const LS_PRODUCTS_KEY = 'nama_store_products_v2';
const LS_ORDERS_KEY = 'nama_store_orders_v2';
const LS_SETTINGS_KEY = 'nama_store_settings_v2';

// Local storage helpers for immediate responsive UI and fallback
export function getLocalSettings(): StoreSettings {
  try {
    const raw = localStorage.getItem(LS_SETTINGS_KEY);
    if (raw) return JSON.parse(raw);
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
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.error('Failed to read products from localStorage', e);
  }
  return DEFAULT_PRODUCTS;
}

export function saveLocalProducts(products: Product[]): void {
  try {
    localStorage.setItem(LS_PRODUCTS_KEY, JSON.stringify(products));
  } catch (e) {
    console.error('Failed to save products to localStorage', e);
  }
}

export function getLocalOrders(): Order[] {
  try {
    const raw = localStorage.getItem(LS_ORDERS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.error('Failed to read orders from localStorage', e);
  }
  return SAMPLE_ORDERS;
}

export function saveLocalOrders(orders: Order[]): void {
  try {
    localStorage.setItem(LS_ORDERS_KEY, JSON.stringify(orders));
  } catch (e) {
    console.error('Failed to save orders to localStorage', e);
  }
}

// -------------------------------------------------------------
// FIRESTORE API WITH LOCAL SYNC
// -------------------------------------------------------------

// Fetch or seed settings
export async function fetchStoreSettings(): Promise<StoreSettings> {
  const path = 'settings';
  try {
    const docRef = doc(db, path, 'main');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data() as StoreSettings;
      saveLocalSettings(data);
      return data;
    } else {
      // Seed default settings to Firestore
      const initial = getLocalSettings();
      await setDoc(docRef, initial);
      return initial;
    }
  } catch (error) {
    console.warn('Firestore settings fetch notice, using cached settings:', error);
    return getLocalSettings();
  }
}

export async function updateStoreSettings(newSettings: StoreSettings): Promise<void> {
  saveLocalSettings(newSettings);
  const path = 'settings';
  try {
    const docRef = doc(db, path, 'main');
    await setDoc(docRef, newSettings);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// Fetch or seed products
export async function fetchProducts(): Promise<Product[]> {
  const path = 'products';
  try {
    const querySnapshot = await getDocs(collection(db, path));
    if (!querySnapshot.empty) {
      const list: Product[] = [];
      querySnapshot.forEach(docSnap => {
        list.push(docSnap.data() as Product);
      });
      saveLocalProducts(list);
      return list;
    } else {
      // Seed initial products to Firestore
      const initial = getLocalProducts();
      for (const prod of initial) {
        await setDoc(doc(db, path, prod.id), prod);
      }
      return initial;
    }
  } catch (error) {
    console.warn('Firestore products fetch notice, using cached products:', error);
    return getLocalProducts();
  }
}

export async function saveProduct(product: Product): Promise<void> {
  // Update local
  const current = getLocalProducts();
  const index = current.findIndex(p => p.id === product.id);
  let updated: Product[];
  if (index >= 0) {
    updated = [...current];
    updated[index] = product;
  } else {
    updated = [product, ...current];
  }
  saveLocalProducts(updated);

  // Update firestore
  const path = 'products';
  try {
    await setDoc(doc(db, path, product.id), product);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${path}/${product.id}`);
  }
}

export async function deleteProduct(productId: string): Promise<void> {
  // Update local
  const current = getLocalProducts();
  saveLocalProducts(current.filter(p => p.id !== productId));

  // Update firestore
  const path = 'products';
  try {
    await deleteDoc(doc(db, path, productId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${path}/${productId}`);
  }
}

// Clear all products (wiping demo catalog in 1 click)
export async function clearAllProducts(): Promise<void> {
  const current = getLocalProducts();
  saveLocalProducts([]);

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

// Fetch Orders
export async function fetchOrders(): Promise<Order[]> {
  const path = 'orders';
  try {
    const querySnapshot = await getDocs(collection(db, path));
    if (!querySnapshot.empty) {
      const list: Order[] = [];
      querySnapshot.forEach(docSnap => {
        list.push(docSnap.data() as Order);
      });
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      saveLocalOrders(list);
      return list;
    } else {
      // Seed initial sample orders
      const samples = getLocalOrders();
      for (const ord of samples) {
        await setDoc(doc(db, path, ord.id), ord);
      }
      return samples;
    }
  } catch (error) {
    console.warn('Firestore orders fetch notice, using cached orders:', error);
    return getLocalOrders();
  }
}

// Create new customer order & send notification
export async function createOrder(order: Order, settings: StoreSettings): Promise<void> {
  // Update local
  const current = getLocalOrders();
  saveLocalOrders([order, ...current]);

  // Firestore write
  const path = 'orders';
  try {
    await setDoc(doc(db, path, order.id), order);
  } catch (error) {
    console.warn('Firestore order write notice:', error);
  }

  // Send ntfy notification to store owner!
  try {
    await sendNtfyNotification({
      topic: settings.ntfyTopic || 'nama_store_orders_1383',
      title: `🌿 سفارش جدید در ناما (${order.id})`,
      message: `مشتری: ${order.customerName}\nمبلغ کل: ${order.totalAmount.toLocaleString('fa-IR')} تومان\nشماره تماس: ${order.customerPhone}\nشهر: ${order.city}`,
      tags: ['shopping_cart', 'package', 'dollar'],
      priority: 4,
    });
  } catch (e) {
    console.error('ntfy notification error:', e);
  }
}

// Update order status or postal tracking
export async function updateOrderStatus(
  orderId: string, 
  status: OrderStatus, 
  extras?: { trackingCode?: string; receiptImage?: string; notes?: string; cardLast4?: string; paymentReference?: string }
): Promise<void> {
  const current = getLocalOrders();
  const orderIdx = current.findIndex(o => o.id === orderId);
  if (orderIdx >= 0) {
    current[orderIdx] = {
      ...current[orderIdx],
      status,
      ...extras,
      updatedAt: new Date().toISOString()
    };
    saveLocalOrders([...current]);
  }

  const path = 'orders';
  try {
    await updateDoc(doc(db, path, orderId), {
      status,
      ...extras,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${path}/${orderId}`);
  }
}

// Lookup order by Tracking ID or Phone Number
export async function searchOrder(query: string): Promise<Order | null> {
  const clean = query.trim().toUpperCase();
  const orders = getLocalOrders();
  
  const found = orders.find(o => 
    o.id.toUpperCase() === clean || 
    o.customerPhone.replace(/[\s-]/g, '') === clean.replace(/[\s-]/g, '')
  );

  if (found) return found;

  // Try Firestore direct get if query matches ID format
  const path = 'orders';
  try {
    const docSnap = await getDoc(doc(db, path, clean));
    if (docSnap.exists()) {
      return docSnap.data() as Order;
    }
  } catch (error) {
    console.warn('Order search query notice:', error);
  }

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
