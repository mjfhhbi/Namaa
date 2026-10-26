/**
 * Namaa Store - In-Memory Business Logic & Security Unit Test Suite
 * 
 * ⚠️ EXPLICIT NOTICE / هشدار صریح:
 * این فایل مجموعه‌تست‌های واحد درون‌حافظه‌ای (In-Memory Unit Mocks) برای بررسی منطق سفارش،
 * کسر اتمیک موجودی، اعتبارسنجی ورودی‌ها، محافظت‌های ضد تقلب و امنیت ادمین است.
 * این تست‌ها ۱۰۰٪ مستقل و محلی بوده و به هیچ پایگاه داده واقعی یا دیتابیس عملیاتی متصل نمی‌شوند.
 * 
 * توجه: این تست‌ها معادل تست رسمی قوانین Firestore (Firestore Security Rules) نیستند؛
 * تست واقعی قوانین نیازمند اجرای شبیه‌ساز رسمی فایربیس (Firebase Emulator) با جاوا ۲۱ است.
 */

import crypto from 'crypto';
import { 
  normalizeIranianPhone, 
  isValidIranianMobile, 
  maskIranianPhone, 
  toEnglishDigits 
} from '../src/utils/phone';
import { 
  validateTestTargetProject, 
  OPERATIONAL_PROJECT_ID, 
  OperationalSafetyError 
} from '../src/server/testEnvironmentGuard';
import { 
  processOrderCreation, 
  CreateOrderParams,
  _clearIdempotencyCache
} from '../src/server/orderManager';

// Color utilities for terminal output
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, details?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ${green('✓ PASS:')} ${testName}`);
  } else {
    failedTests++;
    console.error(`  ${red('✗ FAIL:')} ${testName}`);
    if (details) console.error(`    ${yellow('Details:')} ${details}`);
  }
}

// -------------------------------------------------------------
// In-Memory Mock of Firebase Admin Firestore Transaction Engine
// -------------------------------------------------------------
class MockFirestoreDatabase {
  public collections: Map<string, Map<string, any>> = new Map();

  constructor() {
    this.collections.set('products', new Map());
    this.collections.set('orders', new Map());
    this.collections.set('settings', new Map());
  }

  seed(col: string, docId: string, data: any) {
    if (!this.collections.has(col)) {
      this.collections.set(col, new Map());
    }
    this.collections.get(col)!.set(docId, JSON.parse(JSON.stringify(data)));
  }

  collection(colName: string) {
    const self = this;
    return {
      doc(docId: string) {
        return {
          colName,
          docId,
          get: async () => {
            const data = self.collections.get(colName)?.get(docId);
            return {
              exists: data !== undefined,
              data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined),
            };
          },
          update: async (patch: any) => {
            const col = self.collections.get(colName);
            const existing = col?.get(docId);
            if (!existing) throw new Error(`Doc ${docId} does not exist`);
            col!.set(docId, { ...existing, ...JSON.parse(JSON.stringify(patch)) });
          },
          set: async (docData: any) => {
            if (!self.collections.has(colName)) self.collections.set(colName, new Map());
            self.collections.get(colName)!.set(docId, JSON.parse(JSON.stringify(docData)));
          }
        };
      }
    };
  }

  async runTransaction(updateFunction: (tx: any) => Promise<any>): Promise<any> {
    // Snapshot state for atomic rollback on failure
    const snapshot = new Map<string, Map<string, any>>();
    for (const [colName, colMap] of this.collections.entries()) {
      const copyMap = new Map<string, any>();
      for (const [dId, dVal] of colMap.entries()) {
        copyMap.set(dId, JSON.parse(JSON.stringify(dVal)));
      }
      snapshot.set(colName, copyMap);
    }

    const stageWrites: (() => void)[] = [];

    const mockTransaction = {
      get: async (docRef: any) => {
        const col = this.collections.get(docRef.colName);
        const data = col?.get(docRef.docId);
        return {
          exists: data !== undefined,
          data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined)
        };
      },
      set: (docRef: any, data: any) => {
        stageWrites.push(() => {
          if (!this.collections.has(docRef.colName)) {
            this.collections.set(docRef.colName, new Map());
          }
          this.collections.get(docRef.colName)!.set(docRef.docId, JSON.parse(JSON.stringify(data)));
        });
      },
      update: (docRef: any, patch: any) => {
        stageWrites.push(() => {
          const col = this.collections.get(docRef.colName);
          const current = col?.get(docRef.docId);
          if (!current) throw new Error(`Document ${docRef.docId} not found during commit`);
          col!.set(docRef.docId, { ...current, ...JSON.parse(JSON.stringify(patch)) });
        });
      }
    };

    try {
      const res = await updateFunction(mockTransaction);
      // Atomic commit
      for (const applyWrite of stageWrites) {
        applyWrite();
      }
      return res;
    } catch (err) {
      // Atomic rollback
      this.collections = snapshot;
      throw err;
    }
  }
}

// -------------------------------------------------------------
// TEST RUNNER
// -------------------------------------------------------------
async function runAllUnitTests() {
  console.log('\n' + '='.repeat(70));
  console.log(bold(cyan('  🌱 NAMAA FOOD PRODUCTS - IN-MEMORY BUSINESS & SECURITY TESTS')));
  console.log(yellow('  ⚠️  MOCK / UNIT TESTING ONLY - NOT OFFICIAL FIRESTORE RULES'));
  console.log('='.repeat(70) + '\n');

  // ===========================================================
  // SECTION 1: Test Environment Safety Barriers
  // ===========================================================
  console.log(bold('\n📦 [1] SAFETY BARRIER & PRODUCTION PROTECTION TESTS'));

  try {
    validateTestTargetProject({ targetProjectId: OPERATIONAL_PROJECT_ID });
    assert(false, 'Should block operational production project ID');
  } catch (err: any) {
    assert(
      err instanceof OperationalSafetyError && err.message.includes('CRITICAL: Target project ID matches'),
      'Safety barrier strictly blocks operational production project ID'
    );
  }

  try {
    validateTestTargetProject({ targetProjectId: 'ai-studio-namafoodproducts-fake-clone' });
    assert(false, 'Should block project ID with ai-studio-namafoodproducts prefix');
  } catch (err: any) {
    assert(
      err instanceof OperationalSafetyError && err.message.includes('belongs to the production AI Studio namespace'),
      'Safety barrier blocks any namespace containing production prefix'
    );
  }

  try {
    validateTestTargetProject({
      targetProjectId: 'nama-cloud-test-project',
      isCloudTest: true,
      expectedTestProjectId: 'different-project-id',
      confirmationFlag: 'true'
    });
    assert(false, 'Should block cloud test if project ID mismatch');
  } catch (err: any) {
    assert(
      err instanceof OperationalSafetyError && err.message.includes('does not match EXPECTED_TEST_PROJECT_ID'),
      'Cloud test guard requires exact match between target and expected project ID'
    );
  }

  try {
    validateTestTargetProject({
      targetProjectId: 'nama-cloud-test-project',
      isCloudTest: true,
      expectedTestProjectId: 'nama-cloud-test-project',
      confirmationFlag: 'false'
    });
    assert(false, 'Should block cloud test if confirmation flag is not true');
  } catch (err: any) {
    assert(
      err instanceof OperationalSafetyError && err.message.includes('CONFIRM_NON_PRODUCTION_PROJECT=true must be set'),
      'Cloud test guard requires explicit CONFIRM_NON_PRODUCTION_PROJECT=true flag'
    );
  }

  const emuCheck = validateTestTargetProject({
    emulatorHost: '127.0.0.1:8080',
    targetProjectId: 'demo-nama-test'
  });
  assert(
    emuCheck.isSafe && emuCheck.isEmulator && emuCheck.targetProjectId === 'demo-nama-test',
    'Offline demo project (demo-nama-test) is safely permitted under emulator host'
  );

  // ===========================================================
  // SECTION 2: Iranian Phone Normalization & Validation
  // ===========================================================
  console.log(bold('\n📱 [2] PHONE NUMBER NORMALIZATION & VALIDATION TESTS'));

  assert(
    normalizeIranianPhone('۰۹۱۲۳۴۵۶۷۸۹') === '09123456789',
    'Converts Persian digits to standard 11-digit mobile format'
  );

  assert(
    normalizeIranianPhone('٠٩١٢٣٤٥٦٧٨٩') === '09123456789',
    'Converts Arabic digits to standard 11-digit mobile format'
  );

  assert(
    normalizeIranianPhone('+989123456789') === '09123456789',
    'Normalizes +98 prefix to standard 0912 format'
  );

  assert(
    normalizeIranianPhone('00989123456789') === '09123456789',
    'Normalizes 0098 prefix to standard 0912 format'
  );

  assert(
    normalizeIranianPhone('9123456789') === '09123456789',
    'Normalizes 10-digit mobile (without initial zero) to 11 digits'
  );

  assert(
    isValidIranianMobile('09123456789') === true && isValidIranianMobile('09351234567') === true,
    'Validates genuine 11-digit Iranian mobile numbers'
  );

  assert(
    isValidIranianMobile('02188776655') === false,
    'Rejects landline phone numbers (021...)'
  );

  assert(
    isValidIranianMobile('0912345678') === false && isValidIranianMobile('091234567890') === false,
    'Rejects phone numbers with invalid digit counts'
  );

  assert(
    maskIranianPhone('09123456789') === '0912***6789',
    'Correctly masks customer phone for privacy in logs and notification alerts'
  );

  // ===========================================================
  // SECTION 3: Input Validation for Order Processing
  // ===========================================================
  console.log(bold('\n🛡️  [3] INPUT SANITIZATION & VALIDATION TESTS'));

  const dummySettings = {
    public: { shippingCost: 35000, freeShippingThreshold: 500000 },
    private: { discountCodes: [] }
  };
  const mockPersist = (_ord: any) => {};

  // 3.1 Reject missing or short customer name
  const nameTest = await processOrderCreation(
    { customerName: ' ', customerPhone: '09123456789', address: 'تهران، خیابان آزادی' },
    {},
    null,
    dummySettings,
    mockPersist
  );
  assert(nameTest.status === 400 && nameTest.success === false, 'Rejects empty or whitespace-only customer name');

  // 3.2 Reject invalid phone
  const phoneTest = await processOrderCreation(
    { customerName: 'علی رضایی', customerPhone: '02112345678', address: 'تهران، خیابان آزادی' },
    {},
    null,
    dummySettings,
    mockPersist
  );
  assert(phoneTest.status === 400 && phoneTest.success === false, 'Rejects invalid phone format (landline/short)');

  // 3.3 Reject short address
  const addrTest = await processOrderCreation(
    { customerName: 'علی رضایی', customerPhone: '09123456789', address: 'کو' },
    {},
    null,
    dummySettings,
    mockPersist
  );
  assert(addrTest.status === 400 && addrTest.success === false, 'Rejects address shorter than 5 characters');

  // 3.4 Reject invalid postal code (not 10 digits)
  const postalTest = await processOrderCreation(
    { customerName: 'علی رضایی', customerPhone: '09123456789', address: 'تهران، آزادی', postalCode: '12345' },
    {},
    null,
    dummySettings,
    mockPersist
  );
  assert(postalTest.status === 400 && postalTest.success === false, 'Rejects postal code with length != 10');

  // 3.5 Reject empty shopping cart
  const cartTest = await processOrderCreation(
    { customerName: 'علی رضایی', customerPhone: '09123456789', address: 'تهران، آزادی', items: [] },
    {},
    null,
    dummySettings,
    mockPersist
  );
  assert(cartTest.status === 400 && cartTest.success === false, 'Rejects empty shopping cart array');

  // 3.6 Reject negative or zero quantity
  const zeroQtyTest = await processOrderCreation(
    { customerName: 'علی رضایی', customerPhone: '09123456789', address: 'تهران، آزادی', items: [{ productId: 'p1', quantity: 0 }] },
    {},
    null,
    dummySettings,
    mockPersist
  );
  assert(zeroQtyTest.status === 400 && zeroQtyTest.success === false, 'Rejects item with quantity <= 0');

  // 3.7 Reject non-integer quantity (e.g. 1.5)
  const floatQtyTest = await processOrderCreation(
    { customerName: 'علی رضایی', customerPhone: '09123456789', address: 'تهران، آزادی', items: [{ productId: 'p1', quantity: 1.5 }] },
    {},
    null,
    dummySettings,
    mockPersist
  );
  assert(floatQtyTest.status === 400 && floatQtyTest.success === false, 'Rejects non-integer quantity values');

  // 3.8 Reject oversized receipt image (> 7MB)
  const oversizedReceipt = 'data:image/jpeg;base64,' + 'A'.repeat(8 * 1024 * 1024);
  const receiptTest = await processOrderCreation(
    { customerName: 'علی رضایی', customerPhone: '09123456789', address: 'تهران، آزادی', receiptImage: oversizedReceipt },
    {},
    null,
    dummySettings,
    mockPersist
  );
  assert(receiptTest.status === 400 && receiptTest.success === false, 'Rejects receipt image exceeding 7MB limit');

  // 3.9 Reject invalid payment method
  const payMethodTest = await processOrderCreation(
    { customerName: 'علی رضایی', customerPhone: '09123456789', address: 'تهران، آزادی', paymentMethod: 'unsupported_method' },
    {},
    null,
    dummySettings,
    mockPersist
  );
  assert(payMethodTest.status === 400 && payMethodTest.success === false, 'Rejects unsupported payment method');

  // 3.10 Reject productId containing path traversal or slash
  const slashProdTest = await processOrderCreation(
    { customerName: 'علی رضایی', customerPhone: '09123456789', address: 'تهران، آزادی', items: [{ productId: '../secrets/key', quantity: 1 }] },
    {},
    null,
    dummySettings,
    mockPersist
  );
  assert(slashProdTest.status === 400 && slashProdTest.success === false, 'Rejects product ID containing path traversal or slashes');

  // 3.11 Reject oversized discount code (> 32 chars)
  const longCouponTest = await processOrderCreation(
    { customerName: 'علی رضایی', customerPhone: '09123456789', address: 'تهران، آزادی', items: [{ productId: 'p1', quantity: 1 }], discountCode: 'A'.repeat(50) },
    {},
    null,
    dummySettings,
    mockPersist
  );
  assert(longCouponTest.status === 400 && longCouponTest.success === false, 'Rejects discount code exceeding 32 characters');

  // ===========================================================
  // SECTION 4: Fail-Secure Architecture (Null AdminDb Gate)
  // ===========================================================
  console.log(bold('\n🔒 [4] FAIL-SECURE GATE TESTS (NO FALLBACK TO UNSECURE CLIENT SDK)'));

  const validOrderPayload: CreateOrderParams = {
    customerName: 'رضا کمالی',
    customerPhone: '09129876543',
    province: 'تهران',
    city: 'تهران',
    address: 'خیابان ولیعصر، بالاتر از میدان ونک، پلاک ۱۰',
    postalCode: '1969712345',
    items: [{ productId: 'honey-mountain-1', quantity: 1 }]
  };

  // If adminDb is null, order creation MUST stop with 503 and NEVER proceed
  const failSecureTest = await processOrderCreation(
    validOrderPayload,
    {}, // db (client sdk)
    null, // adminDb (unconfigured)
    dummySettings,
    mockPersist
  );
  assert(
    failSecureTest.status === 503 && failSecureTest.success === false,
    'Returns HTTP 503 error when Admin SDK credential is null (never falls back to client SDK)'
  );
  assert(
    failSecureTest.error?.includes('Firebase Admin SDK') === true,
    'Provides descriptive security error message explaining missing server credential'
  );

  // ===========================================================
  // SECTION 5: Atomic Transaction, Stock Decrement & Pricing Engine
  // ===========================================================
  console.log(bold('\n⚡ [5] ATOMIC TRANSACTION, STOCK DECREMENT & PRICING TESTS'));

  const mockDb = new MockFirestoreDatabase();
  mockDb.seed('products', 'honey-01', {
    id: 'honey-01',
    name: 'عسل گون اعلا',
    price: 350000,
    stock: 10,
    weight: '۱ کیلوگرم'
  });
  mockDb.seed('products', 'tea-01', {
    id: 'tea-01',
    name: 'چای بهاره گیلان',
    price: 180000,
    stock: 3,
    weight: '۵۰۰ گرم'
  });

  const storeSettings = {
    public: {
      shippingCost: 40000,
      freeShippingThreshold: 600000
    },
    private: {
      discountCodes: [
        { code: 'NOROOZ1404', type: 'percent', amount: 10, minPurchase: 300000, maxDiscount: 50000, isActive: true },
        { code: 'OFF50K', type: 'fixed', amount: 50000, minPurchase: 200000, isActive: true },
        { code: 'EXPIRED', type: 'percent', amount: 20, isActive: false }
      ]
    }
  };

  let savedServerOrders: any[] = [];
  const testPersist = (ord: any) => { savedServerOrders.push(ord); };

  // 5.1 Successful Order Creation with Stock Decrement
  const order1 = await processOrderCreation(
    {
      customerName: 'سارا احمدی',
      customerPhone: '09121112233',
      address: 'اصفهان، خیابان چهارباغ عباسی، کوچه مریم',
      postalCode: '8146512345',
      items: [{ productId: 'honey-01', quantity: 2 }],
      idempotencyKey: 'test-key-001'
    },
    {},
    mockDb,
    storeSettings,
    testPersist
  );

  assert(order1.success === true && order1.status === 200, 'Order successfully processed with valid stock');
  assert(order1.order?.id?.startsWith('NM-') === true, 'Generates collision-free Order ID format (NM-...)');
  assert(order1.order?.subtotal === 700000, 'Computes correct subtotal from server database prices (2 * 350,000)');
  assert(order1.order?.shippingCost === 0, 'Applies free shipping threshold when subtotal >= 600,000');
  assert(order1.order?.totalAmount === 700000, 'Computes exact final total amount');

  // Verify stock decrement in mock db
  const honeyDocAfter = await mockDb.collection('products').doc('honey-01').get();
  assert(honeyDocAfter.data()?.stock === 8, 'Product stock was decremented from 10 to 8 atomically');

  // 5.2 Stock Depletion / Insufficient Stock Rejection
  const overOrder = await processOrderCreation(
    {
      customerName: 'مهدی کریمی',
      customerPhone: '09125556677',
      address: 'شیراز، بلوار زند، کوچه حافظ',
      items: [{ productId: 'tea-01', quantity: 5 }] // only 3 in stock
    },
    {},
    mockDb,
    storeSettings,
    testPersist
  );
  assert(overOrder.success === false && overOrder.status === 400, 'Rejects order when requested quantity exceeds stock');
  assert(overOrder.error?.includes('موجودی محصول') === true, 'Error specifies insufficient stock message');

  // Verify tea stock remained unchanged (atomic rollback)
  const teaDocAfter = await mockDb.collection('products').doc('tea-01').get();
  assert(teaDocAfter.data()?.stock === 3, 'Product stock is completely unchanged after failed order transaction');

  // 5.3 Duplicate Product ID in Cart Aggregation
  const aggOrder = await processOrderCreation(
    {
      customerName: 'کامران نوری',
      customerPhone: '09128889900',
      address: 'مشهد، خیابان امام رضا',
      items: [
        { productId: 'tea-01', quantity: 1 },
        { productId: 'tea-01', quantity: 2 } // Total = 3 (exactly matches stock of 3)
      ]
    },
    {},
    mockDb,
    storeSettings,
    testPersist
  );
  assert(aggOrder.success === true, 'Aggregates quantities for duplicate items in cart properly');
  const teaDocZero = await mockDb.collection('products').doc('tea-01').get();
  assert(teaDocZero.data()?.stock === 0, 'Tea stock successfully decremented to 0 after aggregate order of 3');

  // 5.4 Discount Coupon Validation & Server-Side Calculation
  const couponOrder = await processOrderCreation(
    {
      customerName: 'ندا حسینی',
      customerPhone: '09351234567',
      address: 'تبریز، خیابان ارتش شمالی',
      items: [{ productId: 'honey-01', quantity: 1 }], // 350,000 تومان
      discountCode: 'NOROOZ1404' // 10% = 35,000 (cap is 50,000)
    },
    {},
    mockDb,
    storeSettings,
    testPersist
  );
  assert(couponOrder.success === true, 'Processes order with valid coupon code');
  assert(couponOrder.order?.discountAmount === 35000, 'Server accurately calculated 10% discount (35,000 T)');
  assert(couponOrder.order?.shippingCost === 40000, 'Applied shipping fee (subtotal < 600,000)');
  assert(couponOrder.order?.totalAmount === 355000, 'Total computed as 350,000 + 40,000 - 35,000 = 355,000');

  // 5.5 Inactive / Invalid Coupon Ignored
  const inactiveCouponOrder = await processOrderCreation(
    {
      customerName: 'سهراب سپهری',
      customerPhone: '09361112233',
      address: 'کاشان، خیابان امیرکبیر',
      items: [{ productId: 'honey-01', quantity: 1 }],
      discountCode: 'EXPIRED'
    },
    {},
    mockDb,
    storeSettings,
    testPersist
  );
  assert(inactiveCouponOrder.order?.discountAmount === undefined, 'Ignores expired or inactive discount coupons');

  // ===========================================================
  // SECTION 6: Idempotency Protection
  // ===========================================================
  console.log(bold('\n🔁 [6] IDEMPOTENCY & DUPLICATE ORDER SHIELD TESTS'));

  const honeyBeforeIdemp = (await mockDb.collection('products').doc('honey-01').get()).data()?.stock;
  
  // Re-submit the exact same order with idempotencyKey: 'test-key-001'
  const duplicateOrder = await processOrderCreation(
    {
      customerName: 'سارا احمدی',
      customerPhone: '09121112233',
      address: 'اصفهان، خیابان چهارباغ عباسی، کوچه مریم',
      postalCode: '8146512345',
      items: [{ productId: 'honey-01', quantity: 2 }],
      idempotencyKey: 'test-key-001'
    },
    {},
    mockDb,
    storeSettings,
    testPersist
  );

  assert(duplicateOrder.success === true, 'Returns cached response for duplicate idempotency key');
  assert(duplicateOrder.order?.id === order1.order?.id, 'Returns the exact same Order ID from cache');

  const honeyAfterIdemp = (await mockDb.collection('products').doc('honey-01').get()).data()?.stock;
  assert(honeyBeforeIdemp === honeyAfterIdemp, 'Stock was NOT decremented a second time on duplicate request');

  // 6.2 Persistent DB Idempotency across process restarts (empty memory cache)
  _clearIdempotencyCache();
  const dbIdempOrder = await processOrderCreation(
    {
      customerName: 'سارا احمدی',
      customerPhone: '09121112233',
      address: 'اصفهان، خیابان چهارباغ عباسی، کوچه مریم',
      postalCode: '8146512345',
      items: [{ productId: 'honey-01', quantity: 2 }],
      idempotencyKey: 'test-key-001'
    },
    {},
    mockDb,
    storeSettings,
    testPersist
  );
  assert(dbIdempOrder.success === true, 'Returns order via persistent database idempotency even when in-memory cache is wiped');
  assert(dbIdempOrder.order?.id === order1.order?.id, 'Matches original order ID from database idempotency table');
  const honeyAfterDbIdemp = (await mockDb.collection('products').doc('honey-01').get()).data()?.stock;
  assert(honeyAfterDbIdemp === honeyBeforeIdemp, 'Stock remains unchanged after DB-level idempotency match');

  // ===========================================================
  // SECTION 7: Admin Security, Session Management & Tracking Access Control
  // ===========================================================
  console.log(bold('\n🔐 [7] ADMIN PIN AUTHENTICATION, LOCKOUT & SESSION TESTS'));

  const {
    initAdminSecurity,
    verifyAdminPin,
    validateSessionToken,
    revokeSession,
    isPinConfigured,
    hashPin
  } = await import('../src/server/adminSecurity');

  // 7.1 PBKDF2 hashing test
  const testSalt = '1234567890abcdef1234567890abcdef';
  const hash1 = hashPin('NamaaPass123', testSalt);
  const hash2 = hashPin('NamaaPass123', testSalt);
  assert(hash1 === hash2 && hash1.length === 128, 'PBKDF2-HMAC-SHA512 produces deterministic 128-char hex hash');

  // 7.2 Configure test PIN
  process.env.ADMIN_PIN = 'TestAdmin9988';
  initAdminSecurity();
  assert(isPinConfigured() === true, 'Admin PIN initialized successfully in security state');

  // 7.3 Valid PIN verification
  const loginIp = '192.168.1.' + Math.floor(Math.random() * 250 + 1);
  const validLogin = verifyAdminPin('TestAdmin9988', loginIp);
  assert(validLogin.success === true && !!validLogin.token, 'Authenticates successfully with valid admin PIN');
  assert(validateSessionToken(validLogin.token!) === true, 'Validates newly created admin session token');

  // 7.4 Revoke session on logout
  const revoked = revokeSession(validLogin.token!);
  assert(revoked === true, 'Revokes active admin session token on logout');
  assert(validateSessionToken(validLogin.token!) === false, 'Revoked token is rejected on subsequent authorization checks');

  // 7.5 Invalid PIN & Brute-force lockout
  const testIp = '10.0.0.' + Math.floor(Math.random() * 250 + 1);
  const fail1 = verifyAdminPin('WrongPin1', testIp);
  assert(fail1.success === false && fail1.status === 401, 'Rejects incorrect PIN with HTTP 401');

  // Perform 4 more failed attempts to reach threshold 5
  verifyAdminPin('WrongPin2', testIp);
  verifyAdminPin('WrongPin3', testIp);
  verifyAdminPin('WrongPin4', testIp);
  const lockoutAttempt = verifyAdminPin('WrongPin5', testIp);
  assert(
    lockoutAttempt.status === 401 && Boolean(lockoutAttempt.error?.includes('۱۵ دقیقه مسدود شد')),
    'Locks out client IP for 15 minutes upon reaching 5 consecutive failed attempts'
  );

  const lockedQuery = verifyAdminPin('TestAdmin9988', testIp);
  assert(lockedQuery.status === 429, 'Returns HTTP 429 Too Many Requests while locked out even with correct PIN');

  // 7.6 Order Tracking Privacy & Access Control
  console.log(bold('\n📦 [8] ORDER TRACKING PRIVACY & PII FILTERING TESTS'));

  const rawStoredOrder = {
    id: 'NM-TRACK-01',
    customerName: 'فاطمه موسوی',
    customerPhone: '09124445566',
    address: 'تهران، خیابان شریعتی، پلاک ۱۲۰، واحد ۴',
    postalCode: '1939512345',
    notes: 'لطفاً زنگ واحد ۴ فشرده شود، نوزاد خواب است',
    cardLast4: '4521',
    paymentReference: '789123456',
    receiptImage: 'data:image/jpeg;base64,xxxx',
    status: 'paid_pending_approval',
    totalAmount: 450000,
    shippingCost: 35000,
    items: [{ name: 'عسل گون', weight: '۱ کیلوگرم', quantity: 1, price: 415000 }],
    createdAt: '2026-10-22T10:00:00.000Z',
    updatedAt: '2026-10-22T10:05:00.000Z'
  };

  // Mock server tracking endpoint projection logic
  function projectPublicTrackingData(storedOrder: any, inputPhone: string) {
    const cleanStoredPhone = normalizeIranianPhone(storedOrder.customerPhone || '');
    const cleanInputPhone = normalizeIranianPhone(inputPhone || '');

    if (!cleanStoredPhone || cleanInputPhone !== cleanStoredPhone) {
      return { status: 403, error: 'شماره تلفن همراه با این سفارش مطابقت ندارد.' };
    }

    // Minimized DTO returned to client
    return {
      status: 200,
      data: {
        id: storedOrder.id,
        customerName: storedOrder.customerName,
        status: storedOrder.status,
        totalAmount: storedOrder.totalAmount,
        shippingCost: storedOrder.shippingCost,
        items: storedOrder.items,
        createdAt: storedOrder.createdAt,
        updatedAt: storedOrder.updatedAt
      }
    };
  }

  // Reject on phone mismatch
  const wrongPhoneTrack = projectPublicTrackingData(rawStoredOrder, '09120000000');
  assert(wrongPhoneTrack.status === 403, 'Rejects tracking lookup when customer phone does not match');

  // Reject on partial phone match (e.g. only last 7 digits)
  const partialPhoneTrack = projectPublicTrackingData(rawStoredOrder, '4445566');
  assert(partialPhoneTrack.status === 403, 'Rejects partial phone numbers that lack full 11-digit normalized match');

  // Accept with Persian numerals
  const farsiPhoneTrack = projectPublicTrackingData(rawStoredOrder, '۰۹۱۲۴۴۴۵۵۶۶');
  assert(farsiPhoneTrack.status === 200, 'Accepts tracking lookup when phone is entered in Persian numerals');

  // Verify that confidential PII is completely stripped from customer tracking view
  const trackingDto = farsiPhoneTrack.data as any;
  assert(trackingDto.address === undefined, 'Customer home address is omitted from tracking view');
  assert(trackingDto.postalCode === undefined, 'Customer postal code is omitted from tracking view');
  assert(trackingDto.customerPhone === undefined, 'Customer phone number is omitted from tracking view');
  assert(trackingDto.notes === undefined, 'Customer delivery notes are omitted from tracking view');
  assert(trackingDto.cardLast4 === undefined && trackingDto.paymentReference === undefined, 'Bank card & payment references are omitted from tracking view');
  assert(trackingDto.receiptImage === undefined, 'Receipt image is omitted from tracking view');

  // ===========================================================
  // SUMMARY REPORT
  // ===========================================================
  console.log('\n' + '='.repeat(70));
  console.log(bold(`TEST RESULTS: ${passedTests}/${totalTests} Passed`));
  if (failedTests === 0) {
    console.log(green(bold('🎉 ALL IN-MEMORY UNIT TESTS PASSED WITH 100% SUCCESS!')));
  } else {
    console.log(red(bold(`⚠️  ${failedTests} TESTS FAILED. PLEASE CHECK LOGS ABOVE.`)));
  }
  console.log('='.repeat(70) + '\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

// Execute suite
runAllUnitTests().catch((err) => {
  console.error('[Fatal Test Error]:', err);
  process.exit(1);
});
