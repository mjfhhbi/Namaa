import crypto from 'crypto';
import { doc, runTransaction } from 'firebase/firestore';
import { normalizeIranianPhone, isValidIranianMobile, toEnglishDigits } from '../utils/phone';

// Simple Async Mutex to serialize order placements and prevent stock race conditions
class AsyncMutex {
  private queue: Promise<void> = Promise.resolve();

  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    let release: () => void;
    const waitPromise = new Promise<void>(resolve => { release = resolve; });
    const currentQueue = this.queue;
    this.queue = currentQueue.then(() => waitPromise);
    await currentQueue;
    try {
      return await fn();
    } finally {
      release!();
    }
  }
}

export const orderCreationMutex = new AsyncMutex();

// In-memory idempotency cache (expires after 2 minutes)
interface IdempotencyRecord {
  orderId: string;
  order: any;
  timestamp: number;
}
const idempotencyCache = new Map<string, IdempotencyRecord>();

// Clean expired idempotency keys periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of idempotencyCache.entries()) {
    if (now - record.timestamp > 2 * 60 * 1000) {
      idempotencyCache.delete(key);
    }
  }
}, 60 * 1000);

export function generateCollisionFreeOrderId(): string {
  const timestampPart = Date.now().toString(36).toUpperCase();
  const randomPart = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `NM-${timestampPart}-${randomPart}`;
}

export interface CreateOrderParams {
  customerName?: string;
  customerPhone?: string;
  province?: string;
  city?: string;
  address?: string;
  postalCode?: string;
  items?: any[];
  discountCode?: string;
  paymentMethod?: string;
  cardLast4?: string;
  paymentReference?: string;
  receiptImage?: string;
  notes?: string;
  idempotencyKey?: string;
}

export async function processOrderCreation(
  params: CreateOrderParams,
  db: any,
  adminDb: any,
  serverSettingsCache: { public: any; private: any },
  persistServerOrder: (order: any) => void
): Promise<{ success: boolean; order?: any; error?: string; status: number }> {
  return await orderCreationMutex.runExclusive(async () => {
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
      idempotencyKey,
    } = params;

    // 1. Contact validation
    if (!customerName || typeof customerName !== 'string' || customerName.trim().length < 2 || customerName.trim().length > 100) {
      return { success: false, status: 400, error: 'نام و نام خانوادگی خریدار الزامی است (بین ۲ تا ۱۰۰ کاراکتر).' };
    }

    const cleanPhone = normalizeIranianPhone(customerPhone || '');
    if (!cleanPhone || !isValidIranianMobile(cleanPhone)) {
      return { success: false, status: 400, error: 'شماره تلفن همراه وارد شده نامعتبر است. لطفاً شماره موبایل ۱۱ رقمی (مثال: ۰۹۱۲۳۴۵۶۷۸۹) را وارد نمایید.' };
    }

    if (!address || typeof address !== 'string' || address.trim().length < 5 || address.trim().length > 500) {
      return { success: false, status: 400, error: 'آدرس پستی کامل تحویل‌گیرنده الزامی است (حداقل ۵ کاراکتر).' };
    }

    const cleanPostal = toEnglishDigits(postalCode || '').replace(/\D/g, '').slice(0, 10);
    if (postalCode && cleanPostal.length !== 10) {
      return { success: false, status: 400, error: 'کد پستی باید دقیقاً ۱۰ رقم باشد.' };
    }

    if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
      return { success: false, status: 400, error: 'سبد خرید نامعتبر است (باید بین ۱ تا ۵۰ قلم کالا داشته باشد).' };
    }

    // 2. Compute idempotency key / request fingerprint
    const sortedItemsSummary = [...items]
      .map(i => `${String(i.productId || i.product?.id)}:${i.quantity}`)
      .sort()
      .join('|');
    const autoFingerprint = crypto
      .createHash('sha256')
      .update(`${cleanPhone}:${cleanPostal}:${sortedItemsSummary}`)
      .digest('hex');
    const effectiveKey = idempotencyKey?.trim() || autoFingerprint;

    const existingRecord = idempotencyCache.get(effectiveKey);
    if (existingRecord) {
      return {
        success: true,
        status: 200,
        order: existingRecord.order
      };
    }

    // 3. Aggregate quantities per productId and validate integer positive quantities
    const aggregatedQuantities = new Map<string, number>();
    for (const item of items) {
      const prodId = String(item.productId || item.product?.id || '').trim();
      const rawQty = item.quantity;

      if (!prodId) {
        return { success: false, status: 400, error: 'شناسه محصول الزامی است.' };
      }

      if (typeof rawQty !== 'number' || !Number.isInteger(rawQty) || rawQty <= 0 || rawQty > 50) {
        return {
          success: false,
          status: 400,
          error: `تعداد سفارش برای هر محصول باید یک عدد صحیح مثبت بین ۱ تا ۵۰ باشد (مقدار نامعتبر: ${rawQty}).`
        };
      }

      aggregatedQuantities.set(prodId, (aggregatedQuantities.get(prodId) || 0) + rawQty);
    }

    // 4. Atomic Firestore Transaction for Order Creation & Stock Decrement
    // Enforces all reads before all writes and rolls back atomically on any failure
    const orderId = generateCollisionFreeOrderId();
    let finalOrderData: any = null;

    try {
      if (adminDb) {
        await adminDb.runTransaction(async (transaction: any) => {
          // PHASE 1: ALL READS FIRST
          const productDocs: { ref: any; data: any; requestedQty: number }[] = [];
          let computedSubtotal = 0;
          const verifiedItems: any[] = [];

          for (const [productId, aggregateQty] of aggregatedQuantities.entries()) {
            const prodRef = adminDb.collection('products').doc(productId);
            const docSnap = await transaction.get(prodRef);

            if (!docSnap.exists) {
              throw new Error(`محصول با شناسه ${productId} در پایگاه داده فروشگاه یافت نشد.`);
            }

            const prodData = docSnap.data();
            const currentStock = Number(prodData.stock ?? 0);
            if (currentStock < aggregateQty) {
              throw new Error(`موجودی محصول «${prodData.name || productId}» کافی نیست (موجودی فعلی: ${currentStock} عدد، درخواستی: ${aggregateQty} عدد).`);
            }

            const realPrice = Number(prodData.price) || 0;
            computedSubtotal += realPrice * aggregateQty;

            verifiedItems.push({
              productId,
              name: prodData.name || 'محصول ناما',
              price: realPrice,
              weight: prodData.weight || 'بسته استاندارد',
              image: prodData.image || '',
              quantity: aggregateQty,
            });

            productDocs.push({
              ref: prodRef,
              data: prodData,
              requestedQty: aggregateQty,
            });
          }

          // Calculate shipping from server configuration
          let appliedShipping = Number(serverSettingsCache.public.shippingCost) || 0;
          const freeThreshold = Number(serverSettingsCache.public.freeShippingThreshold) || 0;
          if (freeThreshold > 0 && computedSubtotal >= freeThreshold) {
            appliedShipping = 0;
          }

          // Calculate discount coupon from server private settings
          let computedDiscount = 0;
          let validDiscountCode: string | undefined = undefined;
          if (discountCode && typeof discountCode === 'string') {
            const cleanCode = discountCode.trim().toUpperCase();
            const coupons = Array.isArray(serverSettingsCache.private.discountCodes)
              ? serverSettingsCache.private.discountCodes
              : [];
            const matched = coupons.find((c: any) => c.code?.toUpperCase() === cleanCode && c.isActive);
            if (matched) {
              if (!matched.minPurchase || computedSubtotal >= matched.minPurchase) {
                if (matched.type === 'percent') {
                  computedDiscount = Math.round((computedSubtotal * matched.amount) / 100);
                  if (matched.maxDiscount && computedDiscount > matched.maxDiscount) {
                    computedDiscount = matched.maxDiscount;
                  }
                } else {
                  computedDiscount = Number(matched.amount) || 0;
                }
                validDiscountCode = cleanCode;
              }
            }
          }

          const computedTotalAmount = Math.max(0, computedSubtotal + appliedShipping - computedDiscount);

          const newOrder: Record<string, any> = {
            id: orderId,
            customerName: customerName.trim(),
            customerPhone: cleanPhone,
            province: (province || 'تهران').trim(),
            city: (city || '').trim(),
            address: address.trim(),
            postalCode: cleanPostal,
            items: verifiedItems,
            subtotal: computedSubtotal,
            shippingCost: appliedShipping,
            totalAmount: computedTotalAmount,
            status: paymentMethod === 'card_to_card' ? 'paid_pending_approval' : 'pending_receipt',
            paymentMethod,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          if (validDiscountCode) newOrder.discountCode = validDiscountCode;
          if (computedDiscount > 0) newOrder.discountAmount = computedDiscount;
          if (cardLast4) newOrder.cardLast4 = toEnglishDigits(String(cardLast4)).replace(/\D/g, '').slice(0, 4);
          if (paymentReference) newOrder.paymentReference = toEnglishDigits(String(paymentReference)).trim();
          if (receiptImage) newOrder.receiptImage = receiptImage;
          if (notes) newOrder.notes = String(notes).trim();

          // PHASE 2: ALL WRITES IN THE SAME TRANSACTION
          // 1. Write the order
          const orderRef = adminDb.collection('orders').doc(orderId);
          transaction.set(orderRef, newOrder);

          // 2. Decrement stock atomically
          for (const item of productDocs) {
            const currentStock = Number(item.data.stock ?? 0);
            const newStock = Math.max(0, currentStock - item.requestedQty);
            transaction.update(item.ref, {
              stock: newStock,
              updatedAt: new Date().toISOString()
            });
          }

          finalOrderData = newOrder;
        });
      } else {
        // Use client SDK runTransaction on db
        await runTransaction(db, async (transaction) => {
          // PHASE 1: ALL READS FIRST
          const productDocs: { ref: any; data: any; requestedQty: number }[] = [];
          let computedSubtotal = 0;
          const verifiedItems: any[] = [];

          for (const [productId, aggregateQty] of aggregatedQuantities.entries()) {
            const prodRef = doc(db, 'products', productId);
            const prodSnap = await transaction.get(prodRef);

            if (!prodSnap.exists()) {
              throw new Error(`محصول با شناسه ${productId} در پایگاه داده فروشگاه یافت نشد.`);
            }

            const prodData = prodSnap.data();
            const currentStock = Number(prodData.stock ?? 0);
            if (currentStock < aggregateQty) {
              throw new Error(`موجودی محصول «${prodData.name || productId}» کافی نیست (موجودی فعلی: ${currentStock} عدد، درخواستی: ${aggregateQty} عدد).`);
            }

            const realPrice = Number(prodData.price) || 0;
            computedSubtotal += realPrice * aggregateQty;

            verifiedItems.push({
              productId,
              name: prodData.name || 'محصول ناما',
              price: realPrice,
              weight: prodData.weight || 'بسته استاندارد',
              image: prodData.image || '',
              quantity: aggregateQty,
            });

            productDocs.push({
              ref: prodRef,
              data: prodData,
              requestedQty: aggregateQty,
            });
          }

          // Calculate shipping from server configuration
          let appliedShipping = Number(serverSettingsCache.public.shippingCost) || 0;
          const freeThreshold = Number(serverSettingsCache.public.freeShippingThreshold) || 0;
          if (freeThreshold > 0 && computedSubtotal >= freeThreshold) {
            appliedShipping = 0;
          }

          // Calculate discount coupon from server private settings
          let computedDiscount = 0;
          let validDiscountCode: string | undefined = undefined;
          if (discountCode && typeof discountCode === 'string') {
            const cleanCode = discountCode.trim().toUpperCase();
            const coupons = Array.isArray(serverSettingsCache.private.discountCodes)
              ? serverSettingsCache.private.discountCodes
              : [];
            const matched = coupons.find((c: any) => c.code?.toUpperCase() === cleanCode && c.isActive);
            if (matched) {
              if (!matched.minPurchase || computedSubtotal >= matched.minPurchase) {
                if (matched.type === 'percent') {
                  computedDiscount = Math.round((computedSubtotal * matched.amount) / 100);
                  if (matched.maxDiscount && computedDiscount > matched.maxDiscount) {
                    computedDiscount = matched.maxDiscount;
                  }
                } else {
                  computedDiscount = Number(matched.amount) || 0;
                }
                validDiscountCode = cleanCode;
              }
            }
          }

          const computedTotalAmount = Math.max(0, computedSubtotal + appliedShipping - computedDiscount);

          const newOrder: Record<string, any> = {
            id: orderId,
            customerName: customerName.trim(),
            customerPhone: cleanPhone,
            province: (province || 'تهران').trim(),
            city: (city || '').trim(),
            address: address.trim(),
            postalCode: cleanPostal,
            items: verifiedItems,
            subtotal: computedSubtotal,
            shippingCost: appliedShipping,
            totalAmount: computedTotalAmount,
            status: paymentMethod === 'card_to_card' ? 'paid_pending_approval' : 'pending_receipt',
            paymentMethod,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          if (validDiscountCode) newOrder.discountCode = validDiscountCode;
          if (computedDiscount > 0) newOrder.discountAmount = computedDiscount;
          if (cardLast4) newOrder.cardLast4 = toEnglishDigits(String(cardLast4)).replace(/\D/g, '').slice(0, 4);
          if (paymentReference) newOrder.paymentReference = toEnglishDigits(String(paymentReference)).trim();
          if (receiptImage) newOrder.receiptImage = receiptImage;
          if (notes) newOrder.notes = String(notes).trim();

          // PHASE 2: ALL WRITES IN THE SAME TRANSACTION
          // 1. Write the order
          const orderRef = doc(db, 'orders', orderId);
          transaction.set(orderRef, newOrder);

          // 2. Decrement stock atomically
          for (const item of productDocs) {
            const currentStock = Number(item.data.stock ?? 0);
            const newStock = Math.max(0, currentStock - item.requestedQty);
            transaction.update(item.ref, {
              stock: newStock,
              updatedAt: new Date().toISOString()
            });
          }

          finalOrderData = newOrder;
        });
      }
    } catch (txErr: any) {
      console.error('[Order] Transaction aborted/failed:', txErr);
      // Never report success when transaction fails. Stock is guaranteed NOT decremented.
      return {
        success: false,
        status: 400,
        error: txErr.message || 'خطا در ثبت تراکنشی سفارش و بررسی موجودی در پایگاه داده.'
      };
    }

    const cleanOrder = finalOrderData;
    if (!cleanOrder) {
      return {
        success: false,
        status: 500,
        error: 'خطای سیستمی در فرآیند تراکنشی ثبت سفارش.'
      };
    }

    // Persist in secure server-side orders cache
    persistServerOrder(cleanOrder);

    // 10. Record in idempotency cache
    idempotencyCache.set(effectiveKey, {
      orderId,
      order: cleanOrder,
      timestamp: Date.now()
    });

    // 11. Send privacy-preserving instant ntfy push notification to store owner
    try {
      const topic = serverSettingsCache.private.ntfyTopic || 'nama_store_orders_1383';
      const cleanTopic = topic.trim().replace(/^https?:\/\/ntfy\.sh\//, '');
      if (cleanTopic) {
        const maskedName = cleanOrder.customerName.length > 3
          ? `${cleanOrder.customerName.slice(0, 3)}***`
          : cleanOrder.customerName;

        fetch(`https://ntfy.sh/${cleanTopic}`, {
          method: 'POST',
          headers: {
            'Title': encodeURIComponent(`🌿 سفارش جدید ناما (${orderId})`),
            'Priority': '4',
            'Tags': 'shopping_cart,package,dollar'
          },
          body: `سفارش جدید ${orderId} به مبلغ ${cleanOrder.totalAmount.toLocaleString('fa-IR')} تومان ثبت شد.\nنام: ${maskedName}\nشهر: ${cleanOrder.city}\n(جزئیات کامل، شماره تماس و آدرس فقط در پنل امن مدیریت ثبت گردید)`
        }).catch(() => {});
      }
    } catch (_e) {}

    return {
      success: true,
      status: 200,
      order: cleanOrder
    };
  });
}
