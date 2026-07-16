// Dev-only: Quick DB state inspection
// Usage: DATA_LAYER=live node scripts/check-state.js
require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function check() {
  const hosp = await pool.query("SELECT count(*) FROM hospitals");
  console.log("Hospitals:", hosp.rows[0].count);

  const resA = await pool.query(
    "SELECT count(*) FROM resources WHERE hospital_id = $1",
    ["11111111-1111-1111-1111-111111111111"]
  );
  console.log("Resources for Hosp A:", resA.rows[0].count);

  const keys = await pool.query(
    "SELECT count(*) FROM hospital_api_keys WHERE hospital_id = $1",
    ["11111111-1111-1111-1111-111111111111"]
  );
  console.log("API keys for Hosp A:", keys.rows[0].count);

  const deps = await pool.query("SELECT count(*) FROM resource_dependencies");
  console.log("Resource dependencies:", deps.rows[0].count);

  const hospDetail = await pool.query(
    "SELECT id, name, email, password_hash IS NOT NULL as has_hash FROM hospitals WHERE id = $1",
    ["11111111-1111-1111-1111-111111111111"]
  );
  console.log("Hosp A detail:", hospDetail.rows[0]);

  await pool.end();
}

check().catch((e) => { console.error(e); process.exit(1); });
