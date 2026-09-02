-- Append-only audit_log cannot accept UPDATE from org_accounts ON DELETE SET NULL.
-- Keep historical org_id values; drop FK so org delete does not mutate audit rows.

ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_org_id_fkey;
