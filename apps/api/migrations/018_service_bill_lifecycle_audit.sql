-- M4-36 / OpenAPI v0.3.2: service bill lifecycle columns + audit index.

ALTER TABLE service_bills
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_adjustment_reason TEXT,
  ADD COLUMN IF NOT EXISTS payment_reference TEXT;

CREATE INDEX IF NOT EXISTS audit_log_action_created_idx
  ON audit_log (action, created_at DESC);
