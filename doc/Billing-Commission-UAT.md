# Billing & commission — portal UAT checklist

Manual walkthrough after migrate `064`–`066` and API restart (daily jobs loaded).

**Prep**

```bash
set -a && . /etc/cryptogate/api.env && set +a
cd apps/api && node scripts/migrate.mjs
node scripts/billing-smoke.mjs --live
# restart API so jobs pick up new code
```

Hard-refresh the portal (new web `dist`).

Accounts: see [UAT-Client-Review-Logins.md](UAT-Client-Review-Logins.md).

---

## A. Platform Owner — billing calendar

| # | Step | Expect |
|---|------|--------|
| A1 | Fees → **Billing calendar** | Copy mentions payment-date merchant fees + day-C agent invoices |
| A2 | Merchant pay window | Collapsed **legacy** details (not the fee clock) |
| A3 | Agent remittance **From day (C)** / To day | Editable; From = auto invoice day |
| A4 | Activation fee + Pay within + Auto-send | Editable; Save calendar |

---

## B. Merchant — activation paywall

Use a merchant that is setup-ready but **not** activation-paid (or create new → finish setup).

| # | Step | Expect |
|---|------|--------|
| B1 | Merchant shell | **Activation** banner (not the setup banner) with link to invoice |
| B2 | Create payment order | Disabled / locked — “Pay the account activation fee…” |
| B3 | Service Bills | Callout + open activation row first, **Activation** tag |
| B4 | If draft + auto-send **off** | Callout says wait for Confirm & send |
| B5 | Platform: Confirm & send (or enable auto-send) | Status **issued**; merchant **Pay activation** works |
| B6 | Platform: Mark paid | Merchant `activationPaid`; live actions unlock; commercial shows **billing anchor** + **next invoice** |

---

## C. Merchant — monthly invoice (ops force)

| # | Step | Expect |
|---|------|--------|
| C1 | After activation paid on day D | `next_invoice_on` = D + 1 month (UTC, day clamp) |
| C2 | Force daily job (or wait until that date 00:00 UTC) | Monthly draft/issued: subscription + volume |
| C3 | Auto-send off | Draft until Confirm & send |
| C4 | Auto-send on | Issued immediately |
| C5 | Leave unpaid past due | **Overdue** + merchant **paused** |
| C6 | Mark paid while paused | Active again; new anchor = pay day E; next invoice E+1 month |

Force daily merchant job (API host):

```js
// node -e with DATABASE_URL from api.env
import { runDailyServiceBillInvoiceJob } from './apps/api/src/service-bills/daily-invoice.mjs';
console.log(await runDailyServiceBillInvoiceJob(new Date('YYYY-MM-DDT00:05:00.000Z')));
```

---

## D. Platform — agent commission (day C)

| # | Step | Expect |
|---|------|--------|
| D1 | Merchants under agent have **paid** monthly bills with `paid_at` in prior UTC month | — |
| D2 | Commissions page | Hint: auto-create 00:00 UTC on day C; Generate is **ops override** |
| D3 | Day C 00:00 UTC (or force job / Generate for `YYYY-MM` prior month) | Issued invoices for top-level agents |
| D4 | Amount | `(Σ subscription + volume on paid monthly bills) × agent %` — activation excluded |
| D5 | Credit on a merchant bill | Commission base **unchanged** (line amounts) |
| D6 | Mark paid → agent confirms | Settled in payout history |

Force day-C job:

```js
import { runDailyAgentCommissionInvoiceJob } from './apps/api/src/commercial/daily-commission-invoice.mjs';
// Use a Date whose UTC day === agentPayDayStart
console.log(await runDailyAgentCommissionInvoiceJob(new Date('2026-04-10T00:05:00.000Z')));
```

---

## E. Audit

| # | Step | Expect |
|---|------|--------|
| E1 | After daily merchant creates | Audit: `service_bill_daily_auto` |
| E2 | After day-C commission creates | Audit: `commission_payout_auto` |

---

## Pass / fail

- [ ] A calendar copy + legacy window OK  
- [ ] B activation gate + banner + unlock after mark paid  
- [ ] C monthly create / overdue / late-pay reset  
- [ ] D commission formula + day C / Generate override  
- [ ] E audit actions present  

See also: [Service-Bill-Ops-Playbook.md](Service-Bill-Ops-Playbook.md).
