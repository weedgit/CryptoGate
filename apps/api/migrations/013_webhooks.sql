-- M3-13: merchant webhook endpoints. signing_secret never returned on GET.
-- Deliveries table seeds M3-14 worker (test enqueue writes pending rows).

CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES org_accounts (id) ON DELETE RESTRICT,
  url             TEXT NOT NULL,
  events          TEXT[] NOT NULL,
  signing_secret  TEXT NOT NULL,
  enabled         BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  disabled_at     TIMESTAMPTZ,
  CONSTRAINT webhook_endpoints_secret_len CHECK (char_length(signing_secret) >= 32),
  CONSTRAINT webhook_endpoints_url_nonempty CHECK (char_length(url) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS webhook_endpoints_org_url_active_idx
  ON webhook_endpoints (org_id, url)
  WHERE enabled = true;

CREATE INDEX IF NOT EXISTS webhook_endpoints_org_id_idx
  ON webhook_endpoints (org_id)
  WHERE enabled = true;

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id      UUID NOT NULL REFERENCES webhook_endpoints (id) ON DELETE CASCADE,
  event_id        UUID NOT NULL,
  event_type      TEXT NOT NULL,
  payload         JSONB NOT NULL,
  status          TEXT NOT NULL
                    CHECK (status IN ('pending', 'success', 'failed')),
  attempt         INTEGER NOT NULL DEFAULT 1 CHECK (attempt >= 1),
  http_status     INTEGER,
  next_retry_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS webhook_deliveries_webhook_id_created_idx
  ON webhook_deliveries (webhook_id, created_at DESC);

CREATE INDEX IF NOT EXISTS webhook_deliveries_pending_idx
  ON webhook_deliveries (status, next_retry_at)
  WHERE status = 'pending';
