require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});

(async () => {
  const r = await pool.query(`
    UPDATE emergencies
    SET name = CASE
      WHEN scope = 'mass'
        THEN 'Mass Casualty — ' || COALESCE(
          (SELECT string_agg(dept, ', ') FROM unnest(department_reach) AS dept),
          'Multiple Departments')
        || ' (' || to_char(declared_at, 'Mon DD, HH12:MI AM') || ')'
      ELSE 'Individual Emergency — ' || COALESCE(
          (SELECT string_agg(dept, ', ') FROM unnest(department_reach) AS dept),
          'ER')
        || ' (' || to_char(declared_at, 'Mon DD, HH12:MI AM') || ')'
    END
    WHERE name IN ('Individual Emergency', 'Mass Casualty Incident')
    RETURNING id, LEFT(name, 60) as name
  `);
  console.log(`Updated ${r.rowCount} remaining generic emergencies`);
  r.rows.forEach(row => console.log(`  ${row.name}`));
  await pool.end();
})();
