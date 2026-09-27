-- Platform-owned per-merchant / per-site rail overlays (confirmations + pair mins).
-- NULL columns mean "inherit parent floor". Raise-only vs parent enforced in app.
-- Applies to new orders only (payment_orders.required_confirmations snapshotted at create).

CREATE TABLE IF NOT EXISTS platform_merchant_network_rail_settings (
  org_id                   UUID NOT NULL REFERENCES org_accounts (id) ON DELETE CASCADE,
  network                  TEXT NOT NULL,
  required_confirmations   INTEGER NULL
                             CHECK (
                               required_confirmations IS NULL
                               OR (required_confirmations >= 1 AND required_confirmations <= 256)
                             ),
  updated_by_user_id       UUID NULL REFERENCES users (id) ON DELETE SET NULL,
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, network)
);

CREATE INDEX IF NOT EXISTS platform_merchant_network_rail_settings_org_idx
  ON platform_merchant_network_rail_settings (org_id);

CREATE TABLE IF NOT EXISTS platform_merchant_pair_rail_settings (
  org_id                   UUID NOT NULL REFERENCES org_accounts (id) ON DELETE CASCADE,
  network                  TEXT NOT NULL,
  asset                    TEXT NOT NULL,
  min_amount               TEXT NULL
                             CHECK (
                               min_amount IS NULL
                               OR min_amount ~ '^(?:0|[1-9]\d*)(?:\.\d+)?$'
                             ),
  updated_by_user_id       UUID NULL REFERENCES users (id) ON DELETE SET NULL,
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, network, asset)
);

CREATE INDEX IF NOT EXISTS platform_merchant_pair_rail_settings_org_idx
  ON platform_merchant_pair_rail_settings (org_id);

CREATE TABLE IF NOT EXISTS platform_site_network_rail_settings (
  site_id                  UUID NOT NULL REFERENCES org_accounts (id) ON DELETE CASCADE,
  network                  TEXT NOT NULL,
  required_confirmations   INTEGER NULL
                             CHECK (
                               required_confirmations IS NULL
                               OR (required_confirmations >= 1 AND required_confirmations <= 256)
                             ),
  updated_by_user_id       UUID NULL REFERENCES users (id) ON DELETE SET NULL,
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (site_id, network)
);

CREATE INDEX IF NOT EXISTS platform_site_network_rail_settings_site_idx
  ON platform_site_network_rail_settings (site_id);

CREATE TABLE IF NOT EXISTS platform_site_pair_rail_settings (
  site_id                  UUID NOT NULL REFERENCES org_accounts (id) ON DELETE CASCADE,
  network                  TEXT NOT NULL,
  asset                    TEXT NOT NULL,
  min_amount               TEXT NULL
                             CHECK (
                               min_amount IS NULL
                               OR min_amount ~ '^(?:0|[1-9]\d*)(?:\.\d+)?$'
                             ),
  updated_by_user_id       UUID NULL REFERENCES users (id) ON DELETE SET NULL,
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (site_id, network, asset)
);

CREATE INDEX IF NOT EXISTS platform_site_pair_rail_settings_site_idx
  ON platform_site_pair_rail_settings (site_id);
