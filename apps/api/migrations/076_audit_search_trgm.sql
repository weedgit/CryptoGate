-- Trigram indexes for audit free-text search (GET /v1/audit?q=, /v1/audit/export?q=).
-- ILIKE '%term%' can use these; users/org_accounts are searched first and their ids
-- are matched against audit_log via the existing btree indexes.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS audit_log_action_trgm_idx
  ON audit_log USING gin (action gin_trgm_ops);

CREATE INDEX IF NOT EXISTS audit_log_metadata_trgm_idx
  ON audit_log USING gin ((metadata::text) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS users_email_trgm_idx
  ON users USING gin (email gin_trgm_ops);

CREATE INDEX IF NOT EXISTS users_display_name_trgm_idx
  ON users USING gin (display_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS org_accounts_name_trgm_idx
  ON org_accounts USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS org_accounts_legal_name_trgm_idx
  ON org_accounts USING gin (legal_name gin_trgm_ops);
