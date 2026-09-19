# Phase 1 acceptance pack

**Audience:** Client / UAT / compliance review  
**Date:** 2026-09-16  
**Product:** CryptoGate / PaymentGate — non-custodial payment collection  
**Status:** Describes **what the running product does today**, with org-tree lock confirmed 2026-09-19. Items marked **Phase 1.1** are not in this freeze.

This pack is the next-revision set for matching, abnormal orders, MVP boundary, permissions, webhooks, and minimum UAT metrics. It does not replace [Business-Model.md](Business-Model.md) or [Phase1-Requirement.md](Phase1-Requirement.md).

---

## 0. One-line product rule

The payer sends crypto to the **merchant’s own wallet**. CryptoGate **watches, matches, and notifies**. It never holds spend keys, never moves merchant or customer funds, and never takes a cut of the on-chain payment. Platform fees are a separate **service bill**.

---

## 1. Phase 1 MVP boundary

### In scope

| Capability | Notes |
| --- | --- |
| Create payment orders | Merchant portal, signed API, Cashier (own orders) |
| QR + payment link | Amount, asset, network, contract (if any), address, expiry |
| Chain watch + match | Modes **B / C / S** (see §2) |
| Order statuses | Pending Payment → Verifying → Confirmed → Completed; or Expired / Payment Anomaly / Failed / Cancelled. **Never “Paid”.** |
| Anomaly queue + resolve | Required staff note; no “Mark paid” on payment orders |
| Signed webhooks + retry | HMAC; merchant can also poll `GET /v1/orders/{id}` |
| Dashboards | Platform / Agent / Merchant; live updates via SSE |
| Settlement address | MFA + cool-down; receive address **immutable** after QR issued |
| Optional xPub / HD pool | Mode S (watch-only xPub; platform does not hold keys) |
| Service bills | Subscription + volume fee to **platform billing wallet**; not deducted from customer payments |
| Agent commissions | Rebate from collected platform fees; not from on-chain payer amount |
| Audit log | Append-only privileged actions; users cannot delete |
| TOTP MFA | Sensitive actions (address / xPub / similar) |

### Out of scope (not Phase 1 commercial core)

- Custody, sweeping, signing, or moving merchant/customer funds  
- Exchange, OTC, fiat settlement promise, yield, lending  
- Taking platform fee from the customer’s on-chain payment  
- Full KYC/KYB / UBO pack (simple invite/register until client makes it a go-live gate)  
- Email / SMS verification (implement after SMTP / SMS provider confirm)  
- Memo/Tag matching (**Mode D**) as a live method — no enabled catalog pair has `memoSupported: true`  
- Unique address per order without xPub (**Mode A**) — Phase 2  
- Maker-checker on wallet change, multi-RPC failover, scheduled chain↔DB reconciliation job  
- Open self-registration (onboard is invite / operator-created)  
- Sanction / wallet blacklist screening  

### Chains (commercial focus vs catalog)

**Proposed Phase 1 commercial focus** (pending client lock): **TRON, Solana, Ethereum**.

The technical catalog already has more pairs (USDT/USDC on several EVM nets, TON, BTC, native TRX/ETH). Extra pairs are **enablement**, not a promise that every pair is UAT-complete. Default create-order pair: **USDT on TRON**.

**Org tree (locked):** **Platform → Agent → Merchant → Cashier**, with optional **Merchant (site)** under multi-location merchants. **No** agent (sub). New `agent_sub` creates are rejected (`phase1_org_type_disabled`).

---

## 2. Order matching mechanism

### 2.1 What matching is

Matching binds an **on-chain transfer** to an **open payment order** using the fields the guest was shown: receive address, asset, network, payable amount, and (Mode D only) memo/tag.

Matching **never** FIFO-completes when two open orders look the same. Collision → **Payment Anomaly** for the involved orders.

The receive address on an issued order is **never rewritten**.

### 2.2 Modes (live)

| Portal label | Code | How it avoids same-amount collision | Guest must |
| --- | --- | --- | --- |
| **Standard** (default) | **B** | Second create for the same amount on the main address is **blocked** while a live ticket exists. Match-time race → anomaly (all colliding ids). | Correct asset, network, amount, address |
| **Amount fingerprint** | **C** | Unique payable (e.g. 50.00 → 50.01). Guest must pay the **exact** amount on the page. | Exact fingerprint |
| **Smart address** | **S** | Main address unless same-amount conflict; then an HD address from watch-only xPub. Without xPub, create falls back to B. | Pay the address on **that** order’s QR |

**Do not combine** Mode S and Mode C on the same merchant path (API rejects).

### 2.3 Mode D — Memo / tag (hidden)

Engine exists. **Create is rejected** unless the registry row has `memoSupported: true`.

Today **every enabled pair is `memoSupported: false`** (including USDT on TRON / Ethereum / Solana / TON). TON is listed but memo matching is **not** enabled. **XRP is not in the catalog.**

Phase 1: keep Memo/Tag **unavailable** in settlement UI. Revisit only when a real memo-capable pair is enabled and watcher-tested.

### 2.4 Recommended default for hotels / retail

| Desk | Prefer |
| --- | --- |
| One cashier, low overlap | **Standard (B)** |
| Several cashiers, same ticket amounts | **Amount fingerprint (C)** or **Smart address (S)** with xPub |
| Formal scale / shared address risk | **S** (unique address when conflict) — not amount-only on a shared address |

Amount-only matching on a shared address is **not** sufficient at scale. That is why B blocks a second same-amount create, and why C/S exist.

### 2.5 Match outcomes (watcher)

| Result | Order status | Completes? |
| --- | --- | --- |
| Exact match, 1 order | `verifying` | Only after **required confirmations** (per network registry) |
| 2+ open orders same fingerprint | `payment_anomaly` | No |
| Underpay / overpay (sole order) | `payment_anomaly` | No |
| Wrong asset / wrong network (when detected) | `payment_anomaly` | No |
| Late payment after expiry | `payment_anomaly` (`late_payment_after_expiry`) | No auto-complete |
| No open order at address | Unmatched (not completed) | No |

Confirmations are **platform-wide** per asset/network (example: USDT TRON = 19). Merchants cannot lower the floor. Optional merchant **fulfillment policy** (`on_verifying` vs `on_completed`) only tells staff when they may release goods — it does not change chain status or webhooks.

Detail: [Matching-Package-API.md](Matching-Package-API.md), [M4-32-Merchant-Manual.md](M4-32-Merchant-Manual.md), [Watcher-Order-Status-Contract.md](Watcher-Order-Status-Contract.md).

---

## 3. Abnormal order handling

```
                    create
                      │
                      ▼
              Pending Payment
                 │         │
     tx matches  │         │ expires_at (still pending, no tx)
                 ▼         ▼
             Verifying   Expired
                 │         │
    confirmations│         │ on-chain pay still possible
                 ▼         ▼
             Completed   Payment Anomaly (late)
                           │
         mismatch / collision / under-over / wrong net
                           ▼
                    Payment Anomaly
                           │
              staff Resolve + required note
                           ▼
                      Cancelled
              (reason + note kept on the order)
```

### 3.1 Expiry

- Only **Pending Payment** past `expires_at` becomes **Expired**.  
- **Verifying / Confirmed** stay open so confirmations can finish.  
- Expiry does **not** stop the blockchain. A payer can still send coins to the address.  
- A late detected payment is **not** auto-Completed. It is classified as abnormal (`late_payment_after_expiry`) for merchant review.  
- Product copy must not say “payment is impossible after expiry.”

### 3.2 Wrong network / wrong token

- The pay page and cashier screen **instruct** the exact asset + network.  
- Detection is **best-effort**: the watcher can flag a seen transfer to a watched address on a **configured** chain/asset. It cannot see every possible wrong chain, and it cannot recover coins sent to the wrong network.  
- Product copy must not say “wrong network is always detected” or that CryptoGate can reverse the send.  
- When detected: **Payment Anomaly**, never silent Completed. Funds stay in whichever wallet received them — CryptoGate does not move them.

### 3.3 Staff action

- **Resolve anomaly** with a required note (Owner/Admin on the org; Cashier on own orders).  
- There is **no** “Mark paid” on a payment order.  
- Manual **re-link / force-match** of an arbitrary tx hash to an order is **not** in Phase 1 (Phase 1.1 if the client requires it).  
- Anomalies are audited.

### 3.4 Typical anomaly reasons (plain language)

Same-amount collision · underpay · overpay · wrong network/asset (when seen) · late pay after expiry · missing/wrong memo (Mode D, if ever enabled).

---

## 4. Permission matrix

Roles apply **inside** one org account. One person may have different roles on different orgs.

**Org tree:** Platform → Agent → Merchant (+ optional sites); no sub-agent creates.

| Action | Platform O/A | Platform V | Agent O/A | Agent V | Merchant O/A | Merchant V | Cashier |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Create payment order | — | — | **No** | — | ✓ | — | ✓ own only |
| View orders in scope | ✓ | R | merchants R | R | ✓ | R | own only |
| Resolve anomaly | ✓ | — | — | — | ✓ | — | own only |
| Change receive address / xPub / matching | override (logged) | — | **No** | — | ✓ MFA + cool-down | R | **No** |
| API keys / webhook secrets | platform ops | — | **No** merchant secrets | — | ✓ | — | **No** |
| Service bills | issue / mark paid (billing rail) | R | merchants R | R | view / pay own | R | **No** |
| Onboard agent / merchant | ✓ | — | merchant only | — | invite Cashiers | — | — |
| Add/remove Admin/Viewer | Owner only on that org | — | Owner only | — | Owner only | — | — |
| Audit log | ✓ | R | scoped | R | scoped | R | — |

**Always**

- Agent accounts **cannot** create payment orders or change the merchant receive wallet.  
- Cashier: no settlement, xPub, matching, API secrets, service bills, team.  
- Unavailable actions should be **hidden in UI**, not only rejected by API (complete remaining gaps in Phase 1.1).

Canonical terms: [Business-Model.md](Business-Model.md).

---

## 5. Webhooks, retry, and poll fallback

Do **not** fulfill from the browser pay page or a redirect. Use a **signed webhook** or **re-GET the order**.

### 5.1 Delivery

POST JSON to the merchant HTTPS endpoint.

| Header | Meaning |
| --- | --- |
| `X-PaymentGate-Signature` | Lowercase hex HMAC-SHA256(signingSecret, **raw body**) |
| `X-PaymentGate-Timestamp` | Unix seconds (not in HMAC input) |
| `X-PaymentGate-Event-Id` | Stable event id — **idempotency key** |
| `X-PaymentGate-Delivery-Id` | This attempt (retries/resend get a new id) |

Verify HMAC on raw bytes; constant-time compare; ignore duplicate event ids (return 2xx).

### 5.2 Retry

Failed or timed-out deliveries (timeout **10s**) retry with delays **1s, 5s, 25s, 125s, 625s**. Merchant UI can **resend** a delivery; body and event id stay the same, delivery id is new. Handlers must be idempotent on event id.

Events come from a DB **outbox** on order create / status change (including watcher writes).

### 5.3 Poll fallback

If webhooks fail, merchant backend:

1. `GET /v1/orders/{id}` — status, amounts  
2. `GET /v1/orders/{id}/on-chain` — tx hash, confirmations  
3. `GET /v1/orders` — list/export in authorized scope  

Machine calls use API key HMAC (`X-Api-Key`, `X-Timestamp`, `X-Nonce`, `X-Signature`). Guest `GET /v1/orders/{id}/payment` is public and **must not** be used as fulfillment proof.

Guides: [Webhook-Verification.md](Webhook-Verification.md), [M3-02-Integration-Guide.md](M3-02-Integration-Guide.md), [M3-03-Webhook-Verify-Example.md](M3-03-Webhook-Verify-Example.md).

---

## 6. Minimum UAT and stress metrics

“Stress testing completed” is not acceptance. Phase 1 sign-off uses this **minimum set**. Broader lists (20+ counters) are Phase 1.1.

### 6.1 Functional UAT (must pass)

| # | Case | Pass |
| --- | --- | --- |
| 1 | Create USDT-TRON order → pay page shows amount, network, address, expiry, wrong-network warning | Copy is instructional, not a detection guarantee |
| 2 | Exact match → Verifying → Completed after confirmations | Status never “Paid”; webhook `verifying` then `completed` |
| 3 | Mode B: second same-amount create while first is live | Blocked or anomaly; never two Completeds from one tx |
| 4 | Underpay or overpay | Anomaly, not Completed |
| 5 | Expire with no tx | Expired; QR closed |
| 6 | Pay after expiry (if testable) | Not auto-Completed; anomaly / review |
| 7 | Wrong asset/network **when the watcher can see it** | Anomaly |
| 8 | HMAC webhook verify + replay of same event id | Second delivery ignored |
| 9 | Disable webhook / 5xx endpoint | Retries recorded; `GET /v1/orders/{id}` still correct |
| 10 | Cashier cannot open settlement / API keys | Hidden or 403 |
| 11 | Agent cannot create order or edit merchant receive address | Hidden or 403 |
| 12 | Address change | MFA + cool-down; old address remains on already-issued orders |
| 13 | Service bill rail separate from payment order | Amber vs teal; no skim of guest tx |
| 14 | Nile or testnet pay (at least one live chain) | Watcher ingest on **open** orders only |

### 6.2 Reliability metrics (fill measured values in UAT)

| Metric | Phase 1 bar (target) | How |
| --- | --- | --- |
| API `GET /health` | 200, `db: ok` | Probe |
| Order create P95 | Recorded in UAT env (no silent timeout) | Load script `apps/api` M4-12 |
| Webhook success (2xx) after retries | ≥ 99% when merchant endpoint is healthy | Delivery log |
| Webhook retry exhaust | Count + alert; merchant can resend | Delivery log |
| Watcher tick | Process up; chain health lamps; backoff on RPC errors | Watcher logs / health |
| Confirmations | Match registry (USDT TRON 19, ETH 12, …) | Order detail vs registry |
| DB backup | Snapshot + restore drill documented | [M4-03-Backup-Monitoring.md](M4-03-Backup-Monitoring.md) |
| Failover time (API/watcher restart) | Record minutes; no dual-writer on restore | Runbook |

### 6.3 Explicitly not claimed yet

- Multi-RPC automatic failover  
- Scheduled full chain↔DB reconciliation job  
- 10-wallet URI certification matrix  
- Peak orders/sec production SLO until UAT numbers are written into this table  

Existing smoke: [X-07-E2E-Smoke.md](X-07-E2E-Smoke.md).

---

## 7. Document map (client letter items)

| # | Client ask | This pack |
| --- | --- | --- |
| 1 | Order matching | §2 |
| 2 | Abnormal order flowchart | §3 |
| 3 | Wallet address generation | §2.2 Mode S + settlement cool-down in §4 / M4-32 |
| 4 | Network URI / QR (TRON-first) | Pay-page HTTPS QR + optional `network:address` hint; full BIP-21 / EIP-681 matrix is later |
| 5 | Wallet compatibility matrix | Phase 1.1 |
| 6 | Wallet change security | MFA + cool-down **Already**; maker-checker Phase 1.1 |
| 7 | Webhook signature / retry / idempotency | §5 |
| 8 | RPC redundancy & DR | Health + backoff **Already**; multi-RPC + fuller DR Phase 1.1; backup §6.2 / M4-03 |
| 9 | KYC/KYB | Out of scope until client gate |
| 10 | Permission matrix | §4 |
| 11 | Stress metrics | §6.2 |
| 12 | UAT checklist | §6.1 |
| 13 | Audit log | Append-only **Already** — [Business-Model.md](Business-Model.md) |
| 14 | Backup & recovery | [M4-03-Backup-Monitoring.md](M4-03-Backup-Monitoring.md) |
| 15 | MVP boundary | §1 |

---

## 8. Open confirms (remaining)

1. **Email** (and phone) verification — SMTP / SMS provider?  
2. Is **full KYC/KYB** a Phase 1 go-live blocker?  
3. Commercial chain focus **TRON + Solana + Ethereum** first?

**Org tree:** locked — no sub-agent; merchant sites allowed under multi_location.
