-- Merchant pricing preferences (preserved when platform disables a mode).
CREATE TABLE IF NOT EXISTS merchant_pricing_settings (
  org_id              UUID PRIMARY KEY REFERENCES org_accounts (id) ON DELETE CASCADE,
  pricing_mode        TEXT NOT NULL DEFAULT 'pegged_1to1'
                        CHECK (pricing_mode IN ('pegged_1to1', 'market')),
  quote_lock_seconds  INTEGER NOT NULL DEFAULT 900
                        CHECK (quote_lock_seconds IN (300, 600, 900, 1800)),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Platform kill switches + policy for pricing / rates.
CREATE TABLE IF NOT EXISTS platform_pricing_settings (
  id                         SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  rates_enabled              BOOLEAN NOT NULL DEFAULT TRUE,
  mode_pegged_1to1_enabled   BOOLEAN NOT NULL DEFAULT TRUE,
  mode_market_enabled        BOOLEAN NOT NULL DEFAULT TRUE,
  depeg_threshold_bps        INTEGER NOT NULL DEFAULT 100
                               CHECK (depeg_threshold_bps >= 0 AND depeg_threshold_bps <= 5000),
  allowed_quote_lock_seconds INTEGER[] NOT NULL DEFAULT ARRAY[300, 600, 900, 1800],
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO platform_pricing_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;
