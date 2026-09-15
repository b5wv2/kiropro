import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import pool from '../src/db';

async function seedProductsBatch() {
  console.log('--- Batch Seeding Products into PostgreSQL (V2) ---');
  const jsonPath = path.join(__dirname, '../data/gamesdrop-topups.json');
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`Snapshot file not found at ${jsonPath}`);
  }

  const rawData = fs.readFileSync(jsonPath, 'utf-8');
  const snapshot = JSON.parse(rawData);
  const products = snapshot.products || [];

  console.log(`Snapshot contains ${products.length} products. Starting batch insert/update...`);

  const client = await pool.connect();
  try {
    const chunkSize = 100;
    for (let i = 0; i < products.length; i += chunkSize) {
      const chunk = products.slice(i, i + chunkSize);
      
      const valueStrings: string[] = [];
      const values: any[] = [];
      let paramIdx = 1;

      for (const p of chunk) {
        const isTestOffer = p.providerOfferId === 999;
        const initialActive = isTestOffer ? true : false;
        const gdCost = Number(p.gamesDropCostUsd !== undefined ? p.gamesDropCostUsd : p.providerPrice || 0);
        const supplierCost = Number(p.supplierCostUsd !== undefined ? p.supplierCostUsd : gdCost);
        const addedPercent = Number(p.gamesDropAddedPercent !== undefined ? p.gamesDropAddedPercent : 0);
        const fxRate = Number(p.gamesDropFxRate !== undefined ? p.gamesDropFxRate : 1);

        const initialCustomerPrice = isTestOffer 
          ? 24.00 
          : null; // Null until admin specifies

        valueStrings.push(`(
          'GAMESDROP',
          $${paramIdx++},
          $${paramIdx++},
          $${paramIdx++},
          $${paramIdx++},
          'TOP_UP',
          $${paramIdx++},
          $${paramIdx++},
          $${paramIdx++},
          $${paramIdx++},
          $${paramIdx++},
          $${paramIdx++},
          $${paramIdx++},
          $${paramIdx++},
          $${paramIdx++},
          $${paramIdx++},
          $${paramIdx++},
          $${paramIdx++},
          $${paramIdx++},
          $${paramIdx++},
          $${paramIdx++},
          $${paramIdx++},
          NOW()
        )`);

        values.push(
          p.providerOfferId,
          p.productId || null,
          p.productName,
          p.offerName,
          p.platformCode || null,
          p.platformName || null,
          p.regionCode || null,
          p.regionName || null,
          supplierCost,
          gdCost,
          addedPercent,
          fxRate,
          gdCost, // providerCostUsd legacy compatibility
          p.gamesDropCurrency || p.providerCurrency || 'USD',
          initialCustomerPrice,
          initialActive,
          p.inStock !== false,
          p.image || null,
          p.requiresGameUserId || false,
          p.requiresGameServerId || false
        );
      }

      const query = `
        INSERT INTO "Product" (
          "provider", "providerOfferId", "productId", "productName", "offerName",
          "category", "platformCode", "platformName", "regionCode", "regionName",
          "supplierCostUsd", "gamesDropCostUsd", "gamesDropAddedPercent", "gamesDropFxRate",
          "providerCostUsd", "providerCurrency", "customerPriceUsd", "isActive",
          "inStock", "imageUrl", "requiresGameUserId", "requiresGameServerId",
          "lastProviderSyncAt"
        )
        VALUES ${valueStrings.join(', ')}
        ON CONFLICT ("providerOfferId") DO UPDATE SET
          "supplierCostUsd" = EXCLUDED."supplierCostUsd",
          "gamesDropCostUsd" = EXCLUDED."gamesDropCostUsd",
          "gamesDropAddedPercent" = EXCLUDED."gamesDropAddedPercent",
          "gamesDropFxRate" = EXCLUDED."gamesDropFxRate",
          "providerCostUsd" = EXCLUDED."gamesDropCostUsd",
          "providerCurrency" = EXCLUDED."providerCurrency",
          "inStock" = EXCLUDED."inStock",
          "lastProviderSyncAt" = NOW();
      `;

      await client.query(query, values);
      console.log(`[Batch] Processed ${Math.min(i + chunkSize, products.length)} / ${products.length} products`);
    }

    console.log('--- Batch Seeding Completed Successfully! ---');
  } catch (err) {
    console.error('Batch seed failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seedProductsBatch().catch(err => {
  console.error(err);
  process.exit(1);
});
