-- M1-15: user ↔ org memberships. Role strings match @cryptogate/domain UserRole.
-- Cashier is only valid on merchant / merchant_site (enforced in app).

CREATE TABLE IF NOT EXISTS org_memberships (
  org_id      UUID NOT NULL REFERENCES org_accounts (id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role        TEXT NOT NULL
                CHECK (role IN ('owner', 'administrator', 'viewer', 'cashier')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, user_id)
);

CREATE INDEX IF NOT EXISTS org_memberships_user_id_idx ON org_memberships (user_id);
CREATE INDEX IF NOT EXISTS org_memberships_org_id_role_idx ON org_memberships (org_id, role);
