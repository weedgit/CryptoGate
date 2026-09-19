-- Phase 1: USD invoice + FX quote evidence on payment orders.
-- payable_amount remains token major units for watcher matching.
-- invoice_amount_usd is the business volume unit (locked at quote).

ALTER TABLE payment_orders
  ADD COLUMN IF NOT EXISTS invoice_amount_usd TEXT,
  ADD COLUMN IF NOT EXISTS invoice_currency TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS market_rate TEXT,
  ADD COLUMN IF NOT EXISTS pricing_rate TEXT,
  ADD COLUMN IF NOT EXISTS pricing_mode TEXT,
  ADD COLUMN IF NOT EXISTS rate_source TEXT,
  ADD COLUMN IF NOT EXISTS rate_fetched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS quote_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pay_amount_base_units TEXT,
  ADD COLUMN IF NOT EXISTS asset_decimals INTEGER;

-- Backfill: treat historical payable_amount as USD for stablecoins; else copy as best-effort.
UPDATE payment_orders
SET invoice_amount_usd = payable_amount
WHERE invoice_amount_usd IS NULL
  AND asset IN ('USDT', 'USDC');

UPDATE payment_orders
SET invoice_amount_usd = COALESCE(invoice_amount_usd, payable_amount)
WHERE invoice_amount_usd IS NULL;

ALTER TABLE payment_orders
  ALTER COLUMN invoice_amount_usd SET NOT NULL;

ALTER TABLE payment_orders
  DROP CONSTRAINT IF EXISTS payment_orders_pricing_mode_check;

ALTER TABLE payment_orders
  ADD CONSTRAINT payment_orders_pricing_mode_check
  CHECK (
    pricing_mode IS NULL
    OR pricing_mode IN ('pegged_1to1', 'market', 'depeg_market')
  );

ALTER TABLE payment_orders
  DROP CONSTRAINT IF EXISTS payment_orders_invoice_currency_check;

ALTER TABLE payment_orders
  ADD CONSTRAINT payment_orders_invoice_currency_check
  CHECK (invoice_currency = 'USD');
