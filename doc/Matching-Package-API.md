# Matching public API (Bruce)

Package path: `packages/matching`

## Exports

| Function | Called by | Purpose |
| --- | --- | --- |
| `assignOnCreate` | `apps/api` on order create | Assign payable amount + receive address (+ memo) per mode |
| `matchTransaction` | `apps/watcher` | Map inbound tx → order status |

Mode modules: `mode-b`, `mode-c`, `mode-d`, `mode-s` (pool states live in mode-s, not create-order).

Sprint 0: Mode B assign stub only; C/D/S throw until implemented.
