-- Merchant billing flags, service-bill ops notes, line amounts, next-period credit.

ALTER TABLE merchant_commercial
  ADD COLUMN IF NOT EXISTS fee_exempt_until DATE,
  ADD COLUMN IF NOT EXISTS skip_activation BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS billing_ops_note TEXT,
  ADD COLUMN IF NOT EXISTS service_bill_credit_usd TEXT NOT NULL DEFAULT '0.00';

ALTER TABLE service_bills
  ADD COLUMN IF NOT EXISTS ops_note TEXT,
  ADD COLUMN IF NOT EXISTS credit_applied_usd TEXT;
