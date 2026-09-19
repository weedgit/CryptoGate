-- Org brand mark for agent/merchant portals (preset icon key; null = initials).

ALTER TABLE org_accounts
  ADD COLUMN IF NOT EXISTS icon_key TEXT;
