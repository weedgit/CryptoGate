-- X-04: merchant (site) inherit + Owner approval for overrides.
-- Sites use parent merchant settlement / xPub / matching / retention until
-- the parent merchant Owner approves a site-level override.

CREATE TABLE IF NOT EXISTS merchant_retention_settings (
  org_id              UUID PRIMARY KEY REFERENCES org_accounts (id) ON DELETE CASCADE,
  order_delete_days   INTEGER NOT NULL
                        CHECK (order_delete_days >= 7 AND order_delete_days <= 3650),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS site_setting_overrides (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_org_id     UUID NOT NULL REFERENCES org_accounts (id) ON DELETE CASCADE,
  parent_org_id   UUID NOT NULL REFERENCES org_accounts (id) ON DELETE CASCADE,
  setting_kind    TEXT NOT NULL
                    CHECK (setting_kind IN (
                      'settlement',
                      'xpub',
                      'matching_mode',
                      'order_retention'
                    )),
  status          TEXT NOT NULL
                    CHECK (status IN ('pending', 'approved', 'denied')),
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  requested_by    UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  decided_by      UUID REFERENCES users (id) ON DELETE RESTRICT,
  decided_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS site_setting_overrides_pending_kind_idx
  ON site_setting_overrides (site_org_id, setting_kind)
  WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS site_setting_overrides_approved_kind_idx
  ON site_setting_overrides (site_org_id, setting_kind)
  WHERE status = 'approved';

CREATE INDEX IF NOT EXISTS site_setting_overrides_parent_status_idx
  ON site_setting_overrides (parent_org_id, status, created_at DESC);
