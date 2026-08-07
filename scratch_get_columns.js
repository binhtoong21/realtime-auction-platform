import dotenv from 'dotenv';
dotenv.config({ path: 'apps/api/.env' });
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function test() {
  const res = await pool.query(`
    SELECT table_name, column_name 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND data_type = 'timestamp without time zone'
  `);
  for (const row of res.rows) {
    if (row.table_name === 'pgmigrations') continue;
    console.log(`pgm.alterColumn('${row.table_name}', '${row.column_name}', { type: 'timestamptz' });`);
  }
  process.exit(0);
}
test();
