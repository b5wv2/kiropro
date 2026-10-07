import pool from '../src/db';

async function main() {
  const queryTerm = 'ameer5';
  console.log(`=== FULL DATABASE TEXT SEARCH FOR: "${queryTerm}" ===\n`);

  try {
    const colsRes = await pool.query(`
      SELECT table_name, column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND data_type IN ('text', 'character varying', 'character')
      ORDER BY table_name, column_name;
    `);

    const tableGroups: { [tableName: string]: string[] } = {};
    for (const row of colsRes.rows) {
      if (!tableGroups[row.table_name]) {
        tableGroups[row.table_name] = [];
      }
      tableGroups[row.table_name].push(row.column_name);
    }

    for (const [table, cols] of Object.entries(tableGroups)) {
      const whereClauses = cols.map(c => `"${c}"::text ILIKE '%${queryTerm}%'`).join(' OR ');
      try {
        const res = await pool.query(`
          SELECT * FROM "${table}" 
          WHERE ${whereClauses} 
          LIMIT 10;
        `);
        if (res.rows.length > 0) {
          console.log(`\n>>> MATCH FOUND IN TABLE "${table}" (${res.rows.length} rows):`);
          res.rows.forEach(r => {
            const safe = { ...r };
            delete safe.passwordHash;
            delete safe.token_hash;
            delete safe.resetToken;
            console.log(safe);
          });
        }
      } catch (err: any) {}
    }

    console.log('\nSearch completed.');
  } catch (err) {
    console.error('Error during full search:', err);
  } finally {
    await pool.end();
  }
}

main();
