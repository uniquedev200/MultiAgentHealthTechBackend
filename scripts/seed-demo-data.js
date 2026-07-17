require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const { randomUUID } = require('crypto');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});

const DEMO_EMERGENCIES = [
  {
    id: randomUUID(),
    name: "Multi-Vehicle Accident — Highway 101",
    scope: "mass",
    department_reach: ["Emergency", "Trauma", "Surgery", "ICU"],
    status: "active",
  },
  {
    id: randomUUID(),
    name: "Cardiac Arrest — Ward 3B",
    scope: "individual",
    department_reach: ["Emergency", "Cardiology", "ICU"],
    status: "active",
  },
  {
    id: randomUUID(),
    name: "Chemical Spill — Laboratory Wing",
    scope: "mass",
    department_reach: ["Emergency", "Internal Medicine", "Toxicology"],
    status: "active",
  },
  {
    id: randomUUID(),
    name: "Pediatric Asthma Attack",
    scope: "individual",
    department_reach: ["Emergency", "Pediatrics"],
    status: "resolved",
  },
];

const DEMO_CASES = [
  // Case 1: Critical — multi-vehicle accident, multiple trauma
  {
    emergency_idx: 0,
    acuity_score: 5,
    symptoms: "Chest pain, broken femur, abdominal bleeding, GCS 10",
    symptom_severity: "critical",
    vital_signs: { heart_rate: 130, blood_pressure: "82/50", sp_o2: 89, temperature: 36.1 },
    triage_note: "34yo male, ejected from vehicle, found unconscious, multiple fractures",
    age: 34,
    required_resource_types: ["icu_bed", "staff"],
  },
  // Case 2: Severe — another accident victim
  {
    emergency_idx: 0,
    acuity_score: 4,
    symptoms: "Open fracture left arm, head laceration, alert but distressed",
    symptom_severity: "severe",
    vital_signs: { heart_rate: 112, blood_pressure: "100/68", sp_o2: 95, temperature: 36.4 },
    triage_note: "28yo female, conscious, significant blood loss from arm wound",
    age: 28,
    required_resource_types: ["or_slot", "staff"],
  },
  // Case 3: Moderate — minor accident injury
  {
    emergency_idx: 0,
    acuity_score: 2,
    symptoms: "Whiplash, mild headache, abrasions on face",
    symptom_severity: "mild",
    vital_signs: { heart_rate: 88, blood_pressure: "124/78", sp_o2: 98, temperature: 36.7 },
    triage_note: "42yo female, seatbelt bruising, ambulatory, no LOC",
    age: 42,
    required_resource_types: ["er_bay"],
  },
  // Case 4: Cardiac arrest patient
  {
    emergency_idx: 1,
    acuity_score: 5,
    symptoms: "Cardiac arrest, no pulse, CPR in progress",
    symptom_severity: "critical",
    vital_signs: { heart_rate: 0, blood_pressure: "0/0", sp_o2: 72, temperature: 35.8 },
    triage_note: "71yo male, collapsed in hallway, witnessed arrest, CPR started 3 min ago",
    age: 71,
    medical_history: "History of MI 2019, Hypertension, Diabetes Type 2",
    required_resource_types: ["icu_bed", "staff", "equipment"],
  },
  // Case 5: Chemical inhalation
  {
    emergency_idx: 2,
    acuity_score: 4,
    symptoms: "Respiratory distress, chemical burns in throat, coughing blood",
    symptom_severity: "severe",
    vital_signs: { heart_rate: 118, blood_pressure: "132/84", sp_o2: 91, temperature: 37.1 },
    triage_note: "26yo male lab technician, accidental chlorine gas exposure, 15 min ago",
    age: 26,
    required_resource_types: ["icu_bed", "equipment"],
  },
];

const DEMO_RESOURCES = [
  { type: "icu_bed", label: "ICU Bed A1", department: "ICU", status: "available" },
  { type: "icu_bed", label: "ICU Bed A2", department: "ICU", status: "available" },
  { type: "or_slot", label: "OR Suite 1", department: "Surgery", status: "available" },
  { type: "or_slot", label: "OR Suite 2", department: "Surgery", status: "available" },
  { type: "staff", label: "Trauma Team Alpha", department: "Emergency", status: "available" },
  { type: "staff", label: "Trauma Team Bravo", department: "Emergency", status: "available" },
  { type: "equipment", label: "Ventilator Unit 1", department: "ICU", status: "available" },
  { type: "equipment", label: "Crash Cart 1", department: "Emergency", status: "available" },
  { type: "er_bay", label: "ER Bay 3", department: "Emergency", status: "available" },
  { type: "er_bay", label: "ER Bay 4", department: "Emergency", status: "available" },
];

const HOSPITAL_ID = "872159b0-a439-488e-b7ea-e664df3608f2";

(async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Wipe old emergencies and cascading data
    await client.query("DELETE FROM audit_log WHERE hospital_id = $1", [HOSPITAL_ID]);
    await client.query("DELETE FROM allocations WHERE hospital_id = $1", [HOSPITAL_ID]);
    await client.query("DELETE FROM bids WHERE hospital_id = $1", [HOSPITAL_ID]);
    await client.query("DELETE FROM cases WHERE hospital_id = $1", [HOSPITAL_ID]);
    await client.query("DELETE FROM emergencies WHERE hospital_id = $1", [HOSPITAL_ID]);
    console.log("Cleared old emergency data");

    // 2. Insert demo emergencies
    for (const em of DEMO_EMERGENCIES) {
      await client.query(
        `INSERT INTO emergencies (id, name, scope, status, department_reach, hospital_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [em.id, em.name, em.scope, em.status, em.department_reach, HOSPITAL_ID]
      );
      console.log(`  Created emergency: "${em.name}" (${em.status})`);
    }

    // 3. Insert demo resources
    for (const r of DEMO_RESOURCES) {
      await client.query(
        `INSERT INTO resources (type, label, department, status, hospital_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [r.type, r.label, r.department, r.status, HOSPITAL_ID]
      );
    }
    console.log(`  Created ${DEMO_RESOURCES.length} resources`);

    // 4. Insert demo cases with clinical data
    const acuityToSev = { 5: "critical", 4: "severe", 3: "moderate", 2: "mild", 1: "mild" };
    for (const c of DEMO_CASES) {
      const emId = DEMO_EMERGENCIES[c.emergency_idx].id;
      await client.query(
        `INSERT INTO cases (emergency_id, acuity_score, required_resource_types, hospital_id,
          symptoms, symptom_severity, vital_signs, triage_note, suggested_resource_types)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          emId, c.acuity_score, c.required_resource_types, HOSPITAL_ID,
          c.symptoms, c.symptom_severity || acuityToSev[c.acuity_score] || "moderate",
          JSON.stringify(c.vital_signs || {}), c.triage_note || "",
          c.required_resource_types,
        ]
      );
    }
    console.log(`  Created ${DEMO_CASES.length} cases with clinical data`);

    // 5. Verify
    const emCount = await client.query("SELECT count(*) FROM emergencies WHERE hospital_id = $1", [HOSPITAL_ID]);
    const caseCount = await client.query("SELECT count(*) FROM cases WHERE hospital_id = $1", [HOSPITAL_ID]);
    const resCount = await client.query("SELECT count(*) FROM resources WHERE hospital_id = $1", [HOSPITAL_ID]);
    console.log(`\nTotals: ${emCount.rows[0].count} emergencies, ${caseCount.rows[0].count} cases, ${resCount.rows[0].count} resources`);

    // 6. List created emergencies
    const ems = await client.query("SELECT id, name, status, scope FROM emergencies WHERE hospital_id = $1 ORDER BY declared_at DESC", [HOSPITAL_ID]);
    ems.rows.forEach(r => console.log(`  ${r.name} (${r.scope}/${r.status})`));

    await client.query("COMMIT");
    console.log("\nDone!");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Error:", e.message);
  } finally {
    client.release();
    await pool.end();
  }
})();
