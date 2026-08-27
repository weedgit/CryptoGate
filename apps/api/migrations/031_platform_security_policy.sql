-- B13: platform security policy on the platform org row
-- (MFA Owner/Admin enrollment gate + sliding session TTL minutes).

ALTER TABLE org_accounts
  ADD COLUMN IF NOT EXISTS mfa_enforcement BOOLEAN,
  ADD COLUMN IF NOT EXISTS session_timeout_minutes INTEGER;

UPDATE org_accounts
SET
  mfa_enforcement = COALESCE(mfa_enforcement, true),
  session_timeout_minutes = COALESCE(session_timeout_minutes, 30)
WHERE type = 'platform';

UPDATE org_accounts
SET
  mfa_enforcement = NULL,
  session_timeout_minutes = NULL
WHERE type <> 'platform';

ALTER TABLE org_accounts
  DROP CONSTRAINT IF EXISTS org_accounts_security_policy_chk;

ALTER TABLE org_accounts
  ADD CONSTRAINT org_accounts_security_policy_chk CHECK (
    (
      type = 'platform'
      AND mfa_enforcement IS NOT NULL
      AND session_timeout_minutes IN (15, 30, 60, 120)
    )
    OR (
      type <> 'platform'
      AND mfa_enforcement IS NULL
      AND session_timeout_minutes IS NULL
    )
  );
