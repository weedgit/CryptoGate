-- M1-17: append-only audit log. Login + privileged actions.
-- No application path may UPDATE or DELETE rows (enforced by trigger).

CREATE TABLE IF NOT EXISTS audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id   UUID REFERENCES users (id) ON DELETE SET NULL,
  org_id          UUID REFERENCES org_accounts (id) ON DELETE SET NULL,
  action          TEXT NOT NULL,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_created_at_idx
  ON audit_log (created_at DESC);

CREATE INDEX IF NOT EXISTS audit_log_actor_user_id_idx
  ON audit_log (actor_user_id);

CREATE INDEX IF NOT EXISTS audit_log_org_id_idx
  ON audit_log (org_id);

CREATE OR REPLACE FUNCTION audit_log_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$;

DROP TRIGGER IF EXISTS audit_log_no_update ON audit_log;
CREATE TRIGGER audit_log_no_update
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW
  EXECUTE PROCEDURE audit_log_immutable();

REVOKE UPDATE, DELETE ON audit_log FROM PUBLIC;
