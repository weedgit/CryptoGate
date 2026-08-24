-- X-01 / OpenAPI v0.3.3: platform fee tiers, merchant commercial, enterprise approvals.

CREATE TABLE IF NOT EXISTS platform_fee_tiers (
  tier                      TEXT PRIMARY KEY
                              CHECK (tier IN ('small', 'mid', 'enterprise')),
  subscription_amount_usd   TEXT NOT NULL,
  volume_fee_min_percent    TEXT NOT NULL,
  volume_fee_max_percent    TEXT NOT NULL,
  default_signup_percent    TEXT NOT NULL,
  tier_description          TEXT,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO platform_fee_tiers (
  tier,
  subscription_amount_usd,
  volume_fee_min_percent,
  volume_fee_max_percent,
  default_signup_percent,
  tier_description
) VALUES
  ('small', '49.00', '1.2', '2.0', '2.0', NULL),
  ('mid', '199.00', '0.8', '1.5', '1.2', NULL),
  ('enterprise', '0.00', '0.5', '1.0', '0.8', NULL)
ON CONFLICT (tier) DO NOTHING;

CREATE TABLE IF NOT EXISTS merchant_commercial (
  org_id                        UUID PRIMARY KEY
                                  REFERENCES org_accounts (id) ON DELETE CASCADE,
  tier                          TEXT NOT NULL
                                  CHECK (tier IN ('small', 'mid', 'enterprise')),
  volume_fee_percent            TEXT NOT NULL,
  pending_volume_fee_percent    TEXT,
  pending_tier                  TEXT
                                  CHECK (pending_tier IS NULL OR pending_tier IN ('small', 'mid', 'enterprise')),
  effective_from                DATE NOT NULL,
  pending_effective_from        DATE,
  enterprise_approval_status    TEXT
                                  CHECK (
                                    enterprise_approval_status IS NULL
                                    OR enterprise_approval_status IN ('pending', 'approved', 'denied')
                                  ),
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS merchant_commercial_tier_idx
  ON merchant_commercial (tier);

CREATE TABLE IF NOT EXISTS enterprise_rate_approvals (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                        UUID NOT NULL REFERENCES org_accounts (id) ON DELETE CASCADE,
  requested_tier                TEXT NOT NULL
                                  CHECK (requested_tier IN ('small', 'mid', 'enterprise')),
  requested_volume_fee_percent  TEXT NOT NULL,
  status                        TEXT NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('pending', 'approved', 'denied')),
  requested_by_user_id          UUID REFERENCES users (id) ON DELETE SET NULL,
  decided_by_user_id            UUID REFERENCES users (id) ON DELETE SET NULL,
  decision_reason               TEXT,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at                    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS enterprise_rate_approvals_status_created_idx
  ON enterprise_rate_approvals (status, created_at DESC);
