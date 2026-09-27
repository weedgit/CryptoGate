-- Hot/cold audit retention: keep recent rows in audit_log for UI;
-- move older rows to audit_log_archive (compliance retain, cold).
-- Controlled DELETE only via archive_old_audit_log() — not app UPDATE/DELETE.

CREATE TABLE IF NOT EXISTS audit_log_archive (
  id              UUID PRIMARY KEY,
  actor_user_id   UUID,
  org_id          UUID,
  action          TEXT NOT NULL,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL,
  archived_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_archive_created_at_idx
  ON audit_log_archive (created_at DESC);

CREATE INDEX IF NOT EXISTS audit_log_archive_action_created_at_idx
  ON audit_log_archive (action, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_log_archive_org_id_idx
  ON audit_log_archive (org_id);

CREATE INDEX IF NOT EXISTS audit_log_archive_archived_at_idx
  ON audit_log_archive (archived_at DESC);

/**
 * Copy up to p_limit rows older than p_before into archive, then delete from hot.
 * Returns number of rows removed from audit_log.
 */
CREATE OR REPLACE FUNCTION archive_old_audit_log(
  p_before TIMESTAMPTZ,
  p_limit INTEGER DEFAULT 1000
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

REVOKE ALL ON FUNCTION archive_old_audit_log(TIMESTAMPTZ, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION archive_old_audit_log(TIMESTAMPTZ, INTEGER) TO PUBLIC;
