-- The token_to_usd and usd_to_token pricing modes priced exactly like 'market'; they are removed.
UPDATE merchant_pricing_settings
SET pricing_mode = 'market', updated_at = now()
WHERE pricing_mode IN ('token_to_usd', 'usd_to_token');

ALTER TABLE merchant_pricing_settings
  DROP CONSTRAINT IF EXISTS merchant_pricing_settings_pricing_mode_check;

ALTER TABLE merchant_pricing_settings
  ADD CONSTRAINT merchant_pricing_settings_pricing_mode_check
  CHECK (pricing_mode IN ('pegged_1to1', 'market'));
