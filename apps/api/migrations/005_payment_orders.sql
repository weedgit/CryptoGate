-- M1-19 / M2-10: payment orders. Column names match @paymentgate/domain PaymentOrderColumn.
-- Status / matching enums match domain + Watcher-Order-Status-Contract.md.
-- Amounts are major-unit decimal strings (no float). Watcher owns tx_hash / received_amount.

CREATE SEQUENCE IF NOT EXISTS payment_orders_order_number_seq;

CREATE TABLE IF NOT EXISTS payment_orders (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  UUID NOT NULL REFERENCES org_accounts (id) ON DELETE RESTRICT,
  created_by              UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  order_number            TEXT NOT NULL,
  status                  TEXT NOT NULL
                            CHECK (status IN (
                              'pending_payment',
                              'verifying',
                              'confirmed',
                              'completed',
                              'expired',
                              'payment_anomaly',
                              'failed',
                              'cancelled'
                            )),
  matching_mode           TEXT NOT NULL
                            CHECK (matching_mode IN ('B', 'C', 'D', 'S')),
  payable_amount          TEXT NOT NULL,
  received_amount         TEXT,
  receive_address         TEXT NOT NULL,
  address_source          TEXT NOT NULL
                            CHECK (address_source IN ('main', 'hd_pool')),
  hd_index                INTEGER,
  memo_or_tag             TEXT,
  asset                   TEXT NOT NULL,
  network                 TEXT NOT NULL,
  expires_at              TIMESTAMPTZ NOT NULL,
  tx_hash                 TEXT,
  confirmations           INTEGER NOT NULL DEFAULT 0
                            CHECK (confirmations >= 0),
  required_confirmations  INTEGER NOT NULL
                            CHECK (required_confirmations >= 0),
  idempotency_key         TEXT NOT NULL,
  idempotency_body_hash   TEXT NOT NULL,
  merchant_metadata       JSONB,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payment_orders_order_number_unique UNIQUE (order_number),
  CONSTRAINT payment_orders_org_idempotency_unique UNIQUE (org_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS payment_orders_org_id_status_idx
  ON payment_orders (org_id, status);

CREATE INDEX IF NOT EXISTS payment_orders_status_expires_at_idx
  ON payment_orders (status, expires_at);

CREATE UNIQUE INDEX IF NOT EXISTS payment_orders_network_tx_hash_idx
  ON payment_orders (network, tx_hash)
  WHERE tx_hash IS NOT NULL;
