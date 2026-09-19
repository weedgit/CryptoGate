-- User profile avatar (optional data-URL image; null = initials default).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

COMMENT ON COLUMN users.avatar_url IS 'Optional profile avatar as a small image data-URL; null shows initials';
