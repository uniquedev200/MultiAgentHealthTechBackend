const { query, pool } = require('../dist/db');
async function check() {
  try {
    const r = await query("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'hospital_llm_credentials')");
    console.log('Table exists:', r.rows[0].exists);
  } catch(e) {
    console.error('Error:', e.message);
  }
  pool.end();
}
check();
