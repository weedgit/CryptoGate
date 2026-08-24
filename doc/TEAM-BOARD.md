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
| M2-40 | Mode B assign (main address + amount validation) | Bruce | **done** | PR #12 merged |
| M1-34 | Review Andrew `payment_orders` migration | Bruce | **done** | `doc/M1-34-Payment-Orders-Review.md` |
| M2-41 | Mode C assign (fingerprint + reservation port) | Bruce | **done** | PR #17 merged |
| M2-42 | Mode D assign (memoSupported gate + unique memo) | Bruce | **done** | PR #18 merged |
| M2-45 | Reject Mode S+C / Mode C wide underpay | Bruce | **doing** | `feat-bruce-matching-reject-s-c-combo` |

## Now — matching (Bruce)

**Current:** M2-45 settings policy on `feat-bruce-matching-reject-s-c-combo`.

**Next after merge:** Mode S (M2-43) needs Andrew xPub + HD pool migration. Ask Andrew to call `validateMatchingSettings` on settlement save + wire `assignOnCreate`.

## Blockers / asks for Kevin

- Optional: `scripts/check.mjs` run `apps/watcher/test` + domain `pnpm build` before matching tsc.
- Enable a `memoSupported: true` asset/network when Mode D should go live beyond reject-path.
- `HdPoolState` in OpenAPI if merchant UI exposes pool (M2).

## Blockers / asks for Andrew

- Wire `@cryptogate/matching` `assignOnCreate` instead of stub; Mode C/D reservation ports under create lock.
- Call `validateMatchingSettings` when Owner/Admin saves matching mode (M2-45).
- Mode S: HD pool migration + xPub registration when ready for M2-43.

---

| Date | Change |
| --- | --- |
| 2026-08-24 | Bruce: M2-45 reject Mode S+C / Mode C wide underpay |
| 2026-08-24 | Bruce: M2-42 Mode D assign (memoSupported gate) |
| 2026-08-24 | Bruce: M1-34 accept payment_orders; M2-41 Mode C assign |
| 2026-08-24 | Bruce: M2-40 Mode B assign harden + tests |
| 2026-08-24 | Bruce: M1-32 scaffold branch; C/D/S stubs; next M2-40 after merge |
| 2026-08-23 | Bruce: S0-06 + M1-30/31/33 complete |
| 2026-08-23 | Bruce: default watcher one-tick; `pnpm start` uses `--loop`; reverted root file edits |
