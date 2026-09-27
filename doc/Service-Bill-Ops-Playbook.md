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
  → Overdue + merchant Suspended (reason + invoice link; sites inherit watch-only)

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
  → Skip agents with $0 commission (no invoice row; reason skipped_zero)
  → Audit commission_payout_auto even when all skipped (ops “Last auto run”)

Platform marks paid (note required; optional txRef) → agent confirms → settled
  → Ops may batch Confirm & pay from the Commissions list (issued multi-select; max 50)
```

Merchants under one agent may have different onboard / activation dates; day **C** is a single platform calendar day so remittance stays predictable. Platform Commissions list filters **Issued** vs **Awaiting confirm**; paid slips older than 7 days show an aging hint until the agent settles.

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
| Lower this bill | Adjust lines / delta |
| Forgive this bill | **Waive** (reason required) → status **Waived** |
| Wrong bill | **Cancel** (reason required) → status **Cancelled** |
| Ops note | On send / waive / cancel / adjust / grant credit |
| Fee holiday (N months) | Service Bills → **Waive platform fee** list |
| Free activation | Service Bills → **Waive activation** list |
| Credit after paid | Grant next-period credit |
| One-off merchant bill | Create Bill |
| Missed merchant invoice | Service Bills → More → **Find missed invoice** |
| Missed day-C job | Catch-up while still in remittance window; or Owner **Generate (ops override)** on Commissions |

## Find missed invoice

Service Bills → More → **Find missed invoice** (Owner, Administrator). Run it every 2–3 days to review the daily job.

1. Pick a start and end date (UTC). The end date cannot be after today — later invoices are created automatically. At most 92 days per search.
2. The search lists every invoice a merchant's payment-date schedule expected in that range that does not exist. Any existing monthly bill — draft, issued, overdue, paid or waived — counts as created and is never listed.
3. Review each row (merchant, bill date, period, estimated amount) and click **Create**. The server checks again first, so a bill the daily job made in the meantime is never duplicated.

| Row | Meaning |
|-----|---------|
| Plain | The merchant's schedule is stuck on this bill (the daily job only moves the next bill date after a bill exists). Create uses the daily job's rules — waiver, credit, auto-send — and moves the next bill date forward to the usual day (a 17 Jun bill → next bill 17 Jul). |

Pay within (default 7 days) for a missed invoice counts from the day it is created, not the day it was missed, so the merchant always gets the full period. Sending a draft later restarts it from the send day. Paying on time never moves the next bill date; only paying after the bill went overdue re-anchors the schedule to the payment day.
| **Previously cancelled** | The period's only bill was cancelled. Create it only if money is still owed; the schedule is not changed. |
| **Will be waived** | Merchant is on the Waive platform fee list; the bill is saved as Waived and uses one month. |
| Create *date* first | Later month of a multi-month gap; create the earlier one first. |
| Merchant is suspended / no commercial settings | Fix the merchant first, then search again. |

The owner-only `POST /v1/service-bills/generate` calendar-month backfill remains for seed and smoke tooling only; it is not in the UI.

## Waive vs cancel

Both work on draft, issued and overdue bills and need a reason. Either one resumes a merchant that was suspended by that bill.

| | Waive | Cancel |
|---|---|---|
| Meaning | Real bill, platform forgives it | Bill was wrong |
| Status | `waived` (amounts kept, $0 collected, no agent commission) | `cancelled` |
| Activation bill | Merchant activated today; first monthly bill one month later; never regenerated | Merchant stays unactivated; a corrected activation bill is regenerated |
| Monthly bill | Closed as waived | Closed; use **Create Bill** if money is still owed |

## Waive lists (Service Bills page)

Owner and Administrator add, edit and remove entries; Viewer sees them read-only. A reason is required and every change is audited (`billing_waiver_put`, `billing_waiver_delete`).

- **Waive platform fee** — merchant + months left. Each monthly bill the daily job creates is saved as **Waived** with the real amounts and the reason `Waived N of M — <reason>`; months left drops by 1 and the merchant leaves the list at 0. Credits are not consumed and nothing is auto-sent.
- **Waive activation** — merchant + reason. When setup completes, the merchant is activated that day, the activation bill is saved as **Waived** (`Activation waived — <reason>`) and the entry is removed. Adding a merchant that already finished setup activates it immediately.

Merchant detail shows the billing schedule read-only: `Activated YYYY-MM-DD · Next bill YYYY-MM-DD · N waived months left`.

## Roles

- **Owner**: billing calendar, commercial flags, all bill / commission actions; commission **Generate (ops override)**  
- **Administrator**: send / waive / cancel / adjust / mark paid / grant credit; **Find missed invoice**; commission remittance (note + optional txRef); one-off Create Bill  
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
- `078_billing_waivers.sql` — `waived` status, `voided` → `cancelled`, waive lists; migrates `fee_exempt_until` / `skip_activation` and drops them with `billing_ops_note`  
