# PaymentGate

Phase 1 merchant collection: hotels, travel, transport, and retail take crypto (starting with USDT) without giving PaymentGate their keys.

The payer sends from their own wallet to the **merchant’s** address. PaymentGate creates the **payment order**, shows QR and payment link, watches the chain, and marks the order paid. It does not hold coins, does not convert to fiat, and does not take a cut of the on-chain payment. Platform revenue is a separate **service bill** (subscription + volume fee).

This is B2B software. The guest or shopper is not a Phase 1 account.

Later phases (wallet, licensed fiat, token) are out of scope here.

## Status

**Phase 1 review build (2026-08-27).** OpenAPI **v0.3.5**. Stack: TypeScript + pnpm workspaces. Postgres via Docker Compose.

| Area | State |
| --- | --- |
| Core rail (API, matching, watcher, merchant web) | Implemented |
| Platform commercial (B8/B13, fee tiers, org policy, enterprise approvals) | Wired |
| Service bill generate + agent commissions + site inherit (Wave 6) | Wired |
| Signed order create + webhook listener smoke (X-07) | Wired |
| MFA login + merchant enroll | Wired |
| USDT/Tron | Live |
| USDT/Ethereum | Client ready — enable after staging smoke ([`doc/M3-32-Ethereum-Go-Live.md`](doc/M3-32-Ethereum-Go-Live.md)) |
| USDT/BNB Smart Chain | Client ready (X-06) — still `enabled: false`; enable after Ethereum |

**Your review:** run `node scripts/check.mjs` (without exporting a live `DATABASE_URL`), bring up API + web + payment-page, walk [`doc/M1-T05-Demo-Script.md`](doc/M1-T05-Demo-Script.md). Machine-key E2E: [`doc/X-07-E2E-Smoke.md`](doc/X-07-E2E-Smoke.md).  
**Blocked on you:** Company A hostnames (M3-T09), pilot merchant (M4-40), reference POS device (M5-01), scope sign-off (M1-01).

Implementation plan: [`doc/Phase1-Implementation-Plan.md`](doc/Phase1-Implementation-Plan.md). Ops index: [`doc/M4-33-Ops-Runbook-Index.md`](doc/M4-33-Ops-Runbook-Index.md).

Contract freeze notes, DB conventions, and package API notes: `doc/CONTRACT-FREEZE.md`, `doc/DB-Conventions.md`, `doc/Matching-Package-API.md`, `doc/Chain-Clients.md`.

UI lock + tokens + Figma handoff: `doc/UI-Style-Lock.md`, `doc/UI-Tokens.md`, `doc/UI-Handoff.md`. Preview guest pay: `pnpm --filter @paymentgate/payment-page dev` → http://127.0.0.1:5173/

## Repository layout

```
apps/api              HTTP: auth, orgs, payment orders, webhooks, service bills (Andrew)
apps/watcher          Chain ingest and matching (Bruce) — separate process
apps/web              Platform / agent / merchant portals (React)
apps/payment-page     Public pay URL + M1 prototypes (Kevin)
apps/cashier-apk      Cashier Android POS client (Bruce, M2+)
packages/api-spec     OpenAPI contract (Kevin)
packages/domain       Shared types (Kevin)
packages/matching     Modes B / C / D / S (Bruce)
packages/chain-clients
```

API and watcher stay separate processes in this repo. Do not merge them.

## Local setup

```bash
# Install (pnpm 9.15 via packageManager field)
npx pnpm@9.15.0 install

# Postgres
docker compose up -d
cp .env.example .env

# Contract + stub checks
npx pnpm@9.15.0 check
# or: node scripts/check.mjs

# Wave 5 local deploy (Postgres + migrate + API + watcher + smoke)
node scripts/deploy-wave5.mjs
# Full local review (API + web portals + demo logins):
node scripts/deploy-wave5.mjs --local
# Stop: node scripts/deploy-wave5.mjs --down
# Docker stack: docker compose -f docker-compose.deploy.yml up -d

# Optional: mint a local merchant API key for X-07 live smoke (prints exports; do not commit)
node scripts/e2e-mint-api-key.mjs
# Then: node scripts/e2e-smoke.mjs --live

# M1 payment-page prototypes
npx pnpm@9.15.0 --filter @paymentgate/payment-page dev
# → http://localhost:5173  (pay page)
# → /create-order.html     (create-order prototype)
# → /pos/                  (cashier POS wireframes)
```

Demo login: run `node scripts/seed-local.mjs` — `own.platform@paymentgate.io` / `User1234567890!` (platform owner only). Portals: http://127.0.0.1:5174/{platform,agent,merchant}

## Invariants

- Receive address is merchant-controlled. The platform has no spend keys.
- Volume fee is billed on the service rail, never skimmed from the payer payment.
- Cashiers cannot change settlement address, xPub, matching mode, or fees.
- Agent accounts do not create merchant payment orders.
- Signed webhooks only; do not fulfill on browser redirect.

## Ownership

| Area | Owner |
| --- | --- |
| `packages/api-spec`, `packages/domain`, infra, `apps/payment-page` | Kevin |
| `apps/api` (+ DB migrations) | Andrew |
| `apps/watcher`, `packages/matching`, `packages/chain-clients`, `apps/cashier-apk` | Bruce |

## Local docs

Product, business, and planning files live in `doc/` (same repo — Andrew and Bruce pull with `main`).
