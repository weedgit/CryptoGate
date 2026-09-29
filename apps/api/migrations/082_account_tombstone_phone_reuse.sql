-- One email = one account in one org. Removing a person's last membership deletes the account:
-- the row stays (append-only audit_log references it) but the email is released for a fresh invite.
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN users.deleted_at IS 'Account deleted (tombstone): email renamed to deleted+<id>@deleted.invalid, credentials and contacts cleared';

-- A phone number may be reused across accounts; each account must verify it again.
DROP INDEX IF EXISTS users_phone_uidx;
CREATE INDEX IF NOT EXISTS users_phone_idx ON users (phone) WHERE phone IS NOT NULL;
