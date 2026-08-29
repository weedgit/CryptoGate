# Payment order invoice / receipt — Phase 1 field lock

**Status:** Locked for Phase 1 implementation.  
**Rail:** Merchant **payment orders** only (payer → merchant wallet).  
**Not in scope:** Service bills, agent commission, tax/VAT, AR aging, multi-line catalog.

See also: [Business-Model.md](Business-Model.md), [Service-Bill-Invoice-Phase1.md](Service-Bill-Invoice-Phase1.md) (separate rail), [UI-Page-Spec.md](UI-Page-Spec.md) D3.

---

## Decisions

| Decision | Choice |
| --- | --- |
| System of record | Keep **`payment_orders`** — no second money entity |
| Delivery | **UI-first** finance document on order detail + browser Print → PDF |
| Naming | UI: **Payment invoice** (open) / **Payment receipt** (completed); API stays payment order |
| Buyer identity | Optional — Phase 1 often has no payer KYC; show “Guest payer” when unknown |
| Tax / line items | Out of Phase 1 |

```
create order ──► watcher match ──► GET order + on-chain ──► Invoice/receipt UI ──► Print
```

Never merge with **service bill** checkout or platform billing wallet.

---

## Field list

### Must (document face)

**Document**

| Field | Source |
| --- | --- |
| Display id | `order_number` (e.g. shown as order #) |
| Full id | `payment_orders.id` |
| Status | Canonical `OrderStatus` (never “Paid” alone) |
| Created | `created_at` (fallback: omit) |
| Expires | `expires_at` |
| Asset / network | `asset`, `network` |

**Seller (merchant)**

| Field | Source |
| --- | --- |
| Org name | `org_accounts.name` |
| Legal name | `org_accounts.legal_name` |
| Billing email | `org_accounts.billing_email` |
| Org ID | `org_accounts.id` |

**Buyer (payer)**

| Field | Source |
| --- | --- |
| Display | “Guest payer” unless payer fields exist later |
| From address | On-chain `fromAddress` when tx known |

**Context (where / who created / for what)**

| Field | Source |
| --- | --- |
| Site / location | `orgName` on order (merchant or merchant site org) |
| Created by | `createdByEmail` or staff user id |
| Merchant reference | `merchantReference` at create (`merchant_metadata.reference`) — web create, Cashier APK, list column, invoice, CSV |

**Lines**

| Line | Fields |
| --- | --- |
| Crypto collection | Payable amount + asset + network + matching mode label |
| Memo / tag | `memo_or_tag` when Mode D |
| Totals | Payable due / amount received / balance |

**Remittance (merchant-controlled)**

- Receive address (full)
- Address source (main / HD pool) + hd_index when Mode S
- Guest payment page link when open (screen only; optional on print)
- Wrong-network warning copy

**On-chain proof (when tx known)**

| Field | Source |
| --- | --- |
| Tx hash | on-chain details |
| From | on-chain details |
| Amount received | `received_amount` / on-chain amount |
| Confirmed at | on-chain `confirmed_at` |

**Anomaly**

- Plain-language reason + expected vs received when known
- “No Mark paid” — never silent FIFO / invent a match
- After staff Resolve: staff note + resolved time still print on the closed invoice

### Won’t (Phase 1)

- New DB table for “invoices”
- Tax/VAT, credit notes, multi-currency FX
- Service-bill fields or platform payTo
- Fulfilling on browser redirect alone

---

## Acceptance

1. Merchant/accountant can print a single document explaining **who / amount / network / address / status / tx proof**.
2. Document is a view of the **payment order** — watcher and matching unchanged.
3. Service bill invoice never appears on this surface.
4. Anomaly and verifying states stay honest (no fake “paid”).
5. Print targets the document panel only.
