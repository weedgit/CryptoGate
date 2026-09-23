-- Payment-date billing anchor (activation paid → next invoice one month later).

ALTER TABLE merchant_commercial
  ADD COLUMN IF NOT EXISTS billing_anchor_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_invoice_on DATE,
  ADD COLUMN IF NOT EXISTS volume_period_start DATE;

CREATE INDEX IF NOT EXISTS merchant_commercial_next_invoice_on_idx
  ON merchant_commercial (next_invoice_on)
  WHERE next_invoice_on IS NOT NULL;
