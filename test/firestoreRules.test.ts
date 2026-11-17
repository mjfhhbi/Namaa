import { 
  initializeTestEnvironment, 
  assertFails, 
  assertSucceeds,
  RulesTestEnvironment 
} from '@firebase/rules-unit-testing';
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc,
  collection, 
  getDocs 
} from 'firebase/firestore';
import { onRequestPost as saveProductPost } from '../functions/api/admin/products/save';
import { onRequestPost as deleteProductPost, onRequestDelete as deleteProductDelete } from '../functions/api/admin/products/delete';
import { onRequestPost as clearProductsPost } from '../functions/api/admin/products/clear';
import { onRequestPost as resetProductsPost } from '../functions/api/admin/products/reset-samples';
import { onRequestPost as syncProductsPost } from '../functions/api/admin/products/sync';
import { onRequestPost as updateSettingsPost } from '../functions/api/admin/settings/update';
import { onRequestGet as getSettingsAdminGet } from '../functions/api/admin/settings';
import { signAdminJwt } from '../functions/lib/edgeSecurity';
import { Env, EventContext } from '../functions/types';

const PROJECT_ID = 'demo-nama-test';

function makeMockContext(request: Request, envOverrides: Partial<Env> = {}): EventContext<Env, any, any> {
  return {
    request,
    functionPath: '',
    waitUntil: () => {},
    next: async () => new Response(null, { status: 404 }),
    params: {},
    data: {},
    env: {
      ADMIN_JWT_SECRET: 'test-super-secret-jwt-key-at-least-32-chars-long',
      ADMIN_PIN: '123456',
      ...envOverrides
    }
  };
}

export async function runAdminEndpointAuthTests() {
  console.log('\n--- 0. Testing Admin Endpoints JWT Authentication Enforcement ---');
  const testSecret = 'test-super-secret-jwt-key-at-least-32-chars-long';
  const wrongSecret = 'wrong-secret-key-at-least-32-characters-long-999';

  const nowSec = Math.floor(Date.now() / 1000);
  const validJwt = await signAdminJwt(
    { sub: 'store_admin', role: 'admin', iat: nowSec, exp: nowSec + 3600 },
    testSecret
  );
  const wrongSigJwt = await signAdminJwt(
    { sub: 'store_admin', role: 'admin', iat: nowSec, exp: nowSec + 3600 },
    wrongSecret
  );
  const expiredJwt = await signAdminJwt(
    { sub: 'store_admin', role: 'admin', iat: nowSec - 7200, exp: nowSec - 60 },
    testSecret
  );
  const nonAdminJwt = await signAdminJwt(
    { sub: 'customer', role: 'user', iat: nowSec, exp: nowSec + 3600 },
    testSecret
  );

  const endpoints: Array<{
    name: string;
    method: string;
    url: string;
    body?: any;
    handler: (ctx: EventContext<Env, any, any>) => Response | Promise<Response>;
  }> = [
    {
      name: 'POST /api/admin/products/save',
      method: 'POST',
      url: 'https://example.com/api/admin/products/save',
      body: { id: 'p1', name: 'Test', price: 10000 },
      handler: saveProductPost
    },
    {
      name: 'POST /api/admin/products/delete',
      method: 'POST',
      url: 'https://example.com/api/admin/products/delete',
      body: { productId: 'p1' },
      handler: deleteProductPost
    },
    {
      name: 'DELETE /api/admin/products/delete',
      method: 'DELETE',
      url: 'https://example.com/api/admin/products/delete?productId=p1',
      handler: deleteProductDelete
    },
    {
      name: 'POST /api/admin/products/clear',
      method: 'POST',
      url: 'https://example.com/api/admin/products/clear',
      body: {},
      handler: clearProductsPost
    },
    {
      name: 'POST /api/admin/products/reset-samples',
      method: 'POST',
      url: 'https://example.com/api/admin/products/reset-samples',
      body: { products: [] },
      handler: resetProductsPost
    },
    {
      name: 'POST /api/admin/products/sync',
      method: 'POST',
      url: 'https://example.com/api/admin/products/sync',
      body: { products: [] },
      handler: syncProductsPost
    },
    {
      name: 'POST /api/admin/settings/update',
      method: 'POST',
      url: 'https://example.com/api/admin/settings/update',
      body: { storeName: 'NAMA' },
      handler: updateSettingsPost
    },
    {
      name: 'GET /api/admin/settings',
      method: 'GET',
      url: 'https://example.com/api/admin/settings',
      handler: getSettingsAdminGet
    }
  ];

  for (const ep of endpoints) {
    const buildReq = (authHeader?: string) => {
      const headers: Record<string, string> = {};
      if (ep.method !== 'GET' && ep.method !== 'DELETE') {
        headers['Content-Type'] = 'application/json';
      }
      if (authHeader) {
        headers['Authorization'] = authHeader;
      }
      return new Request(ep.url, {
        method: ep.method,
        headers,
        body: ep.method !== 'GET' && ep.method !== 'DELETE' && ep.body !== undefined
          ? JSON.stringify(ep.body)
          : undefined
      });
    };

    // 1. Missing JWT -> 401 Unauthorized
    const noAuthRes = await ep.handler(makeMockContext(buildReq()));
    assert.strictEqual(noAuthRes.status, 401, `${ep.name} must reject missing JWT with 401`);

    // 2. Malformed JWT -> 403 Forbidden
    const malformedRes = await ep.handler(makeMockContext(buildReq('Bearer invalid.jwt.token')));
    assert.strictEqual(malformedRes.status, 403, `${ep.name} must reject malformed JWT with 403`);

    // 3. Wrong signature JWT -> 403 Forbidden
    const wrongSigRes = await ep.handler(makeMockContext(buildReq(`Bearer ${wrongSigJwt}`)));
    assert.strictEqual(wrongSigRes.status, 403, `${ep.name} must reject wrong-signature JWT with 403`);

    // 4. Expired JWT -> 403 Forbidden
    const expiredRes = await ep.handler(makeMockContext(buildReq(`Bearer ${expiredJwt}`)));
    assert.strictEqual(expiredRes.status, 403, `${ep.name} must reject expired JWT with 403`);

    // 5. Non-admin role JWT -> 403 Forbidden
    const nonAdminRes = await ep.handler(makeMockContext(buildReq(`Bearer ${nonAdminJwt}`)));
    assert.strictEqual(nonAdminRes.status, 403, `${ep.name} must reject non-admin JWT with 403`);

    // 6. Valid Admin JWT passes auth gate (must not return 401 or 403)
    const validRes = await ep.handler(makeMockContext(buildReq(`Bearer ${validJwt}`)));
    assert.ok(
      validRes.status !== 401 && validRes.status !== 403,
      `${ep.name} must accept valid admin JWT past auth gate (got ${validRes.status})`
    );

    console.log(`✓ ${ep.name}: rejects missing (401) & invalid/expired/non-admin (403) JWTs.`);
  }
}

export async function runFirestoreRulesUnitTests() {
  console.log('===============================================================');
  console.log('=== OFFICIAL @firebase/rules-unit-testing SUITE FOR NAMAA ===');
  console.log(`=== Target Project: ${PROJECT_ID} (100% Offline Demo Project) ===`);
  console.log('===============================================================');

  await runAdminEndpointAuthTests();

  const rulesPath = path.join(process.cwd(), 'firestore.rules');
  const rules = fs.readFileSync(rulesPath, 'utf8');

  let testEnv: RulesTestEnvironment;
  try {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules,
        host: '127.0.0.1',
        port: 8085
      }
    });
  } catch (err: any) {
    console.error('\n[FATAL] Unable to connect to Firebase Firestore Emulator:');
    console.error('\nCause: The Firebase Emulator Suite requires Java (JRE 21+) to run.');
    console.error('In GitHub Codespaces or Debian/Ubuntu: sudo apt-get update && sudo apt-get install -y openjdk-21-jre-headless\n');
    process.exit(2);
  }

  try {
    // -------------------------------------------------------------
    // SEED INITIAL DATABASE STATE USING UNRESTRICTED CONTEXT
    // -------------------------------------------------------------
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, 'products', 'honey-01'), {
        id: 'honey-01',
        name: 'عسل گون کوهستان',
        price: 350000,
        stock: 10,
        updatedAt: new Date().toISOString()
      });
      await setDoc(doc(adminDb, 'settings', 'public'), {
        storeName: 'ناما | NAMA',
        shippingCost: 0,
        supportPhone: '09166449409'
      });
      await setDoc(doc(adminDb, 'settings', 'private'), {
        cardNumber: '6037-9918-4521-8763',
        cardHolder: 'متین جهانبانی',
        ntfyTopic: 'nama_secret_orders'
      });
      await setDoc(doc(adminDb, 'orders', 'ord-cust-100'), {
        id: 'ord-cust-100',
        userId: 'customer-uid-100',
        customerName: 'علی رضایی',
        customerPhone: '09123456789',
        totalAmount: 350000,
        status: 'pending_receipt'
      });
      await setDoc(doc(adminDb, 'admins', 'registered-admin-uid'), {
        uid: 'registered-admin-uid',
        role: 'admin',
        email: 'staff@nama.ir'
      });
    });

    console.log('✓ Initial test data seeded in memory.');

    // -------------------------------------------------------------
    // 1. GUEST (UNAUTHENTICATED) CONTEXT
    // -------------------------------------------------------------
    console.log('\n--- 1. Testing Guest (Unauthenticated) Permissions ---');
    const guestContext = testEnv.unauthenticatedContext();
    const guestDb = guestContext.firestore();

    // 1.1 Guest can read products catalog
    await assertSucceeds(getDoc(doc(guestDb, 'products', 'honey-01')));
    console.log('✓ Test 1.1 Passed: Guest can read products catalog.');

    // 1.2 Guest can read public store settings
    await assertSucceeds(getDoc(doc(guestDb, 'settings', 'public')));
    console.log('✓ Test 1.2 Passed: Guest can read public settings.');

    // 1.3 Guest CANNOT read private settings (banking info, secrets)
    await assertFails(getDoc(doc(guestDb, 'settings', 'private')));
    console.log('✓ Test 1.3 Passed: Guest is BLOCKED from reading private settings.');

    // 1.4 Guest CANNOT list orders
    await assertFails(getDocs(collection(guestDb, 'orders')));
    console.log('✓ Test 1.4 Passed: Guest is BLOCKED from listing orders.');

    // 1.5 Guest CANNOT create order directly in Firestore
    await assertFails(
      setDoc(doc(guestDb, 'orders', 'malicious-order-001'), {
        id: 'malicious-order-001',
        totalAmount: 0,
        status: 'delivered'
      })
    );
    console.log('✓ Test 1.5 Passed: Guest is BLOCKED from direct order creation.');

    // 1.6 Guest CANNOT create, update, or delete products
    await assertFails(
      setDoc(doc(guestDb, 'products', 'malicious-prod-01'), {
        id: 'malicious-prod-01',
        name: 'Tampered Product',
        price: 1
      })
    );
    await assertFails(updateDoc(doc(guestDb, 'products', 'honey-01'), { stock: 0 }));
    await assertFails(deleteDoc(doc(guestDb, 'products', 'honey-01')));
    console.log('✓ Test 1.6 Passed: Guest is BLOCKED from creating, updating, or deleting products.');

    // 1.7 Guest CANNOT create, update, or delete settings/public
    await assertFails(setDoc(doc(guestDb, 'settings', 'public'), { storeName: 'Hacked Store' }));
    await assertFails(updateDoc(doc(guestDb, 'settings', 'public'), { shippingCost: 0 }));
    await assertFails(deleteDoc(doc(guestDb, 'settings', 'public')));
    console.log('✓ Test 1.7 Passed: Guest is BLOCKED from writing to settings/public.');

    // -------------------------------------------------------------
    // 2. AUTHENTICATED CUSTOMER CONTEXT (Non-admin)
    // -------------------------------------------------------------
    console.log('\n--- 2. Testing Customer (Authenticated Non-Admin) Permissions ---');
    const customerContext = testEnv.authenticatedContext('customer-uid-100', {
      email: 'customer@gmail.com',
      email_verified: true
    });
    const customerDb = customerContext.firestore();

    // 2.1 Customer can view their own order
    await assertSucceeds(getDoc(doc(customerDb, 'orders', 'ord-cust-100')));
    console.log('✓ Test 2.1 Passed: Customer can view their own order.');

    // 2.2 Customer CANNOT view another customer order
    await assertFails(getDoc(doc(customerDb, 'orders', 'ord-other-user')));
    console.log('✓ Test 2.2 Passed: Customer is BLOCKED from viewing other customers orders.');

    // 2.3 Customer CANNOT create or update orders directly
    await assertFails(
      setDoc(doc(customerDb, 'orders', 'cust-ord-999'), { id: 'cust-ord-999', totalAmount: 100 })
    );
    console.log('✓ Test 2.3 Passed: Customer is BLOCKED from direct order creation.');

    // 2.4 Customer CANNOT write to products or settings/public
    await assertFails(setDoc(doc(customerDb, 'products', 'cust-prod-01'), { id: 'cust-prod-01', price: 1 }));
    await assertFails(updateDoc(doc(customerDb, 'products', 'honey-01'), { price: 1 }));
    await assertFails(deleteDoc(doc(customerDb, 'products', 'honey-01')));
    await assertFails(setDoc(doc(customerDb, 'settings', 'public'), { storeName: 'Hacked' }));
    await assertFails(updateDoc(doc(customerDb, 'settings', 'public'), { shippingCost: 0 }));
    console.log('✓ Test 2.4 Passed: Non-admin Customer is BLOCKED from writing to products and settings/public.');

    // -------------------------------------------------------------
    // 3. AUTHENTIC STORE OWNER CONTEXT (Realistic Simulation via Claims)
    // -------------------------------------------------------------
    console.log('\n--- 3. Testing Verified Store Owner (Realistic Admin Simulation) ---');
    const ownerContext = testEnv.authenticatedContext('owner-uid-01', {
      email: 'matinjahanbani2024@gmail.com',
      email_verified: true
    });
    const ownerDb = ownerContext.firestore();

    // 3.1 Verified Owner can write to products
    await assertSucceeds(updateDoc(doc(ownerDb, 'products', 'honey-01'), { price: 380000 }));
    console.log('✓ Test 3.1 Passed: Verified Store Owner can update product price.');

    // 3.2 Verified Owner can write to settings/public
    await assertSucceeds(updateDoc(doc(ownerDb, 'settings', 'public'), { storeName: 'ناما | NAMA Updated' }));
    console.log('✓ Test 3.2 Passed: Verified Store Owner can update public settings.');

    // 3.3 Verified Owner can view and update orders
    await assertSucceeds(updateDoc(doc(ownerDb, 'orders', 'ord-cust-100'), { status: 'approved' }));
    console.log('✓ Test 3.3 Passed: Verified Store Owner can update order status.');

    // 3.4 Verified Owner can read and write private settings
    await assertSucceeds(getDoc(doc(ownerDb, 'settings', 'private')));
    console.log('✓ Test 3.4 Passed: Verified Store Owner can read private settings.');

    // 3.5 Verified Owner can manage admins registry
    await assertSucceeds(
      setDoc(doc(ownerDb, 'admins', 'new-admin-uid'), {
        uid: 'new-admin-uid',
        role: 'admin',
        email: 'newadmin@nama.ir'
      })
    );
    console.log('✓ Test 3.5 Passed: Verified Store Owner can manage admins registry.');

    // -------------------------------------------------------------
    // 4. REGISTERED SUBORDINATE ADMIN CONTEXT
    // -------------------------------------------------------------
    console.log('\n--- 4. Testing Registered Admin Doc Permissions ---');
    const subAdminContext = testEnv.authenticatedContext('registered-admin-uid', {
      email: 'staff@nama.ir',
      email_verified: true
    });
    const subAdminDb = subAdminContext.firestore();

    // 4.1 Subordinate admin can update order, products, and settings/public
    await assertSucceeds(updateDoc(doc(subAdminDb, 'orders', 'ord-cust-100'), { status: 'shipped' }));
    await assertSucceeds(updateDoc(doc(subAdminDb, 'products', 'honey-01'), { stock: 8 }));
    await assertSucceeds(updateDoc(doc(subAdminDb, 'settings', 'public'), { shippingCost: 45000 }));
    console.log('✓ Test 4.1 Passed: Registered Admin can update orders, products, and public settings.');

    // 4.2 Subordinate admin CANNOT modify admins registry
    await assertFails(
      setDoc(doc(subAdminDb, 'admins', 'unauthorized-admin'), { role: 'admin' })
    );
    console.log('✓ Test 4.2 Passed: Registered Admin is BLOCKED from modifying admins registry.');

    console.log('\n===============================================================');
    console.log('=== ALL OFFICIAL FIRESTORE RULES & ADMIN JWT TESTS PASSED! ===');
    console.log('===============================================================\n');
  } finally {
    await testEnv.cleanup();
  }
}

// Check if running directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runFirestoreRulesUnitTests().catch((e) => {
    console.error('Test execution error:', e);
    process.exit(1);
  });
}
