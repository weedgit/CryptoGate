# Detected latency — budgeted hot path (all networks)

**Owner:** Bruce (`apps/watcher`, POS poll). **Status:** landed (Phase 0–2 bridge).

## Goal

Cut **Detected** time (`pending_payment` → `verifying`) on **TRON, Ethereum, Solana** (and Nile) while many invoices stay open. Do **not** lower required confirmations. Do **not** spawn a watcher process per invoice.

Target: p50 Detected **≤ ~8s**, p95 **≤ ~15s** under load, without a TronGrid/ETH/Solana 429 storm.

## Design

### One watcher, shared RPC budget

| Piece | Behavior |
| --- | --- |
| Pending-first queue | Addresses with `pending_payment` poll before verifying-only / backfill |
| `WATCHER_ADDRESS_POLL_BUDGET` (default **64**) | Max distinct receive addresses polled **per asset+network scope per tick**; remainder rotate fairly |
| Match candidates | Full open-order set still used for matching (Mode B collisions) even when only a subset of addresses was RPC-polled |
| Adaptive sleep | Pending → `WATCHER_PENDING_POLL_INTERVAL_MS` (default **2s**); confirming only → `WATCHER_POLL_INTERVAL_MS` (**5s**); idle → `WATCHER_IDLE_POLL_INTERVAL_MS` (**15s**) |
| Pending fast ticks | After a full tick with pending work, run `WATCHER_PENDING_FAST_TICKS` (default **1**) **match-only** ticks (skip confirmation RPCs) |
| Detection metric | When a transfer carries `blockTimestampMs`, tick logs `detectionLatencyMs` {min,max,avg} on match → `verifying` |
| Transfer hints | In-process queue (`pushTransferHint` / `drainTransferHints`) merges provider push into the next match tick — Phase 2 bridge for WS/webhooks without a process-per-invoice |

### POS / cashier

| Client | Detected refresh |
| --- | --- |
| Cashier APK Pay screen | Poll **2s** + existing org SSE |
| Merchant web live payment | Poll **2s** |

SSE still depends on webhook outbox drain (`WEBHOOK_DELIVERY_INTERVAL_MS`); poll is the hard fallback.

## Env

See `.env.example`:

- `WATCHER_PENDING_POLL_INTERVAL_MS`
- `WATCHER_IDLE_POLL_INTERVAL_MS`
- `WATCHER_ADDRESS_POLL_BUDGET`
- `WATCHER_PENDING_FAST_TICKS`

## Explicit non-goals

- Fake Detected from guest “I paid”
- Lowering `required_confirmations` for UX
- Blind global `WATCHER_POLL_INTERVAL_MS=1000` for every open address
- New OS process / container per invoice

## Measure

Watcher JSON ticks include `workload`, `tickKind` (`full` \| `pending_fast`), `ingest.addressBudget`, and optional `detectionLatencyMs`. Compare under N open invoices (50 / 200 / 500) and watch RPC backoff events (`rpc-backoff`).

## Follow-ups

- Wire HTTP/WS provider callbacks into `pushTransferHint` (Helius / QuickNode / TronGrid)
- Optionally shorten `WEBHOOK_DELIVERY_INTERVAL_MS` in prod so SSE beats the 2s poll

## History

| Date | Change |
| --- | --- |
| 2026-10-02 | Initial hot-path design + implementation |
