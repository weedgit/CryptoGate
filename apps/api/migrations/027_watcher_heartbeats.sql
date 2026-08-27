-- Watcher per-network heartbeat (watch-only ingest status for System health B17).
-- Written by apps/watcher each tick; read by API GET /v1/platform/watcher-health.

CREATE TABLE IF NOT EXISTS watcher_heartbeats (
  network                 TEXT PRIMARY KEY,
  asset                   TEXT NOT NULL,
  tick                    INTEGER NOT NULL,
  status                  TEXT NOT NULL
                            CHECK (status IN ('ok', 'degraded', 'down', 'unknown')),
  health_score            INTEGER NOT NULL
                            CHECK (health_score >= 0 AND health_score <= 100),
  rpc_ok                  BOOLEAN NOT NULL,
  rpc_mode                TEXT NOT NULL,
  ingest_mode             TEXT NOT NULL,
  poll_interval_ms        INTEGER NOT NULL,
  open_orders             INTEGER NOT NULL DEFAULT 0,
  awaiting_confirmations  INTEGER NOT NULL DEFAULT 0,
  transfers_seen          INTEGER NOT NULL DEFAULT 0,
  last_error              TEXT NULL,
  detail                  JSONB NOT NULL DEFAULT '{}'::jsonb,
  tick_at                 TIMESTAMPTZ NOT NULL,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS watcher_heartbeats_updated_at_idx
  ON watcher_heartbeats (updated_at DESC);
