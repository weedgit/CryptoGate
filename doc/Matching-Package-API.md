# Matching public API (Bruce)

Package path: `packages/matching`

## Exports

| Function / type | Called by | Purpose |
| --- | --- | --- |
| `assignOnCreate` | `apps/api` on order create | Assign payable amount + receive address (+ memo) per mode |
| `matchModeB` / `matchModeC` / `matchModeD` | watcher / tests | Mode B/C/D match (also via `matchTransaction`) |
| `MatchCandidateOrder` | watcher | Open-order row shape for match |
| `assignModeB` / `assignModeC` / `assignModeD` / `assignModeS` | tests / direct | Mode modules (also via router) |
| `majorToMinor` / `minorToMajor` | tests / callers | Major ↔ minor unit conversion |
| `pickUniquePayableMinor` | tests | Mode C fingerprint picker (pure) |
| `pickUniqueMemoOrTag` | tests | Mode D memo picker (pure) |
| `ListReservedPayableAmounts` | Andrew | Port for open-order payable list |
| `ListReservedMemoOrTags` | Andrew | Port for open-order memo list |
| `HasModeSSameAmountConflict` / `ClaimHdPoolAddress` | Andrew | Mode S conflict + HD claim ports |
| `MODE_S_CONFLICT_STATUSES` | Andrew | Statuses that count as Mode S same-amount conflict |
| `validateMatchingSettings` / `assertMatchingSettings` | API / merchant UI | Reject Mode S+C and Mode C with wide underpay (M2-45) |

Mode modules: `mode-b`, `mode-c`, `mode-d`, `mode-s` (+ `mode-s/pool` FREE/IN_USE/COOLDOWN helpers — M2-44; DB owned by API — see `doc/M2-44-Hd-Pool.md`).

| Mode | Assign status |
| --- | --- |
| B | **M2-40 done** — main settlement address; payable = requested; validates registry min/decimals; `hdIndex`/`memoOrTag` null |
| C | **M2-41 done** — main address + unique payable via `amountStep`; requires `listReservedPayableAmounts` |
| D | **M2-42 done** — rejects when `memoSupported=false` (USDT Tron); assigns unique `memoOrTag` when supported |
| S | **M2-43 done** — no conflict → main; conflict → `claimHdPoolAddress`; no xPub → Mode B fallback |

| Match | Status |
| --- | --- |
| B | **M3-60 done** — exact match → `verifying`; same-amount collision → `payment_anomaly` (all `orderIds`); under/overpay on sole order → anomaly |
| C | **M3-61 done** — exact fingerprint match → `verifying`; duplicate fingerprints → anomaly (never FIFO) |
| D | **M3-62 done** — amount + memo; missing/wrong memo → anomaly; unsupported network → no match |
| S | Stub until M3-63 |

## Mode B match (`matchModeB` / `matchTransaction` with `mode: "B"`)

- Watcher loads open orders and passes `candidates` (same address / asset / network scope).
- Exact payable (minor units via registry decimals) + address + asset + network:
  - **1** match → `status: verifying`, `orderId` set (confirmations still watcher-owned).
  - **2+** matches → `status: payment_anomaly`, `orderIds` = all colliding — **never FIFO**.
  - **0** exact, sole open order wrong amount → underpay/overpay anomaly.
  - **0** at address → `pending_payment` / `no_open_order_at_address`.
  - All candidates expired → `late_payment_after_expiry` anomaly.
- Does not set `completed` (watcher waits for confirmations).

## Mode C match (`matchModeC` / `matchTransaction` with `mode: "C"`)

- Same candidate + exact payable rules as Mode B (fingerprints are unique at assign).
- **1** exact fingerprint → `verifying` / `mode_c_exact_match`.
- **2+** same fingerprint (should not happen if assign reserved correctly) → `mode_c_fingerprint_collision` anomaly — never FIFO.
- Sole order wrong amount → `mode_c_underpay` / `mode_c_overpay`.
- Guest must pay the exact fingerprint shown on the payment page.

## Mode D match (`matchModeD` / `matchTransaction` with `mode: "D"`)

- Candidates include `memoOrTag`. Tx must include matching `memoOrTag`.
- Registry `memoSupported=false` (USDT Tron) → `mode_d_memo_unsupported_network` (no auto-match).
- Exact amount + exact memo → `verifying` / `mode_d_exact_match`.
- Missing memo → `mode_d_memo_missing` anomaly; wrong memo → `mode_d_memo_mismatch` (never auto-Complete).
- Duplicate amount+memo → `mode_d_memo_collision` anomaly.

## Mode B contract (`assignModeB` / `assignOnCreate` with `mode: "B"`)

- Requires non-empty trimmed `mainSettlementAddress` (no internal whitespace).
- `asset` / `network` must be known enums and **enabled** in `@cryptogate/domain` registry.
- `requestedAmount` is a major-unit decimal string; must meet `minAmount` and asset `decimals`.
- Result: `addressSource: "main"`, `payableAmount.amount` = requested amount, `hdIndex: null`, `memoOrTag: null`.
- Does **not** detect same-amount collisions (watcher `matchTransaction` / M3).

## Mode C contract (`assignModeC` / `assignOnCreate` with `mode: "C"`)

- Same address / registry / minAmount rules as Mode B (base layer B).
- **Required:** `listReservedPayableAmounts({ merchantId, asset, network, receiveAddress })` → major-unit amount strings for open orders. Matching does not query Postgres.
- Algorithm: start at requested minor units; while taken, add registry `amountStep`; fail after `MODE_C_MAX_FINGERPRINT_STEPS` (create must not reuse an open payable).
- Andrew should filter statuses with `MODE_C_RESERVED_STATUSES` (`pending_payment`, `verifying`, `confirmed`, `payment_anomaly`) under a create-order lock.
- Result: `addressSource: "main"`, possibly bumped `payableAmount`, `hdIndex`/`memoOrTag` null.
- Guest must pay the **exact** fingerprint (underpay tolerance 0 or ≪ step — API/merchant setting, not this package).

## Mode D contract (`assignModeD` / `assignOnCreate` with `mode: "D"`)

- Base layer B: main settlement address; payable = requested amount.
- If registry `memoSupported` is **false** (Phase 1 USDT Tron): **reject create** — do not assign a fake memo.
- If `memoSupported` is **true** (future enabled pair):
  - **Required:** `memoSeed` (idempotency key or provisional order id) and `listReservedMemoOrTags` (same scope/lock pattern as Mode C; use `MODE_D_RESERVED_STATUSES`).
  - Memo = `CG-{sanitizedSeed}`, bump `-2`, `-3`, … on collision; max length `MODE_D_MAX_MEMO_LENGTH`.
  - Result: `memoOrTag` set; `hdIndex` null; `addressSource: "main"`.
- Wrong/missing on-chain memo → anomaly in M3 `matchTransaction` (not this assign).
- UI/API should hide Mode D on unsupported USDT networks (Kevin M2-54); matching still enforces the flag.

## Mode S contract (`assignModeS` / `assignOnCreate` with `mode: "S"`)

- Payable = requested amount (no fingerprint). Main settlement address required.
- **`xPubConfigured` false/omitted:** fall back to Mode B (main only) — Mode S unavailable without xPub (Phase1 §2.5).
- **`xPubConfigured` true:**
  1. Require `hasModeSSameAmountConflict` (lock scope: merchant + asset + network + payable; any open order on main **or** HD with same payable → conflict). Use `MODE_S_CONFLICT_STATUSES`.
  2. No conflict → `addressSource: "main"`, `hdIndex: null`.
  3. Conflict → require `claimHdPoolAddress` (atomic FREE claim or derive-next). Result: `addressSource: "hd_pool"`, `hdIndex` ≥ 0, address ≠ main.
- Matching **never** holds keys, derives, signs, or sweeps.
- Issued receive address is immutable after create (API invariant).
- Pool COOLDOWN → FREE helpers exported (M2-44); API migration + claim wiring — see `doc/M2-44-Hd-Pool.md`.

## Matching settings policy (M2-45)

Call `validateMatchingSettings` (or `assertMatchingSettings`) when saving merchant matching settings — **before** create order.

| Rule | Code |
| --- | --- |
| Mode S and Mode C on the same path (mode C + `smartAddressEnabled`, mode S + `amountFingerprintEnabled`, or both secondary flags) | `mode_s_with_mode_c` |
| Mode C with `underpayTolerance` ≥ registry `amountStep` | `mode_c_underpay_too_wide` |

Singular modes B / C / D / S alone are allowed. Open orders keep the mode stored at create; changing the merchant default does not rewrite them.
