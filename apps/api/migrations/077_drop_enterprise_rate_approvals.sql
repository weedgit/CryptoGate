-- Merchant fees are Automatic (volume schedule) or Fixed (Platform Owner) only.
-- There is no in-product rate request, so the Enterprise approval queue is removed.

DROP TABLE IF EXISTS enterprise_rate_approvals;

ALTER TABLE merchant_commercial
  DROP COLUMN IF EXISTS enterprise_approval_status;
