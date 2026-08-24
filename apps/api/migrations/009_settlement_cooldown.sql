-- M2-16: settlement address cool-down.
-- `address` stays the active receive destination for new orders.
-- A change stores pending_address until pending_activates_at.

ALTER TABLE settlement_addresses
  ADD COLUMN IF NOT EXISTS pending_address TEXT,
  ADD COLUMN IF NOT EXISTS pending_activates_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS settlement_addresses_pending_activates_at_idx
  ON settlement_addresses (pending_activates_at)
  WHERE pending_address IS NOT NULL;
