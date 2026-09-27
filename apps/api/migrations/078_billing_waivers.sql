-- Billing waivers: "waived" bill status, void folded into cancelled,
-- platform-fee / activation waive lists replacing merchant billing flags.

ALTER TABLE service_bills
  ADD COLUMN IF NOT EXISTS waived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS close_reason TEXT;

ALTER TABLE service_bills
  DROP CONSTRAINT IF EXISTS service_bills_status_check;

UPDATE service_bills
SET status = 'cancelled',
    cancelled_at = COALESCE(cancelled_at, voided_at, updated_at)
WHERE status = 'voided';

ALTER TABLE service_bills
  ADD CONSTRAINT service_bills_status_check
  CHECK (status IN ('draft', 'issued', 'paid', 'overdue', 'waived', 'cancelled'));

ALTER TABLE service_bills DROP COLUMN IF EXISTS voided_at;

-- Waived bills keep their slot: a waived period / activation is never re-billed.
DROP INDEX IF EXISTS service_bills_org_period_active_uidx;
CREATE UNIQUE INDEX service_bills_org_period_active_uidx
  ON service_bills (org_id, period_start)
  WHERE status <> 'cancelled' AND bill_kind = 'monthly';

DROP INDEX IF EXISTS service_bills_org_activation_active_uidx;
CREATE UNIQUE INDEX service_bills_org_activation_active_uidx
  ON service_bills (org_id)
  WHERE bill_kind = 'activation' AND status <> 'cancelled';

-- Waive platform fee: next N monthly bills are saved as waived.
CREATE TABLE IF NOT EXISTS billing_fee_waivers (
  org_id          UUID PRIMARY KEY REFERENCES org_accounts (id) ON DELETE CASCADE,
  months_granted  SMALLINT NOT NULL CHECK (months_granted BETWEEN 1 AND 120),
  months_used     SMALLINT NOT NULL DEFAULT 0,
  reason          TEXT NOT NULL,
  created_by      UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT billing_fee_waivers_used_ok
    CHECK (months_used >= 0 AND months_used < months_granted)
);

-- Waive activation: merchant is activated on setup completion with a waived bill.
CREATE TABLE IF NOT EXISTS billing_activation_waivers (
  org_id      UUID PRIMARY KEY REFERENCES org_accounts (id) ON DELETE CASCADE,
  reason      TEXT NOT NULL,
  created_by  UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Carry over legacy flags before dropping them.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'merchant_commercial' AND column_name = 'fee_exempt_until'
  ) THEN
    INSERT INTO billing_fee_waivers (org_id, months_granted, reason)
    SELECT mc.org_id,
           LEAST(120, GREATEST(1,
             (EXTRACT(YEAR FROM age(mc.fee_exempt_until, s.start_on)) * 12
              + EXTRACT(MONTH FROM age(mc.fee_exempt_until, s.start_on)) + 1)::int)),
           COALESCE(NULLIF(btrim(mc.billing_ops_note), ''),
                    'Fee exempt until ' || to_char(mc.fee_exempt_until, 'YYYY-MM-DD'))
    FROM merchant_commercial mc
    CROSS JOIN LATERAL (
      SELECT COALESCE(mc.next_invoice_on, CURRENT_DATE) AS start_on
    ) s
    WHERE mc.fee_exempt_until IS NOT NULL
      AND mc.fee_exempt_until >= s.start_on
    ON CONFLICT (org_id) DO NOTHING;

    INSERT INTO billing_activation_waivers (org_id, reason)
    SELECT mc.org_id,
           COALESCE(NULLIF(btrim(mc.billing_ops_note), ''), 'Skip activation')
    FROM merchant_commercial mc
    WHERE mc.skip_activation = true
      AND mc.billing_anchor_at IS NULL
    ON CONFLICT (org_id) DO NOTHING;
  END IF;
END $$;

ALTER TABLE merchant_commercial
  DROP COLUMN IF EXISTS fee_exempt_until,
  DROP COLUMN IF EXISTS skip_activation,
  DROP COLUMN IF EXISTS billing_ops_note;
