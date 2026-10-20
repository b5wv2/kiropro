import pool from '../src/db';
import fs from 'fs';
import path from 'path';

async function backup() {
  const c = await pool.connect();
  try {
    console.log('Taking full snapshot of financial and user tables before migration...');
    
    const users = await c.query('SELECT * FROM "User"');
    const wallets = await c.query('SELECT * FROM "Wallet"');
    const transactions = await c.query('SELECT * FROM "WalletTransaction"');
    const topups = await c.query('SELECT * FROM topup_requests');
    const settings = await c.query('SELECT * FROM platform_settings');
    const orders = await c.query('SELECT * FROM "Order"');
    const partnerWallets = await c.query('SELECT * FROM partner_wallets');

    const backupData = {
      timestamp: new Date().toISOString(),
      counts: {
        users: users.rows.length,
        wallets: wallets.rows.length,
        transactions: transactions.rows.length,
        topups: topups.rows.length,
        settings: settings.rows.length,
        orders: orders.rows.length,
        partnerWallets: partnerWallets.rows.length
      },
      data: {
        users: users.rows,
        wallets: wallets.rows,
        transactions: transactions.rows,
        topups: topups.rows,
        settings: settings.rows,
        orders: orders.rows,
        partnerWallets: partnerWallets.rows
      }
    };

    const backupDir = path.join(__dirname, '../backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const backupFile = path.join(backupDir, `backup_financial_state_${Date.now()}.json`);
    fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2), 'utf8');

    console.log(`Backup completed successfully! Saved to: ${backupFile}`);
    console.log('Counts:', backupData.counts);
  } finally {
    c.release();
    await pool.end();
  }
}

backup().catch(console.error);
