-- M1-18 / M2-15: merchant-controlled settlement addresses (watch-only).
-- One address per org + asset + network. No private keys.

CREATE TABLE IF NOT EXISTS settlement_addresses (
  org_id      UUID NOT NULL REFERENCES org_accounts (id) ON DELETE CASCADE,
  asset       TEXT NOT NULL,
  network     TEXT NOT NULL,
  address     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, asset, network)
);

CREATE INDEX IF NOT EXISTS settlement_addresses_org_id_idx
  ON settlement_addresses (org_id);
