-- Phase 1: drop agent_sub org type and agent→sub commission cascade.
-- Platform → agent invoices only: issued → paid → settled.
-- Payment-order verifying is unchanged.

-- Safety: remove any leftover cascade slips / orphan statuses.
DELETE FROM commission_payouts WHERE payer = 'agent';

UPDATE commission_payouts
   SET payout_status = 'issued'
 WHERE payout_status = 'ready';

UPDATE commission_payouts
   SET payout_status = 'paid'
 WHERE payout_status = 'verifying';

-- Narrow payer to platform only (payer_org_id stays NULL).
ALTER TABLE commission_payouts
  DROP CONSTRAINT IF EXISTS commission_payouts_payer_org_chk;

ALTER TABLE commission_payouts
  DROP CONSTRAINT IF EXISTS commission_payouts_payer_check;

ALTER TABLE commission_payouts
  ADD CONSTRAINT commission_payouts_payer_check
  CHECK (payer = 'platform');

ALTER TABLE commission_payouts
  ADD CONSTRAINT commission_payouts_payer_org_chk
  CHECK (payer = 'platform' AND payer_org_id IS NULL);

ALTER TABLE commission_payouts
  DROP CONSTRAINT IF EXISTS commission_payouts_payout_status_check;

ALTER TABLE commission_payouts
  ADD CONSTRAINT commission_payouts_payout_status_check
  CHECK (payout_status IN ('issued', 'paid', 'settled'));

-- Drop agent_sub from org_accounts.type (rows must already be cleared).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM org_accounts WHERE type = 'agent_sub' LIMIT 1
  ) THEN
    RAISE EXCEPTION
      'org_accounts still has agent_sub rows — run scripts/clear-phase1-nested-orgs.mjs first';
  END IF;
END $$;

ALTER TABLE org_accounts
  DROP CONSTRAINT IF EXISTS org_accounts_type_check;

ALTER TABLE org_accounts
  ADD CONSTRAINT org_accounts_type_check
  CHECK (
    type IN (
      'platform',
      'agent',
      'merchant',
      'merchant_site'
    )
  );
