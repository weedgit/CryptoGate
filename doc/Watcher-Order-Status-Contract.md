# Watcher ↔ payment order status contract (M3 prep)

**Owner:** Bruce (`apps/watcher`)  
**Consumers:** Andrew (`apps/api` reads, webhooks), Kevin (OpenAPI / integration guide)  
**Phase:** Documented in M1; implemented in M3.

Watcher and API are **separate processes**. Watcher **writes** order status and on-chain fields; API **creates** orders and serves HTTP. No imports from `apps/api` in watcher code.

---

## Table: `payment_orders` (Andrew owns migration)

Minimum columns watcher reads/writes in M3:

| Column | Type | Writer | Notes |
| --- | --- | --- | --- |
| `id` | uuid/text PK | API | |
| `order_number` | text | API | |
| `status` | text enum | **Both** | API: create → `pending_payment`, expiry → `expired`, cancel → `cancelled`. Watcher: chain-driven transitions |
| `matching_mode` | text | API | B/C/D/S at create |
| `payable_amount` | numeric/text | API | Mode C fingerprint |
| `received_amount` | numeric/text nullable | **Watcher** | Set when tx seen |
| `receive_address` | text | API | Immutable after QR issued |
| `address_source` | text | API | `main` \| `hd_pool` |
| `hd_index` | int nullable | API | Mode S |
| `memo_or_tag` | text nullable | API | Mode D |
| `asset` | text | API | |
| `network` | text | API | |
| `expires_at` | timestamptz | API | |
| `tx_hash` | text nullable | **Watcher** | Dedupe key with network |
| `confirmations` | int | **Watcher** | Current count |
| `required_confirmations` | int | API/config | From network catalog |
| `updated_at` | timestamptz | **Both** | Optimistic concurrency optional in M3 |

Enum values **must** match `@cryptogate/domain` `OrderStatus`:

`pending_payment`, `verifying`, `confirmed`, `completed`, `expired`, `payment_anomaly`, `failed`, `cancelled`

---

## Status transitions (watcher-owned paths)

```
pending_payment ──(tx seen, amount/network/address match)──► verifying
verifying ──(confirmations >= required)──► confirmed
confirmed ──(business rule / immediate)──► completed   [Phase 1: may merge confirmed→completed in one step]

pending_payment | verifying ──(match failure)──► payment_anomaly
any open ──(API expiry job)──► expired
verifying ──(irrecoverable chain error)──► failed
```

**Watcher must not:**

- Guess same-amount collisions on Mode B → `payment_anomaly` (never FIFO complete)
- Set `completed` without required confirmations
- Change `receive_address` after create
- Import or call `apps/api`

**API must not:**

- Set `completed` from browser redirect alone (webhooks only for merchant fulfillment)

---

## Watcher loop (M1 → M3)

| Phase | Behavior |
| --- | --- |
| **M1** | Poll interval `WATCHER_POLL_INTERVAL_MS`; log health; Tron stub `healthCheck`; no DB |
| **M3** | Load open orders (`pending_payment`, `verifying`, …); poll `chain-clients/tron`; call `matchTransaction`; UPDATE row; idempotent on `tx_hash`. **M3-41 wire:** when `DATABASE_URL` set, watcher pool loads candidates and applies match results (transfers still stub-empty until M3-40 live RPC). |

---

## Matching integration

```text
packages/matching.matchTransaction(MatchInput) → MatchResult
```

Watcher supplies: `mode`, `toAddress`, `amount`, `asset`, `network`, `memoOrTag`, `txHash`.  
Result: `orderId`, `status`, optional `reason` (anomaly detail).

Assign on create stays in API → `assignOnCreate` (Andrew calls from order route).

---

## Chain client

First live target: **USDT on Tron** (`packages/chain-clients/tron`).

Watcher config (env):

- `DEFAULT_ASSET`, `DEFAULT_NETWORK`
- `TRON_RPC_URL` (M3)
- `DATABASE_URL` (shared Postgres; watcher uses own pool module, not `apps/api/src/db`)

---

## Logging

Structured JSON lines to stdout (same as M1 loop): `service`, `event`, `tick`, `chain`, `ingest`.

---

## Document history

| Date | Change |
| --- | --- |
| 2026-08-23 | Initial contract (M1-33) — Bruce |
