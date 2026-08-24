-- M3-16: platform service bills (separate rail from payment_orders).
-- Amounts are USD major-unit decimal strings. Never skimmed from on-chain payments.

CREATE TABLE IF NOT EXISTS service_bills (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  UUID NOT NULL REFERENCES org_accounts (id) ON DELETE RESTRICT,
  period_start            DATE NOT NULL,
  period_end              DATE NOT NULL,
  subscription_amount     TEXT NOT NULL,
  volume_fee_amount       TEXT NOT NULL,
  total_amount            TEXT NOT NULL,
  currency                TEXT NOT NULL DEFAULT 'USD'
                            CHECK (currency = 'USD'),
  status                  TEXT NOT NULL
                            CHECK (status IN ('issued', 'paid', 'overdue', 'voided')),
  due_at                  TIMESTAMPTZ NOT NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT service_bills_period_ok CHECK (period_end >= period_start)
);

CREATE INDEX IF NOT EXISTS service_bills_org_id_status_idx
  ON service_bills (org_id, status);

CREATE INDEX IF NOT EXISTS service_bills_due_at_idx
  ON service_bills (due_at);
