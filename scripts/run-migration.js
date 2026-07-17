require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});

const MIGRATION = `
-- PART 6: Users table (RBAC)
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id   UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  full_name     TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'doctor'
                CHECK (role IN ('admin','department_head','doctor','nurse','triage_officer','paramedic','charge_nurse')),
  password_hash TEXT NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (hospital_id, email)
);
CREATE INDEX IF NOT EXISTS idx_users_hospital ON users(hospital_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- PART 7: Patients table
CREATE TABLE IF NOT EXISTS patients (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id      UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  age              INTEGER NOT NULL CHECK (age >= 0 AND age <= 150),
  gender           TEXT NOT NULL DEFAULT 'unknown'
                   CHECK (gender IN ('male','female','non-binary','unknown')),
  blood_type       TEXT CHECK (blood_type IN ('A+','A-','B+','B-','AB+','AB-','O+','O-','unknown')),
  medical_history  TEXT NOT NULL DEFAULT '',
  allergies        TEXT NOT NULL DEFAULT '',
  current_medications TEXT NOT NULL DEFAULT '',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_patients_hospital ON patients(hospital_id);

-- PART 8: Cases expansion (clinical data)
ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS symptoms TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS symptom_severity TEXT NOT NULL DEFAULT 'moderate'
    CHECK (symptom_severity IN ('mild','moderate','severe','critical')),
  ADD COLUMN IF NOT EXISTS vital_signs JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS triage_note TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS suggested_resource_types TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;
`;

(async () => {
  const client = await pool.connect();
  try {
    console.log('Connected. Running migration...');
    await client.query('BEGIN');
    await client.query(MIGRATION);
    await client.query('COMMIT');
    console.log('Migration complete!');

    // Verify
    const tables = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    console.log('\nTables:', tables.rows.map(r => r.table_name).join(', '));

    const caseCols = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'cases' ORDER BY ordinal_position
    `);
    console.log('Cases columns:', caseCols.rows.map(r => r.column_name).join(', '));

    const userCount = await client.query('SELECT count(*) FROM users');
    const caseCount = await client.query('SELECT count(*) FROM cases');
    const hospCount = await client.query('SELECT count(*) FROM hospitals');
    console.log(`\nExisting data: ${hospCount.rows[0].count} hospitals, ${userCount.rows[0].count} users, ${caseCount.rows[0].count} cases`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', e.message);
  } finally {
    client.release();
    await pool.end();
  }
})();
