-- M1-12: TOTP MFA. Role gating (Owner/Admin) waits on org memberships (M1-15).
-- Secrets stay in DB; never log mfa_secret / mfa_pending_secret.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS mfa_secret TEXT,
  ADD COLUMN IF NOT EXISTS mfa_pending_secret TEXT,
  ADD COLUMN IF NOT EXISTS mfa_enrolled_at TIMESTAMPTZ;

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS mfa_verified_at TIMESTAMPTZ;
