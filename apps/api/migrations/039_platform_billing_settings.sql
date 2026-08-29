-- B11-lite: platform invoice seller identity + service-bill remittance payTo.

CREATE TABLE IF NOT EXISTS platform_billing_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  seller_name TEXT NOT NULL DEFAULT 'CryptoGate',
  seller_email TEXT,
  pay_to TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO platform_billing_settings (id, seller_name, seller_email, pay_to)
VALUES (1, 'CryptoGate', NULL, NULL)
ON CONFLICT (id) DO NOTHING;
