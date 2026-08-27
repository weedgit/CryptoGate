-- Agent commission % of platform fee (Decision 1). Platform O/A may edit;
-- changes apply immediately (no cool-down / next-month deferral).

CREATE TABLE IF NOT EXISTS agent_commission (
  org_id              UUID PRIMARY KEY
                        REFERENCES org_accounts (id) ON DELETE CASCADE,
  commission_percent  TEXT NOT NULL,
  effective_from      DATE NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Existing agent orgs get the Phase 1 UI default (15%).
INSERT INTO agent_commission (org_id, commission_percent, effective_from)
SELECT id, '15', date_trunc('month', now() AT TIME ZONE 'utc')::date
FROM org_accounts
WHERE type IN ('agent', 'agent_sub')
ON CONFLICT (org_id) DO NOTHING;
