import pool from '../src/db';

async function main() {
  try {
    const prodRes = await pool.query(`
      SELECT id, "productName", "arabicName", "customerPriceUsd", "defaultPartnerPriceUsd", "isActive", "productType"
      FROM "Product" 
      WHERE "productName" ILIKE '%kiropro%' OR "arabicName" ILIKE '%kiropro%' OR "productType" ILIKE '%card%'
    `);
    console.log('KiroPro Products in "Product":', prodRes.rows);

    const pricingSettings = await pool.query('SELECT * FROM partner_pricing_settings');
    console.log('\npartner_pricing_settings:', pricingSettings.rows);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

main();
