-- Remove merchant structure (single_location / multi_location).
-- Sites may exist under any merchant; structure is no longer a domain concept.

ALTER TABLE org_accounts
  DROP CONSTRAINT IF EXISTS org_accounts_structure_merchant;

ALTER TABLE org_accounts
  DROP COLUMN IF EXISTS structure;
