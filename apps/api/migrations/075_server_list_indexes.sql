-- Server-side paging / sorting / counts for Service Bills, Commissions and Audit.

-- Service bills: scoped lists sort by due date; window filter also matches created_at.
CREATE INDEX IF NOT EXISTS service_bills_org_due_at_idx
  ON service_bills (org_id, due_at DESC);

CREATE INDEX IF NOT EXISTS service_bills_status_due_at_idx
  ON service_bills (status, due_at DESC);

CREATE INDEX IF NOT EXISTS service_bills_created_at_idx
  ON service_bills (created_at DESC);

-- Commission payouts: default order is period_key DESC, updated_at DESC.
CREATE INDEX IF NOT EXISTS commission_payouts_payer_period_idx
  ON commission_payouts (payer, period_key DESC, updated_at DESC);

CREATE INDEX IF NOT EXISTS commission_payouts_payee_period_idx
  ON commission_payouts (payee_org_id, period_key DESC);

-- Audit: org-filtered pages and totals over a date range.
CREATE INDEX IF NOT EXISTS audit_log_org_created_at_idx
  ON audit_log (org_id, created_at DESC);
