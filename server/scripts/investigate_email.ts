import pool from '../src/db';

async function main() {
  const targetEmail = 'abobakerameer5@gmail.com';
  console.log(`=== INVESTIGATING EMAIL: "${targetEmail}" ===\n`);

  try {
    // 1. Check all tables in current database schema
    const tablesRes = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    const tables = tablesRes.rows.map(r => r.table_name);
    console.log(`Found ${tables.length} tables in public schema:`, tables.filter(t => 
      t.toLowerCase().includes('user') || 
      t.toLowerCase().includes('partner') || 
      t.toLowerCase().includes('session') ||
      t.toLowerCase().includes('auth') ||
      t.toLowerCase().includes('account')
    ));

    // 2. Exact and case-insensitive/fuzzy search in "User"
    console.log('\n--- 1. Checking "User" table ---');
    const userColumnsRes = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'User'
      ORDER BY ordinal_position;
    `);
    const userColumns = userColumnsRes.rows.map(c => c.column_name);
    console.log('"User" columns:', userColumns);

    // Safe SELECT without passwordHash / resetToken
    const safeUserCols = userColumns
      .filter(c => !['passwordHash', 'password', 'resetToken', 'token'].includes(c))
      .map(c => `"${c}"`)
      .join(', ');

    const usersQuery = `
      SELECT ${safeUserCols} 
      FROM "User" 
      WHERE LOWER(TRIM(email)) = LOWER(TRIM($1)) 
         OR email ILIKE $2;
    `;
    const usersResult = await pool.query(usersQuery, [targetEmail, `%${targetEmail.split('@')[0]}%`]);
    console.log(`Users found matching pattern (${usersResult.rows.length}):`);
    console.log(JSON.stringify(usersResult.rows, null, 2));

    // 3. Check partner_profiles
    console.log('\n--- 2. Checking partner_profiles ---');
    if (tables.includes('partner_profiles')) {
      const pColsRes = await pool.query(`
        SELECT column_name FROM information_schema.columns WHERE table_name = 'partner_profiles'
      `);
      console.log('partner_profiles columns:', pColsRes.rows.map(c => c.column_name));

      // Join with User to check if this email has a partner_profile
      const ppRes = await pool.query(`
        SELECT pp.*, u.email as user_email, u.role as user_role
        FROM partner_profiles pp
        JOIN "User" u ON pp.user_id = u.id
        WHERE LOWER(TRIM(u.email)) = LOWER(TRIM($1)) OR u.email ILIKE $2
      `, [targetEmail, `%${targetEmail.split('@')[0]}%`]);
      console.log(`Partner profiles for matching users (${ppRes.rows.length}):`);
      console.log(JSON.stringify(ppRes.rows, null, 2));
    }

    // 4. Check partner_setup_tokens, partner_wallets, etc.
    if (tables.includes('partner_wallets')) {
      console.log('\n--- 3. Checking partner_wallets ---');
      const pwRes = await pool.query(`
        SELECT pw.*, u.email 
        FROM partner_wallets pw
        JOIN partner_profiles pp ON pw.partner_id = pp.id
        JOIN "User" u ON pp.user_id = u.id
        WHERE LOWER(TRIM(u.email)) = LOWER(TRIM($1))
      `, [targetEmail]);
      console.log('Partner wallets:', pwRes.rows);
    }

    // 5. Check if there are other tables containing 'email'
    console.log('\n--- 4. Checking all tables with an "email" column ---');
    const emailColsRes = await pool.query(`
      SELECT table_name, column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND column_name ILIKE '%email%'
      ORDER BY table_name;
    `);
    for (const row of emailColsRes.rows) {
      try {
        const checkRes = await pool.query(`
          SELECT COUNT(*) as count 
          FROM "${row.table_name}" 
          WHERE LOWER(TRIM("${row.column_name}"::text)) = LOWER(TRIM($1))
        `, [targetEmail]);
        if (parseInt(checkRes.rows[0].count) > 0) {
          console.log(`MATCH FOUND in table "${row.table_name}" (column "${row.column_name}"): count = ${checkRes.rows[0].count}`);
        } else {
          // console.log(`No match in "${row.table_name}"."${row.column_name}"`);
        }
      } catch (err: any) {
        // console.log(`Could not query ${row.table_name}.${row.column_name}: ${err.message}`);
      }
    }

    // 6. Check unique constraints and indexes on "User" and "partner_profiles"
    console.log('\n--- 5. Constraints and Indexes ---');
    const indexesRes = await pool.query(`
      SELECT
        t.relname AS table_name,
        i.relname AS index_name,
        ix.indisunique AS is_unique,
        a.attname AS column_name
      FROM pg_class t
      JOIN pg_index ix ON t.oid = ix.indrelid
      JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
      WHERE t.relname IN ('User', 'partner_profiles', 'partner_wallets')
      ORDER BY t.relname, i.relname;
    `);
    console.log(JSON.stringify(indexesRes.rows, null, 2));

  } catch (err) {
    console.error('Investigation error:', err);
  } finally {
    await pool.end();
  }
}

main();
