# Service bill invoice — Phase 1 field lock

**Status:** Locked for Phase 1 implementation.  
**Rail:** Merchant **service bills** only (platform SaaS subscription + volume fee).  
**Not in scope:** Payment orders (see [Payment-Order-Invoice-Phase1.md](Payment-Order-Invoice-Phase1.md)), agent commission statements, tax/VAT, e-invoicing.

See also: [Business-Model.md](Business-Model.md) (payment orders vs service bills), [UI-Page-Spec.md](UI-Page-Spec.md) B10, OpenAPI `ServiceBill`.

---

## Decisions

| Decision | Choice |
| --- | --- |
| Delivery | **UI-first** finance Invoice layout on bill detail + browser Print → PDF |
| Rate / volume math | **Frozen on the bill at issue** (tier, %, billed volume) |
| Tax | Out of Phase 1 |
| Billing entity | **Merchant parent** only — sites are not billed |

```
generate / issue ──► persist snapshot ──► GET bill ──► Invoice UI ──► Print PDF
```

---

## Field list

### Must (invoice face)

**Document**

| Field | Source |
| --- | --- |
| Bill ID (display + full UUID) | `service_bills.id` |
| Status | `status` |
| Issue date | `created_at` |
| Due date | `due_at` |
| Billing period | `period_start` → `period_end` |
| Currency | `currency` (USD) |

**Seller (platform)**

| Field | Source |
| --- | --- |
| Legal / display name | Remittance settings `sellerName` (fallback: env / CryptoGate) |
| Invoice contact | Remittance settings `sellerEmail` (optional) |

**Buyer (merchant parent)**

| Field | Source |
| --- | --- |
| Org name | `org_accounts.name` |
| Legal name | `org_accounts.legal_name` |
| Billing email | `org_accounts.billing_email` |
| Country | `org_accounts.country` |
| Org ID | `org_accounts.id` |

**Lines**

| Line | Fields |
| --- | --- |
| Subscription | `subscription_amount` + snapshot `tier` |
| Volume fee | `billed_volume_usd × volume_fee_percent% = volume_fee_amount` (all snapshot) |
| Adjustment | `last_adjustment_reason` + `last_adjustment_amount` (signed USD delta) |
| Totals | total due / amount paid / balance |

**Remittance**

- Copy: pay via **service-bill checkout** — not the guest payment page
- `payTo` from platform billing settings (B11-lite), else `PLATFORM_BILLING_PAY_TO`
- Link to service-bill checkout when payable

**Receipt (when paid)**

| Field | Source |
| --- | --- |
| Paid at | `paid_at` |
| Tx hash / payment reference | `payment_reference` |
| Rx address | `rx_address` (snapshot at mark-paid; else live billing `payTo`) |
| Tx address | `tx_address` (merchant payer / sender, optional) |
| Amount | `total_amount` |

### Should

- One-liner: “Completed payment-order volume in period”
- Print control on invoice panel
- Keep B10 timeline / platform actions in ops sidebar (not duplicated inside print body)

### Won’t (Phase 1)

- Tax/VAT, multi-currency FX, e-invoicing standards
- Agent commission on merchant invoice
- Guest payment-order QR / Mark paid for sales
- Full postal address / PO number unless already on org

---

## Schema snapshot (at issue)

Persisted on `service_bills` so later commercial changes do not rewrite history
(migration `037_service_bill_invoice_snapshot.sql`):

| Column | Meaning |
| --- | --- |
| `tier` | `small` / `mid` / `enterprise` at issue |
| `volume_fee_percent` | Effective rate at issue |
| `billed_volume_usd` | Confirmed completed volume used for the fee |

Also exposed on API (already in DB): `payment_reference`, `created_at`.

Adjustment delta: `last_adjustment_amount` (migration `038`).

Payment address snapshot at mark-paid (migration `044`):

| Column | Meaning |
| --- | --- |
| `rx_address` | Platform billing wallet receive address used for remittance |
| `tx_address` | Merchant payer / sender address (optional) |

### Backfill existing bills

Bills issued before snapshot columns existed need a one-shot repair (totals **unchanged**):

```bash
# Preview
node scripts/backfill-service-bill-invoice-snapshots.mjs --dry-run

# Apply
node scripts/backfill-service-bill-invoice-snapshots.mjs
```

Requires migrate through `037+` and `DATABASE_URL`. Skips voided bills and rows already fully snapped.

### Seller / payTo (B11-lite)

Live config: `GET/PUT /v1/platform/settings/billing-wallet` (migration `039`).
UI: `/platform/settings/fee-tiers?tab=remittance` (alias `?tab=billing`; legacy `/platform/settings/billing-wallet` redirects). Checkout prefers DB `pay_to`, then env.

**Seller (platform)** on the invoice face:

| Field | Source |
| --- | --- |
| Legal / display name | Remittance settings `sellerName` (fallback: env / CryptoGate) |
| Invoice contact | Remittance settings `sellerEmail` (optional) |

---

## Acceptance

1. Accountant can explain **who / what / rate basis / volume / total / how to pay / paid proof** from one screen or printed PDF.
2. Changing merchant rate after issue does **not** change historical invoice math.
3. Guest payment page never appears on this surface.
4. Agent commission never appears on the merchant service bill.
5. Adjust shows signed amount on invoice; backfill fills snapshots without rewriting totals.
6. Changing billing-wallet settings updates checkout `payTo` and platform invoice remittance without redeploy.
