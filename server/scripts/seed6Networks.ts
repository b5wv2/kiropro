import pool from '../src/db';
import { v4 as uuidv4 } from 'uuid';

async function seedNetworks() {
  const networks = [
    { identifier: 'TRON', name: 'TRON', currency: 'USDT', validator_type: 'TRON', min_amount: 3.00, enabled: true, display_order: 1 },
    { identifier: 'POLYGON', name: 'Polygon', currency: 'USDT', validator_type: 'EVM', min_amount: 3.00, enabled: true, display_order: 2 },
    { identifier: 'BSC', name: 'BNB Smart Chain', currency: 'USDT', validator_type: 'EVM', min_amount: 3.00, enabled: true, display_order: 3 },
    { identifier: 'ETHEREUM', name: 'Ethereum', currency: 'USDT', validator_type: 'EVM', min_amount: 3.00, enabled: true, display_order: 4 },
    { identifier: 'ARBITRUM', name: 'Arbitrum One', currency: 'USDT', validator_type: 'EVM', min_amount: 3.00, enabled: true, display_order: 5 },
    { identifier: 'AVAX', name: 'Avalanche C-Chain', currency: 'USDT', validator_type: 'EVM', min_amount: 3.00, enabled: true, display_order: 6 }
  ];

  for (const net of networks) {
    await pool.query(`
      INSERT INTO crypto_networks (id, identifier, name, currency, validator_type, min_amount, enabled, display_order, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      ON CONFLICT (identifier) DO UPDATE
      SET name = EXCLUDED.name,
          validator_type = EXCLUDED.validator_type,
          min_amount = EXCLUDED.min_amount,
          enabled = EXCLUDED.enabled,
          display_order = EXCLUDED.display_order,
          updated_at = NOW();
    `, [uuidv4(), net.identifier, net.name, net.currency, net.validator_type, net.min_amount, net.enabled, net.display_order]);
  }

  const res = await pool.query('SELECT identifier, name, validator_type, enabled, display_order FROM crypto_networks ORDER BY display_order');
  console.table(res.rows);
  process.exit(0);
}

seedNetworks().catch(err => {
  console.error(err);
  process.exit(1);
});
