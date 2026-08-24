# Matching public API (Bruce)

Package path: `packages/matching`

## Exports

| Function / type | Called by | Purpose |
| --- | --- | --- |
| `assignOnCreate` | `apps/api` on order create | Assign payable amount + receive address (+ memo) per mode |
| `matchTransaction` | `apps/watcher` | Map inbound tx → order status |
| `assignModeB` / `assignModeC` | tests / direct | Mode modules (also via router) |
| `majorToMinor` / `minorToMajor` | tests / callers | Major ↔ minor unit conversion |
| `pickUniquePayableMinor` | tests | Mode C fingerprint picker (pure) |
| `ListReservedPayableAmounts` | Andrew | Port for open-order payable list |
| `MODE_C_RESERVED_STATUSES` | Andrew | Statuses that keep a payable reserved |

Mode modules: `mode-b`, `mode-c`, `mode-d`, `mode-s` (pool states live in mode-s, not create-order).

| Mode | Assign status |
| --- | --- |
| B | **M2-40 done** — main settlement address; payable = requested; validates registry min/decimals; `hdIndex`/`memoOrTag` null |
| C | **M2-41 done** — main address + unique payable via `amountStep`; requires `listReservedPayableAmounts` |
| D | Throws until M2-42 |
| S | Throws until M2-43 |

`matchTransaction` returns Pending Payment stub until M3.

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
