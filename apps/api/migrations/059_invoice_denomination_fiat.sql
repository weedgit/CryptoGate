-- Multi-fiat (EUR) + crypto-denominated invoices.

ALTER TABLE payment_orders
  ADD COLUMN IF NOT EXISTS invoice_amount TEXT,
  ADD COLUMN IF NOT EXISTS invoice_denomination TEXT NOT NULL DEFAULT 'fiat';

UPDATE payment_orders
SET invoice_amount = invoice_amount_usd
WHERE invoice_amount IS NULL;

ALTER TABLE payment_orders
  DROP CONSTRAINT IF EXISTS payment_orders_invoice_currency_check;

ALTER TABLE payment_orders
  ADD CONSTRAINT payment_orders_invoice_currency_check
  CHECK (invoice_currency IN ('USD', 'EUR'));

ALTER TABLE payment_orders
  DROP CONSTRAINT IF EXISTS payment_orders_invoice_denomination_check;

ALTER TABLE payment_orders
  ADD CONSTRAINT payment_orders_invoice_denomination_check
  CHECK (invoice_denomination IN ('fiat', 'crypto'));

ALTER TABLE payment_orders
  DROP CONSTRAINT IF EXISTS payment_orders_pricing_mode_check;

ALTER TABLE payment_orders
  ADD CONSTRAINT payment_orders_pricing_mode_check
  CHECK (
    pricing_mode IS NULL
    OR pricing_mode IN ('pegged_1to1', 'market', 'depeg_market', 'crypto_exact')
  );
