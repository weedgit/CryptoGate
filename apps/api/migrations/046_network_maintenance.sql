-- B16: per-network maintenance windows (deposit pause).
-- Platform O/A toggle; create-order returns 422 while active.

CREATE TABLE IF NOT EXISTS network_maintenance (
  network              TEXT PRIMARY KEY,
  active               BOOLEAN NOT NULL DEFAULT false,
  message              TEXT NULL,
  started_at           TIMESTAMPTZ NULL,
  ends_at              TIMESTAMPTZ NULL,
  updated_by_user_id   UUID NULL REFERENCES users (id) ON DELETE SET NULL,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT network_maintenance_message_len
    CHECK (message IS NULL OR char_length(message) <= 500)
);

CREATE INDEX IF NOT EXISTS network_maintenance_active_idx
  ON network_maintenance (active)
  WHERE active = true;
