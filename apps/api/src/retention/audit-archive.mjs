import { getPool } from "../db/pool.mjs";

/** Default hot-window for audit_log UI (Stripe-like ~6 months). */
export const DEFAULT_AUDIT_HOT_RETENTION_DAYS = 180;

let schemaReady = false;
let schemaPromise = null;

/**
 * @param {number} days
 */
export function clampAuditHotRetentionDays(days) {
  if (!Number.isFinite(days)) return DEFAULT_AUDIT_HOT_RETENTION_DAYS;
  return Math.min(3650, Math.max(30, Math.trunc(days)));
}

/**
 * Idempotent: create archive table + archive_old_audit_log() if missing
 * (covers hosts that have not yet run migration 074).
 * @param {import("pg").Pool | import("pg").PoolClient} [client]
 */
export async function ensureAuditArchiveSchema(client) {
  if (schemaReady) return;
  if (schemaPromise) {
    await schemaPromise;
    return;
  }
  const db = client ?? getPool();
  schemaPromise = (async () => {
    await db.query(`
CREATE TABLE IF NOT EXISTS audit_log_archive (
  id              UUID PRIMARY KEY,
  actor_user_id   UUID,
  org_id          UUID,
  action          TEXT NOT NULL,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL,
  archived_at     TIMESTAMPTZ NOT NULL DEFAULT now()
)`);
    await db.query(`
CREATE INDEX IF NOT EXISTS audit_log_archive_created_at_idx
  ON audit_log_archive (created_at DESC)`);
    await db.query(`
CREATE INDEX IF NOT EXISTS audit_log_archive_action_created_at_idx
  ON audit_log_archive (action, created_at DESC)`);
    await db.query(`
CREATE INDEX IF NOT EXISTS audit_log_archive_org_id_idx
  ON audit_log_archive (org_id)`);
    await db.query(`
CREATE INDEX IF NOT EXISTS audit_log_archive_archived_at_idx
  ON audit_log_archive (archived_at DESC)`);
    await db.query(`
CREATE OR REPLACE FUNCTION archive_old_audit_log(
  p_before TIMESTAMPTZ,
  p_limit INTEGER DEFAULT 1000
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  n INTEGER := 0;
  lim INTEGER := GREATEST(1, LEAST(COALESCE(p_limit, 1000), 5000));
BEGIN
  IF p_before IS NULL THEN
    RAISE EXCEPTION 'p_before is required';
  END IF;

  CREATE TEMP TABLE _audit_archive_batch (
    id UUID PRIMARY KEY
  ) ON COMMIT DROP;

  INSERT INTO _audit_archive_batch (id)
  SELECT id
  FROM audit_log
  WHERE created_at < p_before
  ORDER BY created_at ASC
  LIMIT lim;

  INSERT INTO audit_log_archive (
    id, actor_user_id, org_id, action, metadata, created_at, archived_at
  )
  SELECT
    a.id,
    a.actor_user_id,
    a.org_id,
    a.action,
    a.metadata,
    a.created_at,
    now()
  FROM audit_log a
  INNER JOIN _audit_archive_batch b ON b.id = a.id
  ON CONFLICT (id) DO NOTHING;

  ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_update;
  DELETE FROM audit_log a
  USING _audit_archive_batch b
  WHERE a.id = b.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_update;

  RETURN n;
EXCEPTION
  WHEN OTHERS THEN
    BEGIN
      ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_update;
    EXCEPTION
      WHEN OTHERS THEN
        NULL;
    END;
    RAISE;
END;
$fn$`);
    schemaReady = true;
  })()
    .catch((err) => {
      schemaPromise = null;
      throw err;
    })
    .then(() => {
      schemaPromise = null;
    });
  await schemaPromise;
}

/**
 * Move old audit_log rows into audit_log_archive (compliance cold store).
 * @param {{
 *   hotRetentionDays?: number,
 *   batchSize?: number,
 *   maxBatches?: number,
 *   client?: import("pg").Pool | import("pg").PoolClient,
 * }} [opts]
 * @returns {Promise<{ archived: number, batches: number, cutoff: string }>}
 */
export async function archiveOldAuditLog(opts = {}) {
  const db = opts.client ?? getPool();
  await ensureAuditArchiveSchema(db);

  const days = clampAuditHotRetentionDays(
    opts.hotRetentionDays ??
      Number(
        process.env.AUDIT_HOT_RETENTION_DAYS ?? DEFAULT_AUDIT_HOT_RETENTION_DAYS,
      ),
  );
  const batchSize = Math.min(
    5000,
    Math.max(1, Number(opts.batchSize) || 1000),
  );
  const maxBatches = Math.min(
    100,
    Math.max(1, Number(opts.maxBatches) || 20),
  );

  const cutoffRes = await db.query(
    `SELECT (now() - ($1::int * interval '1 day'))::timestamptz AS cutoff`,
    [days],
  );
  const cutoff = cutoffRes.rows[0]?.cutoff;
  const cutoffIso =
    cutoff instanceof Date ? cutoff.toISOString() : String(cutoff);

  let archived = 0;
  let batches = 0;
  while (batches < maxBatches) {
    const { rows } = await db.query(
      `SELECT archive_old_audit_log($1::timestamptz, $2::int) AS n`,
      [cutoff, batchSize],
    );
    const n = Number(rows[0]?.n ?? 0);
    archived += n;
    batches += 1;
    if (n < batchSize) break;
  }

  return { archived, batches, cutoff: cutoffIso };
}
