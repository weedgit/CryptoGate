-- Automatic volume→tier schedules + fixed overrides (merchant fees & agent commissions).
-- Platform fee tiers gain volume breakpoints, per-tier agent commission %, and deferred schedule columns.
-- Orgs gain rate_mode: automatic (follow schedule) | fixed (operator override).

ALTER TABLE platform_fee_tiers
  ADD COLUMN IF NOT EXISTS volume_min_usd TEXT NOT NULL DEFAULT '0',
  ADD COLUMN IF NOT EXISTS volume_max_usd TEXT,
  ADD COLUMN IF NOT EXISTS agent_commission_percent TEXT NOT NULL DEFAULT '15',
  ADD COLUMN IF NOT EXISTS pending_subscription_amount_usd TEXT,
  ADD COLUMN IF NOT EXISTS pending_volume_fee_min_percent TEXT,
  ADD COLUMN IF NOT EXISTS pending_volume_fee_max_percent TEXT,
  ADD COLUMN IF NOT EXISTS pending_default_signup_percent TEXT,
  ADD COLUMN IF NOT EXISTS pending_agent_commission_percent TEXT,
  ADD COLUMN IF NOT EXISTS pending_volume_min_usd TEXT,
  ADD COLUMN IF NOT EXISTS pending_volume_max_usd TEXT,
  ADD COLUMN IF NOT EXISTS pending_tier_description TEXT,
  ADD COLUMN IF NOT EXISTS pending_effective_from DATE;

UPDATE platform_fee_tiers SET
  volume_min_usd = CASE tier
    WHEN 'small' THEN '0'
    WHEN 'mid' THEN '50000'
    WHEN 'enterprise' THEN '500000'
    ELSE volume_min_usd
  END,
  volume_max_usd = CASE tier
    WHEN 'small' THEN '50000'
    WHEN 'mid' THEN '500000'
    WHEN 'enterprise' THEN NULL
    ELSE volume_max_usd
  END,
  agent_commission_percent = CASE tier
    WHEN 'small' THEN '15'
    WHEN 'mid' THEN '18'
    WHEN 'enterprise' THEN '20'
    ELSE agent_commission_percent
  END
WHERE true;

ALTER TABLE merchant_commercial
  ADD COLUMN IF NOT EXISTS rate_mode TEXT NOT NULL DEFAULT 'automatic';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'merchant_commercial_rate_mode_check'
  ) THEN
    ALTER TABLE merchant_commercial
      ADD CONSTRAINT merchant_commercial_rate_mode_check
      CHECK (rate_mode IN ('automatic', 'fixed'));
  END IF;
END $$;

ALTER TABLE agent_commission
  ADD COLUMN IF NOT EXISTS rate_mode TEXT NOT NULL DEFAULT 'automatic',
  ADD COLUMN IF NOT EXISTS pending_commission_percent TEXT,
  ADD COLUMN IF NOT EXISTS pending_effective_from DATE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agent_commission_rate_mode_check'
  ) THEN
    ALTER TABLE agent_commission
      ADD CONSTRAINT agent_commission_rate_mode_check
      CHECK (rate_mode IN ('automatic', 'fixed'));
  END IF;
END $$;
