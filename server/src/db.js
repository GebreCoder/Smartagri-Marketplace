import pg from "pg";
import { config } from "./config.js";

const { Pool } = pg;

const pool = new Pool(
  config.databaseUrl
    ? { connectionString: config.databaseUrl }
    : {
        host: config.pg.host,
        port: config.pg.port,
        user: config.pg.user,
        password: config.pg.password,
        database: config.pg.database,
      }
);

pool.on("error", (err) => {
  console.error("[db] Unexpected pool error:", err.message);
});

/**
 * Run a parameterized query.
 *   const { rows } = await query("SELECT * FROM users WHERE email = $1", [email]);
 */
export const query = (text, params = []) => pool.query(text, params);

/**
 * Run a transaction: pass an async fn receiving a client.
 *   await withTransaction(async (client) => { await client.query(...) });
 */
export const withTransaction = async (fn) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export default pool;
