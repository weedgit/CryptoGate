# M4-36 — Audit list & service bill lifecycle (OpenAPI v0.3.2)

**Owner:** Kevin (contract). **Implementer:** Andrew (`apps/api`).  
**OpenAPI:** `0.3.2`. **Domain:** `AuditAction`, `AuditLogEntry`, `ServiceBillUpdateAction`.  
**Unblocks:** Platform **B9/B10/B14** (Andrew); merchant D5–D6 read paths unchanged.

Additive to v0.3.1. Signing, API keys, and payment-order paths unchanged.

---

## 1. Audit — `GET /v1/audit`

| Query | Notes |
| --- | --- |
| `from`, `to` | ISO date-time range |
| `actorUserId` | Filter by user |
| `orgId` | Filter by org |
| `action` | `AuditAction` enum |
| `limit` | 1–500, default 100 |

**Access**

| Role | Scope |
| --- | --- |
| Platform O / A / V | Global (all filters) |
| Agent O / A / V | Events for orgs in agent subtree |
| Merchant O / A / V | Events for own org (+ sites if applicable) |
| Cashier | **403** |

**Response:** `{ items: AuditLogEntry[] }` newest first. Metadata must pass `sanitizeAuditMetadata` — never secrets.

**No DELETE** — DB trigger enforces append-only.

---

## 2. Service bills — `PATCH /v1/service-bills/{billId}`

Platform Owner/Administrator only. Cashier **403**.

| `action` | From status | To | Body |
| --- | --- | --- | --- |
| `mark_paid` | `issued`, `overdue` | `paid` | optional `paymentReference` |
| `void` | `issued` | `voided` | `reason` **required** |
| `adjust` | `issued`, `overdue` | same | `reason` + `adjustmentAmount` **required** |

`adjustmentAmount` — signed USD decimal string delta on `totalAmount` (e.g. `"-10.00"`, `"5.50"`). Reject if result total &lt; 0.

Invalid transition → **422**.

**Audit:** append `service_bill_mark_paid`, `service_bill_void`, or `service_bill_adjust` with `{ billId, … }` (no secrets).

---

## 3. Service bill GET additions (v0.3.2)

Optional fields on `ServiceBill`:

| Field | When set |
| --- | --- |
| `paidAt` | status `paid` |
| `voidedAt` | status `voided` |
| `lastAdjustmentReason` | after last `adjust` |

---

## 4. DB migration (Andrew — suggest `018`)

```sql
ALTER TABLE service_bills
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_adjustment_reason TEXT,
  ADD COLUMN IF NOT EXISTS payment_reference TEXT;

CREATE INDEX IF NOT EXISTS audit_log_action_created_idx
  ON audit_log (action, created_at DESC);
```

Implement `listAuditLog` in `apps/api/src/audit/` (read-only SELECT). Reuse `insertAuditEvent` for PATCH side effects.

---

## Related

- API keys freeze: [M4-11-Api-Keys.md](M4-11-Api-Keys.md)  
- Contract log: [CONTRACT-FREEZE.md](CONTRACT-FREEZE.md)  
- UI: [UI-Page-Spec.md](UI-Page-Spec.md) B9, B10, B14
