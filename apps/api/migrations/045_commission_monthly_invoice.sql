-- Monthly commission invoices (platform → agent):
-- issued (month-end) → paid (ops remitted) → settled (agent confirmed → history)
-- Agent → sub keeps ready | verifying | paid.

ALTER TABLE commission_payouts
  ADD COLUMN IF NOT EXISTS tree_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS agent_confirmed_by UUID REFERENCES users (id);

ALTER TABLE commission_payouts
  DROP CONSTRAINT IF EXISTS commission_payouts_payout_status_check;

-- Migrate platform slips onto the invoice lifecycle (order matters).
UPDATE commission_payouts
   SET payout_status = 'settled',
       settled_at = COALESCE(settled_at, paid_at, updated_at)
 WHERE payer = 'platform'
   AND payout_status = 'paid';

UPDATE commission_payouts
   SET payout_status = 'paid'
 WHERE payer = 'platform'
   AND payout_status = 'verifying';

UPDATE commission_payouts
   SET payout_status = 'issued'
 WHERE payer = 'platform'
   AND payout_status = 'ready';

ALTER TABLE commission_payouts
  ADD CONSTRAINT commission_payouts_payout_status_check
  CHECK (
    payout_status IN (
      'issued',
      'ready',
      'verifying',
      'paid',
      'settled'
    )
  );
