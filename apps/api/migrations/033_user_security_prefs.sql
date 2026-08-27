-- Personal MFA preference + session TTL (user-owned, not org policy).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS mfa_enforcement BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS session_timeout_minutes INTEGER NOT NULL DEFAULT 30;

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_session_timeout_minutes_chk;

ALTER TABLE users
  ADD CONSTRAINT users_session_timeout_minutes_chk
  CHECK (session_timeout_minutes IN (15, 30, 60, 120));

COMMENT ON COLUMN users.mfa_enforcement IS 'User preference — require TOTP enrollment for this account';
COMMENT ON COLUMN users.session_timeout_minutes IS 'User preference — sliding session TTL minutes';
