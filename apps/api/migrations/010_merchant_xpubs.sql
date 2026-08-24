-- M2-20: watch-only xPub registration (Mode S prerequisite).
-- Active xPub used for Mode S; changes cool down like settlement addresses.
-- Platform never stores private keys.

CREATE TABLE IF NOT EXISTS merchant_xpubs (
  org_id                 UUID NOT NULL REFERENCES org_accounts (id) ON DELETE CASCADE,
  asset                  TEXT NOT NULL,
  network                TEXT NOT NULL,
  xpub                   TEXT NOT NULL,
  pending_xpub           TEXT,
  pending_activates_at   TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, asset, network)
);

CREATE INDEX IF NOT EXISTS merchant_xpubs_org_id_idx
  ON merchant_xpubs (org_id);

CREATE INDEX IF NOT EXISTS merchant_xpubs_pending_activates_at_idx
  ON merchant_xpubs (pending_activates_at)
  WHERE pending_xpub IS NOT NULL;
