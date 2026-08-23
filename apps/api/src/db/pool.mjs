import pg from "pg";

/** @type {pg.Pool | null} */
let pool = null;

/**
 * Shared Postgres pool for apps/api.
 * Watcher must not import this module — it stays a separate process.
 */
export function getPool() {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }
  pool = new pg.Pool({ connectionString });
  return pool;
}

export async function closePool() {
  if (!pool) return;
  await pool.end();
  pool = null;
}
