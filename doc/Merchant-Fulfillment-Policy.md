# Merchant fulfillment policy

**Status:** Implemented (Phase 1 extension — settings API, merchant UI, order snapshot, guest copy).  
**Owners:** Kevin (`packages/domain`, `packages/api-spec`), Andrew (`apps/api` settings + auth), Bruce (`apps/web` merchant settings, `apps/cashier-apk` read-only).

## Problem

Guests often leave the pay page during **Verifying** even though payment is already on-chain. Merchants want to hand over goods sooner without weakening CryptoGate’s chain-honest order status or platform confirmation floors.

Lowering block confirmations per merchant is **not** the right lever — it weakens platform-wide security and duplicates risk policy across thousands of merchants.

## Solution

Separate **chain truth** (order status + webhooks) from **merchant fulfillment timing** (when staff may release goods / ERP may mark “fulfilled”).

| Layer | Who owns it | Never changes |
| --- | --- | --- |
| **Order status** | Watcher + domain registry | `verifying` until `required_confirmations` met → `completed` |
| **Required confirmations** | Platform (`ASSET_NETWORK_REGISTRY` / B16 Networks) | Merchant/Cashier **cannot** lower below platform minimum |
| **Fulfillment policy** | Merchant Owner / Administrator | When **merchant systems** may treat payment as good enough to ship |

## Policy values

| Value | Meaning | Typical use |
| --- | --- | --- |
| `on_completed` | Fulfill only after `completed` (default) | Digital goods, high value, chargeback-sensitive |
| `on_verifying` | Merchant may fulfill when tx is detected (`verifying`) | Counter retail, coffee, hotel front desk — guest already left |

Enum: `FulfillmentPolicy` in `packages/domain` (must match OpenAPI when implemented).

## Invariants (non-negotiable)

1. **Cashier cannot change** fulfillment policy or confirmation counts (same bar as settlement, xPub, matching mode).
2. **Platform confirmation floor** stays in the registry — watcher never marks `completed` early.
3. **Guest payment page** always shows real status (`verifying` + `n/N` confirmations) — never “Paid” before chain rules pass.
4. **Webhooks stay honest:** `payment_order.verifying` and `payment_order.completed` always fire on real transitions; policy only affects **merchant-side** docs/UI copy (“OK to hand over”).
5. **`on_verifying` is risk acceptance** — merchant acknowledges possible reorg / late anomaly; audit log on enable.

## Comparison to industry

| Platform | Merchant tunable confirmations? | Practical “ship early” pattern |
| --- | --- | --- |
| Coinbase Commerce | No | `charge:pending` vs `charge:confirmed` — merchant chooses integration |
| BTCPay | Yes (store speed policy) | `Processing` (0-conf seen) vs `Settled` (N conf) |
| NOWPayments | No | Docs: do not deliver on `confirming`; wait for `finished` |
| **CryptoGate** | **No** (platform floor) | **`on_verifying` fulfillment policy** — BTCPay-like split without lowering chain bar |

## UX surfaces

### Merchant — D11 Settings → Order policies (new **D11e**)

- Radio: **Standard (completed only)** / **Counter (verifying allowed)**
- Plain-language risk note for counter mode
- MFA + confirm dialog; applies to **new orders only** (stamp on create, like matching mode)
- Cashier: hidden; direct URL → 403
- Merchant (site): inherit parent or override with Owner approval

### Cashier / APK

- Read-only badge on order detail / receipt: **“Chain: Verifying”** vs **“Chain: Completed”**
- Optional helper when policy is `on_verifying`: **“OK to release goods”** (merchant policy, not chain paid)
- Never edit policy on device

### Guest pay page

- Copy when `verifying`: “Payment received — confirming on chain (~1 min). You can close this page.”
- No change to status enum display

## API

- `GET/PUT /v1/orgs/{orgId}/fulfillment-policy` — Owner / Administrator only; Cashier 403
- Field on merchant/site settings: `fulfillmentPolicy: on_completed | on_verifying`
- Order snapshot at create: `fulfillmentPolicy` (for receipt + ERP)
- Webhooks: unchanged events; integration guide adds “if policy is `on_verifying`, subscribe to `payment_order.verifying` for fulfillment”

## Out of scope

- Per-order confirmation count override
- Cashier-editable confirmation threshold
- Fulfillment on `pending_payment` without tx
- Skipping webhooks or marking `completed` from browser redirect

## Milestone

| ID | Task | Owner |
| --- | --- | --- |
| P2-FP-01 | OpenAPI + domain (`FulfillmentPolicy`) | Kevin |
| P2-FP-02 | Merchant settings API + audit | Andrew |
| P2-FP-03 | D11e UI + cashier read-only hints | Bruce |
| P2-FP-04 | Guest pay “safe to close” copy | Kevin |
| P2-FP-05 | Integration guide + webhook examples | Kevin |

## Related docs

- [Business-Model.md](Business-Model.md) — role permissions
- [UI-Page-Spec.md](UI-Page-Spec.md) — D11e
- [Watcher-Order-Status-Contract.md](Watcher-Order-Status-Contract.md) — chain status ownership
- [M3-04-Asset-Networks.md](M3-04-Asset-Networks.md) — platform confirmation floors
