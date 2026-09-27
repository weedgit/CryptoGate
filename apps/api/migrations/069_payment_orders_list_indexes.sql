-- Invoice list filters: status/created_at, creator, global created_at sorts.

CREATE INDEX IF NOT EXISTS payment_orders_created_at_idx
  ON payment_orders (created_at DESC);

CREATE INDEX IF NOT EXISTS payment_orders_status_created_at_idx
  ON payment_orders (status, created_at DESC);

CREATE INDEX IF NOT EXISTS payment_orders_created_by_created_at_idx
  ON payment_orders (created_by, created_at DESC)
  WHERE created_by IS NOT NULL;
