import { getPool } from "./db/pool.mjs";

/**
 * Build health JSON for GET /health and the CLI check stub.
 * @param {{ checkDb?: boolean }} [opts] — set checkDb true for HTTP (needs DATABASE_URL + Postgres).
 */
export async function getHealthPayload(opts = {}) {
  const payload = {
    service: "cryptogate-api",
    status: "ok",
    phase: "m1",
    timestamp: new Date().toISOString(),
  };

  if (!opts.checkDb) {
    return payload;
  }

  if (!process.env.DATABASE_URL) {
    payload.db = "skipped";
    return payload;
  }

  try {
    const pool = getPool();
    await pool.query("SELECT 1");
    payload.db = "ok";
  } catch {
    payload.status = "degraded";
    payload.db = "error";
  }

  return payload;
}
