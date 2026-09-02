-- M1-13: org tree. Enum strings match @paymentgate/domain OrgType.
-- Merchant structure matches OpenAPI (not yet a domain enum).
-- Max agent depth is a Platform-row setting (Business-Model default 2).
-- Memberships (M1-15) are a separate table.

CREATE TABLE IF NOT EXISTS org_accounts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type             TEXT NOT NULL
                     CHECK (type IN (
                       'platform',
                       'agent',
                       'agent_sub',
                       'merchant',
                       'merchant_site'
                     )),
  name             TEXT NOT NULL,
  parent_id        UUID REFERENCES org_accounts (id) ON DELETE RESTRICT,
  structure        TEXT
                     CHECK (
                       structure IS NULL
                       OR structure IN ('single_location', 'multi_location')
                     ),
  max_agent_depth  INTEGER
                     CHECK (max_agent_depth IS NULL OR max_agent_depth >= 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT org_accounts_platform_root CHECK (
    (type = 'platform' AND parent_id IS NULL)
    OR (type <> 'platform' AND parent_id IS NOT NULL)
  ),
  CONSTRAINT org_accounts_structure_merchant CHECK (
    (type = 'merchant' AND structure IN ('single_location', 'multi_location'))
    OR (type <> 'merchant' AND structure IS NULL)
  ),
  CONSTRAINT org_accounts_max_depth_platform CHECK (
    (type = 'platform' AND max_agent_depth IS NOT NULL)
    OR (type <> 'platform' AND max_agent_depth IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS org_accounts_one_platform_idx
  ON org_accounts ((true))
  WHERE type = 'platform';

CREATE INDEX IF NOT EXISTS org_accounts_parent_id_idx ON org_accounts (parent_id);
CREATE INDEX IF NOT EXISTS org_accounts_type_idx ON org_accounts (type);
