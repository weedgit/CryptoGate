-- B2: org account lifecycle (pause / resume). Soft operational gate — not custody.
ALTER TABLE org_accounts
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused'));

CREATE INDEX IF NOT EXISTS org_accounts_status_idx ON org_accounts (status);
