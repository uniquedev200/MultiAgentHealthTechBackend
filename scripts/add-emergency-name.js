require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Add name column to emergencies
    await client.query(`ALTER TABLE emergencies ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT 'Individual Emergency'`);
    console.log('Added name column to emergencies');

    // 2. Check existing emergencies
    const emResult = await client.query('SELECT id, name, status, scope FROM emergencies ORDER BY declared_at DESC');
    console.log(`\nFound ${emResult.rows.length} emergencies:`);
    emResult.rows.forEach(r => {
      console.log(`  ${r.id.slice(0,12)}... | "${r.name}" | ${r.status} | ${r.scope}`);
    });

    // 3. Check existing cases for patient name
    const caseResult = await client.query(`SELECT id, symptoms, patient_id, LEFT(triage_note, 50) as triage FROM cases LIMIT 5`);
    console.log(`\nSample cases (${caseResult.rows.length} shown):`);
    caseResult.rows.forEach(r => {
      console.log(`  ${r.id.slice(0,12)}... | symptoms="${r.symptoms}" | triage="${r.triage}"`);
    });

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Error:', e.message);
  } finally {
    client.release();
    await pool.end();
  }
})();
