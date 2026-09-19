-- Phase 2: multi-venue median evidence + Chainlink reference settings.

ALTER TABLE payment_orders
  ADD COLUMN IF NOT EXISTS rate_sources JSONB,
  ADD COLUMN IF NOT EXISTS reference_rate TEXT,
  ADD COLUMN IF NOT EXISTS reference_source TEXT,
  ADD COLUMN IF NOT EXISTS rate_warning TEXT;

ALTER TABLE platform_pricing_settings
  ADD COLUMN IF NOT EXISTS min_rate_sources INTEGER NOT NULL DEFAULT 2
    CHECK (min_rate_sources >= 1 AND min_rate_sources <= 5),
  ADD COLUMN IF NOT EXISTS rate_venues TEXT[] NOT NULL DEFAULT ARRAY['binance','coingecko','kraken'],
  ADD COLUMN IF NOT EXISTS chainlink_reference_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reference_deviation_bps INTEGER NOT NULL DEFAULT 150
    CHECK (reference_deviation_bps >= 0 AND reference_deviation_bps <= 5000);

UPDATE platform_pricing_settings
SET rate_venues = ARRAY['binance','coingecko','kraken']
WHERE rate_venues IS NULL OR cardinality(rate_venues) = 0;
