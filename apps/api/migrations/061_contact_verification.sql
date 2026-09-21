-- Contact proof after invite: email OTP + phone OTP. Live actions stay
-- locked until both timestamps are set. Existing users are grandfathered.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ;

UPDATE users
SET email_verified_at = COALESCE(email_verified_at, created_at),
    phone_verified_at = COALESCE(phone_verified_at, created_at)
WHERE email_verified_at IS NULL OR phone_verified_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_phone_uidx
  ON users (phone)
  WHERE phone IS NOT NULL;

CREATE TABLE IF NOT EXISTS contact_otps (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  channel      TEXT NOT NULL CHECK (channel IN ('email', 'phone')),
  destination  TEXT NOT NULL,
  code_hash    TEXT NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  consumed_at  TIMESTAMPTZ,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contact_otps_user_channel_idx
  ON contact_otps (user_id, channel, created_at DESC);

COMMENT ON COLUMN users.email_verified_at IS 'Set when invite-reset token is used or email OTP succeeds';
COMMENT ON COLUMN users.phone_verified_at IS 'Set when SMS OTP succeeds';
COMMENT ON TABLE contact_otps IS 'Hashed 6-digit email/SMS OTPs for contact verification';
