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

### Contract freeze (M1-05)

| Cadence | What |
| --- | --- |
| **Tuesday EOD** | Kevin freezes OpenAPI/`domain` for the week; Andrew/Bruce rebase |
| **15 min standup** | Blockers only (CORS, assign, matching, pay-page) — async on board if no call |
| **After merge to main** | Pull before editing `TEAM-BOARD.md` or contracts |

Current freeze: OpenAPI **v0.3.3** (fee tiers + merchant commercial; builds on v0.3.2 audit + bill PATCH).

### This week standup (Kevin — async OK)

| Who | Focus | Status / note |
| --- | --- | --- |
| **Andrew** | B4 branch up; wire v0.3.3 commercial when API lands | X-01 on `main` — migrate **019** |
| **Bruce** | **M3-32** USDT/ethereum ingest | Registry row on `main`; merchant web D1–D17 done (#67–#83) |
| **Kevin** | X-01 v0.3.3 landed; M3-T09 handoff; chase M1-01 | [`doc/X-01-Fee-Tiers-v033.md`](doc/X-01-Fee-Tiers-v033.md) |
| **All** | `git pull origin main`; migrate **017** + **018** | **019** when Andrew lands X-01 API |

---

## Now (start here)

| ID | Owner | Status | Task | Notes |
| --- | --- | --- | --- | --- |
| M1-11 | Andrew | todo | Login, logout, session refresh/revoke | Next — after M1-10 (PR #1 merged) |
| M2-40 | Bruce | done | Mode B `assignOnCreate` | PR #12 merged |
| M2-41 | Bruce | done | Mode C fingerprint assign | PR #17 merged |
| M2-42 | Bruce | done | Mode D memo/tag assign | PR #18 merged |
| M2-45 | Bruce | done | Reject Mode S+C / Mode C wide underpay | PR #21 merged |
| M2-43 | Bruce | done | Mode S main vs HD assign | PR #23 merged |
| M3-60 | Bruce | done | Mode B `matchTransaction` | PR #26 merged |
| M3-61 | Bruce | done | Mode C exact fingerprint match | PR #29 merged |
| M3-62 | Bruce | done | Mode D memo match | PR #32 merged |
| M3-41 | Bruce | done | Watcher → matchTransaction wire | PR #34 merged |
| M3-42 | Bruce | done | Confirmations → completed | PR #37 merged |
| M3-40 | Bruce | done | Tron ingest watched addrs + tx dedupe (RPC still stub) | PR #39 |
| M3-30 | Bruce | done | Live TronGrid USDT TRC-20 ingest + confirmations | PR #42 merged |
| M2-44 | Bruce | done | HD pool state helpers + Andrew schema handoff | PR #43 |
| M2-44a | Andrew | done | HD pool claim + list API | PR #44 |
| M3-10 | Andrew | done | HMAC API signing (timestamp/nonce) | PR #52/#53 |
| M3-11 | Andrew | done | Rate limits | PR #53 |
| M3-13 | Andrew | done | Webhook register / list / test | PR #55 |
| M3-14 | Andrew | done | Webhook delivery worker + retries | PR #57 |
| M3-16 | Andrew | done | Service bill stubs | PR #59 |
| M4-11 | Andrew | done | API key CRUD / rotate + migrate 017 | on main |
| M3-63 | Bruce | done | Mode S matchTransaction by owned address | PR #45 merged |
| M3-64 | Bruce | done | §2.8 matching acceptance (B/C/D/S) | PR #46 merged |
| M3-45 | Bruce | done | Watcher/RPC congestion backoff | PR #47 merged |
| M2-70 | Bruce | done | Cashier APK Kotlin scaffold + login | PR #49 merged |
| M2-71 | Bruce | done | Cashier APK create order + QR (M2-72) | PR #50 merged |
| M3-70 | Bruce | done | Cashier APK poll order status (no mark paid) | PR #51 merged |
| M4-20 | Bruce | done | Watcher HA / restart safety; no duplicate status updates | PR #54 merged |
| M2-73 | Bruce | done | Cashier APK hide settings + graceful 403 | PR #56 merged |
| M2-74 | Bruce | done | Cashier APK offline/network-error; no create offline | PR #56 merged |
| M4-21 | Bruce | done | Reorg / rollback handling for Tron confirmations | PR #58 merged |
| M4-23 | Bruce | done | Signed APK flavors (staging vs prod API URL) | PR #61 merged |
| M3-43 | Bruce | done | Expired / anomaly / failed watcher paths | PR #65 merged |
| M3-44 | Bruce | done | Underpay, overpay, duplicate hash, wrong network | PR #65 merged |
| M2-60 | Bruce | done | Merchant create order UI (D4) | PR #67 merged |
| M2-61 | Bruce | done | Matching mode settings UI | PR #70 merged |
| M2-62 | Bruce | done | Settlement address book + cool-down UI | PR #70 merged |
| M2-63 | Bruce | done | xPub / HD pool settings UI | PR #70 merged |
| M2-64 | Bruce | done | Merchant dashboard (D1) | PR #73 merged |
| M2-65 | Bruce | done | Orders list + CSV export (D2) | PR #73 merged |
| M2-66 | Bruce | done | Order detail + on-chain panel (D3) | PR #73 merged |
| M2-67 | Bruce | done | Cashier web shell (D17) | PR #74 merged |
| M2-68 | Bruce | done | Service bills list + checkout (D5–D6) | PR #76 merged |
| M2-69 | Bruce | done | API keys & webhooks UI (D14) | PR #77 merged |
| M2-75 | Bruce | done | Reports & export (D10) | PR #79 merged |
| M2-76 | Bruce | done | Settings pages org/billing/alerts/team (D12–D16) | PR #81 merged |
| M2-77 | Bruce | done | Sites list/create/detail (D7–D9) | PR #83 merged |
| M1-34 | Bruce | done | Review Andrew migrations for M3 columns | `doc/M1-34-Payment-Orders-Review.md` |
| M1-01 | Kevin | blocked | Confirm M1 scope signed | Awaiting client written sign-off (Phase1-Requirement) |
| M1-05 | Kevin | done | Weekly standup + contract-freeze schedule | Tue EOD freeze; § Contract freeze above |
| M2-01 | Kevin | done | OpenAPI: full order + payment schemas | `feat-kevin-api-spec-m2-orders` v0.2.0 |
| M2-03 | Kevin | done | Asset/network registry (USDT + Tron) | PR #7 on `main` |
| M2-02 | Kevin | done | Domain order fields for matching assign | PR #6 on `main` |
| M2-04 | Kevin | done | OpenAPI matching-mode settings | PR #27 v0.2.1 |
| M2-05 | Kevin | done | OpenAPI settlement address book | PR #28 v0.2.2 |
| M2-06 | Kevin | done | CI package gate + Andrew unblock notes | PR #31 |
| M2-07 | Kevin | done | M2 mid-gate smoke checklist | PR #35 — `doc/M2-Mid-Gate.md` |
| M2-08 | Kevin | done | Pay page CORS live path + origin notes | merged to main |
| M2-09 | Kevin | done | CI: watcher inbound + API cors/expiry/audit tests | merged to main |
| M2-10 | Kevin | done | OpenAPI settlement cool-down + xPub (v0.2.3) | merged to main |
| M2-11 | Kevin | done | OpenAPI order list + CSV (v0.2.4) | merged to main |
| M2-12 | Kevin | done | OpenAPI Mode S HD pool list (v0.2.5) | merged to main |
| M2-13 | Kevin | done | CI: matching §2.8 acceptance suite | `feat-kevin-infra-matching-acceptance` |
| M3-01 | Kevin | done | OpenAPI M3 signing, webhooks, service bills (v0.3.0) | `feat-kevin-api-spec-m3-signing-webhooks` |
| M3-04 | Kevin | done | Connected assets/networks list (live vs planned) | `doc/M3-04-Asset-Networks.md` |
| M3-02 | Kevin | done | Integration guide (auth, signing, webhooks) | `doc/M3-02-Integration-Guide.md` |
| M3-03 | Kevin | done | Worked webhook verify + replay sample | `doc/M3-03-Webhook-Verify-Example.md` |
| — | Kevin | done | Merchant Figma frame → route map (unblocks M2-60+) | `doc/UI-Handoff.md` |
| M4-11 | Kevin | done | OpenAPI API key CRUD / rotation freeze | v0.3.1 `doc/M4-11-Api-Keys.md` |
| M3-gate | Kevin | done | M3 acceptance checklist T02–T08 (CI) | `doc/M3-Acceptance.md` |
| M4-05 | Kevin | done | Test vs prod environment matrix | `doc/M4-05-Env-Matrix.md` |
| — | Kevin | done | CI: api-key rules + T07 signing smoke | `doc/examples/api-signing-smoke.mjs` |
| M4-32 | Kevin | done | Merchant manual: modes, collision, cool-down | `doc/M4-32-Merchant-Manual.md` |
| M4-01 | Kevin | done | Deploy/runbook scaffold (Company A accounts) | `doc/M4-01-Deploy-Runbook.md` |
| M4-02 | Kevin | done | TLS + secrets inventory & rotation | `doc/M4-02-Secrets-TLS.md` |
| M4-03 | Kevin | done | DB backup, restore drill, monitoring alerts | `doc/M4-03-Backup-Monitoring.md` |
| M4-04 | Kevin | done | Admin jump host + named vendor access | `doc/M4-04-Admin-Host-Vendor-Access.md` |
| M4-33 | Kevin | done | Ops runbook index (daily ops map) | `doc/M4-33-Ops-Runbook-Index.md` |
| M4-34 | Kevin | done | Third-party / OSS license list | `doc/M4-34-Third-Party-Licenses.md` |
| M4-35 | Kevin | done | DB schema reference (migrations 001–018) | `doc/M4-35-Database-Schema.md` |
| M4-36 | Kevin | done | OpenAPI v0.3.2 audit + bill lifecycle | `doc/M4-36-Audit-Bills-v032.md` |
| X-01 | Kevin | done | OpenAPI v0.3.3 fee tiers + merchant commercial | `doc/X-01-Fee-Tiers-v033.md` |
| M3-T09 | Kevin | done | Company A handoff pack (email + checklists) | Send `doc/M3-T09-Company-A-Handoff.md` when client ready |
| M2-50 | Kevin | done | Live pay page poll GET /payment | PR #22; CORS unblocked PR #33 |
| M2-51 | Kevin | done | Guest display + wrong-network | PR #25 |
| M2-52 | Kevin | done | QR + copy + share link | PR #25 |
| M2-53 | Kevin | done | Mode C exact payable warning | PR #25 |
| M2-54 | Kevin | done | Hide Mode D when memo unsupported | PR #25 |

### Asks for Kevin

| Priority | Ask | Why |
| --- | --- | --- |
| P1 | **Pick second live network** | **Done — USDT / `ethereum`** (see decision table below; BSC deferred) |
| P2 | M1-01 client sign-off + Company A hostname table | Still blocked on client |

**Second network decision** (Phase 1 §VI):

| Candidate | Pros | Cons | Status |
| --- | --- | --- | --- |
| USDT / `ethereum` | Common merchant expectation; Blockonomics-adjacent | Higher gas; Mode D off (no memo on USDT ERC-20) | **Selected** — registry row on `main`; Bruce owns ingest |
| USDT / `bnb_smart_chain` | Lower fees; popular in Asia | Separate contract + ingest module | Deferred |

Kevin adds/enables registry row + `doc/M3-04-Asset-Networks.md` **live** section after Bruce staging smoke → Bruce owns `packages/chain-clients/ethereum/`.

### Asks for Andrew

| Priority | Ask | Why |
| --- | --- | --- |
| **P1** | **X-01 / v0.3.3** — fee tiers, org policy, merchant commercial, migrate **019** | `doc/X-01-Fee-Tiers-v033.md`; unblocks B8/B13 + real B4/C6 commercial (replace stubs) |
| **P2** | **v0.3.2 UI** — audit list, bill PATCH, B14 | Already on main API; wire platform pages |
| — | Run migrate **017** + **018** | Required before API keys + bill lifecycle on any DB |

CI runs `api-key-rules.test.mjs` + `doc/examples/api-signing-smoke.mjs` (T07 nonce mapping).

Webhook secret rotate = delete + re-register (no new path). Fan-out already on main.

### Asks for Bruce

| Priority | Ask | Why |
| --- | --- | --- |
| — | Merchant web D1–D17 **done** | PRs #67–#83; shell complete on `main` |
| — | M1-32 mode-b test scaffold **done** | PR #86 — `packages/matching/test/mode-b.test.mjs` |
| **P1** | **M3-32 / M4-22** USDT **ethereum** ERC-20 | Registry row `USDT_ETHEREUM` on `main` (`enabled: false` until ingest smoke). Branch `feat-bruce-chain-ethereum-ingest`. Kevin flips `enabled: true` after staging sign-off. |
| **P2** | Web polish when Andrew lands APIs | Team list, org PATCH, notification prefs |

Branch example: `feat-bruce-matching-m1-tests`. Style lock = Institutional Ink (dark). Cashier shell = `d17` only.

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
| M1-32 | Bruce | done | Matching test scaffold (mode-b) | `packages/matching/test/mode-b.test.mjs` |
| M1-33 | Bruce | done | Watcher ↔ payment_orders status contract | `doc/Watcher-Order-Status-Contract.md` |
| M1-34 | Bruce | done | Review Andrew migrations for M3 columns | `doc/M1-34-Payment-Orders-Review.md` |

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

## Milestone 2 — orders, QR, payment page

### Contract (Kevin)

| ID | Owner | Status | Task | Notes |
| --- | --- | --- | --- | --- |
| M2-01 | Kevin | done | OpenAPI: full order + payment schemas | `feat-kevin-api-spec-m2-orders` v0.2.0 |
| M2-02 | Kevin | done | Domain order fields for matching assign | `feat-kevin-domain-order-fields` |
| M2-03 | Kevin | done | Asset/network registry (USDT + Tron) | `feat-kevin-domain-asset-registry` |
| M2-04 | Kevin | done | OpenAPI matching-mode settings | PR #27 v0.2.1 |
| M2-05 | Kevin | done | OpenAPI settlement address book | PR #28 v0.2.2 |
| M2-10 | Kevin | done | OpenAPI settlement cool-down + xPub | v0.2.3 merged |
| M2-11 | Kevin | done | OpenAPI order list + CSV | v0.2.4 merged |
| M2-12 | Kevin | done | OpenAPI Mode S HD pool list | v0.2.5 merged |
| M2-13 | Kevin | done | CI: matching §2.8 acceptance | `feat-kevin-infra-matching-acceptance` |
| M2-07 | Kevin | done | M2 mid-gate smoke checklist | PR #35 |
| M2-08 | Kevin | done | Pay page CORS live path notes | merged to main |

---

## Milestone 3 — on-chain & full API

### Contract (Kevin)

| ID | Owner | Status | Task | Notes |
| --- | --- | --- | --- | --- |
| M3-01 | Kevin | done | OpenAPI signing, webhooks, service bills | v0.3.0 `feat-kevin-api-spec-m3-signing-webhooks` |
| M3-04 | Kevin | done | Live vs planned asset/network list | `doc/M3-04-Asset-Networks.md` |
| M3-02 | Kevin | done | Integration guide | `doc/M3-02-Integration-Guide.md` |
| M3-03 | Kevin | done | Webhook verify sample | `doc/examples/webhook-verify.mjs` |
| M3-gate | Kevin | done | M3 acceptance T02–T08 mapped to CI | `doc/M3-Acceptance.md` |

---

## Milestone 4 — hardening & ops

### Contract (Kevin)

| ID | Owner | Status | Task | Notes |
| --- | --- | --- | --- | --- |
| M4-11 | Kevin | done | OpenAPI API keys CRUD/rotate | v0.3.1 `feat-kevin-api-spec-m4-api-keys` |
| M4-05 | Kevin | done | Test vs prod env matrix in integration guide | `doc/M4-05-Env-Matrix.md` |
| M4-32 | Kevin | done | Merchant manual (matching / collision / cool-down) | `doc/M4-32-Merchant-Manual.md` |
| M4-01 | Kevin | done | Deploy/runbook on Company A accounts | `doc/M4-01-Deploy-Runbook.md` |
| M4-02 | Kevin | done | TLS + secrets (test/prod) | `doc/M4-02-Secrets-TLS.md` |
| M4-03 | Kevin | done | DB backup, restore, monitoring alerts | `doc/M4-03-Backup-Monitoring.md` |
| M4-04 | Kevin | done | Admin host + named vendor access | `doc/M4-04-Admin-Host-Vendor-Access.md` |
| M4-33 | Kevin | done | Ops runbook index | `doc/M4-33-Ops-Runbook-Index.md` |
| M4-34 | Kevin | done | OSS / third-party license list | `doc/M4-34-Third-Party-Licenses.md` |
| M4-35 | Kevin | done | DB schema reference | `doc/M4-35-Database-Schema.md` |
| M4-36 | Kevin | done | OpenAPI v0.3.2 audit + bills | `doc/M4-36-Audit-Bills-v032.md` |
| X-01 | Kevin | done | OpenAPI v0.3.3 fee tiers + commercial | `doc/X-01-Fee-Tiers-v033.md` |

### API (Andrew)

| ID | Owner | Status | Task | Notes |
| --- | --- | --- | --- | --- |
| M4-11 | Andrew | done | Implement `/v1/api-keys` + migrate columns | migrate 017 on main |

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
