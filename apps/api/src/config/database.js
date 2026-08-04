import 'dotenv/config';
import pg from 'pg';
const { Pool, types } = pg;

// OID 1114 is 'timestamp without time zone'.
// Force node-postgres to treat it as UTC instead of local time.
types.setTypeParser(1114, str => new Date(str + 'Z'));

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Force the session timezone to UTC so that Postgres doesn't shift timestamps
// when casting UTC strings to 'timestamp without time zone' columns.
pool.on('connect', (client) => {
  client.query("SET TIME ZONE 'UTC'").catch(err => {
    console.error('Failed to set timezone on connect', err);
  });
});

pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

/**
 * Execute a callback within a transaction.
 * @param {Function} callback - Function receiving the client, e.g. async (client) => { ... }
 */
export const withTransaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export const query = (text, params) => pool.query(text, params);
