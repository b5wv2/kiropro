import { pool } from '../src/db';

async function testSync() {
  const client = await pool.connect();
  try {
    const productsRes = await client.query(`
      SELECT 
        p.id, 
        p."productName", 
        p."offerName", 
        p.provider, 
        p."primaryProvider",
        p.fulfillment_type, 
        p."productType", 
        p."customerPriceUsd",
        p."supplierCostUsd", 
        p."gamesDropCostUsd", 
        p."providerCostUsd",
        p.face_value, 
        p.card_currency, 
        p."defaultPartnerPriceUsd",
        p."providerOfferId", 
        g2.unit_price as g2_unit_price
      FROM "Product" p
      LEFT JOIN g2bulk_voucher_catalog g2 
        ON (g2.provider_product_id::text = p."providerOfferId"::text OR g2.title ILIKE p."productName")
      WHERE p."isActive" = true
      ORDER BY p."productName" ASC
    `);

    console.log(`Found ${productsRes.rows.length} active products to evaluate for sync.`);

    let updatedCount = 0;
    let unverifiedCostCount = 0;
    let matchedPartnerPrices = 0;

    const previewList: any[] = [];

    for (const p of productsRes.rows) {
      // 1. Determine authentic provider cost
      let resolvedCost: number | null = null;
      const g2Unit = p.g2_unit_price ? Number(p.g2_unit_price) : 0;
      const pCost = p.providerCostUsd ? Number(p.providerCostUsd) : 0;
      const sCost = p.supplierCostUsd ? Number(p.supplierCostUsd) : 0;
      const gdCost = p.gamesDropCostUsd ? Number(p.gamesDropCostUsd) : 0;
      const isCard = p.fulfillment_type === 'KIROPRO_CARD' || p.productType === 'VIRTUAL_CARD';
      const isVoucher = p.fulfillment_type === 'G2BULK_VOUCHER' || p.provider === 'G2BULK' || p.primaryProvider === 'G2BULK';

      if (isVoucher) {
        if (g2Unit > 0) resolvedCost = g2Unit;
        else if (pCost > 0) resolvedCost = pCost;
        else if (sCost > 0) resolvedCost = sCost;
      } else if (isCard) {
        const faceVal = Number(p.face_value || 0);
        if (faceVal > 0) {
          resolvedCost = p.card_currency === 'CAD' ? Math.round(faceVal * 0.72 * 100) / 100 : faceVal;
        }
      } else {
        // GamesDrop or direct top-up
        if (gdCost > 0) resolvedCost = gdCost;
        else if (sCost > 0) resolvedCost = sCost;
        else if (pCost > 0) resolvedCost = pCost;
      }

      if (resolvedCost === null || resolvedCost <= 0) {
        unverifiedCostCount++;
      }

      // 2. Determine target default partner price = customer retail price
      const customerRetail = Number(p.customerPriceUsd || 0);
      const targetPartnerPrice = customerRetail > 0 ? customerRetail : null;
      if (targetPartnerPrice !== null) {
        matchedPartnerPrices++;
      }

      updatedCount++;

      if (previewList.length < 20) {
        previewList.push({
          name: p.productName,
          offer: p.offerName,
          resolvedCost: resolvedCost !== null ? `$${resolvedCost.toFixed(2)}` : 'UNKNOWN',
          customerRetail: customerRetail > 0 ? `$${customerRetail.toFixed(2)}` : '-',
          targetPartnerPrice: targetPartnerPrice !== null ? `$${targetPartnerPrice.toFixed(2)}` : '-',
          isCostSeparate: targetPartnerPrice !== resolvedCost
        });
      }
    }

    console.log(`Summary Preview:`);
    console.log({
      total: productsRes.rows.length,
      updatedCount,
      unverifiedCostCount,
      matchedPartnerPrices
    });

    console.table(previewList);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  } finally {
    client.release();
  }
}

testSync();
