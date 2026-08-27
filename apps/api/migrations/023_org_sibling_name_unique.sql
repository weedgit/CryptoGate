-- Sibling org names under the same parent (case-insensitive, trimmed).
-- Different parents may reuse the same display name.
-- Platform rows (parent_id IS NULL) are excluded; one-platform index already applies.

CREATE UNIQUE INDEX IF NOT EXISTS org_accounts_parent_name_ci_uidx
  ON org_accounts (parent_id, lower(btrim(name)))
  WHERE parent_id IS NOT NULL;
