-- Snapshot remittance addresses when a service bill is marked paid.
-- payment_reference remains the tx hash / bank ref (Phase 1 receipt).

ALTER TABLE service_bills
  ADD COLUMN IF NOT EXISTS rx_address TEXT,
  ADD COLUMN IF NOT EXISTS tx_address TEXT;
