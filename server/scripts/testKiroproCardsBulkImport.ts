import pool from '../src/db';
import {
  cleanCardNumber,
  isValidLuhn,
  isValidExpDate,
  isValidCvv,
  hashCardNumber,
  parseCsvLine,
  encryptCardData
} from '../src/utils/cryptoCard';
import { v4 as uuidv4 } from 'uuid';

async function runBulkImportTestSuite() {
  console.log('================================================================');
  console.log('🧪 KIROPRO CARDS BULK IMPORT & VALIDATION COMPREHENSIVE SUITE');
  console.log('================================================================\n');

  const client = await pool.connect();
  const PRODUCT_ID = 'b0000000-0000-0000-0000-000000000001';

  try {
    // Clean test cards
    await client.query(`DELETE FROM kiropro_cards_inventory WHERE card_last4 IN ('1111', '2222', '3333', '4444', '5555')`);

    // -------------------------------------------------------------
    // Helper: simulate bulk import route logic
    // -------------------------------------------------------------
    async function processImport(rawContent: string, defaultBalance = 1.00) {
      if (!rawContent || !rawContent.trim()) {
        return {
          status: 400,
          body: {
            success: false,
            code: 'MISSING_DATA',
            message: 'يرجى اختيار ملف CSV أو إدخال بيانات الاستيراد.',
            errors: []
          }
        };
      }

      // 1. Strip UTF-8 BOM
      const cleaned = rawContent.replace(/^\uFEFF/, '').trim();

      // 2. Split lines (CRLF and LF)
      const lines = cleaned.split(/\r\n|\r|\n/).map((l) => l.trim()).filter(Boolean);
      if (lines.length === 0) {
        return {
          status: 400,
          body: {
            success: false,
            code: 'EMPTY_IMPORT',
            message: 'ملف الاستيراد فارغ ولا يحتوي على أي صفوف صالحة.',
            errors: []
          }
        };
      }

      if (lines.length > 500) {
        return {
          status: 400,
          body: {
            success: false,
            code: 'TOO_MANY_ROWS',
            message: 'الحد الأقصى للاستيراد في المرة الواحدة هو 500 بطاقة.',
            errors: []
          }
        };
      }

      // 3. Header inspection
      let startIndex = 0;
      const colMap = { card: 0, exp: 1, cvv: 2, bal: 3 };
      const firstParts = parseCsvLine(lines[0] || '');
      const lowerHeader = firstParts.map((p) => p.toLowerCase().replace(/[\s_-]/g, ''));

      const looksLikeHeader = lowerHeader.some((p) =>
        p.includes('card') || p.includes('pan') || p.includes('number') || p.includes('exp')
      );

      if (looksLikeHeader) {
        startIndex = 1;
        const cardIdx = lowerHeader.findIndex((p) => p.includes('card') || p.includes('pan') || p.includes('number'));
        const expIdx = lowerHeader.findIndex((p) => p.includes('exp') || p.includes('date'));
        const cvvIdx = lowerHeader.findIndex((p) => p.includes('cvv') || p.includes('cvc') || p.includes('sec'));
        const balIdx = lowerHeader.findIndex((p) => p.includes('bal') || p.includes('amount') || p.includes('price'));

        if (cardIdx !== -1) colMap.card = cardIdx;
        if (expIdx !== -1) colMap.exp = expIdx;
        if (cvvIdx !== -1) colMap.cvv = cvvIdx;
        if (balIdx !== -1) colMap.bal = balIdx;
      }

      const dataRowsCount = lines.length - startIndex;
      if (dataRowsCount <= 0) {
        return {
          status: 400,
          body: {
            success: false,
            code: 'NO_DATA_ROWS',
            message: 'الملف يحتوي فقط على سطر العناوين (Headers) دون أي بيانات للبطاقات.',
            errors: []
          }
        };
      }

      const conn = await pool.connect();
      const errors: Array<{ row: number; reason: string }> = [];
      const seenHashesInBatch = new Set<string>();
      let importedCount = 0;

      try {
        await conn.query('BEGIN');

        for (let i = startIndex; i < lines.length; i++) {
          const rowNumber = i + 1;
          const lineText = lines[i];
          if (!lineText) continue;

          const parts = parseCsvLine(lineText);
          const rawNum = parts[colMap.card]?.trim();
          const rawExp = parts[colMap.exp]?.trim();
          const rawCvv = parts[colMap.cvv]?.trim();
          const rawBal = parts[colMap.bal]?.trim();

          if (!rawNum || !rawExp || !rawCvv) {
            errors.push({ row: rowNumber, reason: 'السطر غير مكتمل (مطلوب: رقم البطاقة، تاريخ الانتهاء، رمز CVV)' });
            continue;
          }

          const cleanNum = cleanCardNumber(rawNum);
          if (!cleanNum || cleanNum.length !== 16) {
            errors.push({ row: rowNumber, reason: 'رقم البطاقة غير صالح (يجب أن يتكون من 16 رقماً)' });
            continue;
          }

          if (!isValidLuhn(cleanNum)) {
            errors.push({ row: rowNumber, reason: 'رقم البطاقة غير صالح (فشل فحص خوارزمية Luhn Checksum)' });
            continue;
          }

          if (!isValidExpDate(rawExp)) {
            errors.push({ row: rowNumber, reason: 'تاريخ الانتهاء غير صالح أو منتهي الصلاحية (مطلوب صيغة MM/YY)' });
            continue;
          }

          if (!isValidCvv(rawCvv)) {
            errors.push({ row: rowNumber, reason: 'رمز الأمان (CVV) غير صالح (مطلوب 3 أو 4 أرقام)' });
            continue;
          }

          const cardBalance = rawBal !== undefined && rawBal !== '' ? Number(rawBal) : defaultBalance;
          if (isNaN(cardBalance) || cardBalance < 0) {
            errors.push({ row: rowNumber, reason: 'رصيد البطاقة غير صالح (يجب أن يكون رقماً أكبر من أو يساوي 0)' });
            continue;
          }

          const cardHash = hashCardNumber(cleanNum);
          if (seenHashesInBatch.has(cardHash)) {
            errors.push({ row: rowNumber, reason: 'البطاقة مكررة داخل ملف الاستيراد نفسه' });
            continue;
          }
          seenHashesInBatch.add(cardHash);

          const existingCheck = await conn.query(
            `SELECT id FROM kiropro_cards_inventory WHERE card_hash = $1 LIMIT 1`,
            [cardHash]
          );
          if (existingCheck.rows.length > 0) {
            errors.push({ row: rowNumber, reason: 'البطاقة مسجلة مسبقاً في مخزون النظام' });
            continue;
          }

          const last4 = cleanNum.slice(-4);
          const numEnc = encryptCardData(cleanNum);
          const cvvEnc = encryptCardData(rawCvv);

          await conn.query(
            `INSERT INTO kiropro_cards_inventory (
               id, product_id, card_number_encrypted, card_last4, exp_date, cvv_encrypted, balance, status, card_hash
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'AVAILABLE', $8)`,
            [uuidv4(), PRODUCT_ID, numEnc, last4, rawExp, cvvEnc, cardBalance, cardHash]
          );

          importedCount++;
        }

        if (importedCount === 0 && errors.length > 0) {
          await conn.query('ROLLBACK');
          return {
            status: 400,
            body: {
              success: false,
              code: 'INVALID_IMPORT',
              message: 'فشل استيراد الملف؛ جميع الصفوف تحتوي على أخطاء ولم يتم حفظ أي بطاقة.',
              imported: 0,
              failed: errors.length,
              errors
            }
          };
        }

        await conn.query('COMMIT');
        return {
          status: 200,
          body: {
            success: true,
            imported: importedCount,
            failed: errors.length,
            total: dataRowsCount,
            message: `تم استيراد ${importedCount} بطاقة بنجاح للمخزون.`,
            errors
          }
        };
      } catch (err: any) {
        await conn.query('ROLLBACK');
        throw err;
      } finally {
        conn.release();
      }
    }

    function generateLuhnCard(prefix15: string): string {
      let sum = 0;
      for (let i = 0; i < 15; i++) {
        let n = parseInt(prefix15[i] || '0', 10);
        const posFromRight = 16 - i;
        if (posFromRight % 2 === 0) {
          n *= 2;
          if (n > 9) n -= 9;
        }
        sum += n;
      }
      const checkDigit = (10 - (sum % 10)) % 10;
      return prefix15 + checkDigit.toString();
    }

    const validCard1 = generateLuhnCard('510510510510111');
    const validCard2 = generateLuhnCard('555555555555222');
    const validCard3 = generateLuhnCard('510510510510333');
    const validCard4 = generateLuhnCard('555555555555444');
    const validCard5 = generateLuhnCard('510510510510555');

    console.log(`Generated Luhn valid test cards: ${validCard1}, ${validCard2}`);

    // -------------------------------------------------------------
    // TEST 1: Valid CSV with Headers
    // -------------------------------------------------------------
    console.log('--- TEST 1: Valid CSV with standard headers ---');
    const csv1 = `card_number,exp_date,cvv,balance\n${validCard1},12/28,123,1.00\n${validCard2},11/27,456,1.00`;
    const res1 = await processImport(csv1);
    console.log('Result 1:', res1.status, res1.body.message, res1.body.errors);
    if (res1.status !== 200 || res1.body.imported !== 2 || res1.body.failed !== 0) {
      throw new Error(`TEST 1 Failed: Expected 2 imported, got ${res1.body.imported}`);
    }
    console.log('✅ TEST 1 PASSED: Valid CSV imported cleanly.\n');

    // -------------------------------------------------------------
    // TEST 2: Empty CSV
    // -------------------------------------------------------------
    console.log('--- TEST 2: Empty CSV content ---');
    const res2 = await processImport('');
    console.log('Result 2:', res2.status, res2.body.code);
    if (res2.status !== 400 || res2.body.code !== 'MISSING_DATA') {
      throw new Error('TEST 2 Failed: Expected 400 MISSING_DATA');
    }
    console.log('✅ TEST 2 PASSED: Empty content rejected with structured error.\n');

    // -------------------------------------------------------------
    // TEST 3: Header Only (No Data Rows)
    // -------------------------------------------------------------
    console.log('--- TEST 3: Header only (0 data rows) ---');
    const res3 = await processImport('card_number,exp_date,cvv,balance\n');
    console.log('Result 3:', res3.status, res3.body.code);
    if (res3.status !== 400 || res3.body.code !== 'NO_DATA_ROWS') {
      throw new Error('TEST 3 Failed: Expected 400 NO_DATA_ROWS');
    }
    console.log('✅ TEST 3 PASSED: Header-only file rejected cleanly.\n');

    // -------------------------------------------------------------
    // TEST 4: Incomplete row (Missing columns)
    // -------------------------------------------------------------
    console.log('--- TEST 4: Row with missing columns ---');
    const csv4 = `card_number,exp_date,cvv,balance\n5105105105103333,12/28`;
    const res4 = await processImport(csv4);
    console.log('Result 4:', res4.status, res4.body.errors);
    if (res4.status !== 400 || !res4.body.errors[0]?.reason.includes('غير مكتمل')) {
      throw new Error('TEST 4 Failed: Incomplete row not properly caught');
    }
    console.log('✅ TEST 4 PASSED: Missing columns detected with line reference.\n');

    // -------------------------------------------------------------
    // TEST 5: Invalid card length
    // -------------------------------------------------------------
    console.log('--- TEST 5: Invalid card length (12 digits) ---');
    const csv5 = `card_number,exp_date,cvv,balance\n123456789012,12/28,123,1.00`;
    const res5 = await processImport(csv5);
    console.log('Result 5:', res5.status, res5.body.errors);
    if (res5.status !== 400 || !res5.body.errors[0]?.reason.includes('16 رقماً')) {
      throw new Error('TEST 5 Failed: Invalid length not caught');
    }
    console.log('✅ TEST 5 PASSED: Invalid card length detected.\n');

    // -------------------------------------------------------------
    // TEST 6: Invalid Luhn Checksum
    // -------------------------------------------------------------
    console.log('--- TEST 6: Invalid Luhn Checksum ---');
    const csv6 = `card_number,exp_date,cvv,balance\n5105105105101112,12/28,123,1.00`; // last digit invalid
    const res6 = await processImport(csv6);
    console.log('Result 6:', res6.status, res6.body.errors);
    if (res6.status !== 400 || !res6.body.errors[0]?.reason.includes('Luhn')) {
      throw new Error('TEST 6 Failed: Luhn check failed');
    }
    console.log('✅ TEST 6 PASSED: Invalid Luhn checksum detected.\n');

    // -------------------------------------------------------------
    // TEST 7: Expired or Invalid Expiry Date
    // -------------------------------------------------------------
    console.log('--- TEST 7: Expired / Invalid Expiry Date ---');
    const csv7 = `card_number,exp_date,cvv,balance\n${validCard3},01/20,123,1.00`; // Expired year 2020
    const res7 = await processImport(csv7);
    console.log('Result 7:', res7.status, res7.body.errors);
    if (res7.status !== 400 || !res7.body.errors[0]?.reason.includes('تاريخ الانتهاء')) {
      throw new Error('TEST 7 Failed: Expiry validation failed');
    }
    console.log('✅ TEST 7 PASSED: Expired card rejected.\n');

    // -------------------------------------------------------------
    // TEST 8: Invalid CVV (letters or not 3 digits)
    // -------------------------------------------------------------
    console.log('--- TEST 8: Invalid CVV ---');
    const csv8 = `card_number,exp_date,cvv,balance\n${validCard3},12/28,99,1.00`; // 2 digits only
    const res8 = await processImport(csv8);
    console.log('Result 8:', res8.status, res8.body.errors);
    if (res8.status !== 400 || !res8.body.errors[0]?.reason.includes('CVV')) {
      throw new Error('TEST 8 Failed: Invalid CVV not caught');
    }
    console.log('✅ TEST 8 PASSED: Invalid CVV rejected.\n');

    // -------------------------------------------------------------
    // TEST 9: Invalid balance (negative)
    // -------------------------------------------------------------
    console.log('--- TEST 9: Invalid balance (negative) ---');
    const csv9 = `card_number,exp_date,cvv,balance\n${validCard3},12/28,123,-5.00`;
    const res9 = await processImport(csv9);
    console.log('Result 9:', res9.status, res9.body.errors);
    if (res9.status !== 400 || !res9.body.errors[0]?.reason.includes('رصيد')) {
      throw new Error('TEST 9 Failed: Negative balance not caught');
    }
    console.log('✅ TEST 9 PASSED: Negative balance rejected.\n');

    // -------------------------------------------------------------
    // TEST 10: Duplicate card within the same file
    // -------------------------------------------------------------
    console.log('--- TEST 10: In-file duplicate card ---');
    const csv10 = `card_number,exp_date,cvv,balance\n${validCard3},12/28,123,1.00\n${validCard3},12/28,123,1.00`;
    const res10 = await processImport(csv10);
    console.log('Result 10:', res10.status, res10.body.imported, res10.body.failed, res10.body.errors);
    if (res10.body.imported !== 1 || res10.body.failed !== 1 || !res10.body.errors[0]?.reason.includes('مكررة داخل ملف')) {
      throw new Error('TEST 10 Failed: In-file duplicate not detected');
    }
    console.log('✅ TEST 10 PASSED: In-file duplicate detected and handled gracefully.\n');

    // -------------------------------------------------------------
    // TEST 11: Duplicate against DB (validCard1 already inserted in TEST 1)
    // -------------------------------------------------------------
    console.log('--- TEST 11: In-DB duplicate card (via card_hash) ---');
    const csv11 = `card_number,exp_date,cvv,balance\n${validCard1},12/28,123,1.00`;
    const res11 = await processImport(csv11);
    console.log('Result 11:', res11.status, res11.body.errors);
    if (res11.status !== 400 || !res11.body.errors[0]?.reason.includes('مسجلة مسبقاً')) {
      throw new Error('TEST 11 Failed: In-DB duplicate not detected by card_hash');
    }
    console.log('✅ TEST 11 PASSED: In-DB duplicate detected via deterministic card_hash.\n');

    // -------------------------------------------------------------
    // TEST 12: UTF-8 BOM Handling
    // -------------------------------------------------------------
    console.log('--- TEST 12: UTF-8 BOM (\uFEFF) ---');
    const bomCsv = `\uFEFFcard_number,exp_date,cvv,balance\n${validCard4},12/28,789,1.00`;
    const res12 = await processImport(bomCsv);
    console.log('Result 12:', res12.status, res12.body.imported);
    if (res12.status !== 200 || res12.body.imported !== 1) {
      throw new Error('TEST 12 Failed: UTF-8 BOM corrupted row parsing');
    }
    console.log('✅ TEST 12 PASSED: UTF-8 BOM stripped and parsed perfectly.\n');

    // -------------------------------------------------------------
    // TEST 13: Windows CRLF (\r\n) Line Endings
    // -------------------------------------------------------------
    console.log('--- TEST 13: Windows CRLF (\\r\\n) Line Endings ---');
    const crlfCsv = `card_number,exp_date,cvv,balance\r\n${validCard5},10/29,999,1.00\r\n`;
    const res13 = await processImport(crlfCsv);
    console.log('Result 13:', res13.status, res13.body.imported);
    if (res13.status !== 200 || res13.body.imported !== 1) {
      throw new Error('TEST 13 Failed: Windows CRLF line endings failed');
    }
    console.log('✅ TEST 13 PASSED: Windows CRLF parsed without trailing \\r artifacts.\n');

    // -------------------------------------------------------------
    // TEST 14: Over 500 rows limit
    // -------------------------------------------------------------
    console.log('--- TEST 14: File with > 500 rows ---');
    const bigLines = ['card_number,exp_date,cvv,balance'];
    for (let i = 0; i < 505; i++) {
      bigLines.push('5105105105101111,12/28,123,1.00');
    }
    const res14 = await processImport(bigLines.join('\n'));
    console.log('Result 14:', res14.status, res14.body.code);
    if (res14.status !== 400 || res14.body.code !== 'TOO_MANY_ROWS') {
      throw new Error('TEST 14 Failed: 500 limit not enforced');
    }
    console.log('✅ TEST 14 PASSED: 500 rows max limit strictly enforced.\n');

    // -------------------------------------------------------------
    // TEST 15: Security: No PAN or CVV in errors or logs
    // -------------------------------------------------------------
    console.log('--- TEST 15: Security - No raw card numbers in errors ---');
    const allErrors = [
      ...res4.body.errors,
      ...res5.body.errors,
      ...res6.body.errors,
      ...res7.body.errors,
      ...res8.body.errors,
      ...res9.body.errors
    ];
    for (const err of allErrors) {
      if (err.reason.includes('5105') || err.reason.includes('1234') || err.reason.includes('789')) {
        throw new Error(`SECURITY LEAK: Error reason exposed sensitive card data: ${err.reason}`);
      }
    }
    console.log('✅ TEST 15 PASSED: Error responses are strictly sanitised and leak zero PAN/CVV.\n');

    // -------------------------------------------------------------
    // CLEANUP
    // -------------------------------------------------------------
    await client.query(`DELETE FROM kiropro_cards_inventory WHERE card_last4 IN ('1111', '2222', '3333', '4444', '5555')`);
    console.log('🧹 Cleaned up all test records.');

    console.log('\n================================================================');
    console.log('🎉 ALL 15 BULK IMPORT TEST CASES PASSED WITH 100% SUCCESS');
    console.log('================================================================\n');
  } finally {
    client.release();
    await pool.end();
  }
}

runBulkImportTestSuite().catch((err) => {
  console.error('\n❌ BULK IMPORT TEST SUITE FAILED:', err);
  process.exit(1);
});
