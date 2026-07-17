import { Pool } from "pg";
import { readFileSync } from "fs";
import { resolve } from "path";

async function runMigration() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    const sql = readFileSync(resolve(__dirname, "../supabase/all-migrations.sql"), "utf8");
    
    // Extract only PARTs 6, 7, 8 (the new ones)
    const parts = sql.split(/-- PART \d+:/);
    const newParts = parts.filter((_, i) => i >= 6); // PART 6, 7, 8 (0-indexed: 5, 6, 7)
    
    if (newParts.length === 0) {
      console.log("No new migration parts found (PARTs 6-8)");
      return;
    }

    for (let i = 0; i < newParts.length; i++) {
      const partNum = i + 6;
      const partSql = newParts[i].trim();
      if (!partSql) continue;
      
      console.log(`\nRunning PART ${partNum}...`);
      try {
        await pool.query(partSql);
        console.log(`  PART ${partNum} completed successfully`);
      } catch (err: any) {
        // Ignore "already exists" errors
        if (err.message?.includes("already exists")) {
          console.log(`  PART ${partNum}: tables/columns already exist, skipping`);
        } else {
          console.error(`  PART ${partNum} error:`, err.message);
        }
      }
    }

    console.log("\nMigration complete!");
  } finally {
    await pool.end();
  }
}

runMigration().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
