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
| M2-40 | Mode B assign (main address + amount validation) | Bruce | **doing** | `feat-bruce-matching-mode-b-assign` |

## Now — matching (Bruce)

**Current:** M2-40 Mode B assign on `feat-bruce-matching-mode-b-assign` — registry min/decimals, `hdIndex`/`memoOrTag` null.

**Next after merge:** wait on Andrew `payment_orders` for Mode C open-order reservation (M2-41) / Mode S pool (M2-43). Mode D (M2-42) can follow independently if memo networks land.

## Blockers / asks for Kevin

- Optional: `scripts/check.mjs` run `apps/watcher/test` + domain `pnpm build` before matching tsc (local check currently fragile).
- `HdPoolState` in OpenAPI if merchant UI exposes pool (M2).

## Blockers / asks for Andrew

- M1-19 / M2: `payment_orders` migration with columns per `doc/Watcher-Order-Status-Contract.md` + domain `PaymentOrderColumn` (needed for M1-34 review and Mode C/S).

---

| Date | Change |
| --- | --- |
| 2026-08-24 | Bruce: M2-40 Mode B assign harden + tests |
| 2026-08-24 | Bruce: M1-32 scaffold branch; C/D/S stubs; next M2-40 after merge |
| 2026-08-23 | Bruce: S0-06 + M1-30/31/33 complete |
| 2026-08-23 | Bruce: default watcher one-tick; `pnpm start` uses `--loop`; reverted root file edits |
