import pool from '../src/db';
import fs from 'fs';

async function main() {
  try {
    const res = await pool.query('SELECT id, email, role, name FROM "User" ORDER BY email ASC');
    console.log(`Total users: ${res.rows.length}`);
    fs.writeFileSync('scripts/all_users_emails.json', JSON.stringify(res.rows, null, 2));
    
    // Check for any email containing "abobaker" or "ameer" or "5@gmail"
    const matches = res.rows.filter(u => 
      u.email.toLowerCase().includes('abobaker') || 
      u.email.toLowerCase().includes('ameer') ||
      u.email.toLowerCase().includes('abubakar') ||
      u.email.toLowerCase().includes('abubakr') ||
      u.email.toLowerCase().includes('bakri') ||
      u.email.toLowerCase().includes('baker')
    );
    console.log('Fuzzy matches:', matches);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

main();
