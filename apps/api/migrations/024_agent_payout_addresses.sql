-- Agent commission payout destination (watch-only; platform or agent Owner sets).

CREATE TABLE IF NOT EXISTS agent_payout_addresses (
  org_id      UUID PRIMARY KEY REFERENCES org_accounts (id) ON DELETE CASCADE,
  asset       TEXT NOT NULL,
  network     TEXT NOT NULL,
  address     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_payout_addresses_org_id_idx
  ON agent_payout_addresses (org_id);
