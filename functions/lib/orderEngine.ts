/**
 * Cloudflare Edge Order Processing Engine with Atomic Firestore Transactions
 * Zero Node.js modules, zero in-memory locks, 100% Web Standards
 */

import { FirestoreClientInterface, toFirestoreValue } from './firestoreRest';

export interface ValidatedOrderItem {
  productId: string;
  name: string;
  price: number;
  weight: string;
  image: string;
  quantity: number;
}

export interface ValidatedOrder {
  id: string;
  customerName: string;
  customerPhone: string;
  province: string;
  city: string;
  address: string;
  postalCode: string;
  items: ValidatedOrderItem[];
  subtotal: number;
  shippingCost: number;
  discountCode?: string;
  discountAmount?: number;
  totalAmount: number;
  status: 'pending_receipt' | 'paid_pending_approval';
  paymentMethod: 'card_to_card' | 'zarinpal';
  receiptImage?: string;
  cardLast4?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// Digits normalizer
export function toEnglishDigits(str: string): string {
  if (!str) return '';
  const farsiDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  let res = String(str);
  for (let i = 0; i < 10; i++) {
    res = res.replaceAll(farsiDigits[i], String(i)).replaceAll(arabicDigits[i], String(i));
  }
  return res;
}

export function normalizeIranianPhone(raw: string): string {
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

export function isValidIranianMobile(phone: string): boolean {
  const norm = normalizeIranianPhone(phone);
  return /^09\d{9}$/.test(norm);
}

export function generateCollisionFreeOrderId(): string {
  const timestampPart = Date.now().toString(36).toUpperCase();
  const randomBytes = new Uint8Array(4);
  crypto.getRandomValues(randomBytes);
  const randomPart = Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase().slice(0, 6);
  return `NM-${timestampPart}-${randomPart}`;
}

export function generateCheckoutIntentId(): string {
  const time = Date.now().toString(36);
  const randomBytes = new Uint8Array(8);
  crypto.getRandomValues(randomBytes);
  const rand = Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `chk_${time}_${rand}`;
}

export async function computePayloadFingerprint(
  phone: string,
  postal: string,
  address: string,
  items: { productId: string; quantity: number }[],
  discountCode?: string
): Promise<string> {
  const summary = [...items]
    .map(i => `${i.productId}:${i.quantity}`)
    .sort()
    .join('|');
  const rawKey = `${phone}:${postal}:${address.trim().slice(0, 50)}:${summary}:${discountCode || ''}`;
  const enc = new TextEncoder();
  const hashBuf = await crypto.subtle.digest('SHA-256', enc.encode(rawKey));
  const hashArr = Array.from(new Uint8Array(hashBuf));
  return hashArr.map(b => b.toString(16).padStart(2, '0')).join('');
}

export interface CreateOrderInput {
  customerName?: string;
  customerPhone?: string;
  province?: string;
  city?: string;
  address?: string;
  postalCode?: string;
  items?: any[];
  discountCode?: string;
  paymentMethod?: string;
  receiptImage?: string;
  cardLast4?: string;
  notes?: string;
  idempotencyKey?: string;
}

/**
 * Validates raw request payload before transaction starts
 */
export function validateOrderInput(input: CreateOrderInput): { valid: boolean; error?: string; cleanData?: any } {
  if (!input || typeof input !== 'object') {
    return { valid: false, error: 'اطلاعات ارسالی سفارش نامعتبر است.' };
  }

  const { customerName, customerPhone, address, postalCode, items } = input;

  if (!customerName || typeof customerName !== 'string' || customerName.trim().length < 2 || customerName.trim().length > 100) {
    return { valid: false, error: 'نام و نام خانوادگی خریدار الزامی است (بین ۲ تا ۱۰۰ کاراکتر).' };
  }

  const cleanPhone = normalizeIranianPhone(customerPhone || '');
  if (!cleanPhone || !isValidIranianMobile(cleanPhone)) {
    return { valid: false, error: 'شماره تلفن همراه نامعتبر است. لطفاً شماره موبایل ۱۱ رقمی (مثال: ۰۹۱۲۳۴۵۶۷۸۹) را وارد نمایید.' };
  }

  if (!address || typeof address !== 'string' || address.trim().length < 5 || address.trim().length > 500) {
    return { valid: false, error: 'آدرس پستی کامل تحویل‌گیرنده الزامی است (حداقل ۵ کاراکتر).' };
  }

  const cleanPostal = toEnglishDigits(postalCode || '').replace(/\D/g, '').slice(0, 10);
  if (postalCode && cleanPostal.length !== 10) {
    return { valid: false, error: 'کد پستی باید دقیقاً ۱۰ رقم باشد.' };
  }

  if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
    return { valid: false, error: 'سبد خرید نامعتبر است (باید بین ۱ تا ۵۰ قلم کالا داشته باشد).' };
  }

  const aggregated = new Map<string, number>();
  for (const item of items) {
    const pId = String(item?.productId || item?.product?.id || '').trim();
    const qty = item?.quantity;

    if (!pId) {
      return { valid: false, error: 'شناسه محصول در سبد خرید الزامی است.' };
    }

    if (typeof qty !== 'number' || !Number.isInteger(qty) || qty <= 0 || qty > 50) {
      return { valid: false, error: `تعداد سفارش برای هر کالا باید عدد صحیح مثبت بین ۱ تا ۵۰ باشد (مقدار نامعتبر: ${qty}).` };
    }

    aggregated.set(pId, (aggregated.get(pId) || 0) + qty);
  }

  return {
    valid: true,
    cleanData: {
      customerName: customerName.trim(),
      cleanPhone,
      cleanPostal,
      province: (input.province || 'تهران').trim(),
      city: (input.city || '').trim(),
      address: address.trim(),
      aggregatedQuantities: aggregated,
      discountCode: input.discountCode?.trim()?.toUpperCase(),
      paymentMethod: input.paymentMethod === 'zarinpal' ? 'zarinpal' : 'card_to_card',
      receiptImage: input.receiptImage,
      cardLast4: input.cardLast4?.trim()?.slice(0, 4),
      notes: input.notes?.trim()?.slice(0, 500),
      clientProvidedIdempotencyKey: input.idempotencyKey?.trim()
    }
  };
}

/**
 * Executes Atomic Order Creation and Inventory Decrement with Firestore Transactions
 */
export async function processAtomicOrder(
  input: CreateOrderInput,
  firestore: FirestoreClientInterface,
  databasePath: string,
  settings: { shippingCost?: number; freeShippingThreshold?: number; discountCodes?: any[] } = {}
): Promise<{ success: boolean; status: number; order?: any; error?: string; isDuplicate?: boolean }> {
  const valResult = validateOrderInput(input);
  if (!valResult.valid) {
    return { success: false, status: 400, error: valResult.error };
  }

  const clean = valResult.cleanData;

  // 1. Compute Idempotency Fingerprint and Effective Key
  const itemsForHash: { productId: string; quantity: number }[] = [];
  clean.aggregatedQuantities.forEach((qty: number, prodId: string) => {
    itemsForHash.push({ productId: prodId, quantity: qty });
  });

  const payloadFingerprint = await computePayloadFingerprint(
    clean.cleanPhone,
    clean.cleanPostal,
    clean.address,
    itemsForHash,
    clean.discountCode
  );

  // If client provided a unique checkout intent key, use it; otherwise use a 10-minute sliding window key
  // This guarantees identical orders placed in the future will NEVER be blocked as false duplicates!
  const tenMinuteBucket = Math.floor(Date.now() / (10 * 60 * 1000));
  const effectiveIdempotencyKey = clean.clientProvidedIdempotencyKey 
    ? clean.clientProvidedIdempotencyKey.trim()
    : `auto_${tenMinuteBucket}_${payloadFingerprint}`;

  // Retry loop for Firestore transaction contention (up to 3 attempts)
  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    let txId: string;
    try {
      txId = await firestore.beginTransaction();
    } catch (err: any) {
      return { success: false, status: 503, error: `خطا در آغاز تراکنش پایگاه داده: ${err?.message || 'ارتباط برقرار نشد'}` };
    }

    try {
      // Step A: Atomic Idempotency Check inside transaction
      const idempDocPath = `orders_idempotency/${effectiveIdempotencyKey}`;
      const idempSnap = await firestore.getDocument(idempDocPath, txId);
      if (idempSnap.exists && idempSnap.data?.orderId) {
        // Enforce: Reusing the same idempotency key for a DIFFERENT order must be rejected!
        if (idempSnap.data.payloadFingerprint && idempSnap.data.payloadFingerprint !== payloadFingerprint) {
          await firestore.rollback(txId);
          return {
            success: false,
            status: 409,
            error: 'این شناسه یکتایی (Idempotency Key) قبلاً برای سفارش دیگری با اطلاعات متفاوت استفاده شده است.'
          };
        }

        // Exact match retry (network timeout, double click): rollback transaction and return existing order
        await firestore.rollback(txId);
        const existingOrderSnap = await firestore.getDocument(`orders/${idempSnap.data.orderId}`);
        if (existingOrderSnap.exists) {
          return {
            success: true,
            status: 200,
            isDuplicate: true,
            order: existingOrderSnap.data
          };
        }
      }

      // Step B: READ ALL PRODUCTS inside transaction
      let computedSubtotal = 0;
      const verifiedItems: ValidatedOrderItem[] = [];
      const productDocs: { path: string; data: any; updateTime?: string; requestedQty: number }[] = [];

      for (const [prodId, reqQty] of clean.aggregatedQuantities.entries()) {
        const prodPath = `products/${prodId}`;
        const prodSnap = await firestore.getDocument(prodPath, txId);

        if (!prodSnap.exists) {
          throw new Error(`محصول با شناسه «${prodId}» در پایگاه داده فروشگاه یافت نشد.`);
        }

        const prodData = prodSnap.data;
        const currentStock = Number(prodData.stock ?? 0);

        if (currentStock < reqQty) {
          throw new Error(`موجودی محصول «${prodData.name || prodId}» کافی نیست (موجودی فعلی: ${currentStock} عدد، درخواستی: ${reqQty} عدد).`);
        }

        // Server-authoritative real price (client price completely ignored)
        const realPrice = Number(prodData.price) || 0;
        computedSubtotal += realPrice * (reqQty as number);

        verifiedItems.push({
          productId: prodId,
          name: prodData.name || 'محصول ناما',
          price: realPrice,
          weight: prodData.weight || 'بسته استاندارد',
          image: prodData.image || '',
          quantity: reqQty as number
        });

        productDocs.push({
          path: prodPath,
          data: prodData,
          updateTime: prodSnap.updateTime,
          requestedQty: reqQty as number
        });
      }

      // Step C: Server-authoritative Shipping Cost
      let appliedShipping = Number(settings.shippingCost) || 0;
      const freeThreshold = Number(settings.freeShippingThreshold) || 600000;
      if (freeThreshold > 0 && computedSubtotal >= freeThreshold) {
        appliedShipping = 0;
      }

      // Step D: Server-authoritative Discount
      let computedDiscount = 0;
      let validDiscountCode: string | undefined = undefined;
      if (clean.discountCode && Array.isArray(settings.discountCodes)) {
        const matched = settings.discountCodes.find(c => c.code?.toUpperCase() === clean.discountCode && c.isActive);
        if (matched && (!matched.minPurchase || computedSubtotal >= matched.minPurchase)) {
          if (matched.type === 'percent') {
            computedDiscount = Math.round((computedSubtotal * matched.amount) / 100);
            if (matched.maxDiscount && computedDiscount > matched.maxDiscount) {
              computedDiscount = matched.maxDiscount;
            }
          } else {
            computedDiscount = Number(matched.amount) || 0;
          }
          validDiscountCode = clean.discountCode;
        }
      }

      const totalAmount = Math.max(0, computedSubtotal + appliedShipping - computedDiscount);
      const orderId = generateCollisionFreeOrderId();
      const nowIso = new Date().toISOString();

      const newOrder: ValidatedOrder = {
        id: orderId,
        customerName: clean.customerName,
        customerPhone: clean.cleanPhone,
        province: clean.province,
        city: clean.city,
        address: clean.address,
        postalCode: clean.cleanPostal,
        items: verifiedItems,
        subtotal: computedSubtotal,
        shippingCost: appliedShipping,
        discountCode: validDiscountCode,
        discountAmount: computedDiscount,
        totalAmount,
        status: clean.receiptImage ? 'paid_pending_approval' : 'pending_receipt',
        paymentMethod: clean.paymentMethod,
        receiptImage: clean.receiptImage,
        cardLast4: clean.cardLast4,
        notes: clean.notes,
        createdAt: nowIso,
        updatedAt: nowIso
      };

      // Step E: Prepare ATOMIC WRITES with Preconditions
      const writes: any[] = [];

      // 1. Decrement inventory for each product with updateTime precondition
      for (const p of productDocs) {
        const newStock = Math.max(0, Number(p.data.stock ?? 0) - p.requestedQty);
        const updatedFields: Record<string, any> = {};
        for (const [k, v] of Object.entries({ ...p.data, stock: newStock, updatedAt: nowIso })) {
          updatedFields[k] = toFirestoreValue(v);
        }

        const writeOp: Record<string, any> = {
          update: {
            name: `${databasePath}/documents/${p.path}`,
            fields: updatedFields
          }
        };

        if (p.updateTime) {
          writeOp.currentDocument = { updateTime: p.updateTime };
        }
        writes.push(writeOp);
      }

      // 2. Insert new Order with exists: false precondition
      const orderFields: Record<string, any> = {};
      for (const [k, v] of Object.entries(newOrder)) {
        if (v !== undefined) {
          orderFields[k] = toFirestoreValue(v);
        }
      }
      writes.push({
        update: {
          name: `${databasePath}/documents/orders/${orderId}`,
          fields: orderFields
        },
        currentDocument: { exists: false }
      });

      // 3. Insert Idempotency record with exists: false precondition
      writes.push({
        update: {
          name: `${databasePath}/documents/orders_idempotency/${effectiveIdempotencyKey}`,
          fields: {
            orderId: toFirestoreValue(orderId),
            payloadFingerprint: toFirestoreValue(payloadFingerprint),
            createdAt: toFirestoreValue(nowIso),
            expiresAt: toFirestoreValue(new Date(Date.now() + 24 * 3600 * 1000).toISOString())
          }
        },
        currentDocument: { exists: false }
      });

      // Step F: COMMIT TRANSACTION ATOMICALLY
      const commitSuccess = await firestore.commit(txId, writes);

      if (!commitSuccess) {
        // Concurrency conflict detected (another user updated inventory in the same millisecond)
        if (attempt < maxRetries) {
          // Exponential backoff with jitter
          await new Promise(r => setTimeout(r, 50 * Math.pow(2, attempt) + Math.random() * 20));
          continue; // Retry transaction with fresh read
        } else {
          return {
            success: false,
            status: 409,
            error: 'به دلیل تقاضای همزمان، موجودی کالا تغییر کرد. لطفاً مجدداً تلاش فرمایید.'
          };
        }
      }

      return {
        success: true,
        status: 200,
        order: newOrder
      };
    } catch (err: any) {
      await firestore.rollback(txId);
      return {
        success: false,
        status: 400,
        error: err?.message || 'خطا در ثبت تراکنشی سفارش.'
      };
    }
  }

  return {
    success: false,
    status: 409,
    error: 'خطای تعارض همزمانی در تراکنش انبار.'
  };
}
