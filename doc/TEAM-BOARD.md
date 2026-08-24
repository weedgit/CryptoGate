# Team board — CryptoGate Phase 1

Local only (`doc/` gitignored). Bruce updates this row when starting/finishing tasks.

**Pull before each session:** `git fetch origin && git pull origin main`

| ID | Task | Owner | Status | Branch / note |
| --- | --- | --- | --- | --- |
| M3-41 | Watcher → matchTransaction wire | Bruce | **done** | PR #34 merged |
| M3-42 | Confirmations → completed | Bruce | **doing** | `feat-bruce-watcher-confirmations` |
| M3-62 | Mode D memo match | Bruce | **done** | PR #32 merged |
| M3-60 / M3-61 | Mode B/C match | Bruce | **done** | PR #26 / #29 |

## Now — watcher (Bruce)

**Current:** M3-42 confirmation advance on `feat-bruce-watcher-confirmations`.

**Next after merge:** Live Tron transfer poll (M3-40) needs RPC; Mode S match (M3-63) needs HD pool.

## Blockers

- Andrew: HD pool (M2-44) + xPub (M2-20) for Mode S.
- Kevin: `memoSupported: true` registry row when Mode D goes live on-chain.

---

| Date | Change |
| --- | --- |
| 2026-08-24 | Bruce: M3-42 watcher confirmations → completed |
| 2026-08-24 | Bruce: M3-41 watcher match wire |
| 2026-08-24 | Bruce: M3-60/61/62 matchTransaction modes B/C/D |
