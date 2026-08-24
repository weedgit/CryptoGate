-- M3-14: persist exact JSON bytes for outbound HMAC (jsonb key order is unstable).

ALTER TABLE webhook_deliveries
  ADD COLUMN IF NOT EXISTS body_raw TEXT;

UPDATE webhook_deliveries
SET body_raw = payload::text
WHERE body_raw IS NULL;

ALTER TABLE webhook_deliveries
  ALTER COLUMN body_raw SET NOT NULL;
