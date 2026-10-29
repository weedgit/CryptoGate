-- H8 (review 2026-10-29): TOTP checks had no failure limit and no replay protection.
-- Per-account counter + lockout, and the last accepted time step (codes are single-use).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS mfa_failed_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mfa_locked_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mfa_last_step BIGINT;

-- POS: a correct PIN no longer clears the terminal's wrong-PIN count; failures age out
-- an hour after the last one instead.
ALTER TABLE pos_terminals
  ADD COLUMN IF NOT EXISTS last_failed_unlock_at TIMESTAMPTZ;
