require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});

(async () => {
  const hospId = '872159b0-a439-488e-b7ea-e664df3608f2';
  const hash = await bcrypt.hash('demo1234', 10);
  const users = [
    { email: 'doctor@hospital.com', name: 'Dr. Smith', role: 'doctor' },
    { email: 'nurse@hospital.com', name: 'Nurse Johnson', role: 'nurse' },
    { email: 'triage@hospital.com', name: 'Triage Officer Lee', role: 'triage_officer' },
    { email: 'depthead@hospital.com', name: 'Dept. Head Chen', role: 'department_head' },
    { email: 'paramedic@hospital.com', name: 'Paramedic Garcia', role: 'paramedic' },
  ];
  for (const u of users) {
    await pool.query(
      'INSERT INTO users (hospital_id, email, full_name, role, password_hash) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (hospital_id, email) DO NOTHING',
      [hospId, u.email, u.name, u.role, hash]
    );
    console.log('Created:', u.email, '(' + u.role + ')');
  }
  const r = await pool.query('SELECT email, role FROM users WHERE hospital_id = $1 ORDER BY role', [hospId]);
  console.log('\nAll users for St. Jude:');
  r.rows.forEach(u => console.log('  ' + u.role.padEnd(20) + u.email));
  await pool.end();
})();
