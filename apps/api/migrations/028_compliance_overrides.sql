-- B7: compliance override log + suspend order-create flag (non-custodial ops gate).
ALTER TABLE org_accounts
  ADD COLUMN IF NOT EXISTS order_create_suspended BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS compliance_overrides (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES org_accounts (id) ON DELETE CASCADE,
  actor_user_id   UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  override_type   TEXT NOT NULL
                    CHECK (override_type IN (
                      'settlement_address',
                      'matching_mode',
                      'suspend_order_create',
                      'suspend_merchant'
                    )),
  reason_code     TEXT NOT NULL
                    CHECK (reason_code IN (
                      'manual_review',
                      'suspicious_activity',
                      'sanctions_screening',
                      'other'
                    )),
  notes           TEXT NOT NULL,
  ticket_id       TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS compliance_overrides_org_id_created_idx
  ON compliance_overrides (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS compliance_overrides_created_idx
  ON compliance_overrides (created_at DESC);
