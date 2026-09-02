# PaymentGate Phase 1 architecture

Watch-only merchant collection. Payer coins never enter a platform wallet. The API creates **payment orders**; the watcher matches on-chain receipts; **service bills** are a separate rail. Product rules: `doc/Business-Model.md`. Matching modes: `doc/Phase1-Project-Plan.md` §II.

Language and framework are **not frozen**. Folders are. Put implementation in the leaf that owns the job.

## Runtimes

| Path | Process | Job |
| --- | --- | --- |
| `apps/api` | HTTP | Auth, org tree, payment orders, webhooks, service bills |
| `apps/watcher` | Background | Ingest chain data, call matching, update order status |
| `apps/web` | Browser | Platform / agent / merchant shells (after Milestone 1 roles) |
| `apps/payment-page` | Public HTTP | Guest QR / pay URL — **no** merchant session, **no** admin imports |
| `apps/cashier-apk` | Android | Cashier client of the API (Kotlin). No keys, no matching-mode settings |

`packages/api-spec` is the contract (OpenAPI). `packages/domain` is shared types (order status, asset/network, money). `packages/matching` is Mode B / C / D / S. `packages/chain-clients` is one module per network.

Watcher and API are **separate processes in the same repo**. Order creation can fail while ingest still runs. Do not merge them to “keep it simple.”

## File size (smell, not a ban)

Split by **second responsibility**, not by hitting a number.

| Signal | Action |
| --- | --- |
| ~250–350 lines, one job | Fine |
| ~400–500 lines | Smell — find the second job |
| Matching + create-order + watcher in one file | Split now |
| Generated OpenAPI / clients | Do not count |
| Tests | May be longer than the code under test |

Do **not** add a max-lines linter. Do **not** split a 120-line function into five files. Do **not** grow `utils` / `helpers`.

**Matching:** `mode-b`, `mode-c`, `mode-d`, `mode-s` (pool states in `mode-s`, not in create-order). A small router selects the mode stored on the order. Never a 800-line `switch`.

**Chains:** one client per network (start with the confirmed USDT network). No `watcher` file that switches on Tron / ETH / BTC.

**Orgs:** Platform → agent → merchant → merchant (site) → cashier lives under `apps/api/src/orgs`, not in `users`.

## Invariants (code must not violate)

1. Receive address on a payment order is merchant-controlled. Platform has no spend keys.
2. Volume fee is **not** deducted from the payer on-chain payment.
3. Cashier cannot change settlement address, xPub, matching mode, or fees.
4. Agent accounts do not create merchant payment orders.
5. Same-amount collision on Mode B → anomaly; never FIFO guess.
6. Mode S never holds keys, never signs, never sweeps.
7. Webhooks are signed; do not fulfill on browser redirect alone.

## First implementation slice

Implement `apps/api` (auth + orgs), `apps/watcher` (skeleton), `packages/matching`, `packages/api-spec`. Add `apps/web`, `apps/payment-page`, and `apps/cashier-apk` when Milestone 1–2 UI starts.
