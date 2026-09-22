const { pool } = require('../dist/db');

async function check() {
  const tables = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;");
  console.log('--- ALL PUBLIC TABLES ---');
  console.log(tables.rows.map(r => r.table_name));

  console.log('\n--- COLUMNS IN User TABLE ---');
  const userCols = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'User' ORDER BY ordinal_position;");
  console.log(userCols.rows);

  console.log('\n--- CHECK IF AuditLog EXISTS ---');
  const auditExists = tables.rows.some(r => r.table_name === 'AuditLog' || r.table_name === 'audit_logs');
  if (auditExists) {
    const auditCols = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name IN ('AuditLog', 'audit_logs');");
    console.log(auditCols.rows);
    const sample = await pool.query('SELECT * FROM "AuditLog" ORDER BY "createdAt" DESC LIMIT 3;').catch(() => null);
    if (sample) console.log('Sample AuditLog:', sample.rows);
  }

  console.log('\n--- CHECK IF user_sessions EXISTS ---');
  const sessionsExists = tables.rows.some(r => r.table_name.toLowerCase().includes('session'));
  console.log('Session tables:', sessionsExists);

  await pool.end();
}

check().catch(err => {
  console.error(err);
  process.exit(1);
});
