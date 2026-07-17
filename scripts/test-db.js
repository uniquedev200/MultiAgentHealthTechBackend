require('dotenv').config();
const { Pool } = require('pg');

async function tryConnect(label, connStr) {
  console.log(`\n--- ${label} ---`);
  const pool = new Pool({
    connectionString: connStr,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });
  try {
    const r = await pool.query('SELECT 1 as ok');
    console.log('OK:', r.rows);
    return pool;
  } catch (e) {
    console.error('ERR:', e.message, e.code);
    await pool.end();
    return null;
  }
}

(async () => {
  const base = process.env.DATABASE_URL;
  const pw = base.match(/:\/\/[^:]+:([^@]+)@/)[1];
  const user = base.match(/:\/\/([^:]+):/)[1];

  // 1. Pooler session (5432)
  const p1 = await tryConnect('Pooler 5432', base);
  if (p1) { await p1.end(); return; }

  // 2. Pooler transaction (6543)
  const p2 = await tryConnect('Pooler 6543', base.replace(':5432/', ':6543/'));
  if (p2) { await p2.end(); return; }

  // 3. Direct connection
  const directUrl = `postgresql://${user}:${pw}@db.nkiksvfhotufqpfejpmd.supabase.co:5432/postgres`;
  const p3 = await tryConnect('Direct db.*.supabase.co', directUrl);
  if (p3) { await p3.end(); return; }

  console.log('\nAll connection attempts failed.');
})();
