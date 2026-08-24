# Team board — CryptoGate Phase 1

Shared **todo / doing / done** for Kevin, Andrew, Bruce.  
Update this file when you start or finish a task. Pull before editing.

**Statuses:** `todo` · `doing` · `done` · `blocked`  
**IDs** match `doc/Milestone-Task-List.md` (local).

---

## Machines (who works where)

| Machine | Developer | GitHub account | Owns (edit only) |
| --- | --- | --- | --- |
| **Main OS** | Kevin | Kevin’s account | `packages/api-spec`, `packages/domain`, infra, `apps/payment-page`, `TEAM-BOARD.md` |
| **VM1** | Andrew | Andrew’s account | `apps/api/**` (+ DB migrations) |
| **VM2** | Bruce | Bruce’s account | `apps/watcher`, `packages/matching`, `packages/chain-clients` |

Each person pushes from **their own VM + GitHub account**. One feature branch per person (see branch names below).

---

## Daily ritual (all three)

**Before you start work:**

```bash
git fetch origin
git pull origin main
```

Open this file on `main` and check **Now**. Pick your next task.

**When you start a task:**

1. Set your row to `doing` in this file.  
2. Commit + push the board update (or include it in your feature PR).  
3. Branch if you haven’t: `feat-{nick}-{surface}-{slug}` (see Git rules in `.cursor/rules/Git_rule.mdc`).

**When you finish (or get blocked):**

1. Set row to `done` or `blocked` + short note (PR link, blocker).  
2. Push branch; open PR to `main`.  
3. **Do not merge** — Kevin merges contract conflicts; each owner merges own area when agreed.

**Contract changes:** Andrew/Bruce do **not** edit `packages/domain` or `packages/api-spec`. Ask Kevin; wait for merge to `main`, then `git pull`.

**Suggested contract freeze:** Tuesday EOD (Kevin announces if different).

---

## Now (start here)

| ID | Owner | Status | Task | Notes |
| --- | --- | --- | --- | --- |
| M1-11 | Andrew | todo | Login, logout, session refresh/revoke | Next — after M1-10 (PR #1 merged) |
| M1-32 | Bruce | todo | Matching test scaffold (mode-b) | Optional leftover — do not start M2-40 until M2-02 is on `main` |
| M2-40 | Bruce | blocked | Mode B `assignOnCreate` | Wait for Kevin M2-02 on `main`; then `feat-bruce-matching-mode-b-assign` |
| M1-01 | Kevin | doing | Confirm M1 scope signed | Requirements + matching + POS in scope |
| M1-05 | Kevin | todo | Weekly standup + contract-freeze schedule | Tue EOD freeze suggested |
| M2-01 | Kevin | todo | OpenAPI: full order + payment schemas | Next Kevin branch after payment-page lands |
| M2-02 | Kevin | todo | Domain order fields for matching assign | Unblocks Bruce M2-40 |

---

## Sprint 0 — foundation

| ID | Owner | Status | Task | Notes |
| --- | --- | --- | --- | --- |
| S0-01 | Kevin | done | Monorepo workspace | pnpm workspaces |
| S0-02 | Kevin | done | `.env.example` + docker-compose Postgres | |
| S0-03 | Kevin | done | CI skeleton | `.github/workflows/ci.yml` |
| S0-04 | Kevin | done | `packages/domain` types | |
| S0-05 | Kevin | done | OpenAPI M1 stub paths | `openapi.yaml` v0.1.0 |
| S0-06 | Andrew+Bruce | done | Review domain + OpenAPI vs Business-Model | Andrew 2026-08-23: enums align; gaps: MerchantStructure (domain), MFA tables (M1-12), Session.memberships needs orgs (M1-13/15) |
| S0-07 | Andrew | done | API entry + health; choose migration tool | `server.mjs` GET `/health`; CLI `health.mjs` for check script |
| S0-08 | Andrew | done | First migration skeleton | `apps/api/migrations/` + `scripts/migrate.mjs` |
| S0-09 | Bruce | done | Watcher boots / health / exits | `apps/watcher/src/main.mjs` stub |
| S0-10 | Bruce | done | Matching router + mode-b stub | |
| S0-11 | Bruce | done | Matching public API documented | `doc/Matching-Package-API.md` |
| S0-12 | Kevin | done | Contract freeze v0.1 | `doc/CONTRACT-FREEZE.md` |

**Gate:** Sprint 0 content complete. Andrew/Bruce may open M1 feature work.

---

## Milestone 1 — account system + prototypes

### Contract (Kevin)

| ID | Owner | Status | Task | Notes |
| --- | --- | --- | --- | --- |
| M1-02 | Kevin | done | OpenAPI auth/session/MFA schemas | In `openapi.yaml` |
| M1-03 | Kevin | done | OpenAPI org CRUD / invite / role | In `openapi.yaml` |
| M1-04 | Kevin | done | OpenAPI order create stub response | In `openapi.yaml` |

### API (Andrew)

| ID | Owner | Status | Task | Notes |
| --- | --- | --- | --- | --- |
| M1-10 | Andrew | done | DB: users, sessions, password hash + policy | PR #1 merged |
| M1-11 | Andrew | todo | Login, logout, session refresh/revoke | After M1-10 |
| M1-12 | Andrew | todo | MFA for Owner/Admin (agent + merchant) | After M1-11 |
| M1-13 | Andrew | todo | DB org_accounts | |
| M1-14 | Andrew | todo | Org tree CRUD + max agent depth | |
| M1-15 | Andrew | todo | Memberships + roles | |
| M1-16 | Andrew | todo | Role middleware / policy | |
| M1-17 | Andrew | todo | Append-only audit_log | |
| M1-18 | Andrew | todo | Settlement settings stub; Cashier 403 | |
| M1-19 | Andrew | todo | Order create stub (mock address/QR) | Needs M1-04 (done) |
| M1-20 | Andrew | todo | Cross-merchant scope isolation | |

### Watcher / matching (Bruce)

| ID | Owner | Status | Task | Notes |
| --- | --- | --- | --- | --- |
| M1-30 | Bruce | done | Watcher main loop + graceful shutdown | PR #2 merged — `pnpm start` loops; default one tick for CI |
| M1-31 | Bruce | done | Chain-clients layout; Tron stub | `packages/chain-clients/tron` |
| M1-32 | Bruce | todo | Matching test scaffold (mode-b) | Partial tests exist |
| M1-33 | Bruce | done | Watcher ↔ payment_orders status contract | `doc/Watcher-Order-Status-Contract.md` |
| M1-34 | Bruce | todo | Review Andrew migrations for M3 columns | After M1-19 |

### UI prototypes (Kevin)

| ID | Owner | Status | Task | Notes |
| --- | --- | --- | --- | --- |
| M1-40 | Kevin | done | Payment page wireframe | `apps/payment-page/public/` |
| M1-41 | Kevin | done | Payment page from Figma E1 | Institutional Ink; `doc/UI-Handoff.md` |
| M1-42 | Kevin | done | Create-order prototype | |
| M1-43 | Kevin | done | Cashier POS wireframes | `/pos/` |
| M1-44 | Kevin | done | POS device class note | In POS page |

### Day 6 acceptance (Kevin verifies)

| ID | Status | Test | Fix owner |
| --- | --- | --- | --- |
| M1-T01 | todo | Cashier cannot change settlement | Andrew |
| M1-T02 | todo | Cross-merchant isolation | Andrew |
| M1-T03 | todo | MFA + session revoke | Andrew |
| M1-T04 | todo | Agent cannot create payment orders | Andrew |
| M1-T05 | todo | Prototype walkthrough | Kevin |
| M1-T06 | todo | Watcher separate process | Bruce |
| M1-T07 | todo | Routes match OpenAPI v0.1 | Andrew |

---

## How to update

1. Set your row to `doing` when you start; `done` when merged/ready.  
2. Put PR link or blocker in **Notes**.  
3. Do not edit other owners’ rows except to mark `blocked` with a reason.  
4. Kevin owns contract freezes; bump OpenAPI/`domain` only via Kevin.  
5. Always **pull `main`** before editing this file to avoid merge fights.

## Branch examples (current M1)

| Owner | Branch (example) | First tasks |
| --- | --- | --- |
| Kevin | `feat-kevin-infra-team-board` | M1-01, M1-05 |
| Andrew | `feat-andrew-api-m1-auth` | S0-07/08, M1-10, M1-11 |
| Bruce | `feat-bruce-matching-m1-tests` | M1-32 |
