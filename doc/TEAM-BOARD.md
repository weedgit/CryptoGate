# Team board — CryptoGate Phase 1

Local only (`doc/` gitignored). Bruce updates this row when starting/finishing tasks.

**Pull before each session:** `git fetch origin && git pull origin main`

| ID | Task | Owner | Status | Branch / note |
| --- | --- | --- | --- | --- |
| S0-06 | Review domain + OpenAPI (watcher/matching) | Bruce | **done** | `doc/S0-06-Bruce-Review.md` |
| M1-30 | Watcher main loop + graceful shutdown | Bruce | **done** | `apps/watcher` — `--loop` for prod, default one tick for CI |
| M1-31 | Tron client stub | Bruce | **done** | `packages/chain-clients/tron` |
| M1-33 | Watcher ↔ order status contract doc | Bruce | **done** | `doc/Watcher-Order-Status-Contract.md` |

## Now — M1 watcher (Bruce)

All M1 watcher rows **done** (uncommitted on `feat-bruce-watcher-m1-loop`). Next: M1-32 matching test scaffold or wait for Andrew `payment_orders` migration.

## Blockers / asks for Kevin

- Optional: `scripts/check.mjs` run `apps/watcher/test` + domain `pnpm build` before matching tsc (local check currently fragile).
- `HdPoolState` in OpenAPI if merchant UI exposes pool (M2).

## Blockers / asks for Andrew

- M2 migration: `payment_orders` columns per `doc/Watcher-Order-Status-Contract.md`.

---

| Date | Change |
| --- | --- |
| 2026-08-23 | Bruce: S0-06 + M1-30/31/33 complete |
| 2026-08-23 | Bruce: default watcher one-tick; `pnpm start` uses `--loop`; reverted root file edits |
