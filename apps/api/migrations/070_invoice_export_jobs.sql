-- Async invoice CSV export jobs (Invoice v1.1).

CREATE TABLE IF NOT EXISTS invoice_export_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by  UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  filters       JSONB NOT NULL DEFAULT '{}'::jsonb,
  list_query    JSONB NOT NULL DEFAULT '{}'::jsonb,
  status        TEXT NOT NULL
                CHECK (status IN ('queued', 'running', 'ready', 'failed', 'expired')),
  total_rows    INT,
  file_name     TEXT,
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  ready_at      TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours')
);

CREATE INDEX IF NOT EXISTS invoice_export_jobs_queued_idx
  ON invoice_export_jobs (created_at ASC)
  WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS invoice_export_jobs_requested_by_idx
  ON invoice_export_jobs (requested_by, created_at DESC);

CREATE INDEX IF NOT EXISTS invoice_export_jobs_expires_idx
  ON invoice_export_jobs (expires_at)
  WHERE status IN ('ready', 'failed');
