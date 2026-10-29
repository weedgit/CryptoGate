-- C2 (review 2026-10-29): invite temporary passwords were copied into org_user_invite audit
-- metadata (`initialSignIn`), readable by Viewers, parent agents and API keys.
-- 1. Temporary passwords now expire; 2. scrub stored copies; 3. expire every temporary
--    password that was exposed and is still unchanged (the invitee uses Forgot password).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_expires_at TIMESTAMPTZ;

UPDATE users u
SET password_expires_at = now(),
    updated_at = now()
WHERE u.must_change_password = true
  AND u.deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM audit_log a
    WHERE a.action = 'org_user_invite'
      AND a.metadata ? 'initialSignIn'
      AND a.metadata->>'invitedUserId' = u.id::text
    UNION ALL
    SELECT 1 FROM audit_log_archive a
    WHERE a.action = 'org_user_invite'
      AND a.metadata ? 'initialSignIn'
      AND a.metadata->>'invitedUserId' = u.id::text
  );

ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_update;
UPDATE audit_log
SET metadata = metadata - 'initialSignIn'
WHERE metadata ? 'initialSignIn';
ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_update;

UPDATE audit_log_archive
SET metadata = metadata - 'initialSignIn'
WHERE metadata ? 'initialSignIn';
