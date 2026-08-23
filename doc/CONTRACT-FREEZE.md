# Contract freeze v0.1

**Date:** 2026-08-22  
**Owner:** Kevin (PM + contract gate)  
**Scope:** Sprint 0 / Milestone 1 shapes

## Frozen for this sprint

| Artifact | Path | Notes |
| --- | --- | --- |
| Domain types | `packages/domain` | `OrgType`, `UserRole`, `OrderStatus`, `MatchingMode`, `Money`, `AssetNetwork`, related enums |
| OpenAPI | `packages/api-spec/openapi.yaml` | Auth, session, MFA, orgs, order stubs, webhooks stubs; `info.version` **0.1.0** |

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
- [ ] Implemented M1 routes match OpenAPI v0.1

## Out of this freeze

Live chain matching, Mode C/D/S full assign, signed API headers, webhook HMAC details (deepened in M2–M3).
