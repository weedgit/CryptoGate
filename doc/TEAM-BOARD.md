# Team board — CryptoGate Phase 1

Local only (`doc/` gitignored). Bruce updates this row when starting/finishing tasks.

**Pull before each session:** `git fetch origin && git pull origin main`

| ID | Task | Owner | Status | Branch / note |
| --- | --- | --- | --- | --- |
| S0-06 | Review domain + OpenAPI (watcher/matching) | Bruce | **done** | `doc/S0-06-Bruce-Review.md` |
| M1-30 | Watcher main loop + graceful shutdown | Bruce | **done** | `apps/watcher` — `--loop` for prod, default one tick for CI |
| M1-31 | Tron client stub | Bruce | **done** | `packages/chain-clients/tron` |
| M1-33 | Watcher ↔ order status contract doc | Bruce | **done** | `doc/Watcher-Order-Status-Contract.md` |
| M1-32 | Matching package test scaffold (B + empty C/D/S) | Bruce | **done** | `feat-bruce-matching-test-scaffold` |

## Now — matching (Bruce)

M1 watcher rows done (merged). Kevin **M2-02** PaymentOrder fields are on `main` → Mode B assign (M2-40) is unblocked after M1-32 lands.

**Current:** M1-32 mode-c / mode-d / mode-s stubs + tests on `feat-bruce-matching-test-scaffold`.

**Next after merge:** `feat-bruce-matching-mode-b-assign` (M2-40).

## Blockers / asks for Kevin

- Optional: `scripts/check.mjs` run `apps/watcher/test` + domain `pnpm build` before matching tsc (local check currently fragile).
- `HdPoolState` in OpenAPI if merchant UI exposes pool (M2).

## Blockers / asks for Andrew

- M1-19 / M2: `payment_orders` migration with columns per `doc/Watcher-Order-Status-Contract.md` + domain `PaymentOrderColumn` (needed for M1-34 review and Mode S pool).

---

| Date | Change |
| --- | --- |
| 2026-08-24 | Bruce: M1-32 scaffold branch; C/D/S stubs; next M2-40 after merge |
| 2026-08-23 | Bruce: S0-06 + M1-30/31/33 complete |
| 2026-08-23 | Bruce: default watcher one-tick; `pnpm start` uses `--loop`; reverted root file edits |
