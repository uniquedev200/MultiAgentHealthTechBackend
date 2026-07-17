require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});
(async () => {
  await pool.query("UPDATE cases SET status = 'pending' WHERE hospital_id = '872159b0-a439-488e-b7ea-e664df3608f2'");
  await pool.end();
  console.log('Reset all St. Jude cases to pending');
})();
