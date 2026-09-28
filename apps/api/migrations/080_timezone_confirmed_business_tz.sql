-- Profile time zone was defaulted to UTC and never chosen; track an explicit confirmation.
ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone_confirmed_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN users.timezone_confirmed_at IS 'Set when the user picks or confirms their IANA timezone; NULL = still the default';

-- Business time zone for customer-facing documents (invoice, receipt, pay page). Sites inherit when NULL.
ALTER TABLE org_accounts ADD COLUMN IF NOT EXISTS business_timezone TEXT NULL;

COMMENT ON COLUMN org_accounts.business_timezone IS 'IANA timezone for customer documents; NULL = inherit from parent merchant';
