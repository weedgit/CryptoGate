-- Order channel (web / POS app / API key) + merchant POS policy.
-- created_via is client-declared for sessions (X-PaymentGate-Client) and set
-- server-side for API keys; NULL = unknown (older POS builds, pre-migration rows).

ALTER TABLE payment_orders
  ADD COLUMN IF NOT EXISTS created_via TEXT NULL
    CHECK (created_via IN ('web', 'pos', 'api'));

UPDATE payment_orders
SET created_via = 'web'
WHERE created_via IS NULL
  AND idempotency_key LIKE 'web-%';

CREATE INDEX IF NOT EXISTS payment_orders_created_via_idx
  ON payment_orders (org_id, created_via, created_at DESC);

-- Merchant-owned; sites inherit (settingsLookupOrgId). Missing row = defaults.
CREATE TABLE IF NOT EXISTS merchant_pos_settings (
  org_id              UUID PRIMARY KEY REFERENCES org_accounts (id) ON DELETE CASCADE,
  cashier_web_orders  BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
