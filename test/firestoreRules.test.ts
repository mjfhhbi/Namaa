import { 
  initializeTestEnvironment, 
  assertFails, 
  assertSucceeds,
  RulesTestEnvironment 
} from '@firebase/rules-unit-testing';
import fs from 'fs';
import path from 'path';
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  getDocs 
} from 'firebase/firestore';

const PROJECT_ID = 'demo-nama-test';

export async function runFirestoreRulesUnitTests() {
  console.log('===============================================================');
  console.log('=== OFFICIAL @firebase/rules-unit-testing SUITE FOR NAMAA ===');
  console.log(`=== Target Project: ${PROJECT_ID} (100% Offline Demo Project) ===`);
  console.log('===============================================================');

  const rulesPath = path.join(process.cwd(), 'firestore.rules');
  const rules = fs.readFileSync(rulesPath, 'utf8');

  let testEnv: RulesTestEnvironment;
  try {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules,
        host: '127.0.0.1',
        port: 8080
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

    // 1.6 Guest CANNOT decrement product stock
    await assertFails(updateDoc(doc(guestDb, 'products', 'honey-01'), { stock: 0 }));
    console.log('✓ Test 1.6 Passed: Guest is BLOCKED from decrementing product stock.');

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

    // 3.2 Verified Owner can view and update orders
    await assertSucceeds(updateDoc(doc(ownerDb, 'orders', 'ord-cust-100'), { status: 'approved' }));
    console.log('✓ Test 3.2 Passed: Verified Store Owner can update order status.');

    // 3.3 Verified Owner can read and write private settings
    await assertSucceeds(getDoc(doc(ownerDb, 'settings', 'private')));
    console.log('✓ Test 3.3 Passed: Verified Store Owner can read private settings.');

    // 3.4 Verified Owner can manage admins registry
    await assertSucceeds(
      setDoc(doc(ownerDb, 'admins', 'new-admin-uid'), {
        uid: 'new-admin-uid',
        role: 'admin',
        email: 'newadmin@nama.ir'
      })
    );
    console.log('✓ Test 3.4 Passed: Verified Store Owner can manage admins registry.');

    // -------------------------------------------------------------
    // 4. REGISTERED SUBORDINATE ADMIN CONTEXT
    // -------------------------------------------------------------
    console.log('\n--- 4. Testing Registered Admin Doc Permissions ---');
    const subAdminContext = testEnv.authenticatedContext('registered-admin-uid', {
      email: 'staff@nama.ir',
      email_verified: true
    });
    const subAdminDb = subAdminContext.firestore();

    // 4.1 Subordinate admin can update order
    await assertSucceeds(updateDoc(doc(subAdminDb, 'orders', 'ord-cust-100'), { status: 'shipped' }));
    console.log('✓ Test 4.1 Passed: Registered Admin can update order status.');

    // 4.2 Subordinate admin CANNOT modify admins registry
    await assertFails(
      setDoc(doc(subAdminDb, 'admins', 'unauthorized-admin'), { role: 'admin' })
    );
    console.log('✓ Test 4.2 Passed: Registered Admin is BLOCKED from modifying admins registry.');

    console.log('\n===============================================================');
    console.log('=== ALL 14 OFFICIAL @firebase/rules-unit-testing TESTS PASSED! ===');
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
