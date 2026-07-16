// Dev-only: Verify Supabase schema has all expected tables and columns
// Usage: DATA_LAYER=live node scripts/verify-schema.js
require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function verify() {
  console.log("=== Verifying Supabase schema ===\n");

  const tables = await pool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
  );
  const tableNames = tables.rows.map((r) => r.table_name);
  console.log("Tables found:", tableNames.join(", "));

  const hospCols = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'hospitals' ORDER BY ordinal_position"
  );
  console.log("\nhospitals columns:", hospCols.rows.map((r) => r.column_name).join(", "));

  console.log("\nhospital_id columns:");
  for (const tbl of ["emergencies", "cases", "resources", "bids", "allocations", "audit_log"]) {
    const hasCol = await pool.query(
      "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = 'hospital_id') AS has_it",
      [tbl]
    );
    console.log(`  ${tbl}.hospital_id: ${hasCol.rows[0].has_it ? "YES" : "NO"}`);
  }

  const hakExists = await pool.query(
    "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'hospital_api_keys') AS has_it"
  );
  console.log("\nhospital_api_keys table:", hakExists.rows[0].has_it ? "YES" : "NO");

  console.log("\n=== Verification complete ===");
  await pool.end();
}

verify().catch((e) => { console.error("Verification failed:", e); process.exit(1); });
