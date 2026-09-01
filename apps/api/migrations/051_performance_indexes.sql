-- Performance: order list sorts, session last-login lookups, audit growth queries.

CREATE INDEX IF NOT EXISTS payment_orders_org_created_at_idx
  ON payment_orders (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS sessions_user_created_at_idx
  ON sessions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_log_action_created_at_idx
  ON audit_log (action, created_at DESC);
