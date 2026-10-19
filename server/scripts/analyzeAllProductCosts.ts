import { pool } from '../src/db';

async function main() {
  try {
    const res = await pool.query(`
      SELECT id, "productName", "offerName", "customerPriceUsd", "supplierCostUsd", "gamesDropCostUsd", "providerCostUsd", face_value, card_currency, "primaryProvider", provider, fulfillment_type
      FROM "Product"
      WHERE "isActive" = true
      ORDER BY "productName" ASC
      LIMIT 25
    `);
    console.table(res.rows.map(r => ({
      name: r.productName,
      offer: r.offerName,
      suppCost: r.supplierCostUsd,
      gdCost: r.gamesDropCostUsd,
      provCost: r.providerCostUsd,
      face: r.face_value,
      retail: r.customerPriceUsd
    })));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();
