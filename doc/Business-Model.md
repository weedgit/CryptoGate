# PaymentGate Business Model

Phase 1 is a merchant collection product. PaymentGate (the **platform**) sells software that creates payment orders and confirms on-chain receipts. It does not hold money, does not run an exchange, and does not convert crypto to fiat.

Business model, fund flow, roles, permissions, and revenue rules in this document are **locked for Phase 1** unless both parties agree a written change.

**Phase 1 org lock (client confirmed):** **Platform → Agent → Merchant → Cashier**, with optional **Merchant (site)** under multi-location merchants. **Agent (sub)** is **out of product**. Existing `agent_sub` DB rows may remain for ops/read until cleaned up; **new agent_sub creates are forbidden**.

## Terminology

Product language below is chosen to match **payment-industry** and **B2B SaaS** conventions. Contract documents may still say “Company A / Company B”; in product and UI, use the terms in this section.

### Two kinds of concept (do not mix them)

| Kind | Meaning | Examples |
| --- | --- | --- |
| **Org account type** | A node in the platform tree — has its own login realm, settings scope, and billing boundary | Platform, Agent, Merchant, Merchant (site) |
| **User role** | What a **person** can do **inside** one org account | Owner, Administrator, Viewer, Cashier |

One person may hold different roles in different org accounts (for example Owner of a merchant account and Viewer on an agent account).

### Org account types (Phase 1)

| Term | Market fit | Definition |
| --- | --- | --- |
| **Platform** | Operator / SaaS vendor | PaymentGate itself. Runs global policy, billing wallet, compliance. |
| **Agent account** | Channel partner / ISO-style reseller | Brings merchants onto PaymentGate. Sits **directly under Platform only**. No nested agents. |
| **Merchant account** | Merchant that collects from payers | Parent is **Platform** (direct) or an **agent**. One billing boundary. May be `single_location` or `multi_location`. |
| **Merchant (site)** | Branch / sub-merchant under a multi-location merchant | Child of a **multi_location** merchant only. Local ops; parent remains the billing entity. |

### Removed from Phase 1 product (do not use in UI or new onboarding)

| Avoid | Why |
| --- | --- |
| **Agent (sub) / sub-agent** | Nested agent trees made the product harder than payment matching. |

**Not used in product copy**

| Avoid | Use instead |
| --- | --- |
| Company (for PaymentGate or customer) | **Platform** / **merchant account** |
| Sub-merchant, branch, location account, merchant (site) | **Merchant** + **Cashier** (shop/desk) or order **reference** |
| Sub-agent, agent (sub) | **Agent** (one level under Platform) |
| Guest invoice | **Payment order** |
| Platform fee invoice | **Service bill** |
| Reader | **Viewer** |
| Admin (alone) | **Administrator** |

### User roles

Roles apply **inside** an org account. **Owner**, **Administrator**, and **Viewer** use the same names on Platform, Agent, and Merchant. **Cashier** exists only under **merchant** accounts.

| Role | Typical account | Definition |
| --- | --- | --- |
| **Owner** | Platform, Agent, Merchant | Full control within the org; billing contact where applicable; **only role that may add/remove Administrator and Viewer** on that account. |
| **Administrator** | Platform, Agent, Merchant | Day-to-day operations; **cannot** add/remove Administrator or Viewer. |
| **Viewer** | Platform, Agent, Merchant | Read-only dashboards and reports. |
| **Cashier** | Merchant only | Counter staff: create and manage **own payment orders** only; no settings or team management. |

**Platform-account users** operate PaymentGate globally: fee tiers, agent and merchant onboarding (including merchants **directly under Platform**), billing wallet, compliance override, and audit.

**Agent-account users** may onboard merchants and set volume fees within platform bands. They **cannot** create payment orders, change merchant receive wallets, or see merchant API secrets.

### Payment documents

| Term | Paid by | Funds go to | Created by |
| --- | --- | --- | --- |
| **Payment order** | Payer (customer) | **Merchant wallet** (100%, non-custodial) | Merchant Owner/Administrator or Cashier |
| **Service bill** | Merchant account | **Platform billing wallet** | System (periodic) + Platform Owner/Administrator adjustments |

### Org tree (canonical — Phase 1)

```
Platform
 └── Users: Owner, Administrator, Viewer
 ├── Merchant account (direct under Platform — allowed; no agent required)
 │    └── Users: Owner, Administrator, Viewer, Cashier
 └── Agent account (optional channel; parent = Platform only)
      └── Merchant account
           └── Users: Owner, Administrator, Viewer, Cashier
```

**Rules**

1. Every merchant has exactly one parent: **Platform** or an **agent**. Merchants may hang directly under Platform.
2. **Cashier** users exist only under **merchant** accounts, never under agent accounts or Platform.
3. Agents see volume and service bills for their merchants; they cannot see or change merchant credentials, API secrets, or settlement settings.
4. **No** agent under agent. **No** merchant site under merchant.

**Multi-shop pattern (Phase 1):** one merchant account; one Cashier (or Owner) per desk/shop; optional **merchant reference** on the payment order for room/table/store label. Separate wallets or separate billed companies = separate **merchant** accounts under the same agent (not sites).

---

## What we sell

Hotels, travel firms, transport companies, retailers and similar **merchant accounts** need a way to take crypto (USDT and other catalogued assets) without building their own chain software.

The product gives them:

- payment order creation
- QR code and payment link
- a page that names the amount, asset, network and receiving address
- a cashier Android app for handheld POS terminals (create order, show QR, print receipt; POS unlock PIN after device bind)
- a watcher that marks the order completed when the chain confirms
- dashboards and reports
- simple org management (agent channel + merchant + cashiers)

The payer sends from their own wallet. Coins go straight to a wallet the **merchant account** controls. PaymentGate never sits in the middle of payer funds.

The fee is a **technical service fee**: monthly subscription plus **volume fee** on confirmed payment-order volume. Volume fee follows **merchant size tiers**. The **default ceiling for small merchants is 2%**. Platform Owner sets global tiers and min/max bands; agent-account administrators adjust rates within those bands for their merchants.

## Who is on the platform

**Payer.** The guest, passenger or shopper. Opens the QR or link and pays on-chain. Not a platform account in Phase 1.

**Platform.** PaymentGate operator. Platform **Owner**, **Administrator**, and **Viewer** manage global fee policy, agent onboarding, **direct merchant onboarding under Platform**, compliance override, billing wallet, and audit.

**Agent account.** Optional channel partner **directly under Platform**. Owner/Administrator onboard merchants, set volume fee within platform bands, view merchant volume and service bills — **read-only** on merchant credentials and settlement. Agents **do not** create payment orders. Agents are not required for every merchant.

**Merchant account.** The customer org that collects payer funds. Parent is **Platform** or an **agent**. Optional Cashiers for counter staff.

**Cashier.** User on a merchant account. Creates payment orders at the counter (web or POS APK). Manages **own** payment orders only. Cannot change settlement address, xPub, fees, or org settings.

## Roles and permissions

| Role | Payment orders | Service bills | Team (Administrator / Viewer) | Settings (wallet, xPub, matching mode) | Fee rate |
| --- | --- | --- | --- | --- | --- |
| **Platform Owner** | None | Issue/adjust service bills | **Add/remove Platform Administrator and Viewer** | Compliance override; global tiers | Set global tiers and bands |
| **Platform Administrator** | None | Issue/adjust service bills | **Cannot** add/remove team | Compliance override (logged) | View global tiers |
| **Platform Viewer** | None | View only | None | View only | View only |
| **Owner** (agent / merchant) | Full (merchant) | View + pay own org bills | **Add/remove Administrator and Viewer** | Full within org policy (merchant) | View effective rate |
| **Administrator** (agent / merchant) | Full (merchant) | View + pay own org bills | **Cannot** add/remove team | Change per Owner policy | View effective rate |
| **Viewer** (agent / merchant) | View only | View only | None | View only | View only |
| **Cashier** | Create/manage **own** orders | None | None | None | None |
| **Agent account** (Owner/Administrator/Viewer) | **None** for merchants | View merchant service bills | Onboard merchants (Owner/Administrator) | **Read-only** on merchant settings | Set rate **within platform band** (Owner/Administrator) |

**Audit:** All login events and privileged actions are **append-only**. No user may delete audit records.

**Wallet:** Each merchant has one settlement receive address (and optional watch-only xPub for Smart address matching). Cashiers never change it.

## Payment orders vs service bills

Two flows — never merged in UI, API, or checkout.

| | **Payment order** | **Service bill** |
| --- | --- | --- |
| **Purpose** | Customer purchase | SaaS subscription + volume fee |
| **Created by** | Merchant Owner/Administrator or Cashier | System + Platform Owner/Administrator |
| **Paid by** | Payer | Merchant account |
| **Funds go to** | Merchant wallet | Platform billing wallet |

- Payment order checkout: QR and link for the sale.
- Service bill checkout: separate QR, link, or bank instructions — **platform fee only**.
- Agents do not create merchant payment orders. They view service bills for their merchants and receive **commission statements**.

## How a payment order works

1. Merchant Owner/Administrator or Cashier creates a **payment order** (amount, asset, network).
2. The platform returns QR and payment link. Receive address is the **merchant** wallet.
3. The payer sends coins on that network to that address.
4. The platform watches the chain, waits for confirmations, and updates order status.
5. The merchant system may receive a signed webhook. The merchant receives **100%** of the on-chain amount in their wallet.

Wrong network, underpay, overpay, duplicate pay, or late pay → explicit order state (**Payment Anomaly**). The platform does not move coins to fix it. There is no “Mark paid” on payment orders.

Payment matching modes: [Phase1-Project-Plan.md](Phase1-Project-Plan.md) Section II · acceptance freeze: [Phase1-Acceptance-Pack.md](Phase1-Acceptance-Pack.md).

## Fund flow

### Rail A — Payer payment (non-custodial)

```
Payer ──on-chain──► Merchant wallet (100%)
         ▲
         └── PaymentGate watches only (no custody, no skim)
```

### Rail B — Platform billing (off-chain contract)

```
Merchant account ──pays subscription + volume fee──► Platform revenue
                                                      └── Agent commission (rebate, if applicable)
```

- **Merchant revenue** = full on-chain payment in the merchant’s wallet.
- **Platform revenue** = subscription + volume fee on **confirmed payment-order volume**, invoiced separately.
- **Agent revenue** = commission on platform fee; **not** taken from payer on-chain payments.

Network fees on payer payments are paid by the sender, not by PaymentGate.

## Platform fee tiers

Volume fee **follows merchant size**. Platform Owner defines tiers; agent-account administrators assign a rate **within the platform band** for each merchant.

**Default tier table (Phase 1 — Platform Owner may adjust globally):**

| Tier | Typical profile | Monthly subscription | Volume fee band (agent picks within band) |
| --- | --- | --- | --- |
| **Small** | Low volume | USD 49 / month | **1.2% – 2.0%** (default **2%** at signup) |
| **Mid** | Steady volume | USD 199 / month | **0.8% – 1.5%** |
| **Enterprise** | Large group, custom contract | Custom | **0.5% – 1.0%** (custom rate requires **Platform Owner** approval) |

**Rules**

- Platform Owner sets tier breakpoints, global min/max bands, and subscription amounts.
- Platform Owner/Administrator may onboard agent accounts and issue or adjust service bills.
- Agent-account Owner/Administrator may assign a volume fee **inside the band**.
- Fee changes apply to the **next billing period**, not retroactively.
- Merchant accounts see the **effective** rate; Cashiers cannot change it.

## Agent commission (Decision 1)

**Locked: Platform pays agent (Option A). No sub-agent cascade in Phase 1.**

- Merchant receives **one service bill**: subscription + volume fee (QR + payment link to **platform billing wallet**).
- **Platform pays agents** whose parent is Platform: commission = agreed **% of platform fee collected** on that agent’s merchants. **Collected** = volume fees on **paid** service bills only.
- **Monthly cadence:** ops generate invoices; platform remits (**paid**); agent confirms receipt (**settled**).
- Agent never receives a share of payer on-chain payments.
- Merchants do **not** pay a separate agent fee.
- **No** agent → sub-agent payout product in Phase 1.

### Payout slips (QR + payment link)

| Step | Merchant service bill | Platform → agent |
| --- | --- | --- |
| Statement ready | Bill issued | Monthly invoice **issued** |
| Slip | QR + link → platform wallet | QR → **agent payout address** |
| Who pays | Merchant | Platform treasury / ops → **paid** |
| Confirm | — | Agent confirms receipt → **settled** |
| History | Service bill paid | Settled platform commission record |

Agent payout address changes require **MFA** and a **cool-down** (same bar as merchant settlement), with audit log.

## Locked product decisions (Phase 1)

| # | Topic | Decision |
| --- | --- | --- |
| **1** | Agent commission payer | **Platform pays agents** (rebate from platform fee collected). No merchant-paid agent fee. No sub-agent cascade. |
| **2** | Fee tiers | **Tiered by merchant size** (Small / Mid / Enterprise). Agent assigns rate within band; **Enterprise custom rates require Platform Owner approval**. |
| **3** | Org tree | **Flat:** Platform → Agent → Merchant → Cashier. **No** agent (sub). **No** merchant (site). |
| **4** | Multi-shop | Cashiers + optional order reference under one merchant — not nested site orgs. |
| **5** | Team management | **Owner only** may add and remove **Administrator** and **Viewer**. **Administrator cannot** add or remove team members. All actions logged. |
| **6** | Sibling org names | Under the same **parent**, child org **display names** must be unique (**trim** + **case-insensitive**). Enforced on create (`duplicate_sibling_name`). |
| **7** | Custody | Watch-only. No merchant spend keys. No skim of on-chain payer amount. |

## Platform revenue and cost

**Platform revenue:** subscription (tiered) + volume fee on monthly confirmed payment-order volume (tiered band; default small-tier ceiling 2%).

Volume fee is a software/technical charge — **not** deducted from the payer’s on-chain payment.

**Platform cost:** hosting, chain access, monitoring, support, agent commission payouts, penetration test. Hosted on Company A’s cloud accounts (contract term).

## What this is not

Phase 1 is not a wallet app, broker, OTC desk, or bank. No seed phrases stored. No USDT→fiat conversion. No platform token.

Later phases (each with legal review): Phase 2 consumer wallet; Phase 3 fiat via licensed partner; Phase 4 token/chain optional. Nested sites or agent depth may return only with a written scope change.

## Why a merchant would pay

Card rails take a few percent, can freeze payouts, and need chargebacks. This product is for merchants who already have a crypto address and want payment to land there with a reconcilable record.

PaymentGate competes on **trust (non-custodial)** and **ops clarity** — not on nesting companies.
