-- Merchant fulfillment policy: when staff may release goods vs chain-final Completed.
-- Locked onto each payment order at create (like matching_mode).

CREATE TABLE IF NOT EXISTS merchant_fulfillment_settings (
  org_id              UUID PRIMARY KEY REFERENCES org_accounts (id) ON DELETE CASCADE,
  fulfillment_policy  TEXT NOT NULL
                        CHECK (fulfillment_policy IN ('on_completed', 'on_verifying')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE payment_orders
  ADD COLUMN IF NOT EXISTS fulfillment_policy TEXT NOT NULL
    DEFAULT 'on_completed'
    CHECK (fulfillment_policy IN ('on_completed', 'on_verifying'));

ALTER TABLE site_setting_overrides
  DROP CONSTRAINT IF EXISTS site_setting_overrides_setting_kind_check;

ALTER TABLE site_setting_overrides
  ADD CONSTRAINT site_setting_overrides_setting_kind_check
    CHECK (setting_kind IN (
      'settlement',
      'xpub',
      'matching_mode',
      'order_retention',
      'fulfillment_policy'
    ));
