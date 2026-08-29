-- Staff resolution of payment anomalies (manual reconcile note — not Mark paid).

ALTER TABLE payment_orders
  ADD COLUMN IF NOT EXISTS anomaly_resolution_note TEXT,
  ADD COLUMN IF NOT EXISTS anomaly_resolved_at TIMESTAMPTZ;
