import { pool } from '../src/db';
import { g2BulkVoucherPurchaseProvider } from '../src/providers/g2bulk/voucherPurchaseProvider';
import { g2BulkClient } from '../src/providers/g2bulk/client';
import dotenv from 'dotenv';
dotenv.config();

async function analyzeVoucherPricing() {
  console.log('======================================================================');
  console.log('📊 KIROPRO PRODUCTION VOUCHER PRICING & PROFITABILITY AUDIT');
  console.log('======================================================================\n');

  // 1. Authoritative Exchange Rate in Platform Settings
  const rateRes = await pool.query("SELECT value, updated_at FROM platform_settings WHERE key = 'exchange_rate'");
  const rateRow = rateRes.rows[0];
  let exchangeRate = 7600;
  if (rateRow?.value) {
    if (typeof rateRow.value === 'object' && rateRow.value.rate) {
      exchangeRate = Number(rateRow.value.rate);
    } else {
      exchangeRate = Number(rateRow.value);
    }
  }

  console.log(`Platform Exchange Rate: 1 USD = ${exchangeRate.toLocaleString()} SDG`);
  console.log(`Last Rate Update: ${rateRow?.updated_at || 'N/A'}\n`);

  // 2. Fetch all vouchers from catalog
  const vRes = await pool.query(`
    SELECT provider_product_id, title, arabic_title, game_key, unit_price, customer_price_usd, is_active, is_in_stock, stock
    FROM g2bulk_voucher_catalog
    ORDER BY game_key ASC, unit_price ASC
  `);

  const rows = vRes.rows;
  console.log(`Total vouchers in DB catalog: ${rows.length}\n`);

  console.log('------------------------------------------------------------------------------------------------------------------------');
  console.log('ID  | Game | Title                           | Cost USD | Price USD | Price SDG  | Cost SDG   | Profit SDG | Margin % | Live Check');
  console.log('------------------------------------------------------------------------------------------------------------------------');

  const analysisResults: any[] = [];

  for (const v of rows) {
    const costUsd = Number(v.unit_price);
    const priceUsd = Number(v.customer_price_usd);
    const priceSdg = Math.round(priceUsd * exchangeRate);
    const costSdg = Math.round(costUsd * exchangeRate);
    const profitSdg = priceSdg - costSdg;
    const profitUsd = priceUsd - costUsd;
    const marginPercent = costUsd > 0 ? ((profitUsd / costUsd) * 100) : 0;

    // Check live price from G2Bulk (Read-only GET /v1/products/:id)
    let liveCostUsd: number | null = null;
    let liveStock: number | null = null;
    let liveStatus = 'UNCHECKED';

    try {
      const fresh = await g2BulkVoucherPurchaseProvider.getFreshProductPrice(v.provider_product_id);
      liveCostUsd = fresh.unitPrice;
      liveStock = fresh.stock;
      liveStatus = fresh.stock > 0 ? `LIVE ($${fresh.unitPrice})` : `OUT_OF_STOCK ($${fresh.unitPrice})`;
    } catch (e: any) {
      liveStatus = `ERR: ${e.message?.slice(0, 25)}`;
    }

    const isProfitable = profitSdg > 0 && (liveCostUsd === null || (priceUsd > liveCostUsd));
    const titlePadded = (v.arabic_title || v.title).slice(0, 30).padEnd(31);
    const idStr = String(v.provider_product_id).padStart(3);
    const gameStr = v.game_key.padEnd(4);

    console.log(
      `${idStr} | ${gameStr} | ${titlePadded} | $${costUsd.toFixed(3).padStart(6)} | $${priceUsd.toFixed(2).padStart(7)} | ` +
      `${priceSdg.toLocaleString().padStart(9)} SDG | ${costSdg.toLocaleString().padStart(9)} SDG | ` +
      `${profitSdg.toLocaleString().padStart(8)} SDG | ${marginPercent.toFixed(1).padStart(6)}% | ${liveStatus}`
    );

    analysisResults.push({
      id: v.provider_product_id,
      title: v.arabic_title || v.title,
      gameKey: v.game_key,
      costUsd,
      priceUsd,
      priceSdg,
      costSdg,
      profitSdg,
      marginPercent,
      liveCostUsd,
      liveStock,
      isProfitable,
      isActive: v.is_active
    });
  }

  console.log('------------------------------------------------------------------------------------------------------------------------\n');

  // Summary
  const profitableCount = analysisResults.filter(r => r.isProfitable).length;
  const losingCount = analysisResults.filter(r => !r.isProfitable).length;

  console.log(`Profitable vouchers: ${profitableCount}/${analysisResults.length}`);
  if (losingCount > 0) {
    console.warn(`⚠️ WARNING: ${losingCount} vouchers are NOT profitable or have price <= cost!`);
    for (const l of analysisResults.filter(r => !r.isProfitable)) {
      console.warn(`   - ID ${l.id} (${l.title}): Cost $${l.costUsd} vs Price $${l.priceUsd} (Margin: ${l.marginPercent.toFixed(1)}%)`);
    }
  }

  await pool.end();
}

analyzeVoucherPricing().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
