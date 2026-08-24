-- Fan-out payment_order.* webhooks without watcher importing apps/api.
-- Trigger writes outbox on insert/status change; API worker drains → deliveries.

CREATE TABLE IF NOT EXISTS payment_order_webhook_outbox (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL REFERENCES payment_orders (id) ON DELETE CASCADE,
  org_id          UUID NOT NULL REFERENCES org_accounts (id) ON DELETE RESTRICT,
  event_id        UUID NOT NULL DEFAULT gen_random_uuid(),
  event_type      TEXT NOT NULL,
  order_number    TEXT NOT NULL,
  order_status    TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at    TIMESTAMPTZ,
  CONSTRAINT payment_order_webhook_outbox_order_event_unique
    UNIQUE (order_id, event_type)
);

CREATE INDEX IF NOT EXISTS payment_order_webhook_outbox_pending_idx
  ON payment_order_webhook_outbox (created_at ASC)
  WHERE processed_at IS NULL;

-- Same event_id to the same endpoint must not double-queue (retry-safe fan-out).
CREATE UNIQUE INDEX IF NOT EXISTS webhook_deliveries_webhook_event_uidx
  ON webhook_deliveries (webhook_id, event_id);

CREATE OR REPLACE FUNCTION cg_enqueue_payment_order_webhook()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  ev TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'pending_payment' THEN
      ev := 'payment_order.created';
    ELSE
      ev := CASE NEW.status
        WHEN 'verifying' THEN 'payment_order.verifying'
        WHEN 'completed' THEN 'payment_order.completed'
        WHEN 'expired' THEN 'payment_order.expired'
        WHEN 'payment_anomaly' THEN 'payment_order.payment_anomaly'
        WHEN 'failed' THEN 'payment_order.failed'
        ELSE NULL
      END;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
      RETURN NEW;
    END IF;
    ev := CASE NEW.status
      WHEN 'verifying' THEN 'payment_order.verifying'
      WHEN 'completed' THEN 'payment_order.completed'
      WHEN 'expired' THEN 'payment_order.expired'
      WHEN 'payment_anomaly' THEN 'payment_order.payment_anomaly'
      WHEN 'failed' THEN 'payment_order.failed'
      ELSE NULL
    END;
  ELSE
    RETURN NEW;
  END IF;

  IF ev IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO payment_order_webhook_outbox (
    order_id, org_id, event_type, order_number, order_status
  ) VALUES (
    NEW.id, NEW.org_id, ev, NEW.order_number, NEW.status
  )
  ON CONFLICT (order_id, event_type) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payment_orders_webhook_outbox_ins ON payment_orders;
CREATE TRIGGER payment_orders_webhook_outbox_ins
  AFTER INSERT ON payment_orders
  FOR EACH ROW
  EXECUTE PROCEDURE cg_enqueue_payment_order_webhook();

DROP TRIGGER IF EXISTS payment_orders_webhook_outbox_upd ON payment_orders;
CREATE TRIGGER payment_orders_webhook_outbox_upd
  AFTER UPDATE OF status ON payment_orders
  FOR EACH ROW
  EXECUTE PROCEDURE cg_enqueue_payment_order_webhook();
