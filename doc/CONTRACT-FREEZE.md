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
- `PaymentOrder` required fields match `@paymentgate/domain`.

## v0.2.1 — Merchant matching-mode settings

**Date:** 2026-08-24  
**OpenAPI:** `0.2.1`

| Artifact | Path | Notes |
| --- | --- | --- |
| OpenAPI matching mode | `GET/PUT /v1/orgs/{orgId}/matching-mode` | Mirrors Andrew PR #24; Cashier 403; default `B` when unset |

Additive only — order create / payment schemas unchanged.

## v0.2.2 — Merchant settlement address book

**Date:** 2026-08-24  
**OpenAPI:** `0.2.2` (superseded by `0.2.3` for MFA + cool-down)

| Artifact | Path | Notes |
| --- | --- | --- |
| OpenAPI settlement | `GET/PUT /v1/orgs/{orgId}/settlement` | Mirrors Andrew PR #20; Cashier 403 |

## v0.2.3 — Settlement cool-down + xPub presence

**Date:** 2026-08-24  
**OpenAPI:** `0.2.3`

| Artifact | Path | Notes |
| --- | --- | --- |
| Settlement PUT | `PUT /v1/orgs/{orgId}/settlement` | `mfaCode` required; first address active; change → `pendingAddress` until `pendingActivatesAt` (PR #38) |
| xPub | `GET/PUT /v1/orgs/{orgId}/xpub` | GET is presence only (`xPubConfigured`); never full xPub; MFA + cool-down on PUT (PR #40) |

Additive. Guest payment schemas unchanged. HD pool claim API still pending.

## v0.2.4 — Order list + CSV export

**Date:** 2026-08-24  
**OpenAPI:** `0.2.4`

| Artifact | Path | Notes |
| --- | --- | --- |
| OpenAPI list/export | `GET /v1/orders` | Query `format`, `status`, `orgId`, `limit`; CSV Cashier 403 (Andrew PR #41) |

## v0.2.5 — Mode S HD pool list

**Date:** 2026-08-24  
**OpenAPI:** `0.2.5`

| Artifact | Path | Notes |
| --- | --- | --- |
| OpenAPI HD pool | `GET /v1/orgs/{orgId}/hd-pool` | FREE/IN_USE/COOLDOWN; never xPub; claim only via order create (Andrew PR #44) |

## v0.3.0 — M3-01 signed API, webhooks, service bills

**Date:** 2026-08-24  
**OpenAPI:** `0.3.0`

| Artifact | Path | Notes |
| --- | --- | --- |
| Domain | `@paymentgate/domain` | `WebhookEventType`, `ServiceBillStatus`, `ApiSigningHeader`, rate-limit + retry constants |
| Handoff | `doc/M3-01-Signed-Api.md` | Canonical HMAC string, 401 codes, 429 limits |
| Signing | `X-Timestamp` `X-Nonce` `X-Signature` with `X-Api-Key` | Session cookie and guest `/payment` do not sign |
| Webhooks | `GET/POST /v1/webhooks`, `POST /v1/webhooks/test`, deliveries | Secret once; HMAC outbound; Cashier 403 |
| Service bills | `/v1/service-bills` | Separate rail; USD; platform issue; not `/orders` |

## v0.3.0 addendum — M3-04 asset/network list

**Date:** 2026-08-24

| Artifact | Path | Notes |
| --- | --- | --- |
| Live vs planned pairs | `doc/M3-04-Asset-Networks.md` | Only **USDT / tron** enabled; §VI remainder planned |

## v0.3.1 — M4-11 API key CRUD / rotation

**Date:** 2026-08-24  
**OpenAPI:** `0.3.1`

| Artifact | Path | Notes |
| --- | --- | --- |
| Domain | `@paymentgate/domain` | `ApiKey`, `API_KEY_MAX_PER_ORG`, `ApiKeyColumn` |
| Handoff | `doc/M4-11-Api-Keys.md` | Paths, secret-once, rotate, webhook secret rotate-by-recreate |
| API keys | `GET/POST /v1/api-keys`, `DELETE /v1/api-keys/{apiKeyId}`, `POST …/rotate` | Cashier 403; secret never on GET |

Additive to v0.3.0. Signing canonical string unchanged.

## v0.3.2 — Audit list + service bill lifecycle

**Date:** 2026-08-24  
**OpenAPI:** `0.3.2`

| Artifact | Path | Notes |
| --- | --- | --- |
| Domain | `@paymentgate/domain` | `AuditAction`, `AuditLogEntry`, `AuditLogColumn`, `ServiceBillUpdateAction`; optional `ServiceBill.paidAt` / `voidedAt` |
| Handoff | `doc/M4-36-Audit-Bills-v032.md` | Andrew implements GET `/audit`, PATCH service bills |
| Audit | `GET /v1/audit` | Read-only; Cashier 403; scoped by role |
| Service bills | `PATCH /v1/service-bills/{billId}` | Platform-only mark_paid / void / adjust |

Additive to v0.3.1. Andrew: migration **018** suggested in handoff doc.

## v0.3.3 — Platform fee tiers + merchant commercial (X-01)

**Date:** 2026-08-24  
**OpenAPI:** `0.3.3`

| Artifact | Path | Notes |
| --- | --- | --- |
| Domain | `@paymentgate/domain` | `MerchantTier`, `FeeTierBand`, `DEFAULT_FEE_TIER_BANDS`; audit actions `fee_tier_put`, `org_policy_put`, `merchant_commercial_put`, `enterprise_rate_decide` |
| Handoff | `doc/X-01-Fee-Tiers-v033.md` | Andrew implements platform settings + merchant commercial; migration **019** suggested |
| Platform settings | `GET/PUT /platform/settings/fee-tiers`, `GET/PUT /platform/settings/org-policy` | Owner-only PUT; changes next billing period |
| Merchant commercial | `GET/PUT /orgs/{orgId}/commercial` | Agent/platform assign within band; Enterprise approval queue |
| Enterprise | `GET /platform/enterprise-rate-approvals`, `PATCH …/{approvalId}` | Platform Owner approve/deny |
| Create org | `CreateOrgRequest.commercial` | Merchant onboard (C6) |

Additive to v0.3.2. Andrew: migration **019** for tier/commercial tables.

## v0.3.4 — Service bill generation (X-02)

**Date:** 2026-08-27  
**OpenAPI:** `0.3.4`

| Artifact | Path | Notes |
| --- | --- | --- |
| Generate | `POST /v1/service-bills/generate` | Platform only; previous UTC month default; idempotent per org+period |
| Migration | **029** `service_bills_org_period_active_uidx` | One active bill per merchant period |
| Cron | `node apps/api/scripts/generate-service-bills.mjs` | Optional `--period YYYY-MM` |

Volume fee uses **completed** payment-order `payable_amount` in the period × merchant `volume_fee_percent`. Subscription from `platform_fee_tiers`. Does not debit payer on-chain amounts.

## v0.3.5 — Merchant (site) inherit + Owner override (X-04)

**Date:** 2026-08-27  
**OpenAPI:** `0.3.5`

| Artifact | Path | Notes |
| --- | --- | --- |
| Overrides | `GET/POST /v1/orgs/{orgId}/setting-overrides` | Site O/A request; parent merchant Owner `PATCH .../{id}` decide |
| Retention | `GET/PUT /v1/orgs/{orgId}/retention` | Default 90 days; site PUT → `override_required` until approved |
| GET settings | matching / settlement / xPub / HD pool | Additive `source`: merchant / inherit / override |
| Domain | `SiteOverrideKind`, `SettingsSource`, `AuditAction.SiteOverride*` | Migration **030** |

Site order create uses parent settlement/xPub/matching until an approved override. Cashier still 403 on settings PUTs.

## Rules

1. Field or enum change → PR to `packages/api-spec` or `packages/domain` → Kevin reviews → merge → Andrew/Bruce rebase.
2. Weekly freeze: Tuesday EOD unless Kevin announces otherwise.
3. Andrew implements `apps/api` against this contract; Bruce implements matching/watcher against domain enums.
4. Do not fulfill on browser redirect; webhooks are signed (v0.3.0).

## M1 acceptance checklist (Kevin verifies Day 6)

- [ ] Cashier cannot change parent merchant settlement address (403)
- [ ] Merchant A cannot open Merchant B records
- [ ] MFA enroll + login; session revoke invalidates token
- [ ] Agent account user cannot create merchant payment orders (403)
- [ ] Prototype walkthrough: login/roles (API), create-order + payment page + POS wireframes
- [ ] Watcher runs as separate process (`pnpm --filter @paymentgate/watcher start`)
- [ ] Implemented M1 routes match OpenAPI v0.1 (auth/orgs); order routes follow v0.2

## Out of this freeze

M3-02 / M3-03 / M4-05 / M4-32 / M4-01–04 / M4-33 / M4-34 / M4-35 are published. **OpenAPI freeze is v0.3.5** (site inherit). Prior v0.3.4 bill generation remains. Second live network — see `doc/M3-04-Asset-Networks.md`.
