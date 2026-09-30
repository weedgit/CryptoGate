-- Requested payment window, kept so a re-quote can re-open the same window
-- (capped by the new quote lock) instead of only ever shortening expires_at.

ALTER TABLE payment_orders
  ADD COLUMN IF NOT EXISTS validity_seconds INTEGER
    CHECK (validity_seconds IS NULL OR validity_seconds > 0);
