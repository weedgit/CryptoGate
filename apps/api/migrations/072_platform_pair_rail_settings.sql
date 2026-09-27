-- Per-asset min amount overrides (confirmations stay network-scoped in platform_network_rail_settings).
-- Copy any legacy network-level min_amount onto the primary (USDT-preferred) pair, then clear it.

CREATE TABLE IF NOT EXISTS platform_pair_rail_settings (
  network                  TEXT NOT NULL,
  asset                    TEXT NOT NULL,
  min_amount               TEXT NOT NULL
                             CHECK (min_amount ~ '^(?:0|[1-9]\d*)(?:\.\d+)?$'),
  updated_by_user_id       UUID NULL REFERENCES users (id) ON DELETE SET NULL,
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (network, asset)
);

-- Legacy: network.min_amount applied to USDT (or first known asset) when present.
INSERT INTO platform_pair_rail_settings (network, asset, min_amount, updated_by_user_id, updated_at)
SELECT
  n.network,
  CASE
    WHEN n.network IN ('ethereum', 'solana', 'tron', 'tron_nile') THEN 'USDT'
    ELSE 'USDT'
  END AS asset,
  n.min_amount,
  n.updated_by_user_id,
  n.updated_at
FROM platform_network_rail_settings n
WHERE n.min_amount IS NOT NULL
ON CONFLICT (network, asset) DO NOTHING;

UPDATE platform_network_rail_settings
SET min_amount = NULL
WHERE min_amount IS NOT NULL;
