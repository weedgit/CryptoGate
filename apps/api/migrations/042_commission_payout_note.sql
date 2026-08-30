-- Optional ops note when confirming a commission payout (USDT-TRON remittance).
ALTER TABLE commission_payouts
  ADD COLUMN IF NOT EXISTS note TEXT;
