# Contract freeze

**Owner:** Kevin (PM + contract gate)

## v0.1 — Sprint 0 / Milestone 1

**Date:** 2026-08-22  
**OpenAPI:** `0.1.0` (superseded for order schemas by v0.2)

| Artifact | Path | Notes |
| --- | --- | --- |
| Domain types | `packages/domain` | `OrgType`, `UserRole`, `OrderStatus`, `MatchingMode`, `Money`, `AssetNetwork` |
| OpenAPI | `packages/api-spec/openapi.yaml` | Auth, session, MFA, orgs, order stubs, webhooks stubs |

## v0.2 — Milestone 2 order schemas

**Date:** 2026-08-24  
**OpenAPI:** `0.2.0` (superseded patch `0.2.1` for matching-mode settings)

| Artifact | Path | Notes |
| --- | --- | --- |
| Domain order fields | `packages/domain` `PaymentOrder` | `matching_mode`, `payable_amount`, `receive_address`, `address_source`, `hd_index`, `memo_or_tag` |
| OpenAPI orders | `POST /v1/orders`, `GET /v1/orders/{id}`, `GET /v1/orders/{id}/payment` | Full schemas; guest `GET .../payment` is public |

Frozen for Andrew (`M2-11`/`M2-13`) and Kevin (`M2-50`):

- Create body has no `matchingMode`; mode is merchant default locked at create.
- `Idempotency-Key` required on create; reuse with different body → 409.
- Agent create → 403. Cashier cannot set matching mode / settlement / xPub / fees.
- `GET /orders/{id}/payment` has **no** merchant session; payment page polls this, not the chain.
- `PaymentOrder` required fields match `@cryptogate/domain`.

## v0.2.1 — Merchant matching-mode settings

**Date:** 2026-08-24  
**OpenAPI:** `0.2.1`

| Artifact | Path | Notes |
| --- | --- | --- |
| OpenAPI matching mode | `GET/PUT /v1/orgs/{orgId}/matching-mode` | Mirrors Andrew PR #24; Cashier 403; default `B` when unset |

Additive only — order create / payment schemas unchanged.

## v0.2.2 — Merchant settlement address book

**Date:** 2026-08-24  
**OpenAPI:** `0.2.2`

| Artifact | Path | Notes |
| --- | --- | --- |
| OpenAPI settlement | `GET/PUT /v1/orgs/{orgId}/settlement` | Mirrors Andrew PR #20; Cashier 403; enabled asset/network only |

Additive only. MFA + cool-down before address becomes active for new orders is still M2-16 (schema may grow).

## Rules

1. Field or enum change → PR to `packages/api-spec` or `packages/domain` → Kevin reviews → merge → Andrew/Bruce rebase.
2. Weekly freeze: Tuesday EOD unless Kevin announces otherwise.
3. Andrew implements `apps/api` against this contract; Bruce implements matching/watcher against domain enums.
4. Do not fulfill on browser redirect; webhooks are signed (full schemas in M3).

## M1 acceptance checklist (Kevin verifies Day 6)

- [ ] Cashier cannot change parent merchant settlement address (403)
- [ ] Merchant A cannot open Merchant B records
- [ ] MFA enroll + login; session revoke invalidates token
- [ ] Agent account user cannot create merchant payment orders (403)
- [ ] Prototype walkthrough: login/roles (API), create-order + payment page + POS wireframes
- [ ] Watcher runs as separate process (`pnpm --filter @cryptogate/watcher start`)
- [ ] Implemented M1 routes match OpenAPI v0.1 (auth/orgs); order routes follow v0.2

## Out of this freeze

Live chain matching, Mode C/D/S full assign, signed API headers, webhook HMAC details (deepened in M3–M4).
