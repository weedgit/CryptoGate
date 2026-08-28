-- Persist matching / confirmation anomaly reason for merchant + guest UX.
ALTER TABLE payment_orders
  ADD COLUMN IF NOT EXISTS anomaly_reason TEXT;
