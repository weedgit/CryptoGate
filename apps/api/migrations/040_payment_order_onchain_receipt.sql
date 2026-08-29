-- On-chain receipt fields: payer address + settlement confirmation time.
-- Watcher writes these; API exposes via OnChainDetails / PaymentDetails.

ALTER TABLE payment_orders
  ADD COLUMN IF NOT EXISTS from_address TEXT,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

-- Best-effort backfill for already-settled orders (no invented payer address).
UPDATE payment_orders
SET confirmed_at = updated_at
WHERE confirmed_at IS NULL
  AND status IN ('completed', 'confirmed')
  AND tx_hash IS NOT NULL;
