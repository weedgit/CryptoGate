-- POS terminals bound to one merchant or site org by its Owner/Admin. After binding,
-- members of that org unlock the terminal with a server-generated PIN only.

CREATE TABLE IF NOT EXISTS pos_terminals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES org_accounts (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  device_model TEXT,
  app_version TEXT,
  last_seen_at TIMESTAMPTZ,
  last_ip INET,
  bound_by UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES users (id) ON DELETE SET NULL,
  revoke_reason TEXT,
  failed_unlocks INTEGER NOT NULL DEFAULT 0,
  lockout_level INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS pos_terminals_org_idx ON pos_terminals (org_id, created_at DESC);

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS terminal_id UUID REFERENCES pos_terminals (id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS sessions_terminal_idx ON sessions (terminal_id)
  WHERE terminal_id IS NOT NULL AND revoked_at IS NULL;

ALTER TABLE payment_orders
  ADD COLUMN IF NOT EXISTS terminal_id UUID REFERENCES pos_terminals (id) ON DELETE SET NULL;

-- HMAC-SHA256(POS_PIN_PEPPER, orgId || ':' || pin). The org id inside the HMAC makes the
-- unique index mean "unique within the org". pos_pin_hash (scrypt) stays as the second check.
ALTER TABLE users ADD COLUMN IF NOT EXISTS pos_pin_lookup TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS users_pos_pin_lookup_uq ON users (pos_pin_lookup)
  WHERE pos_pin_lookup IS NOT NULL;
