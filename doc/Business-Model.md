# PaymentGate Business Model

Phase 1 is a merchant collection product. PaymentGate (the **platform**) sells software that creates payment orders and confirms on-chain receipts. It does not hold money, does not run an exchange, and does not convert crypto to fiat.

Business model, fund flow, roles, permissions, and revenue rules in this document are **locked for Phase 1** unless both parties agree a written change.

**Phase 1 org lock (client confirmed):** **Platform → Agent → Merchant → Site* → Cashier**. Any merchant may add optional **Site** accounts (sites may nest under sites; unlimited depth; same org type — no “sub-site”). There is **one merchant kind** only (no single vs multi-location). **Agent (sub)** is **out of product**. Existing `agent_sub` DB rows may remain for ops/read until cleaned up; **new agent_sub creates are forbidden**.

\* Site = `merchant_site`. Invoices + cashiers only; **no wallets**. Settlement always climbs to the billing **merchant**.

## Terminology

Product language below is chosen to match **payment-industry** and **B2B SaaS** conventions. Contract documents may still say “Company A / Company B”; in product and UI, use the terms in this section.

### Two kinds of concept (do not mix them)

| Kind | Meaning | Examples |
| --- | --- | --- |
| **Org account type** | A node in the platform tree — has its own login realm, settings scope, and billing boundary | Platform, Agent, Merchant, Site |
| **User role** | What a **person** can do **inside** one org account | Owner, Administrator, Viewer, Cashier |

One person may hold different roles in different org accounts (for example Owner of a merchant account and Viewer on an agent account).

### Org account types (Phase 1)

| Term | Market fit | Definition |
| --- | --- | --- |
| **Platform** | Operator / SaaS vendor | PaymentGate itself. Runs global policy, billing wallet, compliance. |
| **Agent account** | Channel partner / ISO-style reseller | Brings merchants onto PaymentGate. Sits **directly under Platform only**. No nested agents. |
| **Merchant account** | Merchant that collects from payers | Parent is **Platform** (direct) or an **agent**. One billing boundary. Optional sites for outlets. |
| **Site** | Location / ops unit under a merchant (or under another site) | Same type at every level (`merchant_site`). **Invoices + cashiers only; no wallets.** Parent merchant remains the billing and settlement entity. Nesting is unlimited; there is **no** separate sub-site type. |

### Removed from Phase 1 product (do not use in UI or new onboarding)

| Avoid | Why |
| --- | --- |
| **Agent (sub) / sub-agent** | Nested agent trees made the product harder than payment matching. |
| **Single-location / multi-location merchant** | One merchant kind only. Sites are optional under any merchant; fees are not tied to structure. |

**Not used in product copy**

| Avoid | Use instead |
| --- | --- |
| Company (for PaymentGate or customer) | **Platform** / **merchant account** |
| Sub-merchant, branch, location account, sub-site, merchant (site) | **Site** (under merchant or site) |
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
| **Administrator** | Platform, Agent, Merchant | Day-to-day operations; **cannot** add/remove Administrator or Viewer; **cannot** change the org **Owner’s person profile** (first/last name, email, phone, verification, timezone). |
| **Viewer** | Platform, Agent, Merchant | Read-only dashboards and reports. |
| **Cashier** | Merchant or Site | Counter staff: create and manage **own payment orders** only; no settings or team management. |

**Platform-account users** operate PaymentGate globally: fee policy (automatic volume schedule and fixed rates), agent and merchant onboarding (including merchants **directly under Platform**), billing wallet, agent payout overrides, compliance override, and audit.

**Agent-account users** may **help onboard merchants and sites** in their channel (**only after** the agent profile activity gate is clear). They view merchant volume and service bills. From the agent role they **cannot** create payment orders, change merchant receive wallets, or see merchant API secrets. Merchant/site have **no fee settings** (Automatic or Platform Fixed only). Ongoing in-org help: merchant/site may invite a **verified** Agent Owner/Administrator onto the team (not Viewer).

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
 │    └── Site* (optional; any merchant may add sites)
 │         └── Site* …
 └── Agent account (optional channel; parent = Platform only)
      └── Merchant account
           └── Users: Owner, Administrator, Viewer, Cashier
           └── Site* …
```

\* Site org type = `merchant_site`. Child of merchant or site. No wallets.

**Rules**

1. Every merchant has exactly one parent: **Platform** or an **agent**. Merchants may hang directly under Platform.
2. **Cashier** users exist under **merchant** or **site** accounts, never under agent accounts or Platform.
3. Agents see volume and service bills for their merchants; they cannot see or change merchant credentials, API secrets, settlement settings, or merchant platform fee rates.
4. **No** agent under agent.
5. **Sites** may nest under merchant or site without a depth cap. Every site’s settlement/wallet settings resolve to the nearest ancestor **merchant**. Sites do not hold wallets.
6. Service bills and commercial lifecycle stay on the **merchant**, not on sites.

**Multi-shop pattern:** merchant → zero or more **sites** (optionally nested) for outlets; cashiers on merchant and/or sites. Separate wallets or separate billed companies = separate **merchant** accounts.

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

The fee is a **technical service fee**: monthly subscription plus **volume fee** on confirmed payment-order volume. For each merchant, platform fee is either **Automatic** (computed from that merchant’s **monthly payment-order volume** using the platform schedule) or **Fixed** (a locked rate set only with **Platform Owner** permission). **Agents never set or change merchant platform fees.**

## Who is on the platform

**Payer.** The guest, passenger or shopper. Opens the QR or link and pays on-chain. Not a platform account in Phase 1.

**Platform.** PaymentGate operator. Platform **Owner**, **Administrator**, and **Viewer** manage global fee policy, agent onboarding, **direct merchant onboarding under Platform**, compliance override, billing wallet, agent payout overrides, and audit.

**Agent account.** Optional channel partner **directly under Platform**. After profile completeness, Owner/Administrator **help onboard merchants** under the agent and **help onboard sites** under those merchants; they view merchant volume and service bills — **read-only** on merchant credentials, settlement, and merchant fee rates. Agents **do not** create payment orders and **do not** set platform fees. Agents are not required for every merchant.

**Merchant account.** The customer org that collects payer funds. Parent is **Platform** or an **agent**. After profile completeness, Owner/Administrator **help onboard sites** under the merchant (sites may nest). Optional Cashiers for counter staff.

**Cashier.** User on a merchant account. Creates payment orders at the counter (web or POS APK). Manages **own** payment orders only. Cannot change settlement address, xPub, fees, or org settings.

## Roles and permissions

| Role | Payment orders | Service bills | Team (Administrator / Viewer) | Settings (wallet, xPub, matching mode) | Merchant platform fee | Agent commission |
| --- | --- | --- | --- | --- | --- | --- |
| **Platform Owner** | None | Issue/adjust service bills | **Add/remove Platform Administrator and Viewer** | Compliance override; agent payout override | Set Automatic schedule; set / approve **Fixed** rates | Set Automatic / Fixed commission |
| **Platform Administrator** | None | Issue/adjust service bills | **Cannot** add/remove team | Compliance override (logged); agent payout override | View; operate per Owner policy | View; may apply Owner-approved Fixed changes if product allows |
| **Platform Viewer** | None | View only | None | View only | View only | View only |
| **Owner** (merchant) | Full | View + pay own org bills | **Add/remove Administrator and Viewer**; **onboard sites** when merchant activity gate is clear | Full within org policy | View effective rate | — |
| **Administrator** (merchant) | Full | View + pay own org bills | **Cannot** add/remove team; **onboard sites** when merchant activity gate is clear | Change per Owner policy (settlement wallet: **Owner / Platform only**) | View effective rate | — |
| **Viewer** (merchant) | View only | View only | None | View only | View only | — |
| **Cashier** | Create/manage **own** orders | None | None | None | None | — |
| **Agent account** (Owner/Administrator) | **None** for merchants | View merchant service bills | **Onboard merchants** under self; **onboard sites** under those merchants (**when profile complete**) | **Read-only** on merchant settings from agent role; edit **own** agent profile | **N/A — no merchant fee UI** (view effective rate only) | **View only** (Platform sets Automatic/Fixed) |
| **Agent Viewer** | None | View merchant service bills | None | View only | View only | View only |

**Audit:** All login events and privileged actions are **append-only**. No user may delete audit records.

**Wallet:** Each merchant has one settlement receive address (and optional watch-only xPub for Smart address matching). **Only Merchant Owner or Platform Owner/Administrator** may change it. Cashiers, merchant Administrators, and agent-account users never change it.

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

## Platform fee (merchant billing only)

**Merchant** and **site** accounts have **no fee-setting UI**. Volume fee is never configured by merchant, site, or agent users.

Effective platform fee on the **billing merchant** is only:

| Mode | Who sets | Behaviour |
| --- | --- | --- |
| **Automatic** | Platform schedule (default) | Follows that merchant’s **confirmed payment-order volume for the month** |
| **Fixed** | **Platform Owner** (platform setting) | Locked % until Platform Owner changes it |

**Sites** inherit billing from the ancestor **merchant** — no per-site subscription/volume fee settings.

**Rules**

- Platform Owner owns the Automatic schedule and Fixed rates.
- Platform Administrator operates Fixed changes only under Owner policy.
- Agents / merchants / sites **cannot** set or request fee % in-product (agents may still *ask* Platform off-platform to change Fixed).
- Fee changes apply to the **next billing period**, not retroactively.
- Merchant (and site) users may **view** the effective rate on the billing merchant; Cashiers cannot change it.

**Default schedule (Phase 1 — Platform Owner may adjust globally):**

| Volume band (indicative) | Typical profile | Monthly subscription | Volume fee (Automatic) |
| --- | --- | --- | --- |
| **Small** | Low monthly volume | USD 49 / month | Up to **2.0%** (schedule default) |
| **Mid** | Steady volume | USD 199 / month | Mid schedule band (e.g. **0.8% – 1.5%**) |
| **Enterprise** | Large / custom | Custom | Custom; **Fixed** requires **Platform Owner** |

## Agent onboarding & profile completeness

**Create (Platform Owner/Administrator) — minimal:**

1. **Business name** (org name in the tree / portal)
2. **Owner email** (invite first Owner)

No country, billing email, phone, avatar, legal name input, or payout address at create.

**Org fields after invite**

| Field | Rule |
| --- | --- |
| **Business name** | Required; editable by agent O/A and platform support-edit |
| **Legal name** | **Optional** in current Phase 1. Used **only on invoices** when present. On create, **auto-filled = business name**. Agent (or platform support) may change it later. Kept for a future version where legal entity may differ from trading name. |
| **Billing email** | Optional to type separately; for the **activity gate** the agent must confirm a billing email (pre-filled from owner email is OK). If still empty at send time, fall back to owner email. |
| **Avatar / country** | Optional for gate (not required to unlock activity unless listed below) |
| **Payout address (wallet)** | Required for activity gate |

**User (Owner account) profile**

| Field | Rule |
| --- | --- |
| **First name** + **Last name** | Required for activity gate (person profile — not a single display name). Future-friendly for KYC-style packs. |
| **Email** | Login / invite; **email verification** required for activity gate |
| **Phone** | **Phone verification** required for activity gate |
| **Timezone** | Required for activity gate |

**Activity gate (watch-only until all true)**

Until every item below is satisfied, the agent account is **watch-only**: sign-in and read dashboards / merchants / bills allowed; **no activity** such as **onboard merchant** (and other gated writes).

1. First name  
2. Last name  
3. Billing email (set; may equal owner email)  
4. Email verified  
5. Phone number verified  
6. Timezone  
7. Wallet (agent payout) address  

Platform **Owner** may **support-edit** org fields and the partner **Owner’s person profile** (including email/phone verification status) when OTP delivery fails — **audit logged**. **Administrator** (Platform, Agent, or Merchant) **cannot** change an Owner’s person profile — only the Owner themselves (self-profile) or Platform Owner (support). Phase 1 verification channels are **email and phone (SMS) only** — no WhatsApp, voice, or other channels.

**Billing email fallback for delivery:** if billing email is unset when sending a notice, use **owner email**. The activity gate still requires billing email to be explicitly present (pre-fill from owner email on first profile save is enough).

## Merchant onboarding & profile completeness

**Create (Platform Owner/Administrator, or Agent Owner/Administrator when agent activity gate is clear) — minimal:**

1. **Parent** — Platform or agent (shown **read-only** on the onboard form when already chosen; user does not pick freely if context fixed)
2. **Business name**
3. **Owner email**

No country, billing email, phone, avatar, legal name input, or settlement wallet at create.

**Who may create what (onboard help)**

| Actor | May onboard |
| --- | --- |
| **Platform O/A** | Agents, merchants (under Platform or any agent), sites (under any merchant/site) |
| **Agent O/A** (activity gate clear) | **Merchants** under that agent; **sites** under merchants in that agent’s channel |
| **Merchant O/A** (activity gate clear) | **Sites** under that merchant (and nested sites under sites they manage) |
| **Watch-only** agent/merchant | No onboard — self-profile only |

Onboard = create the org + invite Owner (minimal fields). Completing profile / activity gate is then the new Owner’s job (platform may still support-edit).

**Owner invite on onboard — blocked emails:** the new merchant/site **Owner** must **not** be an existing **Platform Owner/Administrator** or **Agent Owner/Administrator** account. Those users operate from platform/agent portals; they are not onboarded *as* the merchant/site Owner.

**Team invite onto merchant/site (after create):**

| Invitee | Allowed on merchant/site team? |
| --- | --- |
| **Verified** Platform Owner or Platform Administrator | **Yes** (same user/email may hold merchant/site membership) |
| **Verified** Agent Owner or Agent Administrator | **Yes** (same) |
| Platform **Viewer** or Agent **Viewer** | **No** |
| Other new emails | **Yes** (normal invite), subject to existing uniqueness rules |

“Verified” = that user’s **email verified** and **phone verified** (Phase 1 channels). Invite is rejected until both are true for Platform/Agent O/A invitees.

When a Platform/Agent O/A accepts a merchant/site membership, they act under **that org’s role** (e.g. Merchant Administrator) for in-org help. That does **not** grant agent-portal power to edit merchant settlement; settlement wallet remains **Merchant Owner** or **Platform O/A** only.

**Org fields after invite**

| Field | Rule |
| --- | --- |
| **Business name** | Required; editable by merchant O/A and platform support-edit |
| **Legal name** | Same as agent: **optional**; invoices only; **auto-filled = business name** on create; merchant (or platform) may change |
| **Billing email** | Same as agent: required for activity gate (may equal owner email); delivery fallback to owner email if unset at send time |
| **Country** | **Required for activity gate** |
| **Settlement wallet address** | Required for activity gate (payer receive address; Mode S / xPub follows existing matching rules once unlocked) |
| **Avatar** | Optional |

**User (Owner and all merchant/site users) profile**

| Field | Rule |
| --- | --- |
| **First name** + **Last name** | Required for person profile **everywhere** (Platform → Agent → Merchant → Cashier). Not a single display name. |
| **Email** | Login; **email verification** required for merchant Owner activity gate |
| **Phone** | **Phone verification** required for merchant Owner activity gate |
| **Timezone** | Required for activity gate |

**Activity gate (watch-only / reader until all true)**

Until every item below is satisfied for the merchant Owner (org + person), the merchant account is **watch-only (reader)**:

1. First name  
2. Last name  
3. Billing email  
4. Email verified  
5. Phone number verified  
6. Timezone  
7. Settlement wallet address  
8. **Country** (required — extra vs agent gate)

**While watch-only:** the user may edit **only their own self-profile** (first/last name, phone, timezone, verification flows, etc.). Everything else is **read-only** (no payment orders, no sites/team writes, no settlement/org/API writes, no fee changes).

**After gate clears:** normal merchant O/A permissions apply (orders, sites, settlement with MFA + cool-down, team per role rules, etc.).

**Platform permissions:** Platform Owner and Platform Administrator may operate merchants (org fields, settlement wallet, fees, lifecycle, etc.) — **audit logged**. **Exception — Owner person profile:** only the **Owner** (self) or **Platform Owner** (support) may change an Owner’s first/last name, email, phone, verification status, or timezone. **Platform Administrator** and all other Administrators **cannot** change Owner person profiles.

**Owner person profile rule (all orgs):** **Administrator cannot change Owner profile.** Applies to Platform, Agent, Merchant, and Site. Each user may edit **their own** self-profile. Org **Owner** may be support-edited only by **Platform Owner**.

**Agent permissions on merchants (agent portal role):** From the **agent** role, agents **do not** edit merchant profile, settlement, credentials, or fees. There is **no merchant/site fee setting** to edit anyway (Automatic or Platform Fixed only). Agents **do** help **onboard** merchants and sites. For ongoing in-org help, a **verified** Agent Owner/Administrator may be **invited onto the merchant/site team** (see team invite rules above) — then they work as that merchant/site member, not via agent-role edits.

**Settlement wallet (payer receive address):** may be set/changed **only** by:

1. **Merchant Owner**, or  
2. **Platform Owner / Platform Administrator**

Merchant Administrator, Viewer, Cashier, and **all agent-account roles** cannot change the settlement wallet. Changes use MFA + cool-down + audit (same safety bar as today).

**Verification:** email + phone SMS only; Platform O/A may override verification status (audit logged) — same as agent.

## Agent commission (Decision 1)

**Locked: Platform pays agent (Option A). No sub-agent cascade in Phase 1.**

- Merchant receives **one service bill**: subscription + volume fee (QR + payment link to **platform billing wallet**).
- **Platform pays agents** whose parent is Platform: commission = agreed **% of platform fee collected** on that agent’s merchants. **Collected** = volume fees on **paid** service bills only.
- Agent commission rate mode is **Automatic** or **Fixed** only:
  - **Automatic** — follows the platform commission schedule.
  - **Fixed** — locked % set by **Platform Owner** (typically after the agent requests a change via social / off-platform conversation).
- **Agent users only watch** commission mode and % — they do not edit it in-product.
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

**Payout address:** Agent Owner/Administrator may set/change their payout address (MFA + cool-down, audit). **Platform Owner and Platform Administrator may also set/change** the agent payout address (support / ops override; MFA + cool-down + audit). Agents are notified on change when product mail is available.

## Locked product decisions (Phase 1)

| # | Topic | Decision |
| --- | --- | --- |
| **1** | Agent commission payer | **Platform pays agents** (rebate from platform fee collected). No merchant-paid agent fee. No sub-agent cascade. |
| **2** | Merchant platform fee | **No fee settings** on merchant or site UI. Billing merchant only: **Automatic** or **Fixed** (**Platform Owner**). Agents/merchants/sites never set fees. |
| **3** | Agent commission rate | **Automatic** or **Fixed**; **Platform Owner** applies changes (agent requests off-platform). Agent UI is **view-only**. |
| **4** | Org tree | Platform → Agent → Merchant → **Site** (under merchant **or** site). Site nesting depth **unlimited**. **No** agent (sub). |
| **5** | Sites | Invoices + cashiers only; **no wallets**; settlement climbs to billing merchant. Unlimited nesting under merchant/site. |
| **6** | Team management | **Owner only** may add and remove **Administrator** and **Viewer**. **Administrator cannot** add or remove team members. All actions logged. |
| **6a** | Owner person profile | **Administrator cannot** change the org **Owner’s** person profile (name, email, phone, verification, timezone). Self-edit by Owner; Platform **Owner** may support-edit (audit). |
| **7** | Sibling org names | Under the same **parent**, child org **business names** must be unique (**trim** + **case-insensitive**). Enforced on create (`duplicate_sibling_name`). |
| **8** | Custody | Watch-only. No merchant spend keys. No skim of on-chain payer amount. |
| **9** | Agent onboard | Platform creates with **business name + owner email** only. **Legal name** auto-filled from business name (optional to edit; invoices only). Agent completes profile after invite. |
| **10** | Agent billing email | Confirmed for activity gate (may equal owner email). Delivery fallback: owner email if unset. |
| **11** | Agent payout address | Editable by **agent O/A** and by **platform O/A** (support override); MFA + cool-down + audit. |
| **12** | Agent activity gate | Requires: **first name**, **last name**, **billing email**, **email verified**, **phone verified**, **timezone**, **wallet (payout) address**. Until then: watch-only. |
| **13** | Person profile | **All** portal users (Platform → Agent → Merchant → **Cashier**) use **first name + last name**. |
| **14** | Contact verification | Phase 1: **email** and **phone (SMS)** only. Verification status override: **Platform Owner** only (not Administrator). Audit logged. |
| **15** | Merchant onboard | **Parent** (read-only when preselected) + **business name** + **owner email**. Legal name auto = business name. Owner email must not be Platform/Agent O/A (see **21**). |
| **16** | Merchant activity gate | Same as agent **plus country**: first name, last name, billing email, email verified, phone verified, timezone, **settlement wallet**, **country**. Until then: watch-only — **self-profile only** editable; all other surfaces read-only. |
| **17** | Platform authority | Platform Owner and Administrator may change partner **org** information (wallets, billing email, country, etc.). **Owner person profile** / verification override: **Platform Owner** only — Administrators cannot. |
| **18** | Agent vs merchant data | From **agent role**: no edit of merchant profile/settlement (fees N/A — no merchant fee UI). Agent **does** onboard merchants/sites. Ongoing help = invite **verified** Agent O/A onto merchant/site team. |
| **19** | Merchant settlement wallet | Changeable **only** by **Merchant Owner** or **Platform Owner/Administrator**. Not by merchant Admin, agent role, or Cashier. MFA + cool-down + audit. |
| **20** | Onboard help matrix | Platform O/A: agents + merchants + sites. Agent O/A: merchants under self + sites under those merchants. Merchant O/A: sites under self. Gates apply. |
| **21** | Merchant/site Owner onboard | Platform O/A and Agent O/A accounts **must not** be onboarded as the new merchant/site **Owner**. |
| **22** | Merchant/site team invite | **May** invite **verified** Platform O/A and **verified** Agent O/A (same email OK). **Must not** invite Platform Viewer or Agent Viewer. |

## Platform revenue and cost

**Platform revenue:** subscription + volume fee on monthly confirmed payment-order volume (**Automatic** schedule or **Fixed** rate).

Volume fee is a software/technical charge — **not** deducted from the payer’s on-chain payment.

**Platform cost:** hosting, chain access, monitoring, support, agent commission payouts, penetration test. Hosted on Company A’s cloud accounts (contract term).

## What this is not

Phase 1 is not a wallet app, broker, OTC desk, or bank. No seed phrases stored. No USDT→fiat conversion. No platform token.

Later phases (each with legal review): Phase 2 consumer wallet; Phase 3 fiat via licensed partner; Phase 4 token/chain optional.

## Why a merchant would pay

Card rails take a few percent, can freeze payouts, and need chargebacks. This product is for merchants who already have a crypto address and want payment to land there with a reconcilable record.

PaymentGate competes on **trust (non-custodial)** and **ops clarity** — not on nesting companies.
