-- Persist signed adjustment delta on service bills for invoice face.

ALTER TABLE service_bills
  ADD COLUMN IF NOT EXISTS last_adjustment_amount TEXT;
