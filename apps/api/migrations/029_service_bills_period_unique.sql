-- One active service bill per merchant per billing period (voided may be re-issued).
DELETE FROM service_bills a
  USING service_bills b
 WHERE a.status <> 'voided'
   AND b.status <> 'voided'
   AND a.org_id = b.org_id
   AND a.period_start = b.period_start
   AND a.id > b.id;

CREATE UNIQUE INDEX IF NOT EXISTS service_bills_org_period_active_uidx
  ON service_bills (org_id, period_start)
  WHERE status <> 'voided';
