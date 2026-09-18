-- Cashier POS device unlock PIN (managed from web dashboard / auth/pos-pin).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS pos_pin_hash TEXT NULL;

COMMENT ON COLUMN users.pos_pin_hash IS
  'scrypt hash of 4–8 digit POS unlock PIN; NULL = not set on dashboard';
