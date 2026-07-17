require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});

(async () => {
  const client = await pool.connect();
  try {
    const hospitals = await client.query('SELECT id, name, email FROM hospitals');
    console.log(`Found ${hospitals.rows.length} hospitals`);

    const hash = await bcrypt.hash('demo1234', 10);

    // For hospitals without users, create an admin user
    for (const h of hospitals.rows) {
      const adminEmail = h.email || `admin@${h.name.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`;

      const existing = await client.query('SELECT id FROM users WHERE hospital_id = $1 AND role = $2', [h.id, 'admin']);
      if (existing.rows.length > 0) {
        console.log(`  [skip] ${h.name} already has admin`);
        continue;
      }

      await client.query(
        `INSERT INTO users (hospital_id, email, full_name, role, password_hash)
         VALUES ($1, $2, $3, 'admin', $4)
         ON CONFLICT (hospital_id, email) DO NOTHING`,
        [h.id, adminEmail, 'Admin User', hash]
      );
      console.log(`  [created] ${h.name} -> admin: ${adminEmail}`);
    }

    const userCount = await client.query('SELECT count(*) FROM users');
    console.log(`\nTotal users now: ${userCount.rows[0].count}`);
  } catch (e) {
    console.error('Seed failed:', e.message);
  } finally {
    client.release();
    await pool.end();
  }
})();
