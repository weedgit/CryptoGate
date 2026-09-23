-- Billing calendar (merchant/agent pay windows), activation fee settings,
-- draft/cancelled service bills, org pause reason for unpaid bills.

-- Platform billing calendar + activation (Owner-configurable).
ALTER TABLE platform_billing_settings
  ADD COLUMN IF NOT EXISTS merchant_pay_day_start SMALLINT NOT NULL DEFAULT 5
    CHECK (merchant_pay_day_start BETWEEN 1 AND 28),
  ADD COLUMN IF NOT EXISTS merchant_pay_day_end SMALLINT NOT NULL DEFAULT 10
    CHECK (merchant_pay_day_end BETWEEN 1 AND 28),
  ADD COLUMN IF NOT EXISTS agent_pay_day_start SMALLINT NOT NULL DEFAULT 10
    CHECK (agent_pay_day_start BETWEEN 1 AND 28),
  ADD COLUMN IF NOT EXISTS agent_pay_day_end SMALLINT NOT NULL DEFAULT 15
    CHECK (agent_pay_day_end BETWEEN 1 AND 28),
  ADD COLUMN IF NOT EXISTS activation_fee_usd TEXT NOT NULL DEFAULT '49.00',
  ADD COLUMN IF NOT EXISTS activation_pay_days SMALLINT NOT NULL DEFAULT 7
    CHECK (activation_pay_days BETWEEN 1 AND 90),
  ADD COLUMN IF NOT EXISTS auto_send_invoices BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'platform_billing_settings_merchant_window_ok'
  ) THEN
    ALTER TABLE platform_billing_settings
      ADD CONSTRAINT platform_billing_settings_merchant_window_ok
      CHECK (merchant_pay_day_end >= merchant_pay_day_start);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'platform_billing_settings_agent_window_ok'
  ) THEN
    ALTER TABLE platform_billing_settings
      ADD CONSTRAINT platform_billing_settings_agent_window_ok
      CHECK (agent_pay_day_end >= agent_pay_day_start);
  END IF;
END $$;

-- Org pause reason (billing overdue link).
ALTER TABLE org_accounts
  ADD COLUMN IF NOT EXISTS status_reason TEXT,
  ADD COLUMN IF NOT EXISTS status_reason_bill_id UUID;

-- Service bill draft / cancelled + kind + sent_at.
ALTER TABLE service_bills
  ADD COLUMN IF NOT EXISTS bill_kind TEXT NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

DO $$
BEGIN
  ALTER TABLE service_bills DROP CONSTRAINT IF EXISTS service_bills_status_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE service_bills
  DROP CONSTRAINT IF EXISTS service_bills_status_check;

ALTER TABLE service_bills
  ADD CONSTRAINT service_bills_status_check
  CHECK (status IN ('draft', 'issued', 'paid', 'overdue', 'voided', 'cancelled'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'service_bills_bill_kind_check'
  ) THEN
    ALTER TABLE service_bills
      ADD CONSTRAINT service_bills_bill_kind_check
      CHECK (bill_kind IN ('activation', 'monthly'));
  END IF;
END $$;

-- Active period uniqueness: ignore voided + cancelled.
DROP INDEX IF EXISTS service_bills_org_period_active_uidx;
CREATE UNIQUE INDEX service_bills_org_period_active_uidx
  ON service_bills (org_id, period_start)
  WHERE status NOT IN ('voided', 'cancelled') AND bill_kind = 'monthly';

-- At most one open activation bill per merchant.
CREATE UNIQUE INDEX IF NOT EXISTS service_bills_org_activation_active_uidx
  ON service_bills (org_id)
  WHERE bill_kind = 'activation' AND status NOT IN ('voided', 'cancelled');
