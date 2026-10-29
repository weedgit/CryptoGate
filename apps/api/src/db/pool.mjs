import pg from "pg";

// Keep Postgres DATE as YYYY-MM-DD strings (avoid local-midnight Date shift).
pg.types.setTypeParser(1082, (value) => value);

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
  pool = new pg.Pool({
    connectionString,
    max: Number(process.env.PG_POOL_MAX ?? 20),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  // An idle client dropped by Postgres (restart, failover, network) emits "error" on the pool;
  // unhandled, that crashed the API mid billing or webhook job (review M26). The pool already
  // discards the client; log and carry on.
  pool.on("error", (err) => {
    console.error("postgres idle client error", err?.message ?? err);
  });
  return pool;
}

export async function closePool() {
  if (!pool) return;
  await pool.end();
  pool = null;
}
