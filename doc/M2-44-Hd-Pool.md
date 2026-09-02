# M2-44 — HD pool schema handoff (Bruce → Andrew)

**Owner:** Bruce defines pool rules in `@paymentgate/matching`; Andrew owns the migration + `claimHdPoolAddress` wiring in `apps/api`.  
**Depends on:** Mode S assign (done), merchant xPubs (PR #40).  
**Unblocks:** Mode S match (M3-63), Mode S acceptance (M3-T05).

## Rules (Phase1 §2.5)

| State | Meaning |
| --- | --- |
| `FREE` | May be claimed for a new conflicting order |
| `IN_USE` | Bound to an open payment order |
| `COOLDOWN` | Order final; not reusable yet (late-pay protection) |

1. On Mode S conflict: prefer atomic **FREE** claim; else derive next HD index from watch-only xPub, insert as **IN_USE**.
2. When bound order hits Completed / Expired / Cancelled / Failed → **COOLDOWN** (never immediate FREE).
3. After cool-down window (matching default **30 minutes**, overridable) → **FREE**.
4. Never rewrite an issued order’s `receive_address`.
5. Matching package never holds private keys / never derives — API owns xPub + derivation.

Pure helpers (import from `@paymentgate/matching`):

- `canClaimHdPoolSlot`, `hdPoolStateAfterClaim`, `hdPoolStateAfterOrderFinal`, `hdPoolStateAfterCooldownElapsed`
- `isHdPoolCooldownElapsed`, `DEFAULT_HD_POOL_COOLDOWN_MS`, `HD_POOL_RELEASE_STATUSES`

## Suggested table

```sql
CREATE TABLE IF NOT EXISTS hd_address_pool (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES org_accounts(id),
  asset           text NOT NULL,
  network         text NOT NULL,
  hd_index        integer NOT NULL CHECK (hd_index >= 0),
  receive_address text NOT NULL,
  state           text NOT NULL
                    CHECK (state IN ('FREE', 'IN_USE', 'COOLDOWN')),
  bound_order_id  uuid NULL REFERENCES payment_orders(id),
  cooldown_started_at timestamptz NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, asset, network, hd_index),
  UNIQUE (org_id, asset, network, receive_address)
);

CREATE INDEX IF NOT EXISTS hd_address_pool_claim_idx
  ON hd_address_pool (org_id, asset, network, state)
  WHERE state = 'FREE';
```

## `claimHdPoolAddress` sketch

Under the same create-order lock as Mode S conflict check:

1. `SELECT … FOR UPDATE SKIP LOCKED` one `FREE` row for org/asset/network → set `IN_USE`, `bound_order_id`.
2. Else derive next index (`max(hd_index)+1` or 0), insert `IN_USE`, return address + index.
3. Return `{ receiveAddress, hdIndex }` to matching (already required by `ClaimHdPoolAddress`).

## Release job (API or watcher later)

When order status ∈ `HD_POOL_RELEASE_STATUSES`: set row `COOLDOWN`, `cooldown_started_at = now()`, clear or keep `bound_order_id` for audit.

Periodic: rows in `COOLDOWN` where `now() - cooldown_started_at >= cooldown_ms` → `FREE`.

## Out of scope for this matching PR

- SQL migration file under `apps/api/migrations/` (Andrew)
- Actual BIP32/xPub derivation (Andrew; watch-only)
- Mode S `matchTransaction` (M3-63, after pool lands)
