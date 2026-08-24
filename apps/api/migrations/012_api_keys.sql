-- M3-10: machine API keys + HMAC nonce replay window.
-- X-Api-Key is the public key_id. secret is the HMAC key — never log or return it.
-- Key CRUD / rotation UI is M4-11; provision rows via DB/admin for M3.

CREATE TABLE IF NOT EXISTS api_keys (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES org_accounts (id) ON DELETE RESTRICT,
  user_id     UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  key_id      TEXT NOT NULL,
  secret      TEXT NOT NULL,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT api_keys_key_id_unique UNIQUE (key_id),
  CONSTRAINT api_keys_key_id_len CHECK (char_length(key_id) BETWEEN 8 AND 128),
  CONSTRAINT api_keys_secret_len CHECK (char_length(secret) >= 16)
);

CREATE INDEX IF NOT EXISTS api_keys_org_id_idx ON api_keys (org_id)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS api_signing_nonces (
  api_key_id  UUID NOT NULL REFERENCES api_keys (id) ON DELETE CASCADE,
  nonce       TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (api_key_id, nonce)
);

CREATE INDEX IF NOT EXISTS api_signing_nonces_expires_at_idx
  ON api_signing_nonces (expires_at);
