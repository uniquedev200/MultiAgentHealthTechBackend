import { readFileSync } from "fs";
import { join } from "path";
import { pool } from "./db";

async function runMigrations(): Promise<void> {
  const sqlPath = join(__dirname, "..", "supabase", "all-migrations.sql");
  const rawSql = readFileSync(sqlPath, "utf-8");

  // Strip comment-only lines but keep the SQL
  const sql = rawSql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");

  console.log("[migrate] Running combined migration against real Supabase...\n");

  try {
    await pool.query(sql);
    console.log("[migrate] All statements executed successfully.\n");
  } catch (err: any) {
    // Some statements may already exist — try running individually
    console.log(
      "[migrate] Bulk execute failed, trying statement-by-statement...\n"
    );

    // Split on semicolons that are followed by newline or end-of-string
    // This avoids breaking inside CHECK constraints
    const statements = rawSql
      .split(/;\s*\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.split("\n")[0].trimStart().startsWith("--"));

    let succeeded = 0;
    let skipped = 0;
    let failed = 0;

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i] + ";";
      const firstLine = stmt.split("\n")[0].slice(0, 80);
      try {
        await pool.query(stmt);
        succeeded++;
        console.log(`  [${i + 1}/${statements.length}] OK: ${firstLine}`);
      } catch (e: any) {
        if (
          e.message?.includes("already exists") ||
          e.message?.includes("duplicate key") ||
          e.message?.includes("column .* already exists")
        ) {
          skipped++;
          console.log(
            `  [${i + 1}/${statements.length}] SKIP: ${firstLine}`
          );
        } else {
          failed++;
          console.error(
            `  [${i + 1}/${statements.length}] FAIL: ${firstLine}`
          );
          console.error(`    ${e.message}`);
        }
      }
    }

    console.log(
      `\n[migrate] Done: ${succeeded} succeeded, ${skipped} skipped, ${failed} failed`
    );
    if (failed > 0) process.exit(1);
  }

  await pool.end();
}

runMigrations().catch((err) => {
  console.error("[migrate] Fatal error:", err);
  process.exit(1);
});
