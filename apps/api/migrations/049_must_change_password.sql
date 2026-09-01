-- Force a password change after seed / invite logins (non-custodial SaaS UAT).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;
