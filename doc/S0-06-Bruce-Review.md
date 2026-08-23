# S0-06 — Bruce review (domain + OpenAPI)

**Reviewer:** Bruce (watcher / matching / chain-clients)  
**Contract:** freeze v0.1 (`doc/CONTRACT-FREEZE.md` on Kevin’s clone; OpenAPI `0.1.0` on main)  
**Date:** 2026-08-23

## Summary

**No blockers** for M1 watcher loop or matching stubs. Enum strings in `@cryptogate/domain` match OpenAPI components. Watcher must not import `apps/api`; DB access only after Andrew’s `payment_orders` migration.

## Domain ↔ OpenAPI alignment

| Domain export | OpenAPI schema | Watcher/matching use |
| --- | --- | --- |
| `OrderStatus` | `OrderStatus` | M3 status writes; same strings |
| `MatchingMode` B/C/D/S | `MatchingMode` | `assignOnCreate` / `matchTransaction` |
| `AddressSource` | `AddressSource` | Mode S reports |
| `HdPoolState` | (not in OpenAPI yet) | Mode S pool — OK in domain only until Kevin adds to spec if exposed via API |
| `AssetCode`, `NetworkId` | same | Tron USDT first target |
| `OrgType`, `UserRole` | same | Watcher ignores (API auth scope) |

## Matching package ↔ API

- `CreatePaymentOrderRequest` fields map to `AssignInput` (amount → `requestedAmount`; asset/network strings).
- `PaymentOrder` response fields cover `AssignResult` + order metadata Andrew will persist.
- `matchTransaction` stub returns `OrderStatus`; M3 needs `orderId` when binding tx → row.

## Watcher-specific notes

1. **Separate process** — confirmed; no shared in-process imports from API.
2. **`GET /v1/orders/{id}/on-chain`** — watcher is writer of on-chain facts; API reads for clients. Contract doc: `Watcher-Order-Status-Contract.md`.
3. **Order statuses** — include `cancelled`; expiry job likely API-side; watcher must not overwrite terminal states.
4. **First chain pair** — `DEFAULT_ASSET_NETWORK` = USDT + tron matches README / `.env.example`.

## Requests for Kevin (non-urgent)

- Optional OpenAPI exposure for `HdPoolState` if merchant UI lists pool slots in M2.
- Webhook event payload schema when M3 webhooks freeze (Andrew + Kevin).

## Requests for Andrew

- `payment_orders` migration with columns in `Watcher-Order-Status-Contract.md` before M3 ingest.

**Sign-off:** Bruce — proceed with M1-30, M1-31, M1-33.
