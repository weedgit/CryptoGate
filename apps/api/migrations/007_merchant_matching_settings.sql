-- M2-17: merchant default matching mode (B/C/D/S).
-- Locked onto each payment order at create; changing default does not rewrite open orders.
-- Phase 1 product default is Mode B when no row exists.

CREATE TABLE IF NOT EXISTS merchant_matching_settings (
  org_id          UUID PRIMARY KEY REFERENCES org_accounts (id) ON DELETE CASCADE,
  matching_mode   TEXT NOT NULL
                    CHECK (matching_mode IN ('B', 'C', 'D', 'S')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
