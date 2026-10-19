import pool from '../src/db';

async function checkCardProductsAndInventory() {
  const client = await pool.connect();
  try {
    console.log('=== 1. ALL VIRTUAL CARD PRODUCTS IN DB ===');
    const prods = await client.query(`
      SELECT id, "productId", "productName", "arabicName", "card_network", "card_currency",
             face_value, "regionCode", "regionName", "subCategory", "customerPriceUsd",
             "defaultPartnerPriceUsd", "isActive", "inStock", "displayOrder", "fulfillment_type",
             "productType", "gameCategoryId", "category"
      FROM "Product"
      WHERE "gameCategoryId" = 'kiropro-card'
         OR "fulfillment_type" = 'KIROPRO_CARD'
         OR "productType" = 'VIRTUAL_CARD'
         OR "category" = 'VIRTUAL_CARD'
         OR id::text LIKE 'b0000000-%'
      ORDER BY "displayOrder" ASC, id ASC
    `);
    console.log(JSON.stringify(prods.rows, null, 2));

    console.log('\n=== 2. KIROPRO_CARDS_INVENTORY COLUMNS ===');
    const cols = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'kiropro_cards_inventory'
      ORDER BY ordinal_position
    `);
    console.log(JSON.stringify(cols.rows, null, 2));

    console.log('\n=== 3. KIROPRO_CARDS_INVENTORY ROWS SAMPLE ===');
    const rows = await client.query(`
      SELECT * FROM kiropro_cards_inventory LIMIT 10
    `);
    // Print without exposing full pan/cvv
    const safeRows = rows.rows.map(r => ({
      ...r,
      card_number_encrypted: r.card_number_encrypted ? '[ENCRYPTED]' : null,
      cvv_encrypted: r.cvv_encrypted ? '[ENCRYPTED]' : null,
      card_number: r.card_number ? '[REDACTED]' : null,
      cvv: r.cvv ? '[REDACTED]' : null
    }));
    console.log(JSON.stringify(safeRows, null, 2));

    console.log('\n=== CARD TABLES IN SCHEMA ===');
    const tbls = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name ILIKE '%card%'
    `);
    console.log(tbls.rows);

    console.log('\n=== ALL PRODUCTS WITH CARD OR VISA OR MASTERCARD ===');
    const allProds = await client.query(`
      SELECT id, "productName", "arabicName", "card_network", "card_currency",
             face_value, "regionCode", "regionName", "subCategory", "customerPriceUsd",
             "isActive", "inStock", "displayOrder", "fulfillment_type", "category"
      FROM "Product"
      WHERE "productName" ILIKE '%card%' 
         OR "productName" ILIKE '%visa%' 
         OR "productName" ILIKE '%mastercard%'
         OR "arabicName" ILIKE '%فيزا%'
         OR "arabicName" ILIKE '%ماستركارد%'
         OR "arabicName" ILIKE '%بطاقة%'
         OR "card_network" IS NOT NULL
      ORDER BY "displayOrder" ASC, id ASC
    `);
    console.log(JSON.stringify(allProds.rows, null, 2));

    console.log('\n=== ALL ORDERS RELATED TO CARDS ===');
    const cardOrders = await client.query(`
      SELECT id, "userId", "packageId", "packageName", status, amount, "chargedAmount", "chargedCurrency", "fulfillmentKey", "createdAt"
      FROM "Order"
      WHERE "packageName" ILIKE '%card%'
         OR "packageName" ILIKE '%visa%'
         OR "packageName" ILIKE '%mastercard%'
         OR "packageName" ILIKE '%بطاقة%'
      ORDER BY "createdAt" DESC
      LIMIT 10
    `);
    console.log(JSON.stringify(cardOrders.rows, null, 2));

  } finally {
    client.release();
    await pool.end();
  }
}

checkCardProductsAndInventory().catch(console.error);
