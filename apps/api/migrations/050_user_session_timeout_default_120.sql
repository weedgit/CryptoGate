-- New users default to 120-minute sliding sessions (existing rows unchanged).
ALTER TABLE users
  ALTER COLUMN session_timeout_minutes SET DEFAULT 120;

COMMENT ON COLUMN users.session_timeout_minutes IS
  'User preference — sliding session TTL minutes (default 120 for new users)';
