-- B16 rail policy: platform network floors + merchant stricter confirmation overrides.
-- NULL columns mean "use ASSET_NETWORK_REGISTRY defaults".
-- Applies to new orders only (payment_orders.required_confirmations is snapshotted at create).

CREATE TABLE IF NOT EXISTS platform_network_rail_settings (
  network                  TEXT PRIMARY KEY,
  required_confirmations   INTEGER NULL
                             CHECK (
                               required_confirmations IS NULL
                               OR (required_confirmations >= 1 AND required_confirmations <= 256)
                             ),
  min_amount               TEXT NULL
                             CHECK (
                               min_amount IS NULL
                               OR min_amount ~ '^(?:0|[1-9]\d*)(?:\.\d+)?$'
                             ),
  updated_by_user_id       UUID NULL REFERENCES users (id) ON DELETE SET NULL,
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS merchant_network_rail_settings (
  org_id                   UUID NOT NULL REFERENCES org_accounts (id) ON DELETE CASCADE,
  network                  TEXT NOT NULL,
  required_confirmations   INTEGER NOT NULL
                             CHECK (required_confirmations >= 1 AND required_confirmations <= 256),
  updated_by_user_id       UUID NULL REFERENCES users (id) ON DELETE SET NULL,
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, network)
);

CREATE INDEX IF NOT EXISTS merchant_network_rail_settings_org_idx
  ON merchant_network_rail_settings (org_id);
