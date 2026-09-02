# PaymentGate Business Model

Phase 1 is a merchant collection product. PaymentGate (the **platform**) sells software that creates payment orders and confirms on-chain receipts. It does not hold money, does not run an exchange, and does not convert crypto to fiat.

Business model, fund flow, roles, permissions, and revenue rules in this document are **locked for Phase 1** unless both parties agree a written change.

## Terminology

Product language below is chosen to match **payment-industry** and **B2B SaaS** conventions. Contract documents may still say “Company A / Company B”; in product and UI, use the terms in this section.

### Two kinds of concept (do not mix them)

| Kind | Meaning | Examples |
| --- | --- | --- |
| **Org account type** | A node in the platform tree — has its own login realm, settings scope, and billing boundary | Platform, Agent, Merchant, Merchant (site) |
| **User role** | What a **person** can do **inside** one org account | Owner, Administrator, Viewer, Cashier |

One person may hold different roles in different org accounts (for example Owner of a merchant account and Viewer on an agent account).

### Org account types

| Term | Market fit | Definition |
| --- | --- | --- |
| **Platform** | Operator / SaaS vendor (Stripe “platform”, CoinGate operator) | PaymentGate itself. Runs global policy, billing wallet, compliance. |
| **Agent account** | Channel partner / ISO-style reseller (common in payment processing) | Brings merchants onto PaymentGate. Sits under **Platform** or under another **agent account** (nested child shown as **Agent (sub) account** when parent context matters). Agent nesting depth is a **platform-wide setting** controlled by **Platform Owner** (default **2** in Phase 1: agent → agent (sub) → merchant). |
| **Merchant account** | **Merchant** — standard payment-industry name for the paying customer org | The business that collects from payers. Two **structures** (not separate products): **single-location** or **multi-location**. |
| **Merchant (site) account** | **Store / outlet / site** under a parent merchant | A site org under a **multi-location merchant** only. Operational unit for one physical site — not a separate billing entity or sub-merchant ID. Replaces informal “branch” and legacy “location account”. |

**Not used in product copy**

| Avoid | Use instead | Why |
| --- | --- | --- |
| Company (for PaymentGate or customer) | **Platform** / **merchant account** | “Company” is ambiguous (vendor vs customer vs legal entity). |
| Business, large/small scale business | **Merchant account** + structure (**single-location** / **multi-location**) | “Business” is vague; payment products say **merchant**. |
| Sub-merchant, branch, location account | **Merchant (site) account** | “Sub-merchant” implies PayFac regulation; “branch” overlaps with banking. **Merchant (site)** is an org account for one site under a parent merchant. |
| Sub-agent account | **Agent (sub) account** | Same org type as agent; “(sub)” marks nesting under a parent agent only. |
| HQ, headquarters (alone) | **Merchant account (multi-location)** or **parent merchant** | HQ is informal; parent merchant is the billing and policy root. |
| Platform Admin (alone), platform administrator | **Platform Owner / Administrator / Viewer** | Platform uses the same role names as other org accounts. Legacy “Platform Admin” maps to **Owner** or **Administrator** on the Platform account. |
| Admin (merchant side) | **Administrator** | Matches CoinGate, Stripe team naming. |
| Reader | **Viewer** | Standard SaaS read-only role name. |
| Guest invoice | **Payment order** | Industry term for a collect request; “guest invoice” is internal jargon. |
| Platform fee invoice | **Service bill** | Distinguishes SaaS billing from customer **payment orders**. |

### User roles

Roles apply **inside** an org account. **Owner**, **Administrator**, and **Viewer** use the same names on Platform, Agent, Merchant, and Merchant (site) accounts. **Cashier** exists only under merchant accounts.

| Role | Typical account | Definition |
| --- | --- | --- |
| **Owner** | Platform, Agent, Merchant, Merchant (site) | Full control within the org; billing contact where applicable; **only role that may add/remove Administrator and Viewer** on that account. |
| **Administrator** | Platform, Agent, Merchant, Merchant (site) | Day-to-day operations; **cannot** add/remove Administrator or Viewer. |
| **Viewer** | Platform, Agent, Merchant, Merchant (site) | Read-only dashboards and reports. |
| **Cashier** | Merchant or Merchant (site) only | Counter staff: create and manage **own payment orders** only; no settings or team management. |

**Platform-account users** (Owner/Administrator/Viewer on the Platform org) operate PaymentGate globally: fee tiers, agent onboarding, billing wallet, compliance override, and audit. **Owner** holds policy authority (global tiers, max agent depth, Enterprise rate approval). **Administrator** runs day-to-day platform operations but cannot change team membership.

**Agent-account users** (Owner/Administrator/Viewer on an agent account) may onboard merchants and set volume fees within platform bands. They are **not** a separate role named “Agent” — they use the same Owner / Administrator / Viewer roles on an **agent account**.

### Payment documents

| Term | Paid by | Funds go to | Created by |
| --- | --- | --- | --- |
| **Payment order** | Payer (customer) | **Merchant wallet** (100%, non-custodial) | Merchant Owner/Administrator, Merchant (site) Owner/Administrator, or Cashier |
| **Service bill** | Merchant account (parent billing entity) | **Platform billing wallet** | System (periodic) + Platform Owner/Administrator adjustments |

### Org tree (canonical)

```
Platform
 └── Users: Owner, Administrator, Viewer
 └── Agent account (optional; depth limit set by Platform Owner)
      └── … nested agent accounts while below max depth …
           └── Merchant account
           ├── Merchant (site) account (multi-location only)
           │    └── Users: Owner, Administrator, Viewer, Cashier
           └── Users: Owner, Administrator, Viewer, Cashier (direct on single-location or parent merchant)
```

**Rules**

1. Every merchant account belongs to exactly one agent account, or to **Platform** when no external agent is assigned (platform acts as channel).
2. **Merchant (site) accounts** and **Cashier** users exist only under **merchant accounts**, never under agent accounts.
3. Agent-account users see **volume and service bills** for their subtree; they cannot see or change merchant login credentials, API secrets, or settlement settings.

---

## What we sell

Hotels, travel firms, transport companies, retailers and similar **merchant accounts** need a way to take USDT (and later other assets) without building their own chain software.

The product gives them:

- payment order creation
- QR code and payment link
- a page that names the amount, asset, network and receiving address
- a cashier Android app for handheld POS terminals (create order, show QR, print receipt)
- a watcher that marks the order paid when the chain confirms
- dashboards and reports
- hierarchical org management (multi-location merchants, merchant (site) accounts, cashiers) and an agent sales channel

The payer sends from their own wallet. Coins go straight to a wallet the **merchant account** controls. PaymentGate never sits in the middle of payer funds.

The fee is a **technical service fee**: monthly subscription plus **volume fee** on confirmed payment-order volume. Volume fee follows **merchant size tiers** (see [Platform fee tiers](#platform-fee-tiers)). The **default ceiling for small merchants is 2%**. Platform Owner sets global tiers and min/max bands; agent-account administrators adjust rates within those bands for their subtree.

## Who is on the platform

**Payer.** The guest, passenger or shopper. Opens the QR or link and pays on-chain. Not a platform account in Phase 1.

**Platform.** PaymentGate operator. Platform **Owner**, **Administrator**, and **Viewer** users manage global fee policy, agent onboarding, compliance override, billing wallet, and audit (see [Roles and permissions](#roles-and-permissions)).

**Agent account.** Channel partner under Platform or nested under another agent (**Agent (sub) account** when shown in tree context). Users with Owner or Administrator role onboard merchants and agent (sub) accounts while **current depth is below the platform max**, set volume fee within platform bands, and view subtree volume and service bills — **read-only** on merchant credentials and settlement settings. Agent accounts **do not** create **payment orders** for merchants.

**Merchant account.** The customer org that collects payer funds.

- **Single-location merchant** — one site; optional cashiers; no merchant (site) layer (example: one hotel).
- **Multi-location merchant** — parent merchant with **merchant (site) accounts**, each with optional cashiers (example: a retail group with several stores).

**Merchant (site) account.** Operates under a multi-location merchant. Creates payment orders for that site. Wallet, matching mode, fulfillment policy, and order retention **always inherit** from the parent merchant. Sites cannot override those settings.

**Cashier.** User role on a merchant or merchant (site) account. Creates payment orders at the counter (web or POS APK). Manages **own** payment orders only. Cannot change settlement address, xPub, fees, fulfillment policy, confirmation rules, or org settings.

## Roles and permissions

| Role | Payment orders | Service bills | Team (Administrator / Viewer) | Settings (wallet, xPub, matching mode) | Fee rate |
| --- | --- | --- | --- | --- | --- |
| **Platform Owner** | None | Issue/adjust service bills | **Add/remove Platform Administrator and Viewer** | Compliance override; **set max agent depth**; global tiers | Set global tiers and bands |
| **Platform Administrator** | None | Issue/adjust service bills | **Cannot** add/remove team | Compliance override (logged) | View global tiers |
| **Platform Viewer** | None | View only | None | View only | View only |
| **Owner** (agent / merchant / site) | Full (merchant / site) | View + pay own org bills | **Add/remove Administrator and Viewer** | Full within org policy | View effective rate |
| **Administrator** (agent / merchant / site) | Full (merchant / site) | View + pay own org bills | **Cannot** add/remove team | Change per Owner policy | View effective rate |
| **Viewer** (agent / merchant / site) | View only | View only | None | View only | View only |
| **Cashier** | Create/manage **own** orders | None | None | None | None |
| **Agent account** (Owner/Administrator/Viewer) | **None** for merchants | View subtree service bills | Onboard subtree (Owner/Administrator) | **Read-only** on merchant settings | Set rate **within platform band** (Owner/Administrator) |

**Audit:** All login events and privileged actions are **append-only**. No user may delete audit records.

**Settings inheritance:** Merchant (site) accounts always inherit wallet, matching mode, fulfillment policy, and order retention from the parent merchant. There is no site-level override. Platform Owner may change those settings on the **parent merchant** for compliance or abuse (logged).

**Merchant (site) wallet address:** A site never has its own receive address. Settlement and xPub always inherit from the parent merchant.

## Payment orders vs service bills

Two flows — never merged in UI, API, or checkout.

| | **Payment order** | **Service bill** |
| --- | --- | --- |
| **Purpose** | Customer purchase | SaaS subscription + volume fee |
| **Created by** | Merchant, merchant (site), or Cashier | System + Platform Owner/Administrator |
| **Paid by** | Payer | Merchant account (parent billing entity) |
| **Funds go to** | Merchant wallet | Platform billing wallet |

- Payment order checkout: QR and link for the sale.
- Service bill checkout: separate QR, link, or bank instructions — **platform fee only**.
- Agent accounts do not create merchant payment orders. They view service bills across their subtree and receive **commission statements** (see [Agent commission](#agent-commission-decision-1)).

Merchant, merchant (site), and agent portals each show **service bills** applicable to their org scope.

## How a payment order works

1. Merchant Owner/Administrator, merchant (site) Owner/Administrator, or Cashier creates a **payment order** (amount, asset, network).
2. The platform returns QR and payment link. Receive address is the **parent merchant** wallet (sites always inherit).
3. The payer sends coins on that network to that address.
4. The platform watches the chain, waits for confirmations, and updates order status.
5. The merchant system may receive a signed webhook. The merchant receives **100%** of the on-chain amount in their wallet.

**Fulfillment vs chain status (Phase 2):** Merchants may choose when staff release goods (`on_completed` vs `on_verifying`) — see [Merchant-Fulfillment-Policy.md](Merchant-Fulfillment-Policy.md). This does **not** lower platform confirmation floors or let Cashiers change chain policy.

Wrong network, underpay, overpay, duplicate pay, or late pay → explicit order state. The platform does not move coins to fix it.

Payment matching modes are defined in [Phase1-Project-Plan.md](Phase1-Project-Plan.md) Section II.

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
- **Platform revenue** = subscription + volume fee on **confirmed payment-order volume** for the billing period, invoiced separately.
- **Agent revenue** = commission on platform fee (default model); **not** taken from payer on-chain payments.

Network fees on payer payments are paid by the sender, not by PaymentGate.

## Platform fee tiers

Volume fee **follows merchant size**, not one fixed rate for everyone. Platform Owner defines tiers; agent-account administrators assign a rate **within the platform band** for each merchant in their subtree.

**Default tier table (Phase 1 — Platform Owner may adjust globally):**

| Tier | Typical profile | Monthly subscription | Volume fee band (agent picks within band) |
| --- | --- | --- | --- |
| **Small** | Single location, low volume | USD 49 / month | **1.2% – 2.0%** (default **2%** at signup) |
| **Mid** | Multi-location or steady volume | USD 199 / month | **0.8% – 1.5%** |
| **Enterprise** | Large group, custom contract | Custom | **0.5% – 1.0%** (custom rate requires **Platform Owner** approval) |

**Rules**

- Platform Owner sets tier breakpoints, global min/max bands, subscription amounts, and max agent nesting depth.
- Platform Owner/Administrator may onboard agent accounts and issue or adjust service bills.
- Agent-account Owner/Administrator may assign a volume fee **inside the band**. Cannot go below platform minimum or above platform maximum.
- Fee changes apply to the **next billing period**, not retroactively.
- Merchant accounts see the **effective** rate; Cashiers cannot change it.

## Agent commission (Decision 1)

**Locked: Platform pays agent (Option A), cascade for nesting.**

- Merchant account receives **one service bill**: subscription + volume fee (QR + payment link to **platform billing wallet**).
- **Platform pays top-level agents only** (agent whose parent is Platform): commission = agreed **% of platform fee collected** on that agent’s **full subtree** (merchants under the agent and under agent (sub) accounts). **Collected** = volume fees on **paid** service bills only (not issued/overdue).
- **Monthly cadence:** last day of month (or ops **Generate invoices**) creates an **issued** invoice per top-level agent with tree fee status + onboard dates; platform Owner/Admin remits on/around the **1st** (**paid**); agent Owner/Admin **confirms receipt** (**settled** → payout history).
- **Agent pays agent (sub) accounts** from the parent agent’s own funds (not from platform treasury). Same pattern: statement → payout slip (QR + payment link to **sub-agent payout address**) → pay → save history. Platform may view cascade payout history read-only.
- Agent never receives a share of payer on-chain payments.
- Merchants do **not** pay a separate agent fee.

### Payout slips (QR + payment link)

Commission payouts reuse the familiar checkout pattern, but the **receiver is the payee’s payout address** (not the platform billing wallet):

| Step | Merchant service bill | Platform → agent | Agent → sub-agent |
| --- | --- | --- | --- |
| Statement ready | Bill issued | Monthly invoice **issued** | Sub-agent share ready |
| Slip | QR + link → platform wallet | QR → **agent payout address** | QR + link → **sub-agent payout address** |
| Who pays | Merchant | Platform treasury / ops → **paid** | Parent agent |
| Confirm | — | Agent confirms receipt → **settled** | — |
| History | Service bill paid | Settled platform commission record | Agent sub-payout record (platform may view read-only) |

Both sides keep an immutable history (statement + paidAt + tx/ref) in the API.

Agent payout address changes require **MFA** and a **cool-down** (same bar as merchant settlement), with audit log.

## Locked product decisions (Phase 1)

| # | Topic | Decision |
| --- | --- | --- |
| **1** | Agent commission payer | **Platform pays top-level agents** (rebate from platform fee collected). **Agents pay their agent (sub) accounts.** No merchant-paid agent fee. |
| **1b** | Cascade payout | Platform does **not** pay agent (sub) accounts directly. Subtree fees roll into the top-level agent statement; parent agent settles subs. |
| **2** | Fee tiers | **Tiered by merchant size** (Small / Mid / Enterprise). Platform Owner sets tiers and bands; agent assigns rate within band; **Enterprise custom rates require Platform Owner approval**. |
| **3** | Merchant (site) settings | **Always inherit** parent wallet, matching, fulfillment, and retention. No site override. |
| **4** | Agent nesting depth | **Platform Owner** sets **max agent depth** (global). Phase 1 **default: 2** (agent → agent (sub) → merchant). Agents may not create another agent level when depth would exceed the limit; audit log records changes to this setting. |
| **5** | Team management | **Owner only** may add and remove **Administrator** and **Viewer** on every org account (Platform, agent, merchant, merchant (site)). **Administrator cannot** add or remove team members. All actions logged immutably. |
| **6** | Sibling org names | Under the same **parent**, child org **display names** must be unique (**trim** + **case-insensitive**). The same name may be reused under a **different** parent. Enforced on create (`duplicate_sibling_name`). |

## Platform revenue and cost

**Platform revenue:** subscription (tiered) + volume fee on monthly confirmed payment-order volume (tiered band; default small-tier ceiling 2%).

Volume fee is a software/technical charge — **not** deducted from the payer’s on-chain payment.

**Platform cost:** hosting, chain access, monitoring, support, agent commission payouts, penetration test. Hosted on Company A’s cloud accounts (contract term).

## What this is not

Phase 1 is not a wallet app, broker, OTC desk, or bank. No seed phrases stored. No USDT→fiat conversion. No platform token.

Later phases (each with legal review): Phase 2 consumer wallet; Phase 3 fiat via licensed partner; Phase 4 token/chain optional.

## Why a merchant would pay

Card rails take a few percent, can freeze payouts, and need chargebacks. This product is for merchants who already have a crypto address and want payment to land there with a reconcilable record.

They pay for operations, multi-location control, cashier POS, and reconciliation — **not** for custody. Tiered pricing positions the fee as an ops service. At the small-tier ceiling (2%), the product wins on **UX, org tree, and agent-supported onboarding**, not on being the cheapest global checkout.
