require('dotenv').config();
const p = require('pg');
const c = new p.Pool({connectionString: process.env.DATABASE_URL, ssl:{rejectUnauthorized:false}});
c.query("SELECT column_name, column_default FROM information_schema.columns WHERE table_name='emergencies' AND column_name='name'")
  .then(r => {
    console.log(JSON.stringify(r.rows[0]));
    return c.query("SELECT id, LEFT(name, 40) as name, scope FROM emergencies WHERE hospital_id = '872159b0-a439-488e-b7ea-e664df3608f2'");
  })
  .then(r => {
    console.log('\nSt. Jude emergencies:');
    r.rows.forEach(row => console.log(`  name=${JSON.stringify(row.name)} scope=${row.scope}`));
    return c.query("SELECT COUNT(*) as cnt FROM emergencies WHERE name = 'Individual Emergency'");
  })
  .then(r => {
    console.log(`\nTotal with default name: ${r.rows[0].cnt}`);
    c.end();
  });
