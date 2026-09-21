require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const pool = require('../dist/db').default;

async function main() {
  const settings = {
    enabled: true,
    referrer_reward: 1000,
    referee_reward: 1000,
    currency: 'SDG',
    min_order_amount: 5000,
    max_referrer_earnings: 10000,
    allow_existing_users_binding: true,
    first_order_only: true,
    allow_crypto_orders: true,
    allow_game_orders: true,
    allow_cards_orders: true,
    total_reward: 2000
  };

  await pool.query(
    'UPDATE "platform_settings" SET "value" = $1, "updated_at" = CURRENT_TIMESTAMP WHERE "key" = $2',
    [JSON.stringify(settings), 'referral_settings']
  );

  const res = await pool.query('SELECT "value" FROM "platform_settings" WHERE "key" = $1', ['referral_settings']);
  console.log('Current referral_settings in DB:', res.rows[0]?.value);
  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
