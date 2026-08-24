# Merchant manual — matching, collisions & cool-downs (M4-32)

**Audience:** Merchant Owner / Administrator  
**Owner (doc):** Kevin. **UI:** Merchant portal settings (`/merchant/settings/settlement`) — Bruce M2-61+.  
**Source of truth:** [Phase1-Project-Plan.md](Phase1-Project-Plan.md) §II · [UI-Page-Spec.md](UI-Page-Spec.md) D11

This guide explains how CryptoGate **matches** guest payments to **payment orders**, what happens when two orders look the same on-chain, and why address / xPub changes wait through a **cool-down**. It does **not** cover platform service bills (separate rail).

---

## 1. What CryptoGate does (and does not)

| Does | Does not |
| --- | --- |
| Create payment orders and show a receive address / QR | Hold your private keys or mnemonics |
| Watch the chain and update order status | Sign, sweep, or move funds for you |
| Send signed webhooks when status changes | Mark an order “paid” from the browser alone |

Payers send crypto **directly to your wallet**. CryptoGate is watch-only.

**Statuses you will see:** Pending Payment → Verifying → Confirmed → Completed, or Expired / Payment Anomaly / Failed. There is no status named “Paid.”

---

## 2. Who can change what

| Action | Owner | Administrator | Viewer | Cashier |
| --- | --- | --- | --- | --- |
| Create payment orders | ✓ | ✓ | — | ✓ (own) |
| Change matching mode | ✓ | ✓ | read | **No** (403) |
| Change settlement address | ✓ | ✓ (+ MFA / cool-down) | read | **No** |
| Register / replace xPub (Smart address) | ✓ | ✓ (+ MFA / cool-down) | read | **No** |
| View HD pool summary | ✓ | ✓ | read | **No** |

Cashiers use web or the Cashier APK to create orders and show QR only. See [Cashier-Apk.md](Cashier-Apk.md).

---

## 3. Matching modes (portal labels)

You pick a **default** mode under **Settings → Settlement & matching**. The mode is **copied onto each new order** at create time. Changing the default later does **not** rewrite open orders.

| Portal label | Code | Best when | Guest must |
| --- | --- | --- | --- |
| **Standard** (default) | B | Low concurrency, one settlement address | Send correct asset, network, amount, address |
| **Amount fingerprint** | C | Several open orders with the same nominal amount | Pay the **exact** payable shown (may be 50.01 not 50.00) |
| **Memo tag** | D | Networks that support memo/tag (not USDT on Tron) | Include the memo exactly |
| **Smart address** | S | Same-amount collisions; you can provide a watch-only xPub | Pay to the address on that order’s QR |

Phase 1 live pair: **USDT on Tron** only. **Memo tag** is unavailable for USDT Tron (hidden / rejected). **Unique address per order (Mode A)** is Phase 2.

**Do not combine** Smart address with Amount fingerprint — the API rejects that combination.

---

## 4. Collision behaviour (same amount, same address)

On USDT Tron, many wallets cannot attach a memo. Two open orders for **245.00 USDT** to the **same** address look identical on-chain.

### Standard (B)

CryptoGate **does not guess**. Both payments become **Payment Anomaly** (manual review). There is no FIFO “first order wins.”

### Amount fingerprint (C)

Each new open order gets a **unique payable amount** (e.g. 245.00 → 245.01, 245.02). The payment page and QR show that exact amount with an **exact-pay** warning. Matching uses that fingerprint. Underpay tolerance is effectively zero so fingerprints stay unique.

### Smart address (S)

Quiet traffic still uses your **main settlement address**. When a new order would collide on amount with another open order on main (or another derived address), CryptoGate assigns a **derived HD address** from your watch-only xPub pool. Each order’s address is fixed once the QR is issued — **never rewritten**.

### Memo tag (D)

Where the network supports it, matching also requires the memo. Wrong or missing memo → anomaly / unmatched — not auto-Completed. Not offered for USDT Tron.

---

## 5. Smart address pool (FREE / IN_USE / COOLDOWN)

Derived addresses are tracked per asset/network:

| State | Meaning |
| --- | --- |
| **FREE** | May be assigned to a new conflicting order |
| **IN_USE** | Bound to an open payment order |
| **COOLDOWN** | Order finished; address waits before reuse (late payment protection) |

After an order reaches a final status, the derived address goes to **COOLDOWN**, then **FREE** after the pool cool-down (default **24 hours**, `HD_POOL_COOLDOWN_MS`). Consolidation across many addresses is **your** wallet’s job — CryptoGate does not sweep.

---

## 6. Settlement address & xPub cool-downs

Changing where funds land is high risk. CryptoGate requires:

1. **MFA** step-up for Owner/Administrator  
2. **Cool-down** before the new address / xPub becomes active (default **24 hours**, `SETTLEMENT_COOLDOWN_MS`)  
3. **Audit log** entry  
4. Banner while pending: new address activates at the shown time  

During cool-down, existing open orders keep the address they already showed. Cashiers never see these settings.

Same bar applies when **replacing xPub** for Smart address.

---

## 7. What guests see

The public payment page (and Cashier QR) shows:

- Amount (exact payable under Amount fingerprint)  
- Asset and **network** (e.g. TRON TRC-20)  
- Contract (when applicable)  
- Receive address + QR  
- Expiry countdown  
- Wrong-network warning  

Guests should not use a different network or round the amount under Amount fingerprint.

---

## 8. Payment Anomaly — what to do

Typical causes: same-amount collision under Standard, underpay/overpay, wrong network, late pay, duplicate tx hash.

1. Open the payment order detail — read the anomaly reason.  
2. Check the chain explorer for the tx.  
3. Reconcile manually in your own books / wallet.  
4. **Do not** expect a “Mark paid” button — CryptoGate will not invent a match.

---

## 9. Quick chooser

| Situation | Suggested mode |
| --- | --- |
| One cashier, low volume, simple ops | **Standard** |
| Several concurrent same-amount tickets | **Amount fingerprint** or **Smart address** |
| You already use HD / xPub watch-only | **Smart address** (register xPub first) |
| USDT on Tron and you need memos | Not available — use Standard / Fingerprint / Smart |

---

## 10. Cashier POS (Android APK) — M5-09

Merchants may deploy the **Cashier Android POS** app for counter staff. It uses the **same APIs** as the web Cashier — no extra keys on the device.

### What Cashiers do on POS

| Action | Allowed |
| --- | --- |
| Log in with Cashier role | ✓ |
| Create payment orders (amount, asset, network, validity) | ✓ |
| Show QR / amount / network / address from the server | ✓ |
| Poll order status until Completed / Expired / Payment anomaly | ✓ |
| Change settlement address, xPub, matching mode, fees | **No** (403) |
| Mark an order paid locally | **No** — server + chain only |

### What Owners should know

- **Two app flavors:** **Test** (`com.cryptogate.cashier.staging`) and **Production** (`com.cryptogate.cashier`). Install the flavor that matches your environment ([M4-05-Env-Matrix.md](M4-05-Env-Matrix.md)).
- **MFA:** If the Cashier user’s org requires MFA, login may direct staff to complete MFA on the **web** portal first — the POS does not enroll MFA.
- **Offline:** Create order is blocked without network; existing orders continue polling when connectivity returns.
- **Receipt / printer:** Generic Android shows QR on screen. Built-in printer and customer-facing second screen depend on the **reference POS device** (M5-01) — see install notes.

### Install (IT / Company A)

Full sideload, MDM, checksum, and upgrade steps: **[M5-08-Cashier-Apk-Install.md](M5-08-Cashier-Apk-Install.md)**.

Developer invariants and Studio setup: [Cashier-Apk.md](Cashier-Apk.md).

---

## 11. Related docs

| Doc | Topic |
| --- | --- |
| [M3-02-Integration-Guide.md](M3-02-Integration-Guide.md) | API signing, webhooks |
| [M4-05-Env-Matrix.md](M4-05-Env-Matrix.md) | Test vs prod |
| [M3-04-Asset-Networks.md](M3-04-Asset-Networks.md) | Live vs planned networks |
| [UI-Handoff.md](UI-Handoff.md) | Portal frame map (D11) |
| [M5-08-Cashier-Apk-Install.md](M5-08-Cashier-Apk-Install.md) | POS install & checksum |
| [Cashier-Apk.md](Cashier-Apk.md) | POS technical reference |
