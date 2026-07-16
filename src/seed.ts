import dotenv from "dotenv";
import { v4 as uuidv4 } from "uuid";
import { hashPassword } from "./password";
import { query, pool } from "./db";

dotenv.config();

const DATA_LAYER = process.env.DATA_LAYER || "fake";

// ── Constants ─────────────────────────────────────────────────
const HOSPITAL_ID = "11111111-1111-1111-1111-111111111111";
const HOSPITAL_NAME = "General Hospital";
const HOSPITAL_EMAIL = "admin@generalhospital.demo";
const HOSPITAL_PASSWORD = "demo1234";
const API_KEY = "gh-live-key-001";

const RESOURCES = [
  { type: "or_slot",     label: "OR Suite 1",        department: "Surgery",  metadata: { capacity: 1, specialty: "general" } },
  { type: "or_slot",     label: "OR Suite 2",        department: "Surgery",  metadata: { capacity: 1, specialty: "cardiac" } },
  { type: "or_slot",     label: "OR Suite 3",        department: "Surgery",  metadata: { capacity: 1, specialty: "neuro" } },
  { type: "or_slot",     label: "OR Suite 4",        department: "Surgery",  metadata: { capacity: 1, specialty: "trauma" } },
  { type: "icu_bed",     label: "ICU Bed 1",         department: "ICU",      metadata: { ventilator: true } },
  { type: "icu_bed",     label: "ICU Bed 2",         department: "ICU",      metadata: { ventilator: true } },
  { type: "icu_bed",     label: "ICU Bed 3",         department: "ICU",      metadata: { ventilator: false } },
  { type: "icu_bed",     label: "ICU Bed 4",         department: "ICU",      metadata: { ventilator: true } },
  { type: "staff",       label: "Dr. Patel",         department: "Surgery",  metadata: { role: "anesthesiologist", specialty: "cardiac" } },
  { type: "staff",       label: "Dr. Nguyen",        department: "Surgery",  metadata: { role: "surgeon", specialty: "trauma" } },
  { type: "staff",       label: "Dr. Kim",           department: "Surgery",  metadata: { role: "surgeon", specialty: "neuro" } },
  { type: "equipment",   label: "Ventilator A",      department: "ICU",      metadata: { model: "VitaMax-3000" } },
  { type: "equipment",   label: "Portable X-Ray",    department: "Radiology", metadata: { model: "ImagingPro" } },
  { type: "er_bay",      label: "ER Bay 1",          department: "Emergency", metadata: { beds: 2 } },
  { type: "er_bay",      label: "ER Bay 2",          department: "Emergency", metadata: { beds: 3 } },
  { type: "er_bay",      label: "ER Bay 3",          department: "Emergency", metadata: { beds: 1 } },
];

// Pre-generated UUIDs for resource dependencies (referencing seeded resources by index)
const DEP_RESOURCE_IDS: string[] = [];
const DEPENDENCIES = [
  { resourceIdx: 0, dependsOnIdx: 8, relation: "requires" },   // OR Suite 1 → Dr. Patel
  { resourceIdx: 4, dependsOnIdx: 11, relation: "requires" },  // ICU Bed 1 → Ventilator A
  { resourceIdx: 1, dependsOnIdx: 9, relation: "requires" },   // OR Suite 2 → Dr. Nguyen
];

// ── Seed function ─────────────────────────────────────────────
async function seed(): Promise<void> {
  if (DATA_LAYER === "fake") {
    console.log("\n[seed] DATA_LAYER=fake — seed data is baked into the fake data layer.");
    console.log("[seed] To create a fresh hospital with resources, run with DATA_LAYER=live.\n");
    console.log("=== Fake mode demo credentials ===");
    console.log(`  Hospital:  ${HOSPITAL_NAME} (id: ${HOSPITAL_ID})`);
    console.log(`  Login:     ${HOSPITAL_EMAIL} / ${HOSPITAL_PASSWORD}`);
    console.log(`  API key:   ${API_KEY}`);
    console.log(`  Resources: ${RESOURCES.length} (hardcoded in fake.ts)`);
    console.log(`  Dependencies: ${DEPENDENCIES.length}`);
    return;
  }

  console.log(`\n[seed] Seeding database (DATA_LAYER=live)...\n`);

  // 1. Check if hospital already exists by email
  const existingResult = await query(
    "SELECT id FROM hospitals WHERE email = $1",
    [HOSPITAL_EMAIL]
  );

  if (existingResult.rows.length > 0) {
    const existingId = existingResult.rows[0].id;
    console.log(
      `[seed] Hospital with email ${HOSPITAL_EMAIL} already exists (id: ${existingId}).`
    );
    console.log(
      "[seed] Skipping hospital creation. Use --force to wipe and reseed.\n"
    );

    if (process.argv.includes("--force")) {
      console.log("[seed] --force flag detected. Deleting existing data...");
      // Delete in reverse dependency order
      await query("DELETE FROM resource_dependencies WHERE resource_id IN (SELECT id FROM resources WHERE hospital_id = $1)", [existingId]);
      await query("DELETE FROM bids WHERE hospital_id = $1", [existingId]);
      await query("DELETE FROM allocations WHERE hospital_id = $1", [existingId]);
      await query("DELETE FROM cases WHERE hospital_id = $1", [existingId]);
      await query("DELETE FROM emergencies WHERE hospital_id = $1", [existingId]);
      await query("DELETE FROM resources WHERE hospital_id = $1", [existingId]);
      await query("DELETE FROM hospital_api_keys WHERE hospital_id = $1", [existingId]);
      await query("DELETE FROM hospitals WHERE id = $1", [existingId]);
      console.log("[seed] Existing data deleted. Re-seeding...\n");
    } else {
      await pool.end();
      return;
    }
  }

  // 2. Create hospital
  const passwordHash = await hashPassword(HOSPITAL_PASSWORD);

  const hospResult = await query(
    `INSERT INTO hospitals (id, name, email, password_hash)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email, password_hash = EXCLUDED.password_hash
     RETURNING id, name`,
    [HOSPITAL_ID, HOSPITAL_NAME, HOSPITAL_EMAIL, passwordHash]
  );

  const hospital = hospResult.rows[0];

  // 3. Create API key
  await query(
    `INSERT INTO hospital_api_keys (hospital_id, api_key)
     VALUES ($1, $2)
     ON CONFLICT (api_key) DO NOTHING`,
    [hospital.id, API_KEY]
  );

  // 4. Create resources (generate UUIDs for each)
  const resourceIds: string[] = [];
  for (const r of RESOURCES) {
    const resId = uuidv4();
    resourceIds.push(resId);
    await query(
      `INSERT INTO resources (id, hospital_id, type, label, status, department, metadata)
       VALUES ($1, $2, $3, $4, 'available', $5, $6)
       ON CONFLICT (id) DO UPDATE SET hospital_id = EXCLUDED.hospital_id, label = EXCLUDED.label`,
      [resId, hospital.id, r.type, r.label, r.department, JSON.stringify(r.metadata)]
    );
  }

  // 5. Create resource dependencies
  for (const d of DEPENDENCIES) {
    const resId = resourceIds[d.resourceIdx];
    const depId = resourceIds[d.dependsOnIdx];
    await query(
      `INSERT INTO resource_dependencies (id, resource_id, depends_on_resource_id, relation)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING`,
      [uuidv4(), resId, depId, d.relation]
    );
  }

  // 6. Print summary
  console.log("=== Seed complete ===\n");
  console.log(`  Seeded hospital: ${hospital.name} (id: ${hospital.id})`);
  console.log(`  Login: ${HOSPITAL_EMAIL} / ${HOSPITAL_PASSWORD}`);
  console.log(`  API key: ${API_KEY}`);
  console.log(`  Resources created: ${RESOURCES.length}`);
  console.log(`  Dependencies created: ${DEPENDENCIES.length}`);
  console.log();

  await pool.end();
}

seed().catch((err) => {
  console.error("[seed] Fatal error:", err);
  process.exit(1);
});
