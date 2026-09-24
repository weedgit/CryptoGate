# Service bill & commission ops playbook (Phase 1)

Payment-date merchant billing and day-C agent commission invoices. Platform Owner configures amounts and windows under **Fees → Billing calendar**.

## Merchant lifecycle

```text
Verify (activity gate)
  → Activation invoice (Owner-set fee) — draft or auto-send
  → Merchant cannot use live features until activation is paid
  → Mark paid on day D → billing anchor = D, next invoice = D + 1 month

Every day at 00:00 UTC
  → For each merchant with next_invoice_on ≤ today
  → Create invoice: subscription + volume for (volume_period_start → next_invoice_on)
  → Draft, or auto-send if “Auto-send without confirm” is on
  → Advance next_invoice_on by +1 month

Unpaid past due (pay-within days, Owner setting)
  → Overdue + merchant paused (reason + invoice link)

Late pay on day E while paused
  → Active again; new anchor = E; next invoice = E + 1 month
  → Next bill’s volume window still starts at prior volume_period_start (includes gap days)
```

## Agent commission lifecycle

```text
Merchants under an agent pay subscription + volume on their own payment-date clocks
  → Only paid monthly bills count (activation excluded)

On day C (agent remittance From day) at 00:00 UTC
  → Create platform → agent invoices for prior UTC month
  → Base = Σ (subscription_paid + volume_fee_paid) where paid_at ∈ that month
    (line amounts; credits/adjustments do not reduce the commission base)
  → Commission = base × agent rate
  → Status issued (ready for platform remittance)

Platform marks paid → agent confirms → settled
```

Merchants under one agent may have different onboard / activation dates; day **C** is a single platform calendar day so remittance stays predictable.

## Credit vs commission (locked)

| Item | Rule |
|------|------|
| Commission base | Paid monthly **subscription + volume** line amounts |
| Activation | Excluded |
| Merchant credit / waiver | Does **not** reduce agent commission (platform absorbs) |
| Cut | `paid_at` in prior UTC month when day-C job runs |

## Examples

| Activation paid | First sub+volume invoice job |
|-----------------|------------------------------|
| 1 Mar | ~1 Apr 00:00 UTC |
| 31 Mar | ~30 Apr / 1 May 00:00 UTC (month clamp) |

| Agent pay From day C | Auto commission invoices |
|----------------------|--------------------------|
| 10 | 10th 00:00 UTC → prior month paid fees |

## Settings (Fees → Billing calendar)

| Setting | Meaning |
|---------|---------|
| Activation fee USD | First invoice after verify |
| Pay within (days) | Due for **all** merchant invoices (activation + monthly) = send/create + these days |
| Auto-send without confirm | If on, merchant drafts become issued immediately |
| Agent remittance From day (C) | **00:00 UTC** auto-create agent commission invoices |
| Agent remittance To day | Ops remittance window / catch-up |
| Merchant pay window (5–10) | Legacy display only — **not** used for `due_at` |

## Special cases

| Need | Action |
|------|--------|
| Lower / waive this bill | Adjust lines / delta, or Cancel |
| Ops note | On send / cancel / adjust / grant credit |
| Fee holiday | Merchant **fee exempt until** |
| Skip activation | Flag → anchor set without activation invoice |
| Credit after paid | Grant next-period credit |
| One-off merchant bill | Create Bill |
| Missed day-C job | Catch-up while still in remittance window; or Owner **Backfill month** |

## Roles

- **Owner**: billing calendar, commercial flags, all bill / commission actions; **Backfill month** (ops override)  
- **Administrator**: send / cancel / adjust / mark paid / grant credit; commission remittance; one-off Create Bill  
- **Viewer**: read-only  

## Jobs

- `startDailyServiceBillInvoiceJob` — 00:00 UTC merchant recurring creates (audit: `service_bill_daily_auto`)  
- `startServiceBillOverdueJob` — due_at → overdue + pause  
- `startDailyAgentCommissionInvoiceJob` — 00:00 UTC on day C (audit: `commission_payout_auto`)  

## Smoke

```bash
pnpm smoke:billing                 # offline math
DATABASE_URL=... pnpm smoke:billing -- --live   # migrate + DB happy path
```

Portal click-through: [Billing-Commission-UAT.md](Billing-Commission-UAT.md).

## Migrations

- `064_billing_calendar_draft_bills.sql`  
- `065_merchant_billing_flags_credits.sql`  
- `066_billing_anchor_next_invoice.sql`  
