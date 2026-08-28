-- Allow manual delivery resend: same event_id, new delivery id.
-- Fan-out idempotency is enforced in enqueueWebhookDelivery (first row wins).
DROP INDEX IF EXISTS webhook_deliveries_webhook_event_uidx;
