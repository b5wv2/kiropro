import express from 'express';
import assert from 'assert';
import http from 'http';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../src/config.js';
import { pool } from '../src/db.js';
import adminRouter from '../src/routes/admin.js';
import topupRouter from '../src/routes/topup.js';

const mockDb = {
  wallet: {
    id: uuidv4(),
    balance: 100,
    currency: 'SDG'
  },
  user: {
    id: 'test-cust-id',
    name: 'Customer Test',
    email: 'cust@test.com',
    preferred_currency: 'SDG',
    role: 'CUSTOMER'
  },
  admin: {
    id: 'test-admin-id',
    name: 'Admin Test',
    email: 'admin@test.com',
    role: 'ADMIN',
    is_super_admin: true,
    permissions: []
  },
  platform_settings: {
    exchange_rate: {
      rate: 9100,
      min_topup: 0.01,
      min_topup_sdg: 2,
      min_admin_sdg: 2,
      max_topup: 500,
      max_admin_sdg: 50000000
    },
    general_settings: {
      maintenanceMode: false,
      autoFulfillOrders: false
    }
  }
};

const mockClient = {
  query: async (queryText: string, params?: any[]) => {
    const q = queryText.toLowerCase();

    if (q.includes('begin') || q.includes('commit') || q.includes('rollback')) {
      return { rows: [] };
    }

    if (q.includes('select id, name, email, preferred_currency from "user"')) {
      return { rows: [mockDb.user] };
    }

    if (q.includes('from "user" where id =')) {
      const targetId = params?.[0];
      if (targetId === mockDb.user.id) return { rows: [mockDb.user] };
      return { rows: [mockDb.admin] };
    }

    if (q.includes('select id, balance, currency from "wallet"')) {
      return { rows: [{ ...mockDb.wallet }] };
    }

    if (q.includes('select value from "platform_settings"') && q.includes('exchange_rate')) {
      return { rows: [{ value: mockDb.platform_settings.exchange_rate }] };
    }

    if (q.includes('update "wallet" set balance')) {
      mockDb.wallet.balance = params?.[0];
      return { rows: [{ ...mockDb.wallet }] };
    }

    if (q.includes('insert into "wallettransaction"')) {
      return { rows: [{ id: uuidv4() }] };
    }

    if (q.includes('insert into "auditlog"')) {
      return { rows: [{ id: uuidv4() }] };
    }

    return { rows: [] };
  },
  release: () => {}
};

// Override pool methods
const originalQuery = pool.query;
pool.connect = async () => mockClient as any;
pool.query = (async (queryText: string, params?: any[]) => {
  const q = String(queryText).toLowerCase();

  if (q.includes('from "user" where id =') || q.includes('from "user" where')) {
    const targetId = params?.[0];
    if (targetId === mockDb.user.id) return { rows: [mockDb.user] };
    return { rows: [mockDb.admin] };
  }

  if (q.includes('platform_settings')) {
    if (params?.[0] === 'general_settings') {
      return { rows: [{ value: mockDb.platform_settings.general_settings }] };
    }
    return { rows: [{ value: mockDb.platform_settings.exchange_rate, updated_at: new Date() }] };
  }

  if (q.includes('select preferred_currency from "user"')) {
    return { rows: [{ preferred_currency: mockDb.user.preferred_currency }] };
  }

  if (q.includes('insert into "topup_requests"')) {
    return { rows: [{ id: uuidv4(), amount_sdg: params?.[5], amount_usd: params?.[3] }] };
  }

  return { rows: [] };
}) as any;

const app = express();
app.use(express.json());
app.use('/api/admin', adminRouter);
app.use('/api', topupRouter);

async function runUnitTests() {
  console.log('================================================================');
  console.log('🧪 KIROPRO WALLET LIMITS & ARBITRARY AMOUNT UNIT VERIFICATION');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  const testPass = (msg: string) => {
    console.log(`  [PASS] ${msg}`);
    passed++;
  };

  const testFail = (msg: string, err?: any) => {
    console.error(`  [FAIL] ${msg}`, err || '');
    failed++;
  };

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const adminToken = jwt.sign(
      { id: mockDb.admin.id, email: mockDb.admin.email, role: 'ADMIN' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    const adminHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    };

    const customerToken = jwt.sign(
      { id: mockDb.user.id, email: mockDb.user.email, role: 'CUSTOMER' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    console.log('>>> SECTION 1: Admin Credit Endpoint Validation');

    // 1.1: Reject negative amount
    const resNeg = await fetch(`${baseUrl}/api/admin/users/${mockDb.user.id}/wallet/credit`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ amount: -10, currency: 'SDG', reason: 'Test Neg' })
    });
    assert.strictEqual(resNeg.status, 400);
    testPass('Admin credit rejects negative amounts (-10 SDG)');

    // 1.2: Reject zero amount
    const resZero = await fetch(`${baseUrl}/api/admin/users/${mockDb.user.id}/wallet/credit`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ amount: 0, currency: 'SDG', reason: 'Test Zero' })
    });
    assert.strictEqual(resZero.status, 400);
    testPass('Admin credit rejects zero amount (0 SDG)');

    // 1.3: Reject boundary amount <= 1 SDG (Exactly 1.00 SDG)
    const resOne = await fetch(`${baseUrl}/api/admin/users/${mockDb.user.id}/wallet/credit`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ amount: 1, currency: 'SDG', reason: 'Test 1' })
    });
    const bodyOne = await resOne.json();
    assert.strictEqual(resOne.status, 400);
    assert.match(bodyOne.error, /أكبر من 1/);
    testPass('Admin credit strictly rejects 1.00 SDG (boundary <= 1 SDG) with Arabic error');

    // 1.4: Reject fractional amount <= 1 SDG (0.80 SDG)
    const resFraction = await fetch(`${baseUrl}/api/admin/users/${mockDb.user.id}/wallet/credit`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ amount: 0.8, currency: 'SDG', reason: 'Test 0.8' })
    });
    assert.strictEqual(resFraction.status, 400);
    testPass('Admin credit strictly rejects fractional amounts <= 1 SDG (0.80 SDG)');

    // 1.5: Reject more than 2 decimal places
    const resDecimals = await fetch(`${baseUrl}/api/admin/users/${mockDb.user.id}/wallet/credit`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ amount: 10.123, currency: 'SDG', reason: 'Test 3 decimals' })
    });
    assert.strictEqual(resDecimals.status, 400);
    testPass('Admin credit rejects > 2 decimal places (precision attack protection)');

    // 1.6: Accept 2.00 SDG (> 1 SDG)
    mockDb.wallet.balance = 100;
    const resTwo = await fetch(`${baseUrl}/api/admin/users/${mockDb.user.id}/wallet/credit`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ amount: 2, currency: 'SDG', reason: 'Test 2 SDG credit' })
    });
    const bodyTwo = await resTwo.json();
    assert.strictEqual(resTwo.status, 200);
    assert.strictEqual(bodyTwo.balance, 102);
    testPass('Admin credit accepts 2.00 SDG (> 1 SDG) and accurately credits wallet (100 -> 102 SDG)');

    // 1.7: Accept arbitrary custom amount: 5 SDG
    const resFive = await fetch(`${baseUrl}/api/admin/users/${mockDb.user.id}/wallet/credit`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ amount: 5, currency: 'SDG', reason: 'Test 5 SDG credit' })
    });
    const bodyFive = await resFive.json();
    assert.strictEqual(resFive.status, 200);
    assert.strictEqual(bodyFive.balance, 107);
    testPass('Admin credit accepts arbitrary small amount: 5.00 SDG');

    // 1.8: Accept arbitrary custom amount: 50 SDG (previously blocked under 910 SDG min)
    const resFifty = await fetch(`${baseUrl}/api/admin/users/${mockDb.user.id}/wallet/credit`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ amount: 50, currency: 'SDG', reason: 'Test 50 SDG credit' })
    });
    const bodyFifty = await resFifty.json();
    assert.strictEqual(resFifty.status, 200);
    assert.strictEqual(bodyFifty.balance, 157);
    testPass('Admin credit accepts 50.00 SDG (previously blocked by old minimum)');

    // 1.9: Accept arbitrary large amount: 50,000 SDG
    const res50k = await fetch(`${baseUrl}/api/admin/users/${mockDb.user.id}/wallet/credit`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ amount: 50000, currency: 'SDG', reason: 'Test 50,000 SDG credit' })
    });
    const body50k = await res50k.json();
    assert.strictEqual(res50k.status, 200);
    assert.strictEqual(body50k.balance, 50157);
    testPass('Admin credit accepts 50,000.00 SDG without issues');

    // 1.10: Reject currency mismatch (USD onto SDG wallet)
    const resMismatch = await fetch(`${baseUrl}/api/admin/users/${mockDb.user.id}/wallet/credit`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ amount: 50, currency: 'USD', reason: 'Test Mismatch' })
    });
    assert.strictEqual(resMismatch.status, 400);
    testPass('Admin credit rejects currency mismatch (USD on SDG wallet)');

    console.log('\n>>> SECTION 2: Exchange Rate & Topup Request Verification');

    // 2.1: Verify GET /api/settings/exchange-rate returns new limits
    const resSettings = await fetch(`${baseUrl}/api/settings/exchange-rate`);
    const bodySettings = await resSettings.json();
    assert.strictEqual(resSettings.status, 200);
    assert.strictEqual(Number(bodySettings.min_topup), 0.01);
    assert.strictEqual(Number(bodySettings.min_topup_sdg), 2);
    testPass('GET /api/settings/exchange-rate returns min_topup: 0.01 USD & min_topup_sdg: 2');

    const validPngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);

    // 2.2: Customer topup rejects 1.00 SDG (boundary <= 1)
    const fdOne = new FormData();
    fdOne.append('receipt', new Blob([validPngBytes], { type: 'image/png' }), 'receipt.png');
    fdOne.append('requested_amount', '1');
    fdOne.append('requested_currency', 'SDG');
    const resCustOne = await fetch(`${baseUrl}/api/topups`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${customerToken}` },
      body: fdOne
    });
    const bodyCustOne = await resCustOne.json();
    assert.strictEqual(resCustOne.status, 400);
    assert.match(bodyCustOne.error, /أكبر من 1/);
    testPass('Customer topup strictly rejects 1.00 SDG (boundary <= 1 SDG)');

    // 2.3: Customer topup rejects 0.25 SDG
    const fdQuarter = new FormData();
    fdQuarter.append('receipt', new Blob([validPngBytes], { type: 'image/png' }), 'receipt.png');
    fdQuarter.append('requested_amount', '0.25');
    fdQuarter.append('requested_currency', 'SDG');
    const resCustQuarter = await fetch(`${baseUrl}/api/topups`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${customerToken}` },
      body: fdQuarter
    });
    assert.strictEqual(resCustQuarter.status, 400);
    testPass('Customer topup rejects 0.25 SDG');

    // 2.4: Customer topup accepts 2.00 SDG (> 1 SDG)
    const fdTwo = new FormData();
    fdTwo.append('receipt', new Blob([validPngBytes], { type: 'image/png' }), 'receipt.png');
    fdTwo.append('requested_amount', '2');
    fdTwo.append('requested_currency', 'SDG');
    const resCustTwo = await fetch(`${baseUrl}/api/topups`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${customerToken}` },
      body: fdTwo
    });
    const bodyCustTwo = await resCustTwo.json();
    assert.strictEqual(resCustTwo.status, 201);
    assert.strictEqual(Number(bodyCustTwo.topup?.amount_sdg), 2);
    testPass('Customer topup accepts 2.00 SDG (> 1 SDG) with HTTP 201');

    // 2.5: Customer topup accepts 500 SDG (previously blocked by old 1 USD = 9,100 SDG minimum)
    const fd500 = new FormData();
    fd500.append('receipt', new Blob([validPngBytes], { type: 'image/png' }), 'receipt.png');
    fd500.append('requested_amount', '500');
    fd500.append('requested_currency', 'SDG');
    const resCust500 = await fetch(`${baseUrl}/api/topups`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${customerToken}` },
      body: fd500
    });
    const bodyCust500 = await resCust500.json();
    assert.strictEqual(resCust500.status, 201);
    assert.strictEqual(Number(bodyCust500.topup?.amount_sdg), 500);
    testPass('Customer topup accepts 500.00 SDG (previously blocked by old 9,100 SDG minimum)');

    // 2.6: Customer topup accepts 10,000 SDG
    const fd10k = new FormData();
    fd10k.append('receipt', new Blob([validPngBytes], { type: 'image/png' }), 'receipt.png');
    fd10k.append('requested_amount', '10000');
    fd10k.append('requested_currency', 'SDG');
    const resCust10k = await fetch(`${baseUrl}/api/topups`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${customerToken}` },
      body: fd10k
    });
    const bodyCust10k = await resCust10k.json();
    assert.strictEqual(resCust10k.status, 201);
    assert.strictEqual(Number(bodyCust10k.topup?.amount_sdg), 10000);
    testPass('Customer topup accepts 10,000.00 SDG');

    // 2.7: Customer topup in USD accepts $0.01 USD
    const fdCent = new FormData();
    fdCent.append('receipt', new Blob([validPngBytes], { type: 'image/png' }), 'receipt.png');
    fdCent.append('amount_usd', '0.01');
    fdCent.append('requested_currency', 'USD');
    const resCustCent = await fetch(`${baseUrl}/api/topups`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${customerToken}` },
      body: fdCent
    });
    const bodyCustCent = await resCustCent.json();
    assert.strictEqual(resCustCent.status, 201);
    assert.strictEqual(Number(bodyCustCent.topup?.amount_usd), 0.01);
    testPass('Customer topup in USD accepts $0.01 USD (equivalent to ~91 SDG > 1 SDG)');

    console.log('\n================================================================');
    console.log(`UNIT VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('================================================================');

  } catch (err: any) {
    testFail('Unexpected test suite error', err);
  } finally {
    server.close();
    pool.query = originalQuery;
  }
}

runUnitTests().catch(console.error);
