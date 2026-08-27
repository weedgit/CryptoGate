-- Membership lifecycle: active | paused. Delete removes the row (soft pause only).

ALTER TABLE org_memberships
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused'));

CREATE INDEX IF NOT EXISTS org_memberships_org_id_status_idx
  ON org_memberships (org_id, status);
