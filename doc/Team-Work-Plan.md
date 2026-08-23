# Team Work Plan — Phase 1

Three developers working in parallel: **Kevin** (project manager), **Andrew** (API), **Bruce** (chain / watcher / matching).

Goal: minimize merge conflicts by **owning folders**, not features. Shared contracts are gated by Kevin before Andrew and Bruce build against them.

References: [ARCHITECTURE.md](ARCHITECTURE.md), [Business-Model.md](Business-Model.md), [Phase1-Project-Plan.md](Phase1-Project-Plan.md) §V Milestone 1. Full task breakdown: [Milestone-Task-List.md](Milestone-Task-List.md). UI design: [UI-Page-Spec.md](UI-Page-Spec.md).

---

## Roles

| Person | Title | Primary job |
| --- | --- | --- |
| **Kevin** | Project manager + contract gate | Priorities, milestone acceptance, `packages/api-spec` and `packages/domain` approval, monorepo / CI / deploy scaffold |
| **Andrew** | API owner | `apps/api` — auth, org tree, orders, webhooks, service bills, DB migrations |
| **Bruce** | Chain owner | `apps/watcher`, `packages/matching`, `packages/chain-clients` |

Kevin may implement thin, isolated UI (`apps/payment-page`, wireframes) when bandwidth allows. Kevin does **not** own `apps/api` business logic or matching implementation.

---

## Ownership matrix

### Kevin — may edit

```
packages/api-spec/**
packages/domain/**
.github/**
docker-compose*.yml
.env.example
README.md (repo overview only)
doc/Team-Work-Plan.md
apps/payment-page/**          (after M1 contract freeze; wireframes/prototypes in M1)
```

### Andrew — may edit

```
apps/api/**
apps/web/src/platform/**      (when assigned)
apps/web/src/agent/**         (when assigned)
```

Andrew owns **all database migrations** under `apps/api` (or agreed `migrations/` path). Bruce requests schema changes via PR or issue; he does not land migration files.

### Bruce — may edit

```
apps/watcher/**
packages/matching/**
packages/chain-clients/**
apps/cashier-apk/**           (Milestone 5; single owner once started)
apps/web/src/merchant/**      (when assigned)
```

### Shared read-only for everyone

Other people's trees are **read-only**. Need a change? Open a PR against the owner's branch or file an issue tagged with the owner.

---

## Do not touch (per person)

### Kevin — do not edit

| Path | Reason |
| --- | --- |
| `apps/api/**` | Andrew owns HTTP and org logic |
| `apps/watcher/**` | Bruce owns ingest loop |
| `packages/matching/**` | Bruce owns matching modes |
| `packages/chain-clients/**` | Bruce owns per-network clients |
| `apps/cashier-apk/**` | Bruce owns once APK work starts |

Exception: Kevin may add **integration tests** at repo root only if agreed in sprint planning (e.g. `tests/e2e/`), and only after M2 API exists.

### Andrew — do not edit

| Path | Reason |
| --- | --- |
| `packages/api-spec/**` | Contract gate — propose changes; Kevin merges |
| `packages/domain/**` | Shared types — propose changes; Kevin merges |
| `apps/watcher/**` | Bruce's process |
| `packages/matching/**` | Bruce implements; API **calls** via published functions only |
| `packages/chain-clients/**` | Bruce only |
| Root `docker-compose*.yml`, `.github/**` | Kevin owns infra unless delegated |

Andrew **must not** embed matching-mode logic inline in order routes. Call `packages/matching` assign API (Bruce provides the package interface).

### Bruce — do not edit

| Path | Reason |
| --- | --- |
| `packages/api-spec/**` | Request new fields via PR to Kevin |
| `packages/domain/**` | Request enum/type changes via PR to Kevin |
| `apps/api/**` | Andrew owns HTTP layer and migrations |
| `apps/payment-page/**` | Kevin or assigned UI owner |
| `apps/web/**` (unless assigned subtree) | Portal split by folder |

Bruce **must not** import from `apps/api`. Watcher talks to the DB and `packages/domain` / `packages/matching` only.

---

## Contract-first workflow

1. **Sprint 0 blocks all feature work** until `packages/domain` + `packages/api-spec` M1 slice merges to `main`.
2. **Field or enum change** → PR to `packages/api-spec` or `packages/domain` → Kevin reviews → merge → Andrew/Bruce rebase.
3. **Weekly contract freeze** (suggested: Tuesday EOD): order create response, auth headers, and org error shapes are frozen for the current sprint.
4. **DB schema change** → Andrew writes migration; Bruce reviews if watcher reads new columns; Kevin notes in sprint log.

Suggested `CODEOWNERS` (add when repo has GitHub remote):

```
/packages/api-spec/     @kevin
/packages/domain/       @kevin
/apps/api/              @andrew
/apps/watcher/          @bruce
/packages/matching/     @bruce
/packages/chain-clients/ @bruce
```

---

## Sprint 0 — blocking (Days 1–2)

**Owner: Kevin** (Andrew + Bruce review; no parallel feature branches until done).

| # | Task | Owner | Done when |
| --- | --- | --- | --- |
| 0.1 | Monorepo scaffold: `apps/*`, `packages/*` folders per README | Kevin | Empty apps start; `pnpm`/`npm` workspace or agreed tool |
| 0.2 | `packages/domain` — `OrgType`, `UserRole`, `OrderStatus`, `MatchingMode`, `Money`, `AssetNetwork` | Kevin | Types exported; no business logic |
| 0.3 | `packages/api-spec` — M1 paths: auth, session, org CRUD stubs; order stubs for prototype | Kevin | OpenAPI validates; paths match Phase1-Project-Plan §4.1 shape |
| 0.4 | DB convention doc (in this file § DB) + first migration **skeleton** only | Andrew | Migration runner works; no feature tables yet |
| 0.5 | Watcher process boots, health log, exits cleanly | Bruce | `apps/watcher` runs without API |
| 0.6 | `.env.example`, docker-compose for Postgres (and Redis if needed) | Kevin | Andrew + Bruce can connect locally |

**Gate:** Kevin calls Sprint 0 complete → Andrew and Bruce create feature branches.

### DB convention (Andrew owns migrations)

- Single source: `apps/api/migrations/` (or `apps/api/db/migrations/` — pick once in Sprint 0).
- Table naming: `snake_case`, plural (`payment_orders`, `org_accounts`).
- Watcher may **read/write** order status columns only; new columns require Bruce review on Andrew's migration PR.
- Enum values must match `packages/domain` exactly.

---

## Milestone 1 task board (Days 1–6)

Milestone goal ([Phase1-Project-Plan.md](Phase1-Project-Plan.md) §V): freeze spec and deliver a working **account system** plus UI **prototypes** (no live chain).

### Day 1 — Kickoff + Sprint 0 start

| Person | Tasks |
| --- | --- |
| **Kevin** | Confirm M1 scope signed; start monorepo + `packages/domain` + OpenAPI M1 paths; standup template |
| **Andrew** | Review domain types; stub `apps/api` entry (health route); migration tool choice |
| **Bruce** | Stub `apps/watcher` main loop; empty `packages/matching` router + `mode-b` placeholder file |

### Day 2 — Sprint 0 complete

| Person | Tasks |
| --- | --- |
| **Kevin** | Merge Sprint 0 to `main`; publish M1 API contract freeze v0.1; `.env.example` |
| **Andrew** | Users + sessions schema migration; password policy constants |
| **Bruce** | `packages/matching` export surface documented (assign vs match functions — stubs OK) |

### Day 3 — Auth + org foundation

| Person | Tasks |
| --- | --- |
| **Kevin** | OpenAPI: login, logout, session, MFA enroll/verify shapes; payment-page **wireframe** (static) |
| **Andrew** | Login, session, password policy; MFA for merchant/agent Owner + Administrator |
| **Bruce** | Org-related **read** models in watcher if needed for future; else chain-client folder layout + Tron stub |

### Day 4 — Org tree + roles

| Person | Tasks |
| --- | --- |
| **Kevin** | OpenAPI: org CRUD, invite user, role assignment; cashier POS **wireframes** (4 screens) |
| **Andrew** | Org types: Platform, Agent, Agent (sub), Merchant, Merchant (site); role middleware; `apps/api/src/orgs/**` |
| **Bruce** | Audit log table **review** on Andrew's PR (watcher may write chain events later); matching package tests scaffold |

### Day 5 — Prototypes + hardening

| Person | Tasks |
| --- | --- |
| **Kevin** | Create-order + payment-page **layout prototype** (mock data, no chain); POS device class confirmation note |
| **Andrew** | Order create **stub** (mock receive address, QR payload from domain); role isolation on settlement settings endpoints (403 for Cashier) |
| **Bruce** | Watcher skeleton polls DB or noop; document watcher ↔ order status contract for M3 |

### Day 6 — M1 test day (Kevin runs acceptance)

| Test | Owner verifies |
| --- | --- |
| Cashier cannot change parent merchant settlement address | Andrew |
| One merchant cannot open another merchant's records | Andrew |
| MFA + session revoke | Andrew |
| Prototype walkthrough: login, roles, order screen, POS wireframes | Kevin |
| Watcher boots alongside API without merge | Bruce |
| OpenAPI matches implemented M1 routes | Kevin |

**M1 exit:** Account system works; prototypes demo-ready; chain matching deferred to M3.

---

## After M1 — ownership preview (Days 7–30)

Use the same folder rules. Do not reassign owners mid-milestone without Kevin's call.

| Milestone | Andrew | Bruce | Kevin |
| --- | --- | --- | --- |
| **M2** (orders, QR, payment page) | Create order, address book, matching mode settings API | Mode B/C/S assign on create; HD pool states | `apps/payment-page` live against API |
| **M3** (on-chain) | Webhooks, reports, signed API | Watcher + full matching + first `chain-clients` network | Integration tests, integration guide |
| **M4** (security, prod) | API hardening, rate limits | Watcher reliability, reorg handling | Pen-test coordination, deploy runbook |
| **M5** (POS APK) | API stability for APK | `apps/cashier-apk` + hardware SDK | Pilot acceptance, merchant manual |

---

## Git conventions

Canonical rules for agents and humans: `.cursor/rules/Git_rule.mdc`. Summary below.

### Branch naming

```
{feat|fix}-{nick}-{surface}-{kebab-slug}
```

Integration branch is **`main`** (not `master`).

| nick | Allowed surfaces | Maps to paths |
| --- | --- | --- |
| **kevin** | `domain`, `api-spec`, `infra`, `payment-page` | `packages/domain`, `packages/api-spec`, `.github/`, `docker-compose*`, `apps/payment-page` |
| **andrew** | `api`, `web-platform`, `web-agent` | `apps/api`, `apps/web/src/platform`, `apps/web/src/agent` |
| **bruce** | `watcher`, `matching`, `chain`, `cashier-apk`, `web-merchant` | `apps/watcher`, `packages/matching`, `packages/chain-clients`, `apps/cashier-apk`, `apps/web/src/merchant` |

Examples:

```
feat-kevin-domain-sprint0-types
feat-kevin-api-spec-m1-paths
feat-andrew-api-m1-org-auth
feat-bruce-watcher-skeleton
feat-bruce-matching-mode-b-stub
```

Surface must match the ownership matrix — do not branch `feat-kevin-api-*` for work in `apps/api`.

### Workflow

1. Branch off `main` before coding; rebase on `main` daily before opening a PR.
2. **One PR per owned folder** when possible — avoids cross-tree reviews.
3. **No long-lived personal branches** (>3 days without merge).
4. Kevin merges to `main`; conflicts in `packages/domain` or `packages/api-spec` → Kevin resolves with both devs on call.
5. Agents and tools: **no branch or commit** unless the developer explicitly asks (see `Git_rule.mdc`).

### Commits

- One discrete feature per commit; subject `feat:` or `fix:`; body explains *why*.
- No `Co-authored-by: Cursor` trailers in commit messages.

### PR checklist (author)

- [ ] Only files in my ownership matrix (or Kevin-approved contract PR)
- [ ] Domain enums match `packages/domain`
- [ ] No import from `apps/api` in watcher (Bruce)
- [ ] No inline matching logic in API routes (Andrew)

---

## Integration checkpoints

| When | What | Participants |
| --- | --- | --- |
| End Sprint 0 | Contract v0.1 on `main` | All |
| End M1 Day 6 | Role isolation demo | Kevin + Andrew |
| M2 mid | Create order → payment page shows address | Kevin + Andrew |
| M3 mid | Mock tx → watcher → order Completed | Andrew + Bruce |
| M3 end | Webhook HMAC verified by sample merchant handler | Andrew + Kevin |
| Weekly | 15 min contract freeze + blockers | Kevin runs |

---

## Conflict escalation

1. **Same file needed** → wrong split; move shared code to `packages/domain` or `packages/matching` with Kevin PR.
2. **Schema disagreement** → Andrew proposes migration; Bruce comments; Kevin decides if product doc silent.
3. **API shape disagreement** → Kevin decides against `Business-Model.md` + OpenAPI; update doc if product change.

---

## Invariants (never assign to "whoever is free")

These are code review blockers for any PR:

1. Receive address is merchant-controlled; platform has no spend keys.
2. Volume fee is not deducted from payer on-chain payment.
3. Cashier cannot change settlement address, xPub, matching mode, or fees.
4. Agent accounts do not create merchant payment orders.
5. Same-amount collision on Mode B → anomaly; never FIFO guess.
6. Mode S never holds keys, never signs, never sweeps.
7. Webhooks are signed; do not fulfill on browser redirect alone.

---

## Document history

| Date | Change |
| --- | --- |
| 2026-08-22 | Initial team plan for Kevin / Andrew / Bruce, M1 day board |
| 2026-08-22 | Git conventions aligned with `.cursor/rules/Git_rule.mdc` |
