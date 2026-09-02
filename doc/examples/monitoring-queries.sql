-- PaymentGate ops monitoring queries (M4-03)
-- Run against the environment Postgres (read-only role recommended).
-- Tune thresholds in your alert tool; values below match doc/M4-03-Backup-Monitoring.md.

-- Webhook deliveries stuck pending (P2 alert candidate)
SELECT COUNT(*) AS pending_stale
FROM webhook_deliveries
WHERE status = 'pending'
  AND next_retry_at < now() - interval '15 minutes';

-- Pending backlog detail (on-call triage)
SELECT d.id,
       d.webhook_id,
       d.event_type,
       d.attempt,
       d.next_retry_at,
       d.created_at
FROM webhook_deliveries d
WHERE d.status = 'pending'
  AND d.next_retry_at < now() - interval '15 minutes'
ORDER BY d.next_retry_at ASC
LIMIT 50;

-- Failed deliveries in last hour (P3 trend)
SELECT COUNT(*) AS failed_last_hour
FROM webhook_deliveries
WHERE status = 'failed'
  AND updated_at >= now() - interval '1 hour';

-- Open payment orders (sanity after restore)
SELECT status, COUNT(*) AS n
FROM payment_orders
WHERE status IN ('pending_payment', 'verifying', 'payment_anomaly')
GROUP BY status
ORDER BY status;

-- Orders past expiry still pending_payment (expiry job check)
SELECT id, status, expires_at
FROM payment_orders
WHERE status = 'pending_payment'
  AND expires_at < now()
ORDER BY expires_at ASC
LIMIT 20;

-- Recent audit activity (should not drop to zero in prod during business hours)
SELECT date_trunc('hour', created_at) AS hour, COUNT(*) AS events
FROM audit_log
WHERE created_at >= now() - interval '24 hours'
GROUP BY 1
ORDER BY 1 DESC;
