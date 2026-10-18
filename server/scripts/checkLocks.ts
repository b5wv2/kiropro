import pool from '../src/db';

async function checkLocks() {
  const res = await pool.query(`
    SELECT pid, usename, state, wait_event_type, wait_event, now() - query_start AS duration, query 
    FROM pg_stat_activity 
    WHERE state != 'idle' AND pid != pg_backend_pid()
    ORDER BY query_start ASC
  `);
  console.log('Active queries:', res.rows.length);
  for (const r of res.rows) {
    console.log(`[PID ${r.pid}] State: ${r.state} | Wait: ${r.wait_event_type}:${r.wait_event} | Duration: ${r.duration.seconds || 0}s | Query: ${r.query.slice(0, 120)}`);
  }
  await pool.end();
}

checkLocks().catch(console.error);
