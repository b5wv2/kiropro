import pool from '../src/db';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../src/config';

async function runTests() {
  console.log('--- Starting Admin Payment Methods Test Suite ---');

  // Find an admin user to generate a valid test token
  const adminRes = await pool.query('SELECT id, email, role FROM "User" WHERE role = \'ADMIN\' LIMIT 1');
  if (adminRes.rows.length === 0) {
    throw new Error('No admin user found in database to execute test suite');
  }
  const adminUser = adminRes.rows[0];
  const adminToken = jwt.sign(
    { id: adminUser.id, email: adminUser.email, role: 'ADMIN' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${adminToken}`
  };

  const baseUrl = 'http://127.0.0.1:5000';

  // 1. List all payment methods
  console.log('\nTest 1: GET /api/admin/payment-methods');
  const getRes = await fetch(`${baseUrl}/api/admin/payment-methods`, { headers });
  console.log('Status:', getRes.status);
  const list = await getRes.json();
  console.log(`Retrieved ${list.length} payment methods.`);

  // 2. Test PATCH on the reported ID: 7f76dbe0-d6fa-4b4a-a2ac-b5eab1eca4b9
  const targetId = '7f76dbe0-d6fa-4b4a-a2ac-b5eab1eca4b9';
  console.log(`\nTest 2: PATCH /api/admin/payment-methods/${targetId} (The user's reported failing request)`);
  const patchPayload = {
    name: 'فوري (بنك فيصل)',
    bank_name: 'بنك فيصل الإسلامي',
    currency: 'SDG',
    account_name: 'احمد ياسر',
    account_number: '020523215220001',
    instructions: 'رقم حساب بنك فيصل في حال قمت ب التحويل من بنك مختلف BBAN',
    phone_number: '',
    qr_code_url: '',
    enabled: true,
    display_order: 3
  };
  const patchRes = await fetch(`${baseUrl}/api/admin/payment-methods/${targetId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(patchPayload)
  });
  console.log('PATCH Status:', patchRes.status);
  const patchResult = await patchRes.json();
  console.log('PATCH Result:', patchResult);
  if (patchRes.status !== 200) {
    throw new Error(`PATCH failed with status ${patchRes.status}: ${JSON.stringify(patchResult)}`);
  }

  // 3. Test PATCH single field (toggle enabled to false then true)
  console.log('\nTest 3: PATCH single field { enabled: false }');
  const toggleRes = await fetch(`${baseUrl}/api/admin/payment-methods/${targetId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ enabled: false })
  });
  const toggled = await toggleRes.json();
  console.log('Toggled enabled:', toggled.enabled, '(account_number retained:', toggled.account_number, ')');
  if (toggled.enabled !== false || toggled.account_number !== '020523215220001') {
    throw new Error('Partial update failed or overwrote untouched fields');
  }

  // Restore enabled to true
  await fetch(`${baseUrl}/api/admin/payment-methods/${targetId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ enabled: true })
  });
  console.log('Restored enabled: true');

  // 4. Test Validation: Invalid UUID
  console.log('\nTest 4: PATCH with invalid UUID "not-a-uuid"');
  const invalidUuidRes = await fetch(`${baseUrl}/api/admin/payment-methods/not-a-uuid`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ name: 'Test' })
  });
  console.log('Status (expected 400):', invalidUuidRes.status);
  const invalidUuidData = await invalidUuidRes.json();
  console.log('Response:', invalidUuidData);
  if (invalidUuidRes.status !== 400) {
    throw new Error('Expected 400 for invalid UUID');
  }

  // 5. Test Validation: Non-existent UUID
  console.log('\nTest 5: PATCH with non-existent UUID "00000000-0000-0000-0000-000000000000"');
  const notFoundRes = await fetch(`${baseUrl}/api/admin/payment-methods/00000000-0000-0000-0000-000000000000`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ name: 'Test' })
  });
  console.log('Status (expected 404):', notFoundRes.status);
  const notFoundData = await notFoundRes.json();
  console.log('Response:', notFoundData);
  if (notFoundRes.status !== 404) {
    throw new Error('Expected 404 for non-existent UUID');
  }

  // 6. Test POST: Create new payment method
  console.log('\nTest 6: POST /api/admin/payment-methods (Create new test method)');
  const newMethodPayload = {
    name: 'حساب بنك الخرطوم التجريبي',
    bank_name: 'بنك الخرطوم (بنكك)',
    type: 'BANK_TRANSFER',
    currency: 'SDG',
    account_name: 'حساب تجريبي KIROPRO',
    account_number: '9988776655',
    phone_number: '0912345678',
    qr_code_url: '',
    instructions: 'يرجى إرفاق إشعار بنكك الرسمي مع رقم العملية واضحاً.',
    enabled: true,
    display_order: 10
  };
  const postRes = await fetch(`${baseUrl}/api/admin/payment-methods`, {
    method: 'POST',
    headers,
    body: JSON.stringify(newMethodPayload)
  });
  console.log('POST Status (expected 201):', postRes.status);
  const createdMethod = await postRes.json();
  console.log('Created method ID:', createdMethod.id, 'name:', createdMethod.name);
  if (postRes.status !== 201 || !createdMethod.id) {
    throw new Error(`POST failed: ${JSON.stringify(createdMethod)}`);
  }

  // 7. Test PATCH on newly created method
  console.log(`\nTest 7: PATCH newly created method ${createdMethod.id}`);
  const updateNewRes = await fetch(`${baseUrl}/api/admin/payment-methods/${createdMethod.id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      name: 'حساب بنك الخرطوم المحدث',
      instructions: null // test explicitly setting to null
    })
  });
  const updatedNew = await updateNewRes.json();
  console.log('Updated new method name:', updatedNew.name, 'instructions:', updatedNew.instructions);
  if (updatedNew.name !== 'حساب بنك الخرطوم المحدث' || updatedNew.instructions !== null) {
    throw new Error('Updating new method or clearing instructions failed');
  }

  // 8. Test Customer Endpoint: GET /api/payment-methods
  console.log('\nTest 8: GET /api/payment-methods (Customer view)');
  const customerRes = await fetch(`${baseUrl}/api/payment-methods`);
  const customerList = await customerRes.json();
  console.log(`Customer sees ${customerList.length} enabled SDG payment methods.`);
  const foundInCustomer = customerList.some((m: any) => m.id === createdMethod.id);
  console.log('New method visible in customer list:', foundInCustomer);
  if (!foundInCustomer) {
    throw new Error('Created method not visible in customer payment methods');
  }

  // 9. Test DELETE on test method
  console.log(`\nTest 9: DELETE /api/admin/payment-methods/${createdMethod.id}`);
  const deleteRes = await fetch(`${baseUrl}/api/admin/payment-methods/${createdMethod.id}`, {
    method: 'DELETE',
    headers
  });
  console.log('DELETE Status (expected 200):', deleteRes.status);
  const deleteResult = await deleteRes.json();
  console.log('DELETE Result:', deleteResult);
  if (deleteRes.status !== 200) {
    throw new Error(`DELETE failed: ${JSON.stringify(deleteResult)}`);
  }

  // 10. Verify test method is gone
  const verifyRes = await fetch(`${baseUrl}/api/admin/payment-methods/${createdMethod.id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ name: 'Should Not Exist' })
  });
  console.log('Verify deletion (expected 404):', verifyRes.status);
  if (verifyRes.status !== 404) {
    throw new Error('Method was not deleted properly');
  }

  console.log('\n✅ ALL 10 TESTS PASSED SUCCESSFULLY! ✅');
  process.exit(0);
}

runTests().catch(err => {
  console.error('\n❌ Test Suite Failed:', err);
  process.exit(1);
});
