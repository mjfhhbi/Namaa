/**
 * Namaa Store - Live Order Creation & Concurrency Test Suite
 * 
 * Target: Real Firebase Firestore Emulator on port 8085
 * Project: demo-nama-test (100% Offline Demo Project)
 * 
 * Tests the REAL processOrderCreation against the REAL Google Firestore Emulator:
 * 1. Authoritative price recalculation (ignoring client prices)
 * 2. Real atomic stock decrement in Firestore
 * 3. Atomic rollback on insufficient stock
 * 4. High-concurrency race condition (competing simultaneous orders)
 * 5. Persistent database idempotency across cache wipes
 * 6. Fail-secure gate when Admin SDK is null
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { 
  processOrderCreation, 
  _clearIdempotencyCache 
} from '../src/server/orderManager';

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

export async function runOrderIntegrationTests() {
  console.log('\n' + '='.repeat(70));
  console.log(bold(cyan('  🔥 REAL FIREBASE EMULATOR - ORDER ENGINE & CONCURRENCY TESTS')));
  console.log(bold('  Project: demo-nama-test (Offline Local Firestore Emulator)'));
  console.log('='.repeat(70) + '\n');

  // 1. Initialize Admin App against local emulator
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8085';
  const adminApp = !getApps().length
    ? initializeApp({ projectId: 'demo-nama-test' })
    : getApps()[0];
  const adminDb = getFirestore(adminApp);

  const testSettings = {
    public: {
      shippingCost: 35000,
      freeShippingThreshold: 500000
    },
    private: {
      discountCodes: [
        { code: 'GOLD10', type: 'percent', amount: 10, minPurchase: 100000, maxDiscount: 40000, isActive: true }
      ]
    }
  };

  const persistServerOrder = (_ord: any) => {};

  // -------------------------------------------------------------
  // Seed initial test products in real emulator
  // -------------------------------------------------------------
  console.log(bold('\n📦 [1] SEEDING REAL PRODUCTS IN FIRESTORE EMULATOR'));
  await adminDb.collection('products').doc('emu-honey-01').set({
    id: 'emu-honey-01',
    name: 'عسل کنار خالص ناما',
    price: 320000,
    stock: 5,
    weight: '۱ کیلوگرم',
    updatedAt: new Date().toISOString()
  });

  await adminDb.collection('products').doc('emu-limited-tea').set({
    id: 'emu-limited-tea',
    name: 'چای دست‌چین لاهیجان (موجودی محدود)',
    price: 150000,
    stock: 2, // exactly 2 in stock
    weight: '۵۰۰ گرم',
    updatedAt: new Date().toISOString()
  });
  console.log('  ✓ Seeded emu-honey-01 (stock: 5, price: 320000)');
  console.log('  ✓ Seeded emu-limited-tea (stock: 2, price: 150000)');

  // -------------------------------------------------------------
  // TEST 1: Authoritative Server-Side Price & Subtotal Calculation
  // -------------------------------------------------------------
  console.log(bold('\n💰 [2] AUTHORITATIVE PRICE & STOCK VALIDATION'));
  const fakePriceOrder = await processOrderCreation(
    {
      customerName: 'محمد جوادی',
      customerPhone: '09123334455',
      address: 'تهران، خیابان شریعتی، کوچه بهار',
      postalCode: '1939512345',
      items: [
        // Malicious client tries to send price: 1000 instead of 320,000
        { productId: 'emu-honey-01', quantity: 2, price: 1000 }
      ],
      idempotencyKey: 'test-real-idemp-01'
    },
    {},
    adminDb,
    testSettings,
    persistServerOrder
  );

  assert(fakePriceOrder.success === true, 'Order created successfully via real Firestore emulator transaction');
  assert(fakePriceOrder.order?.subtotal === 640000, 'Server authoritative calculation used real price (2 * 320,000 = 640,000), ignoring client payload price of 1000');
  assert(fakePriceOrder.order?.shippingCost === 0, 'Applied free shipping because subtotal >= 500,000');
  assert(fakePriceOrder.order?.totalAmount === 640000, 'Total amount correctly computed as 640,000');

  // Verify real emulator stock dropped from 5 to 3
  const honeyDocSnap = await adminDb.collection('products').doc('emu-honey-01').get();
  assert(honeyDocSnap.data()?.stock === 3, 'Real Firestore document stock decremented atomically from 5 to 3');

  // -------------------------------------------------------------
  // TEST 2: High Concurrency Race Condition (Two Competing Orders for 2 Items)
  // -------------------------------------------------------------
  console.log(bold('\n⚡ [3] HIGH-CONCURRENCY RACE CONDITION TEST (LIMITED STOCK: 2)'));
  console.log('  Launching 2 simultaneous orders competing for limited stock of 2 items...');

  // Both orders try to buy 2 units of emu-limited-tea (which only has 2 in stock)
  const orderA = processOrderCreation(
    {
      customerName: 'خریدار الف',
      customerPhone: '09121110001',
      address: 'تهران، نیاوران، خیابان یاسر',
      items: [{ productId: 'emu-limited-tea', quantity: 2 }],
      idempotencyKey: 'race-order-A'
    },
    {},
    adminDb,
    testSettings,
    persistServerOrder
  );

  const orderB = processOrderCreation(
    {
      customerName: 'خریدار ب',
      customerPhone: '09121110002',
      address: 'تهران، صادقیه، خیابان ستارخان',
      items: [{ productId: 'emu-limited-tea', quantity: 2 }],
      idempotencyKey: 'race-order-B'
    },
    {},
    adminDb,
    testSettings,
    persistServerOrder
  );

  const [resA, resB] = await Promise.all([orderA, orderB]);
  const succeededCount = (resA.success ? 1 : 0) + (resB.success ? 1 : 0);
  const failedCount = (!resA.success ? 1 : 0) + (!resB.success ? 1 : 0);

  assert(succeededCount === 1, 'Exactly ONE concurrent order succeeded in buying the limited stock');
  assert(failedCount === 1, 'The competing concurrent order was rejected due to stock exhaustion');

  const teaDocSnap = await adminDb.collection('products').doc('emu-limited-tea').get();
  assert(teaDocSnap.data()?.stock === 0, 'Real stock in Firestore emulator reached exactly 0 (no negative stock, no double decrement)');

  // -------------------------------------------------------------
  // TEST 3: Atomic Rollback on Insufficient Stock
  // -------------------------------------------------------------
  console.log(bold('\n🔄 [4] ATOMIC ROLLBACK ON INSUFFICIENT STOCK'));
  const beforeFailedHoneyStock = (await adminDb.collection('products').doc('emu-honey-01').get()).data()?.stock;

  // Multi-item cart where first item has stock (honey: 3 available, request 1),
  // but second item is out of stock (tea: 0 available, request 1)
  const multiItemOverOrder = await processOrderCreation(
    {
      customerName: 'علی اکبری',
      customerPhone: '09129998877',
      address: 'تهران، سعادت آباد',
      items: [
        { productId: 'emu-honey-01', quantity: 1 },
        { productId: 'emu-limited-tea', quantity: 1 } // Out of stock (0)
      ]
    },
    {},
    adminDb,
    testSettings,
    persistServerOrder
  );

  assert(multiItemOverOrder.success === false, 'Transaction failed due to out-of-stock item in multi-item cart');
  assert(multiItemOverOrder.status === 400, 'Returned HTTP 400 with descriptive error');

  const afterFailedHoneyStock = (await adminDb.collection('products').doc('emu-honey-01').get()).data()?.stock;
  assert(afterFailedHoneyStock === beforeFailedHoneyStock, 'Honey stock was NOT decremented (100% atomic rollback across all items in cart)');

  // -------------------------------------------------------------
  // TEST 4: Persistent Database Idempotency Across Process Restarts
  // -------------------------------------------------------------
  console.log(bold('\n🔁 [5] PERSISTENT DATABASE IDEMPOTENCY TEST'));
  const honeyBeforeDbIdemp = (await adminDb.collection('products').doc('emu-honey-01').get()).data()?.stock;

  // Clear in-memory cache to simulate server restart / new replica container
  _clearIdempotencyCache();
  console.log('  ✓ In-memory idempotency cache wiped to simulate server restart / new replica');

  // Re-submit the exact same order with idempotencyKey: 'test-real-idemp-01'
  const replayOrder = await processOrderCreation(
    {
      customerName: 'محمد جوادی',
      customerPhone: '09123334455',
      address: 'تهران، خیابان شریعتی، کوچه بهار',
      postalCode: '1939512345',
      items: [{ productId: 'emu-honey-01', quantity: 2 }],
      idempotencyKey: 'test-real-idemp-01'
    },
    {},
    adminDb,
    testSettings,
    persistServerOrder
  );

  assert(replayOrder.success === true, 'Replay request succeeded via persistent Firestore idempotency_keys table');
  assert(replayOrder.order?.id === fakePriceOrder.order?.id, 'Returned the identical Order ID previously committed to database');

  const honeyAfterDbIdemp = (await adminDb.collection('products').doc('emu-honey-01').get()).data()?.stock;
  assert(honeyAfterDbIdemp === honeyBeforeDbIdemp, 'Stock was NOT decremented a second time despite empty in-memory cache');

  // -------------------------------------------------------------
  // TEST 5: Fail-Secure Architecture (Null AdminDb)
  // -------------------------------------------------------------
  console.log(bold('\n🔒 [6] FAIL-SECURE GATE TEST'));
  const nullAdminOrder = await processOrderCreation(
    {
      customerName: 'احسان محمدی',
      customerPhone: '09127776655',
      address: 'کرج، عظیمیه',
      items: [{ productId: 'emu-honey-01', quantity: 1 }]
    },
    {},
    null, // unconfigured AdminDb
    testSettings,
    persistServerOrder
  );

  assert(nullAdminOrder.success === false && nullAdminOrder.status === 503, 'Safely halted with HTTP 503 when Admin SDK is null');

  // -------------------------------------------------------------
  // TEST 6: Cross-User Idempotency Isolation (Cryptographic Phone Binding)
  // -------------------------------------------------------------
  console.log(bold('\n🛡️  [7] CROSS-USER IDEMPOTENCY KEY ISOLATION TEST'));
  await adminDb.collection('products').doc('emu-isolated-honey').set({
    id: 'emu-isolated-honey',
    name: 'عسل کوهستان آزمایشی',
    price: 200000,
    stock: 10,
    updatedAt: new Date().toISOString()
  });

  const userBOrder = await processOrderCreation(
    {
      customerName: 'کامران یزدانی',
      customerPhone: '09351112233', // Distinct customer
      address: 'مشهد، بلوار سجاد',
      items: [{ productId: 'emu-isolated-honey', quantity: 1 }],
      idempotencyKey: 'test-real-idemp-01' // Shared string key reused by different user
    },
    {},
    adminDb,
    testSettings,
    persistServerOrder
  );

  assert(userBOrder.success === true, 'User B order successfully created despite reusing identical string key');
  assert(userBOrder.order?.id !== fakePriceOrder.order?.id, 'User B received their own distinct Order ID (zero collision with User A)');
  assert(userBOrder.order?.customerPhone === '09351112233', 'User B order strictly bound to User B phone number');

  // -------------------------------------------------------------
  // SUMMARY REPORT
  // -------------------------------------------------------------
  console.log('\n' + '='.repeat(70));
  console.log(bold(`LIVE ORDER INTEGRATION RESULTS: ${passedTests}/${totalTests} Passed`));
  if (failedTests === 0) {
    console.log(green(bold('🎉 ALL LIVE FIREBASE EMULATOR ORDER TESTS PASSED WITH 100% SUCCESS!')));
  } else {
    console.log(red(bold(`⚠️  ${failedTests} TESTS FAILED. PLEASE CHECK LOGS ABOVE.`)));
  }
  console.log('='.repeat(70) + '\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

// Execute suite
if (import.meta.url === `file://${process.argv[1]}`) {
  runOrderIntegrationTests().catch((err) => {
    console.error('[Fatal Test Error]:', err);
    process.exit(1);
  });
}
