-- Merchants can pick the USD-to-token and token-to-USD pricing modes.
ALTER TABLE merchant_pricing_settings
  DROP CONSTRAINT IF EXISTS merchant_pricing_settings_pricing_mode_check;

ALTER TABLE merchant_pricing_settings
  ADD CONSTRAINT merchant_pricing_settings_pricing_mode_check
  CHECK (pricing_mode IN ('pegged_1to1', 'market', 'token_to_usd', 'usd_to_token'));
