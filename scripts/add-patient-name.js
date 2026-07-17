require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});
(async () => {
  await pool.query(`ALTER TABLE cases ADD COLUMN IF NOT EXISTS patient_name TEXT NOT NULL DEFAULT ''`);
  console.log('Added patient_name column to cases');
  const r = await pool.query(`SELECT id, patient_name, LEFT(triage_note, 40) as triage FROM cases WHERE hospital_id = '872159b0-a439-488e-b7ea-e664df3608f2' LIMIT 5`);
  r.rows.forEach(row => console.log(`  patient_name="${row.patient_name}" triage="${row.triage}"`));
  await pool.end();
})();
