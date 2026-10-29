-- M15 (review 2026-10-29): agents (and merchant managers for sites) could lift suspensions the
-- platform imposed — overdue service bills, compliance holds, platform staff pauses — because
-- nothing recorded who paused the account.
ALTER TABLE org_accounts
  ADD COLUMN IF NOT EXISTS status_set_by_platform BOOLEAN NOT NULL DEFAULT false;

-- Existing platform-imposed pauses: overdue bills and compliance suspensions.
UPDATE org_accounts o
SET status_set_by_platform = true
WHERE o.status = 'paused'
  AND (
    o.status_reason_bill_id IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM compliance_overrides c
      WHERE c.org_id = o.id AND c.override_type = 'suspend_merchant'
        AND c.created_at = (SELECT max(c2.created_at) FROM compliance_overrides c2 WHERE c2.org_id = o.id)
    )
  );
