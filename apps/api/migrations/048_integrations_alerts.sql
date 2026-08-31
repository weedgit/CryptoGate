-- D14: API key scope + IP allowlist; D15: notification preferences; webhook secret rotate support.

ALTER TABLE api_keys
  ADD COLUMN IF NOT EXISTS scopes TEXT[] NOT NULL DEFAULT ARRAY['orders', 'webhooks']::text[],
  ADD COLUMN IF NOT EXISTS ip_allowlist TEXT[] NOT NULL DEFAULT ARRAY[]::text[];

UPDATE api_keys
SET scopes = ARRAY['orders', 'webhooks']::text[]
WHERE scopes IS NULL OR cardinality(scopes) = 0;

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id    UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  org_id     UUID NOT NULL REFERENCES org_accounts (id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  email      BOOLEAN NOT NULL DEFAULT true,
  in_app     BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, org_id, event_type),
  CONSTRAINT notification_preferences_event_len
    CHECK (char_length(event_type) BETWEEN 1 AND 64)
);

CREATE INDEX IF NOT EXISTS notification_preferences_org_id_idx
  ON notification_preferences (org_id);
