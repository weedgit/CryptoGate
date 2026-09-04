---
title: PaymentGate — Product alignment discussion
subtitle: Topics for review with Company A
date: 2 September 2026
---

Thank you for making time to walk through a few product decisions with us. These five points sit underneath how the live product already behaves. We would like to confirm them together before we go further on detail design and any later-phase work. Nothing here is meant to surprise you; we are simply putting the current model on the table so we can agree what to keep and what to simplify.

---

# 1. Account hierarchy, roles, and agent nesting depth

## What we are aligning on

Who sits in the org tree, what a person can do inside one org, and how many agent layers we should allow.

## Org accounts (the tree)

These are companies in the tree, not people:

- **Platform** — PaymentGate itself. Global policy, fee bands, billing wallet, compliance.
- **Agent account** — a channel partner who brings merchants on. An agent under another agent is shown as **Agent (sub)**.
- **Merchant account** — the business that collects from payers. Either **single-location** (one hotel, one shop) or **multi-location** (a group with several stores).
- **Merchant (site)** — one physical store under a multi-location merchant. It is an operations unit, not a separate billed company.

## User roles (the people inside one org)

The same three names apply on Platform, Agent, Merchant, and Site:

- **Owner** — full control of that org. The only person who can add or remove Administrators and Viewers. Billing contact where that applies.
- **Administrator** — day-to-day operations. Cannot change the team.
- **Viewer** — dashboards and reports only.
- **Cashier** — merchant and site only. Creates and manages their own payment orders at the counter. No settings, no wallet, no fees, no team.

One person can be Owner on a merchant and Viewer on an agent. That is intentional.

## Agent nesting depth — current status

Platform Owner already has a global **max agent depth**. Phase 1 default is **2**: Platform → Agent → Agent (sub) → Merchant. Agents cannot add another agent layer once that limit is reached.

## Recommendation: keep max depth at 2

Two levels is enough for a typical ISO / sub-ISO channel (head office plus one local partner) without making commission, audit, and support unreadable. Deeper trees make it hard to see who is responsible for a merchant, and they complicate payouts. If a later programme needs a third layer, Platform Owner can raise the setting; we would rather not design Phase 1 around that.

---

# 2. Merchant fee composition (what we charge, and when)

## What we are aligning on

Whether the merchant still pays a **monthly subscription plus a volume percentage**, or only a **volume percentage**.

## Current status — three commercial pieces

| Piece | Who pays / who receives | When it is taken | Editable? |
| --- | --- | --- | --- |
| **Monthly subscription** | Merchant → Platform (on the service bill) | Issued with the previous calendar month’s bill. Full month amount is charged if the merchant was onboarded on or before the period end — we do not prorate by day today. | Platform Owner edits the tier amount. Change applies from the **next** billing period. |
| **Volume fee (%)** | Merchant → Platform (same service bill) | Same bill. Calculated on **completed** payment-order volume in that period × the merchant’s effective %. | Agent Owner/Admin sets the % **inside the platform band**. Enterprise custom rates need Platform Owner approval. Change applies next period. |
| **Agent / sub-agent commission** | Not a merchant charge. Platform rebates top-level agents from **paid** volume fees; the parent agent then pays their sub-agent. | After the merchant’s service bill is **paid**. Month-end generate → platform remits around the 1st → agent confirms receipt. Sub-agent payout is a separate slip from the parent agent. | Platform sets the agent’s commission %. Parent agent settles the sub-agent from their own share. |

Merchants joining on different days in the same month are handled by **onboard date**: if they did not exist before the period ended, they are skipped for that month; if they did, they get a full subscription line plus volume fee on whatever they actually processed. Commission invoices also show each merchant’s onboard date so the tree is easy to check.

## Recommendation: merchant fee = volume % only

We suggest dropping the monthly subscription from the merchant bill and charging **only a percentage of confirmed volume**.

Why this is kinder to the channel, and simpler to operate:

- New merchants are not asked for a fixed fee in a quiet first month.
- Mid-month onboarding becomes natural: no volume, no fee. Different onboard dates stop being a special case.
- The service bill has one line merchants can explain to finance.
- Agent and sub-agent commission can stay as a **rebate of collected volume fee**, so the channel still earns without the merchant seeing a second “agent fee.”

Subscription amounts and the three-tier table are already in the product. We will **not** rip that out until you confirm. After you confirm, we will come back with a short implementation note (bill line, tier bands, commission base, and what happens to merchants already on a subscription).

---

# 3. Fee settlement path (who the merchant pays)

## What we are aligning on

The order in which platform fee money moves through the channel.

## Option 1 — recommend: Merchant → Platform → Agent → Agent (sub)

The merchant pays **one** service bill to the **platform billing wallet**. Platform keeps its share and pays the **top-level agent**. That agent pays their **sub-agent** from their own funds.

## Option 2: Merchant → Agent (sub) → Agent → Platform

The merchant would pay the nearest partner first, and money would be passed up the tree to the platform.

## Current status

Option 1 is what is built and locked for Phase 1. Merchants never pay a separate agent fee. Platform does not pay sub-agents directly; subtree volume rolls into the top-level agent statement.

## Recommendation: keep Option 1

The merchant has one payee and one QR / payment link. Platform always sees whether the fee was collected before any rebate goes out (commission is on **paid** bills only). Custody stays clean: payer coins still go to the merchant wallet; SaaS fees stay on a separate rail. Option 2 would put channel partners in the middle of platform revenue, split collection across many wallets, and make overdue fees much harder to chase. We would rather not take that on in Phase 1.

---

# 4. Settlement wallet ownership (merchant vs site)

## What we are aligning on

Which org owns the on-chain receive address that payers send to.

## Option 1 — recommend: merchant only

Wallet, xPub, matching mode, and retention live on the **parent merchant**. Every site under that merchant uses the same receive setup. Sites do not have their own address and cannot request an override.

## Option 2: merchant and site, with parent approval

A site could ask for its own wallet; the parent Owner would approve or deny.

## Current status

The locked Phase 1 rule is Option 1: sites **always inherit**. There is still some older UI copy around “request override”; that is leftover from an earlier draft and should not be treated as product policy. Payment orders created at a site already settle to the parent merchant wallet.

## Recommendation: keep Option 1

One wallet per billed merchant keeps matching, reconciliation, and service billing on a single address. Site-level wallets would look like separate merchants on-chain, raise mixed-payment risk, and blur who is the billing entity. Multi-location groups still get site-scoped orders, cashiers, and reports — they simply share settlement. If a group truly needs a different wallet, they should be onboarded as a **separate merchant**, not as a site with a special exception.

---

# 5. Platform fee remittance asset and network

## What we are aligning on

Which crypto asset and which chain merchants (and platform ops) use when paying **service bills** and **agent commissions**. This is separate from the pairs a merchant may offer payers at checkout.

## Current status

Platform fee remittance is already locked to **USDT on TRON (TRC-20)**.

- Production: **USDT · TRON mainnet**
- Test / UAT: **USDT · TRON Nile**
- One platform billing wallet address is enough for Phase 1. There is no multi-asset fee catalog.
- Agent commission payouts use the **same** pair (Confirm & pay is USDT · TRON; explorers open Tronscan).
- Merchant **payment orders** may still collect on other catalogued pairs (USDT on Ethereum, BSC, and so on). Those coins go to the merchant wallet. They are not the rail used to pay the platform.

## Recommendation: keep USDT on TRON (TRC-20)

We recommend staying with the current pair for platform fees and commission remittance.

- It is already built: service-bill checkout, billing-wallet settings, and commission slips all assume this pair.
- It matches the default merchant collection pair, so finance, agents, and support only need one remittance habit for SaaS billing.
- TRC-20 transfer cost is low relative to ERC-20, which matters when many merchants pay a monthly bill and platform later rebates agents.
- One asset and one network keeps invoices, QR codes, and “mark paid” simple. Mixing USDT on several chains (or adding USDC / TRX) would split the treasury, confuse wrong-network payments, and need a fee-wallet catalog we deliberately did not build for Phase 1.

If a later programme needs a second remittance pair, we can add it as a written change. For Phase 1 we would rather not open that door.

---

# How we would like to close

If you are comfortable with the five recommendations — depth 2, volume % only, merchant pays platform first, wallet on the merchant only, and **USDT on TRON for platform fees** — we will treat the first, third, fourth, and fifth as confirmed (they already match the live build) and come back with a concrete change list for **volume % only** before we implement it.

Please tell us if any of these need a different shape for your market or your agents. We would rather adjust the model with you now than retrofit it after merchants are live.

Thank you again for the review.
