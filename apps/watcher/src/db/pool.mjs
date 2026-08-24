/**
 * Watcher-owned Postgres pool. Do not import apps/api.
 */
import pg from "pg";

/** @type {pg.Pool | null} */
let pool = null;

export function getWatcherPool() {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for watcher DB access");
  }
  pool = new pg.Pool({ connectionString });
  return pool;
}

export async function closeWatcherPool() {
  if (!pool) return;
  await pool.end();
  pool = null;
}
