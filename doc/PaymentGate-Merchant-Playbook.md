# PaymentGate Merchant Playbook — Figma content review

**Figma:** [PaymentGate-Merchant-Playbook](https://www.figma.com/design/qugSKKOLsN2ukVxQJhhVG4/PaymentGate-Merchant-Playbook?node-id=0-1) (`qugSKKOLsN2ukVxQJhhVG4`)  
**Canvas:** Merchant Playbook  
**Reviewed against:** [Business-Model.md](Business-Model.md) · [M4-32-Merchant-Manual.md](M4-32-Merchant-Manual.md) · API org / order rules  

This file is the **corrected copy source** for Figma. Prefer these strings over the live frames where marked **FIX**.

---

## Spread map

| Frame | Topic | Verdict |
| --- | --- | --- |
| Cover / Cashier intro (`139:195`, `147:761`) | Role definition | **Fixed** — web-only Cashier; no POS |
| 03 Sign in (`26:5`) | Merchant login | Mostly OK; fix email + custodial tagline |
| 04 Home (`35:4`) | Merchant dashboard | Fix headline English; KPIs OK for O/A/V |
| 05 Create (`37:4`) | Create payment order | Strong; soften “fires”; Mode A label elsewhere |
| 06 Guest pays (`39:4`) | Payment page | Good |
| 07 Done | Order complete | Check status names (no “Paid”) |
| 08 Sites | Multi-location | Keep merchant (site) wording |
| 09 Settlement (`42:28`) | Wallet + matching | **Mode letters wrong**; Owner-only overstated |
| 10–14 | Reports / Networks / Integrations / Alerts / Team | Spot-check terms |
| 15 Service bills (`42:174`) | Amber rail | Good |
| 16 Anomalies | Resolve with note | Soften “before they clear” |
| Duplicate / Agent / Platform scraps | Mixed into file | Relabel or move out of Merchant Playbook |

---

## Critical fixes (do these first)

### 1. Cover — Cashier definition is wrong

**Current (wrong):**  
> CASHIER is the business that collects from payers; it controls the receive/settlement wallet…

**Correct:**

> **Cashier** is a **user role** on a merchant or merchant (site). Counter staff create and manage **own payment orders** only on the **merchant web portal**. They do **not** control the settlement wallet, xPub, matching mode, or fees.  
> **100%** of on-chain payment still goes to the **merchant** wallet.  
> Footer: **NO CUSTODY · WATCH-ONLY**  
> **Do not mention POS / Android APK** in Figma until POS ships.

### 2. Sign-in mock — “CUSTODIAL”

**Current (wrong):** `CUSTODIAL BLOCKCHAIN PAYMENT INFRASTRUCTURE`  

**Correct:** `NON-CUSTODIAL · WATCH-ONLY COLLECTION`  
(or drop the line; never say custodial)

### 3. Sign-in — email callout

**Current:** “Your merchant account email — one per property.”  

**Correct:** “Your login email for this merchant (or site) membership. One person may have roles on several orgs.”

### 4. Home — left rail headline

**Current:** “See the Dashboard after open platform.”  

**Correct:**  
- Kicker: `04 HOME`  
- Headline: `Your desk after sign-in.`  
- Body (keep): `Volume is guest money. Platform fee is a different rail. Anomalies are work.`

### 5. Settlement — matching mode letters

Product labels ([M4-32](M4-32-Merchant-Manual.md)):

| Portal label | Code | Figma must NOT call it |
| --- | --- | --- |
| **Standard** | **B** | Mode A |
| **Amount fingerprint** | **C** | Mode B |
| **Memo tag** | **D** | Mode C |
| **Smart address** | **S** | Mode D |
| Unique address per order | **A** | Phase 2 — omit or mark “Phase 2” |

**Smart address blurb (correct):**  
Quiet traffic uses the main settlement address. On same-amount conflict, assign a derived HD address from the merchant’s watch-only xPub. Address is fixed once the QR is issued.

**Memo tag:** Unavailable for USDT on Tron in Phase 1.

### 6. Settlement — who can edit

**Current:** “locked to the account owner”  

**Correct:** “Owner and Administrator (MFA + cool-down for address / xPub). **Cashier: no.** Viewer: read-only.”

### 7. Create / marketing language

| Avoid | Use |
| --- | --- |
| Fires the order / publish on-chain | Creates the **payment order**; guest page gets amount, network, address, QR |
| Pick Tron, Polygon, or Arbitrum (as if all live) | Phase 1 live pair is **USDT on Tron** (Nile in test). Other networks appear when orderable (**Open**) |
| Fee and speed differ per rail (implies platform fee) | Network gas / confirmation time differ; **platform volume fee is not taken from the payer** |

### 8. Anomalies callout

**Current:** “need a note before they clear”  

**Correct:** “**Payment Anomaly** tickets need Owner/Admin (or Cashier on own order) to **Resolve** with a note. PaymentGate never auto-marks them Completed.”

### 9. Keep (already correct)

- Guests never get an account; pay from their own wallet  
- Service bills = amber rail ≠ payment orders  
- Volume fee not deducted from payer on-chain  
- Matching Standard collision behaviour on create form  
- Merchant reference = internal (room/table); not on payer page  
- Valid For default 30 minutes (`15 | 30 | 60 | 120`)  
- Sites / Cashiers never see settlement settings  

---

## Paste-ready callouts (Merchant)

### 03 Sign in

| # | Title | Body |
| --- | --- | --- |
| — | Left rail | Merchants and Cashiers sign in here. Guests never get an account — they pay from their own wallet. |
| 1 | Email | Your login email for this org membership. |
| 2 | Password + Remember | Stay signed in on trusted front-desk devices. MFA may be required for Owner/Admin. |
| 3 | Sign In | Opens the Home dashboard (next spread). |

### 04 Home (Owner / Admin / Viewer)

| # | Title | Body |
| --- | --- | --- |
| 1 | KPI row | Completed volume, estimated platform fee, tier, open orders, anomalies. Fee is **not** skimmed from guest payments. |
| 2 | Create payment order | Amount, asset, network, validity — optional merchant reference. |
| 3 | Recent orders | Live payment orders with status and network. |
| 4 | Anomalies | Payment Anomaly rows that need resolve — not “paid.” |

### Cashier Home (if separate spread)

Three KPIs only: **Completed volume**, **Open orders**, **Anomalies** — no fee / tier cards.

### 05 Create

| # | Title | Body |
| --- | --- | --- |
| 1 | Amount + asset | Amount in USDT (Phase 1). |
| 2 | Network | Chain the payer must use. Wrong network → anomaly / lost funds risk. |
| 3 | Merchant reference | Internal tag (room, table). Not shown on the guest pay page. |
| 4 | Create payment order | Creates the order and payment page. Watch-only — PaymentGate does not move coins. |

### 06 Guest pays

| # | Title | Body |
| --- | --- | --- |
| 1 | Amount | Exact payable (fingerprint modes may differ from nominal). |
| 2 | Network | Must match the order. |
| 3 | QR + address | Merchant-controlled receive address. |
| 4 | Time remaining | Default 30 minutes; then Expired if unpaid. |

### 15 Service bills

Keep: Fees on the amber rail; not guest payment orders; tier/rate display-only (set by agent or Platform).

---

## Org facts (for any Hierarchy / intro pages)

- Merchants: **single-location** or **multi-location** (+ **merchant (site)**).  
- Merchants **may** hang under **Platform**, **agent**, or **agent (sub)**.  
- Cashier = role, not a Hierarchy node.  
- Never: guest invoice, sub-merchant, branch, Mark paid, custodial.

---

## Checklist before publish

- [ ] No “custodial” anywhere  
- [ ] Cashier ≠ merchant business definition  
- [ ] Matching modes use B / C / D / S (not A/B/C/D for Standard…)  
- [ ] Owner **and** Administrator for settlement (Cashier denied)  
- [ ] Status vocabulary: Pending Payment → Verifying → Confirmed → Completed / Expired / Payment Anomaly / Failed  
- [ ] Platform/Agent playbook content not mixed unlabeled into Merchant spreads  
