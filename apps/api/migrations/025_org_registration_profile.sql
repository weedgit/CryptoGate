-- Registration profile captured at onboard (country, billing contact, legal entity name).

ALTER TABLE org_accounts
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS billing_email TEXT,
  ADD COLUMN IF NOT EXISTS legal_name TEXT;
