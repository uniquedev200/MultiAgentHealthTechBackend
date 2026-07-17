require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});
(async () => {
  await pool.query("ALTER TABLE cases DROP CONSTRAINT IF EXISTS cases_status_check");
  await pool.query("ALTER TABLE cases ADD CONSTRAINT cases_status_check CHECK (status IN ('pending', 'allocated', 'discharged', 'approved', 'rejected'))");
  console.log('Updated cases_status_check constraint to include approved and rejected');
  await pool.end();
})();
