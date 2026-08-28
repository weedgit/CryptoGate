-- Commission payout slips (platform→agent and agent→sub). Immutable history.
CREATE TABLE IF NOT EXISTS commission_payouts (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payee_org_id            UUID NOT NULL REFERENCES org_accounts (id),
  payee_name              TEXT NOT NULL,
  payer                   TEXT NOT NULL CHECK (payer IN ('platform', 'agent')),
  payer_org_id            UUID REFERENCES org_accounts (id),
  period_key              TEXT NOT NULL,
  period_label            TEXT NOT NULL,
  platform_fee_collected  NUMERIC(18, 2) NOT NULL DEFAULT 0,
  commission_percent      TEXT NOT NULL,
  commission_amount       NUMERIC(18, 2) NOT NULL,
  payout_status           TEXT NOT NULL CHECK (payout_status IN ('ready', 'paid')),
  payout_address          TEXT,
  asset                   TEXT,
  network                 TEXT,
  payment_link            TEXT NOT NULL,
  tx_ref                  TEXT,
  paid_at                 TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT commission_payouts_payer_org_chk
    CHECK (
      (payer = 'platform' AND payer_org_id IS NULL)
      OR (payer = 'agent' AND payer_org_id IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS commission_payouts_platform_uniq
  ON commission_payouts (payee_org_id, period_key)
  WHERE payer = 'platform';

CREATE UNIQUE INDEX IF NOT EXISTS commission_payouts_agent_uniq
  ON commission_payouts (payer_org_id, payee_org_id, period_key)
  WHERE payer = 'agent';

CREATE INDEX IF NOT EXISTS commission_payouts_payer_idx
  ON commission_payouts (payer, updated_at DESC);
CREATE INDEX IF NOT EXISTS commission_payouts_payee_idx
  ON commission_payouts (payee_org_id);
CREATE INDEX IF NOT EXISTS commission_payouts_payer_org_idx
  ON commission_payouts (payer_org_id)
  WHERE payer_org_id IS NOT NULL;

-- Agent payout address cool-down (same bar as settlement).
ALTER TABLE agent_payout_addresses
  ADD COLUMN IF NOT EXISTS pending_address TEXT,
  ADD COLUMN IF NOT EXISTS pending_activates_at TIMESTAMPTZ;

-- Mode B underpay tolerance (major units). Mode C must stay 0 or < amountStep.
ALTER TABLE merchant_matching_settings
  ADD COLUMN IF NOT EXISTS underpay_tolerance TEXT NOT NULL DEFAULT '0';

-- Lock underpay onto the order at create (watcher reads it; mode changes don't rewrite).
ALTER TABLE payment_orders
  ADD COLUMN IF NOT EXISTS underpay_tolerance TEXT NOT NULL DEFAULT '0';
