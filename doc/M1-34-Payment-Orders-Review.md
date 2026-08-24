# M1-34 — Review `payment_orders` migration (Bruce)

**Reviewed:** `apps/api/migrations/005_payment_orders.sql` on `main` (PR #15)  
**Against:** `doc/Watcher-Order-Status-Contract.md`, `@cryptogate/domain` `OrderStatus` / `PaymentOrderColumn` / `PaymentOrderAssignFields`  
**Date:** 2026-08-24

## Verdict

**Accept for M3 watcher + Mode C assign.** Columns, status enums, matching modes, and address sources match the contract. No blocker for Bruce M2-41.

## Checklist

| Requirement | Status | Notes |
| --- | --- | --- |
| `status` enum = domain `OrderStatus` | OK | All eight values present |
| `matching_mode` B/C/D/S | OK | No Mode A (Phase 2) |
| `payable_amount` / `receive_address` / `address_source` | OK | Assign fields present |
| `hd_index` / `memo_or_tag` nullable | OK | Mode S / D |
| `received_amount` / `tx_hash` / `confirmations` watcher-owned | OK | Nullable received + tx; confirmations default 0 |
| `required_confirmations` | OK | Set at create from registry |
| Unique `(network, tx_hash)` where tx present | OK | M3 dedupe |
| Amounts as text (no float) | OK | Matches matching package major-unit strings |
| `PaymentOrderColumn` names | OK | `matching_mode`, `payable_amount`, `receive_address`, `address_source`, `hd_index`, `memo_or_tag` |

## Asks for Andrew (non-blocking)

1. **Mode C reservation query** — under a transaction lock, list `payable_amount` for open rows scoped by `org_id` + `receive_address` + `asset` + `network`. Treat these statuses as reserved: `pending_payment`, `verifying`, `confirmed`, `payment_anomaly` (see `@cryptogate/matching` `MODE_C_RESERVED_STATUSES`). Free on `completed` / `expired` / `cancelled` / `failed`.
2. **Optional index** for Mode C hot path, e.g.  
   `(org_id, receive_address, asset, network)` **or** partial index on open statuses. Current `(org_id, status)` is enough to start; add when create-order volume needs it.
3. **Wire `assignOnCreate`** — replace `stubAssignOnCreate` (still mock address / always Mode B) with `@cryptogate/matching` once merchant settlement address is available (M2-12). Pass `listReservedPayableAmounts` for Mode C.
4. **Expiry job** — `payment_orders_status_expires_at_idx` supports API expiry → `expired`; confirms reserved amounts release for Mode C.

## Out of scope here

- Mode S HD pool table (separate migration when M2-43 starts)
- Watcher UPDATE path (M3)
