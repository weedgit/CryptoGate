-- Person profile: first + last name (Business-Model decision 13 / 6a).
-- Keep display_name for backward compatibility; prefer first_name + last_name.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT;

COMMENT ON COLUMN users.first_name IS 'Person given name (A10 / activity gate)';
COMMENT ON COLUMN users.last_name IS 'Person family name (A10 / activity gate)';

-- Best-effort split of legacy display_name into first_name (full string) when empty.
UPDATE users
SET first_name = NULLIF(btrim(display_name), '')
WHERE first_name IS NULL
  AND display_name IS NOT NULL
  AND btrim(display_name) <> '';
