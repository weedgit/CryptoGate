-- M4-11: API key CRUD metadata (label, last_used_at, expires_at).

ALTER TABLE api_keys
  ADD COLUMN IF NOT EXISTS label TEXT,
  ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

UPDATE api_keys
SET label = 'default'
WHERE label IS NULL OR label = '';

ALTER TABLE api_keys
  ALTER COLUMN label SET NOT NULL;

ALTER TABLE api_keys
  DROP CONSTRAINT IF EXISTS api_keys_label_len;

ALTER TABLE api_keys
  ADD CONSTRAINT api_keys_label_len
  CHECK (char_length(label) BETWEEN 1 AND 64);
