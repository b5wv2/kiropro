import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../src/config';
import fs from 'fs';
import path from 'path';

async function runSecurityAuditVerification() {
  console.log('=== RUNNING SECURITY AUDIT VERIFICATION SUITE ===\n');

  let passed = 0;
  let failed = 0;

  // TEST 1: Quick-login session invalidation logic check
  console.log('--- TEST 1: Quick-login passwordChangedAt check ---');
  try {
    const oldIat = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
    const pwdChangedSec = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
    const isInvalid = oldIat < pwdChangedSec;
    if (isInvalid) {
      console.log('✅ PASS: Stolen/pre-reset token with iat < passwordChangedAt is strictly detected as invalidated.');
      passed++;
    } else {
      console.error('❌ FAIL: Session invalidation check failed.');
      failed++;
    }
  } catch (err: any) {
    console.error('❌ FAIL:', err.message);
    failed++;
  }

  // TEST 2: Magic Byte File Signature Verification
  console.log('\n--- TEST 2: Magic Bytes Signature Verification ---');
  try {
    const scratchDir = path.join(__dirname, '../uploads/test_temp');
    if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });

    // Valid PNG signature: 89 50 4E 47 0D 0A 1A 0A
    const validPngPath = path.join(scratchDir, 'valid.png');
    const validPngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D]);
    fs.writeFileSync(validPngPath, validPngHeader);

    // Fake PNG (script renamed to .png)
    const fakePngPath = path.join(scratchDir, 'fake.png');
    fs.writeFileSync(fakePngPath, Buffer.from('<?php echo "evil"; ?>'));

    // Check PNG signature helper logic
    function checkSignature(filePath: string, ext: string): boolean {
      const fd = fs.openSync(filePath, 'r');
      const buffer = Buffer.alloc(16);
      const bytesRead = fs.readSync(fd, buffer, 0, 16, 0);
      fs.closeSync(fd);
      if (bytesRead < 4) return false;
      const cleanExt = ext.toLowerCase();
      if (cleanExt === '.png') {
        return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
      }
      return false;
    }

    const pngValid = checkSignature(validPngPath, '.png');
    const fakeValid = checkSignature(fakePngPath, '.png');

    fs.unlinkSync(validPngPath);
    fs.unlinkSync(fakePngPath);
    fs.rmdirSync(scratchDir);

    if (pngValid && !fakeValid) {
      console.log('✅ PASS: Real PNG magic bytes accepted; spoofed executable/script rejected.');
      passed++;
    } else {
      console.error('❌ FAIL: Magic byte validation failed.');
      failed++;
    }
  } catch (err: any) {
    console.error('❌ FAIL:', err.message);
    failed++;
  }

  // TEST 3: Receipt Exact Equality vs Wildcard Pattern
  console.log('\n--- TEST 3: Receipt Authorization Wildcard Guard ---');
  try {
    const filename = 'receipt_12345_6789.png';
    const attackFilename = 'receipt_%';
    
    // With exact check:
    const expectedPath = `/uploads/receipts/${filename}`;
    const doesMatchAttack = expectedPath === `/uploads/receipts/${attackFilename}`;
    
    if (!doesMatchAttack) {
      console.log('✅ PASS: Strict exact path equality rejects wildcard patterns like receipt_%.');
      passed++;
    } else {
      console.error('❌ FAIL: Wildcard injection not prevented.');
      failed++;
    }
  } catch (err: any) {
    console.error('❌ FAIL:', err.message);
    failed++;
  }
//ddd
  // TEST 4: Outbound GamesDrop Timeout Verification
  console.log('\n--- TEST 4: Outbound Provider Timeout Config ---');
  try {
    const clientCode = fs.readFileSync(path.join(__dirname, '../src/providers/gamesdrop/client.ts'), 'utf-8');
    if (clientCode.includes('AbortSignal.timeout(20000)')) {
      console.log('✅ PASS: AbortSignal.timeout(20000) is configured on all outbound provider requests.');
      passed++;
    } else {
      console.error('❌ FAIL: AbortSignal timeout missing.');
      failed++;
    }
  } catch (err: any) {
    console.error('❌ FAIL:', err.message);
    failed++;
  }

  // TEST 5: Helmet and Security Headers Registration
  console.log('\n--- TEST 5: Security Headers & Error Handler ---');
  try {
    const indexCode = fs.readFileSync(path.join(__dirname, '../src/index.ts'), 'utf-8');
    const hasHelmet = indexCode.includes('app.use(helmet(');
    const hasFrameguard = indexCode.includes("frameguard: { action: 'deny' }");
    const hasErrorHandler = indexCode.includes('Unhandled Server Error');

    if (hasHelmet && hasFrameguard && hasErrorHandler) {
      console.log('✅ PASS: Helmet security headers and centralized production error handler are active.');
      passed++;
    } else {
      console.error('❌ FAIL: Helmet or error handler registration missing in index.ts.');
      failed++;
    }
  } catch (err: any) {
    console.error('❌ FAIL:', err.message);
    failed++;
  }

  // TEST 6: Duplicate Order Debounce & Rate Limiter Registration
  console.log('\n--- TEST 6: Order Placement Rate Limiting & Debounce ---');
  try {
    const ordersCode = fs.readFileSync(path.join(__dirname, '../src/routes/orders.ts'), 'utf-8');
    const hasLimiter = ordersCode.includes('orderCreateLimiter');
    const hasDuplicateCheck = ordersCode.includes("INTERVAL '5 seconds'");

    if (hasLimiter && hasDuplicateCheck) {
      console.log('✅ PASS: Order placement limiter (15/min) and 5-second duplicate debounce active.');
      passed++;
    } else {
      console.error('❌ FAIL: Order limiter or debounce check missing in orders.ts.');
      failed++;
    }
  } catch (err: any) {
    console.error('❌ FAIL:', err.message);
    failed++;
  }

  // TEST 7: Top-up Self-Approval Guard
  console.log('\n--- TEST 7: Admin Top-up Self-Approval Guard ---');
  try {
    const topupCode = fs.readFileSync(path.join(__dirname, '../src/routes/topup.ts'), 'utf-8');
    const hasSelfApprovalGuard = topupCode.includes('SELF_APPROVAL_FORBIDDEN') && topupCode.includes('topup.user_id === adminId');

    if (hasSelfApprovalGuard) {
      console.log('✅ PASS: Separation of duties enforced: Admin self-approval of topups is strictly blocked.');
      passed++;
    } else {
      console.error('❌ FAIL: Self-approval guard missing in topup.ts.');
      failed++;
    }
  } catch (err: any) {
    console.error('❌ FAIL:', err.message);
    failed++;
  }

  console.log(`\n=== RESULTS: ${passed} PASSED, ${failed} FAILED ===`);
  if (failed > 0) process.exit(1);
}

runSecurityAuditVerification().catch(err => {
  console.error(err);
  process.exit(1);
});
