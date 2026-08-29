-- Phase 1 invoice snapshots: freeze tier / rate / billed volume at issue.
-- payment_reference + created_at already exist; exposed via API mapper.

ALTER TABLE service_bills
  ADD COLUMN IF NOT EXISTS tier TEXT,
  ADD COLUMN IF NOT EXISTS volume_fee_percent TEXT,
  ADD COLUMN IF NOT EXISTS billed_volume_usd TEXT;

ALTER TABLE service_bills
  DROP CONSTRAINT IF EXISTS service_bills_tier_chk;

ALTER TABLE service_bills
  ADD CONSTRAINT service_bills_tier_chk CHECK (
    tier IS NULL OR tier IN ('small', 'mid', 'enterprise')
  );
