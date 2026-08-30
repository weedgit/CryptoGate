-- Commission remittance lifecycle: ready → verifying → paid
ALTER TABLE commission_payouts
  DROP CONSTRAINT IF EXISTS commission_payouts_payout_status_check;

ALTER TABLE commission_payouts
  ADD CONSTRAINT commission_payouts_payout_status_check
  CHECK (payout_status IN ('ready', 'verifying', 'paid'));
