require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});
(async () => {
  await pool.query(`UPDATE cases SET patient_name = CASE
    WHEN triage_note LIKE '34yo%' THEN 'Carlos Rivera'
    WHEN triage_note LIKE '28yo%' THEN 'Sarah Mitchell'
    WHEN triage_note LIKE '42yo%' THEN 'Emily Watson'
    WHEN triage_note LIKE '71yo%' THEN 'Robert Chen'
    WHEN triage_note LIKE '26yo%' THEN 'James Park'
    ELSE patient_name
  END WHERE hospital_id = '872159b0-a439-488e-b7ea-e664df3608f2' AND patient_name = ''`);
  const r = await pool.query(`SELECT patient_name, LEFT(triage_note, 30) as triage FROM cases WHERE hospital_id = '872159b0-a439-488e-b7ea-e664df3608f2'`);
  r.rows.forEach(row => console.log(`${row.patient_name} -> ${row.triage}`));
  await pool.end();
})();
