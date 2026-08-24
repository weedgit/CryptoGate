# Matching public API (Bruce)

Package path: `packages/matching`

## Exports

| Function | Called by | Purpose |
| --- | --- | --- |
| `assignOnCreate` | `apps/api` on order create | Assign payable amount + receive address (+ memo) per mode |
| `matchTransaction` | `apps/watcher` | Map inbound tx → order status |
| `assignModeB` | tests / direct | Mode B assign (also via router) |
| `majorToMinor` | tests / callers | Major-unit decimal → minor units |

Mode modules: `mode-b`, `mode-c`, `mode-d`, `mode-s` (pool states live in mode-s, not create-order).

| Mode | Assign status |
| --- | --- |
| B | **M2-40 done** — main settlement address; payable = requested; validates registry min/decimals; `hdIndex`/`memoOrTag` null |
| C | Throws until M2-41 |
| D | Throws until M2-42 |
| S | Throws until M2-43 |

`matchTransaction` returns Pending Payment stub until M3.

## Mode B contract (`assignModeB` / `assignOnCreate` with `mode: "B"`)

- Requires non-empty trimmed `mainSettlementAddress` (no internal whitespace).
- `asset` / `network` must be known enums and **enabled** in `@cryptogate/domain` registry.
- `requestedAmount` is a major-unit decimal string; must meet `minAmount` and asset `decimals`.
- Result: `addressSource: "main"`, `payableAmount.amount` = requested amount, `hdIndex: null`, `memoOrTag: null`.
- Does **not** detect same-amount collisions (watcher `matchTransaction` / M3).
