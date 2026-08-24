# Matching public API (Bruce)

Package path: `packages/matching`

## Exports

| Function | Called by | Purpose |
| --- | --- | --- |
| `assignOnCreate` | `apps/api` on order create | Assign payable amount + receive address (+ memo) per mode |
| `matchTransaction` | `apps/watcher` | Map inbound tx → order status |

Mode modules: `mode-b`, `mode-c`, `mode-d`, `mode-s` (pool states live in mode-s, not create-order).

| Mode | Assign status |
| --- | --- |
| B | Stub assigns main settlement address (M2-40 will harden) |
| C | Throws until M2-41 |
| D | Throws until M2-42 |
| S | Throws until M2-43 |

`matchTransaction` returns Pending Payment stub until M3.
