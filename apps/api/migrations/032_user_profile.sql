-- A10 personal profile — display name + locale prefs (email stays login identity).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS locale TEXT NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC';

COMMENT ON COLUMN users.display_name IS 'Optional display name for portals (A10)';
COMMENT ON COLUMN users.locale IS 'UI language preference BCP 47 (A10)';
COMMENT ON COLUMN users.timezone IS 'IANA timezone for dates (A10)';
