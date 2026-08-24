-- M2-44: Mode S HD address pool (watch-only). Platform never stores spend keys.
-- States: FREE → IN_USE (claimed) → COOLDOWN (order final) → FREE.
-- xpub_fp is a hash prefix of the active xPub, not the xPub itself.

CREATE TABLE IF NOT EXISTS hd_pool_addresses (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES org_accounts (id) ON DELETE CASCADE,
  asset            TEXT NOT NULL,
  network          TEXT NOT NULL,
  hd_index         INTEGER NOT NULL CHECK (hd_index >= 0),
  receive_address  TEXT NOT NULL,
  status           TEXT NOT NULL
                     CHECK (status IN ('FREE', 'IN_USE', 'COOLDOWN')),
  xpub_fp          TEXT NOT NULL,
  cooldown_until   TIMESTAMPTZ,
  last_order_id    UUID REFERENCES payment_orders (id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hd_pool_addresses_org_asset_net_fp_index_unique
    UNIQUE (org_id, asset, network, xpub_fp, hd_index),
  CONSTRAINT hd_pool_addresses_org_asset_net_address_unique
    UNIQUE (org_id, asset, network, receive_address)
);

CREATE INDEX IF NOT EXISTS hd_pool_addresses_claim_idx
  ON hd_pool_addresses (org_id, asset, network, status, hd_index);

CREATE INDEX IF NOT EXISTS hd_pool_addresses_cooldown_idx
  ON hd_pool_addresses (status, cooldown_until)
  WHERE status = 'COOLDOWN';

CREATE INDEX IF NOT EXISTS hd_pool_addresses_last_order_idx
  ON hd_pool_addresses (last_order_id)
  WHERE last_order_id IS NOT NULL;
