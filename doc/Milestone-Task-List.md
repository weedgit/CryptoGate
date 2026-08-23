# Milestone Task List — Phase 1

Detailed development and acceptance tasks for **Kevin** (PM + contract/infra), **Andrew** (API), and **Bruce** (watcher / matching / chain / cashier APK).

Schedule follows [Phase1-Project-Plan.md](Phase1-Project-Plan.md) §V (30-day plan). Ownership rules: [Team-Work-Plan.md](Team-Work-Plan.md).

**Legend:** `[K]` Kevin · `[A]` Andrew · `[B]` Bruce · `[K+A]` Kevin leads, Andrew implements · `[A+B]` joint

---

## Sprint 0 — Blocking foundation (Days 1–2)

**Goal:** Monorepo, shared types, API contract stub, local dev environment. No feature branches until Kevin calls Sprint 0 complete.

| ID | Task | Owner | Depends on |
| --- | --- | --- | --- |
| S0-01 | Create monorepo workspace (`apps/*`, `packages/*`) per README layout | [K] | — |
| S0-02 | Add `.env.example`, `docker-compose` (Postgres; Redis if needed) | [K] | S0-01 |
| S0-03 | CI skeleton (lint/test placeholders, branch protection notes) | [K] | S0-01 |
| S0-04 | `packages/domain` — `OrgType`, `UserRole`, `OrderStatus`, `MatchingMode`, `Money`, `AssetNetwork` | [K] | — |
| S0-05 | `packages/api-spec` — M1 paths: auth, session, org CRUD stubs; order stubs | [K] | S0-04 |
| S0-06 | Review domain + OpenAPI; confirm enum names match `Business-Model.md` | [A] [B] | S0-04, S0-05 |
| S0-07 | `apps/api` entry + health route; choose migration tool and folder path | [A] | S0-01 |
| S0-08 | First migration skeleton (empty or `schema_migrations` only) | [A] | S0-07 |
| S0-09 | `apps/watcher` boots, logs health, exits cleanly | [B] | S0-01 |
| S0-10 | `packages/matching` router stub + `mode-b` placeholder file | [B] | S0-04 |
| S0-11 | Document matching package public API (`assignOnCreate`, `matchTransaction` stubs) | [B] | S0-10 |
| S0-12 | **Gate:** Kevin merges Sprint 0 to `main`, publishes contract freeze v0.1 | [K] | S0-01–S0-11 |

---

## Milestone 1 — Account system + prototypes (Days 1–6)

**Goal:** Freeze spec; working auth, org tree, roles, MFA; order/payment **prototypes** (no live chain).  
**Reference:** Phase1-Project-Plan §V Milestone 1.

### M1 — Product & contract

| ID | Task | Owner | Depends on |
| --- | --- | --- | --- |
| M1-01 | Confirm M1 scope signed (requirements, architecture, matching modes, APK wireframes in scope) | [K] | — |
| M1-02 | OpenAPI: login, logout, session, MFA enroll/verify request/response schemas | [K] | S0-12 |
| M1-03 | OpenAPI: org CRUD, invite user, assign role, list subtree | [K] | S0-12 |
| M1-04 | OpenAPI: order create **stub** response (mock address, QR fields) | [K] | S0-12 |
| M1-05 | Weekly standup + contract-freeze schedule | [K] | — |

### M1 — API & data (`apps/api`)

| ID | Task | Owner | Depends on |
| --- | --- | --- | --- |
| M1-10 | DB: `users`, `sessions`, password hash, password policy enforcement | [A] | S0-12 |
| M1-11 | Login, logout, session refresh, session revoke | [A] | M1-10 |
| M1-12 | MFA (TOTP or agreed method) for merchant + agent Owner and Administrator | [A] | M1-11 |
| M1-13 | DB: `org_accounts` — Platform, Agent, Agent (sub), Merchant, Merchant (site) | [A] | M1-10 |
| M1-14 | Org tree CRUD; max agent depth setting (Platform Owner); nesting rules | [A] | M1-13 |
| M1-15 | User ↔ org membership; roles Owner, Administrator, Viewer, Cashier | [A] | M1-13 |
| M1-16 | Role middleware / policy layer on all protected routes | [A] | M1-15 |
| M1-17 | Append-only `audit_log` — login + privileged actions | [A] | M1-11 |
| M1-18 | Settlement settings endpoints stub; **403 for Cashier** on address/xPub/fee/matching | [A] | M1-16 |
| M1-19 | Order create **stub** — mock `receive_address`, `payable_amount`, QR payload (no chain) | [A] | M1-16, M1-04 |
| M1-20 | Merchant A cannot read Merchant B records (scope filter on all queries) | [A] | M1-16 |

### M1 — Watcher & matching (skeleton)

| ID | Task | Owner | Depends on |
| --- | --- | --- | --- |
| M1-30 | Watcher main loop (poll DB or noop); graceful shutdown | [B] | S0-12 |
| M1-31 | `packages/chain-clients/` folder layout; Tron client stub (no live RPC yet) | [B] | S0-12 |
| M1-32 | Matching package test scaffold (empty tests for mode-b) | [B] | S0-10 |
| M1-33 | Document watcher ↔ `payment_orders` status contract for M3 | [B] | M1-30 |
| M1-34 | Review Andrew's migrations for columns watcher will need in M3 | [B] | M1-19 |

### M1 — UI prototypes & design (no live chain)

| ID | Task | Owner | Depends on |
| --- | --- | --- | --- |
| M1-40 | Payment page wireframe — amount, asset, network, address, expiry, wrong-network warning | [K] | — |
| M1-41 | Payment page layout prototype (static/mock data) | [K] | M1-40 |
| M1-42 | Create-order screen prototype (merchant/cashier context, mock) | [K] | M1-40 |
| M1-43 | Cashier APK wireframes: login, create order, QR screen, customer display, receipt | [K] | — |
| M1-44 | Written note: POS device **class** confirmed; reference SKU TBD before M5 | [K] | — |

### M1 — Acceptance (Day 6)

| ID | Test | Verifier | Owner fix |
| --- | --- | --- | --- |
| M1-T01 | Cashier cannot change parent merchant settlement address | [K] | [A] |
| M1-T02 | One merchant account cannot open another merchant's records | [K] | [A] |
| M1-T03 | MFA enroll + login; session revoke invalidates token | [K] | [A] |
| M1-T04 | Agent account user cannot create merchant payment orders | [K] | [A] |
| M1-T05 | Prototype walkthrough: login, roles, order screen, POS wireframes | [K] | [K] |
| M1-T06 | Watcher runs alongside API as separate process | [K] | [B] |
| M1-T07 | Implemented M1 routes match OpenAPI v0.1 | [K] | [A] |

**M1 exit criteria:** Account system demo-ready; prototypes approved; chain deferred to M3.

---

## Milestone 2 — Create order, QR, payment page (Days 7–12)

**Goal:** Merchants create collection orders; guest gets QR/link; address book + matching mode settings; APK generic Android.  
**Reference:** Phase1-Project-Plan §V Milestone 2.

### M2 — Contract & domain

| ID | Task | Owner | Depends on |
| --- | --- | --- | --- |
| M2-01 | OpenAPI: full `POST /v1/orders`, `GET /v1/orders/{id}`, `GET .../payment` schemas | [K] | M1 exit |
| M2-02 | Domain: order fields `matching_mode`, `payable_amount`, `receive_address`, `address_source`, `hd_index`, `memo_or_tag` | [K] | M1 exit |
| M2-03 | Asset/network registry config (first network: agree USDT + one chain, e.g. Tron) | [K] | M2-02 |

### M2 — API & database

| ID | Task | Owner | Depends on |
| --- | --- | --- | --- |
| M2-10 | DB: `payment_orders` with expiry, unique order number, idempotency key | [A] | M2-02 |
| M2-11 | `POST /v1/orders` — create from API + merchant backend; idempotent | [A] | M2-10, M2-01 |
| M2-12 | Integrate `packages/matching` on create — assign address/amount per mode | [A] | M2-11, M2-40 |
| M2-13 | `GET /v1/orders/{id}`, `GET /v1/orders/{id}/payment` — QR payload, pay URL | [A] | M2-11 |
| M2-14 | Order expiry job / status → Expired when past validity | [A] | M2-10 |
| M2-15 | Merchant payment-address book; per asset/network settlement address | [A] | M2-10 |
| M2-16 | Address change: MFA + cool-down + alert + audit (not active until cool-down ends) | [A] | M2-15, M1-12 |
| M2-17 | Merchant settings API: matching mode (B/C/D/S); lock mode on order at create | [A] | M2-11 |
| M2-18 | Cashier **403** on address book, xPub, matching mode, fee endpoints | [A] | M2-16, M2-17 |
| M2-19 | Agent account **403** on payment order create | [A] | M2-11 |
| M2-20 | xPub registration API: MFA, cool-down, audit (Mode S prerequisite) | [A] | M2-16 |
| M2-21 | `GET /v1/orders` list + export scoped to org tree | [A] | M2-11 |

### M2 — Matching & Mode S (`packages/matching`)

| ID | Task | Owner | Depends on |
| --- | --- | --- | --- |
| M2-40 | **Mode B** — `assignOnCreate`: fixed settlement address | [B] | M2-02 |
| M2-41 | **Mode C** — unique payable amount among open orders; reserve until close | [B] | M2-40 |
| M2-42 | **Mode D** — memo/tag assign (stub + network capability flag) | [B] | M2-40 |
| M2-43 | **Mode S** — conflict detect; main vs HD pool assign on create | [B] | M2-40 |
| M2-44 | HD pool DB model: `FREE` / `IN_USE` / `COOLDOWN`; atomic FREE claim | [B] | M2-43, [A] migration review |
| M2-45 | Reject Mode S + Mode C on same order path | [B] | M2-41, M2-43 |
| M2-46 | Unit tests: Mode S no conflict → main; two same-amount → distinct HD addresses | [B] | M2-43 |

### M2 — Payment page (`apps/payment-page`)

| ID | Task | Owner | Depends on |
| --- | --- | --- | --- |
| M2-50 | Public pay URL — fetch order payment info from API (no merchant session) | [K] | M2-13 |
| M2-51 | Display amount, asset, network, contract, address, expiry, wrong-network warning | [K] | M2-50 |
| M2-52 | QR render + copy address / copy amount / share link | [K] | M2-50 |
| M2-53 | Mode C: show exact fingerprint amount + "pay exact amount" warning | [K] | M2-51 |
| M2-54 | Hide Mode D on unsupported USDT networks (per plan §2.4) | [K] | M2-51 |

### M2 — Merchant web (`apps/web/src/merchant`)

| ID | Task | Owner | Depends on |
| --- | --- | --- | --- |
| M2-60 | Merchant portal: create order UI (amount, asset, network, validity) | [B] | M2-11 |
| M2-61 | Matching mode settings UI (Owner/Admin only; labels Standard / Amount fingerprint / Memo tag / Smart address) | [B] | M2-17 |
| M2-62 | Settlement address book UI + pending cool-down state | [B] | M2-16 |
| M2-63 | xPub registration UI (Owner/Admin; Mode S) | [B] | M2-20 |

### M2 — Cashier APK — generic Android (`apps/cashier-apk`)

| ID | Task | Owner | Depends on |
| --- | --- | --- | --- |
| M2-70 | Kotlin project scaffold; API client + auth (cashier login) | [B] | M2-01 |
| M2-71 | Create order screen → `POST /v1/orders` | [B] | M2-11, M2-70 |
| M2-72 | Show QR, amount, network, address, expiry on main screen | [B] | M2-13, M2-71 |
| M2-73 | Hide wallet / xPub / matching settings; handle 403 gracefully | [B] | M2-72 |
| M2-74 | Offline/network-error state (no create-order offline) | [B] | M2-71 |

### M2 — Acceptance (Day 12)

| ID | Test | Verifier | Owner fix |
| --- | --- | --- | --- |
| M2-T01 | Payment page shows correct network and address for order | [K] | [K] |
| M2-T02 | Expired order cannot be treated as new live order | [K] | [A] |
| M2-T03 | Address change inactive until cool-down ends | [K] | [A] |
| M2-T04 | Cashier cannot edit settlement address or xPub (API + UI) | [K] | [A] [B] |
| M2-T05 | Mode C fingerprint visible on payment page | [K] | [K] [B] |
| M2-T06 | Mode D hidden on unsupported USDT network | [K] | [K] |
| M2-T07 | Mode S: no conflict → main address; two same-amount → second gets HD address | [K] | [B] |
| M2-T08 | APK QR matches `GET /v1/orders/{id}/payment` | [K] | [B] |

---

## Milestone 3 — On-chain confirmation & full API (Days 13–18)

**Goal:** Watcher matches chain txs; full order status machine; signed webhooks; reports; integration docs.  
**Reference:** Phase1-Project-Plan §V Milestone 3.

### M3 — Contract & documentation

| ID | Task | Owner | Depends on |
| --- | --- | --- | --- |
| M3-01 | OpenAPI: webhooks, on-chain, list/export, auth signing headers | [K] | M2 exit |
| M3-02 | Integration guide: auth, signing, replay, idempotency, webhook HMAC | [K] | M3-20 |
| M3-03 | Worked webhook verify example (sample handler code in doc) | [K] | M3-20 |
| M3-04 | Connected assets/networks list doc (from plan §VI; mark live vs planned) | [K] | M3-30 |

### M3 — API

| ID | Task | Owner | Depends on |
| --- | --- | --- | --- |
| M3-10 | API request signing: timestamp, nonce, replay rejection | [A] | M3-01 |
| M3-11 | Rate limits per API key and source IP | [A] | M3-10 |
| M3-12 | `GET /v1/orders/{id}/on-chain` — tx hash, block, from/to, amount, time | [A] | M3-50 |
| M3-13 | `POST /v1/webhooks` register; `POST /v1/webhooks/test` signed sample event | [A] | M3-01 |
| M3-14 | Webhook delivery worker: sign payload, retries, idempotent handler contract | [A] | M3-13 |
| M3-15 | Reports + export: include `matching_mode`, `payable_amount`, `receive_address`, `address_source`, `hd_index`, `memo_or_tag` | [A] | M2-21 |
| M3-16 | Service bill routes stub (separate rail from payment orders — no merge) | [A] | M3-01 |

### M3 — Chain client (`packages/chain-clients`)

| ID | Task | Owner | Depends on |
| --- | --- | --- | --- |
| M3-30 | **First live network** client (e.g. USDT Tron): ingest txs to watched addresses | [B] | M2-03 |
| M3-31 | Network config: confirmations, min amount, precision, contract address | [B] | M3-30 |
| M3-32 | Stubs or second-priority clients for additional §VI networks (schedule per Kevin) | [B] | M3-30 |

### M3 — Watcher (`apps/watcher`)

| ID | Task | Owner | Depends on |
| --- | --- | --- | --- |
| M3-40 | Ingest loop: poll/subscribe via `chain-clients`; dedupe by tx hash | [B] | M3-30 |
| M3-41 | Map inbound tx → open order via `packages/matching` | [B] | M3-40, M3-60 |
| M3-42 | Status transitions: Pending Payment → Verifying → Confirmed → Completed | [B] | M3-41 |
| M3-43 | Expired, Payment Anomaly, Failed paths | [B] | M3-41 |
| M3-44 | Underpay, overpay, duplicate hash, wrong network, delayed arrival | [B] | M3-41 |
| M3-45 | Node delay / congestion backoff; log for ops | [B] | M3-40 |
| M3-46 | Watcher writes order status only — no import from `apps/api` | [B] | M3-40 |

### M3 — Matching (full)

| ID | Task | Owner | Depends on |
| --- | --- | --- | --- |
| M3-60 | **Mode B** `matchTransaction`: strict match; same-amount collision → Anomaly (no FIFO) | [B] | M2-40 |
| M3-61 | **Mode C** exact fingerprint match | [B] | M2-41 |
| M3-62 | **Mode D** memo match on supported network only | [B] | M2-42 |
| M3-63 | **Mode S** match by owned address; pool COOLDOWN → FREE after configured window | [B] | M2-44 |
| M3-64 | Acceptance tests per plan §2.8 (B collision, C concurrent, S three-order, address never rewritten) | [B] | M3-60–M3-63 |

### M3 — Cashier APK (live status)

| ID | Task | Owner | Depends on |
| --- | --- | --- | --- |
| M3-70 | Poll order status from API; UI states through Completed / Expired / Anomaly | [B] | M3-42, M2-72 |
| M3-71 | **No** local "mark paid" button | [B] | M3-70 |
| M3-72 | Anomaly shown distinctly — must not show Completed | [B] | M3-70 |

### M3 — Acceptance (Day 18)

| ID | Test | Verifier | Owner fix |
| --- | --- | --- | --- |
| M3-T01 | Required confirmations → Completed | [K] | [B] |
| M3-T02 | Mode B: two same-amount open orders → Anomaly, not auto-Complete | [K] | [B] |
| M3-T03 | Mode C: two concurrent fingerprints match correct orders | [K] | [B] |
| M3-T04 | Mode D: match on supported net; wrong/missing memo not auto-Complete | [K] | [B] |
| M3-T05 | Mode S: three same-amount orders → distinct destinations; pool reuse after cool-down | [K] | [B] |
| M3-T06 | Wrong network, underpay, overpay, duplicate hash classified correctly | [K] | [B] |
| M3-T07 | Unsigned/replayed API calls rejected | [K] | [A] |
| M3-T08 | Sample merchant verifies webhook HMAC; replay ignored | [K] | [A] |
| M3-T09 | Test environment handoff to client (Company A) | [K] | [K] |
| M3-T10 | APK status matches server including Anomaly | [K] | [B] |

---

## Milestone 4 — Security, production, pilot (Days 19–24)

**Goal:** Production deploy on client cloud; security testing; pilot merchants; operations docs.  
**Reference:** Phase1-Project-Plan §V Milestone 4, Phase1-Requirement §V.

### M4 — Infrastructure & deploy

| ID | Task | Owner | Depends on |
| --- | --- | --- | --- |
| M4-01 | Production Terraform/scripts or runbook on Company A accounts | [K] | M3 exit |
| M4-02 | TLS, separate prod keys, secrets in env/secret manager | [K] | M4-01 |
| M4-03 | DB backup, restore procedure, monitoring alerts | [K] | M4-01 |
| M4-04 | Admin host separated; vendor access named and logged | [K] | M4-01 |
| M4-05 | Test vs production environment matrix in integration guide | [K] | M3-02 |

### M4 — API hardening

| ID | Task | Owner | Depends on |
| --- | --- | --- | --- |
| M4-10 | Authorization regression suite (roles, Cashier, agent, cross-merchant) | [A] | M3 exit |
| M4-11 | API key rotation, webhook secret handling docs | [A] | M3-13 |
| M4-12 | Load test critical paths: create order, get status, webhook fanout | [A] | M4-10 |
| M4-13 | Service bill checkout stub UI/API (separate from payment order) | [A] | M3-16 |

### M4 — Watcher & chain reliability

| ID | Task | Owner | Depends on |
| --- | --- | --- | --- |
| M4-20 | Watcher HA / restart safety; no duplicate status updates | [B] | M3-40 |
| M4-21 | Reorg / rollback handling for first live network | [B] | M3-30 |
| M4-22 | Additional §VI networks per agreed priority | [B] | M3-32 |
| M4-23 | Signed APK build pipeline (test vs prod API base URL) | [B] | M2-70 |

### M4 — Portals & manuals

| ID | Task | Owner | Depends on |
| --- | --- | --- | --- |
| M4-30 | Platform admin shell: agents, fee tiers, max agent depth, audit review | [A] | M1-14 |
| M4-31 | Agent portal: subtree merchants, volume view, service bills read-only | [A] | M1-14 |
| M4-32 | Merchant manual: matching modes, collision behaviour, address cool-down | [K] | M2-61 |
| M4-33 | Administrator + deployment + ops runbooks | [K] | M4-01 |
| M4-34 | Third-party / OSS licence list | [K] | — |
| M4-35 | DB schema documentation | [K] | [A] provides ERD/migrations |

### M4 — Pilot

| ID | Task | Owner | Depends on |
| --- | --- | --- | --- |
| M4-40 | Select pilot merchants (client sign-off) | [K] | — |
| M4-41 | Pilot: live order + on-chain confirm + webhook + report | [K] | M4-40, M3-T01 |
| M4-42 | Pilot exercises Mode B + at least one optional mode (C or S) | [K] | M4-41 |

### M4 — Security testing (Day 24)

| ID | Test | Verifier | Owner fix |
| --- | --- | --- | --- |
| M4-T01 | Functional + regression per Phase1-Requirement §V | [K] | [A] [B] |
| M4-T02 | Auth, key handling, web vulns, duplicate prevention | [K] | [A] |
| M4-T03 | Chain verification + abnormal payment scenarios | [K] | [B] |
| M4-T04 | Load, restore, dependency CVE review | [K] | [K] [A] |
| M4-T05 | Independent pen test; serious/high findings fixed and retested | [K] | [A] [B] |
| M4-T06 | Pilot: no false "paid" in production (incl. amount collision) | [K] | [B] |
| M4-T07 | Client deploys from delivered source in agreed environment | [K] | [K] |

---

## Milestone 5 — Reference POS hardware (Days 25–30)

**Goal:** Customer display + thermal printer on reference device; counter pilot.  
**Reference:** Phase1-Project-Plan §V Milestone 5, §III.

### M5 — Hardware & APK

| ID | Task | Owner | Depends on |
| --- | --- | --- | --- |
| M5-01 | Reference device confirmed in writing (make, model, Android, SDK) | [K] | M1-44 |
| M5-02 | Integrate OEM SDK: thermal printer — print on Completed + reprint | [B] | M5-01 |
| M5-03 | Customer-facing second screen: QR + amount + network + warning | [B] | M5-01 |
| M5-04 | Kiosk: keep-awake during open order; reduce accidental exit | [B] | M5-02 |
| M5-05 | Receipt content: order #, time, amount, asset, network, address (trunc option), status, tx hash | [B] | M5-02 |
| M5-06 | Optional anomaly receipt (distinct from Completed) | [B] | M5-05 |
| M5-07 | Reprint last receipt; today's orders for this Cashier only | [B] | M5-05 |
| M5-08 | Sideload / MDM install notes; release APK checksum | [K] | M5-02 |
| M5-09 | Cashier POS section in merchant manual | [K] | M5-08 |

### M5 — API support (stability only)

| ID | Task | Owner | Depends on |
| --- | --- | --- | --- |
| M5-10 | API stability for APK; no breaking changes without version bump | [A] | M4 exit |
| M5-11 | Server enforces Cashier cannot call wallet/xPub/matching endpoints | [A] | M2-18 |

### M5 — Counter pilot & acceptance (Day 30)

| ID | Test | Verifier | Owner fix |
| --- | --- | --- | --- |
| M5-T01 | Customer screen QR/amount/network matches `GET .../payment` | [K] | [B] |
| M5-T02 | Completed order prints slip with order #, amount, asset, network, tx hash | [K] | [B] |
| M5-T03 | Cashier on POS cannot change settlement, xPub, matching mode | [K] | [A] [B] |
| M5-T04 | Counter pilot: create → guest pays on-chain → Completed → receipt | [K] | [B] |
| M5-T05 | **Fallback:** if no reference device, generic APK accepted; printer/second-screen waived until SKU supplied | [K] | [K] |

---

## Cross-milestone backlog (assign when scheduled)

Tasks from requirements not tied to a single milestone day — Kevin schedules into sprints.

| ID | Task | Owner | Target |
| --- | --- | --- | --- |
| X-01 | Platform fee tiers + volume fee bands (Small/Mid/Enterprise) | [A] API, [K] spec | M4 |
| X-02 | Service bill generation + separate checkout (platform billing wallet) | [A] | M4 |
| X-03 | Agent commission statements (read-only subtree) | [A] | M4 |
| X-04 | Merchant (site) settings inherit + Owner approval for overrides | [A] | M2–M3 |
| X-05 | Immutable audit log UI (Platform) | [A] | M4 |
| X-06 | Remaining §VI asset/network pairs (after first live network) | [B] | M4+ |
| X-07 | E2E integration test suite at repo root | [K] | M3+ |

---

## Summary — task count by owner

| Milestone | Kevin | Andrew | Bruce | Joint tests |
| --- | ---: | ---: | ---: | ---: |
| Sprint 0 | 6 | 2 | 4 | — |
| M1 | 9 | 11 | 5 | 7 |
| M2 | 8 | 12 | 18 | 8 |
| M3 | 6 | 7 | 18 | 10 |
| M4 | 14 | 6 | 5 | 7 |
| M5 | 4 | 2 | 9 | 5 |
| Cross | 3 | 4 | 1 | — |

*Bruce M2–M3 is heaviest (matching + watcher + APK + merchant web). Kevin should not overload parallel contract changes during Bruce's Mode S / watcher sprints.*

---

## Document history

| Date | Change |
| --- | --- |
| 2026-08-22 | Initial milestone task list for Kevin / Andrew / Bruce |
