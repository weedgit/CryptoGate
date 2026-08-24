# CryptoGate

Phase 1 merchant collection: hotels, travel, transport, and retail take crypto (starting with USDT) without giving CryptoGate their keys.

The payer sends from their own wallet to the **merchant’s** address. CryptoGate creates the **payment order**, shows QR and payment link, watches the chain, and marks the order paid. It does not hold coins, does not convert to fiat, and does not take a cut of the on-chain payment. Platform revenue is a separate **service bill** (subscription + volume fee).

This is B2B software. The guest or shopper is not a Phase 1 account.

Later phases (wallet, licensed fiat, token) are out of scope here.

## Status

**Sprint 0 complete. OpenAPI v0.3.3.** Stack: TypeScript + pnpm workspaces. Postgres via Docker Compose. Live: USDT/Tron; USDT/Ethereum ingest ready (registry disabled until staging sign-off).

Contract freeze notes, DB conventions, and package API notes: `doc/CONTRACT-FREEZE.md`, `doc/DB-Conventions.md`, `doc/Matching-Package-API.md`, `doc/Chain-Clients.md`.

UI lock + Figma handoff: `doc/UI-Style-Lock.md`, `doc/UI-Handoff.md`. Preview guest pay: `pnpm --filter @cryptogate/payment-page dev` → http://127.0.0.1:5173/

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

# M1 payment-page prototypes
npx pnpm@9.15.0 --filter @cryptogate/payment-page dev
# → http://localhost:5173  (pay page)
# → /create-order.html     (create-order prototype)
# → /pos/                  (cashier POS wireframes)
```

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

Implementation plan: [`doc/Phase1-Implementation-Plan.md`](doc/Phase1-Implementation-Plan.md). Ops index: [`doc/M4-33-Ops-Runbook-Index.md`](doc/M4-33-Ops-Runbook-Index.md).
