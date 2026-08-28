# Merchant alerts (A9)

In-app alert taxonomy for the merchant portal bell drawer. Aligns with `UI-Page-Spec.md` §A9 and `D15` notification preferences.

## Surfaces

| Surface | Role |
| --- | --- |
| **Alerts drawer** (bell) | Action queue — unread badge counts all unread items |
| **Login summary toast** | Tier A only (`urgent: true`) — once per browser session |
| **Dashboard overdue banner** | Single critical row when a service bill is `overdue` |
| **D15 preferences** | Future email/in-app toggles — not the same as the drawer queue |
| **Webhooks** | Merchant-system integration — only surface in drawer after repeated delivery failure |

## Tiers

### Tier A — urgent (toast + drawer)

- Payment anomaly
- Settlement / xPub cool-down active
- Service bill **overdue**
- Site override approval (parent Owner)
- Webhook delivery failed ≥ 5 attempts on latest delivery

### Tier B — drawer only (informational)

- Service bill **issued** (not yet due)
- Site override pending (site account)
- Site override approved/denied (site account, last 7 days)

### Excluded

- Static network/marketing copy
- Completed payments
- “No anomalies” placeholders
- Product feedback

## Lifecycle

1. **Detected** — client derives condition from API on refresh (~60s) or login
2. **Unread** — not in per-user read set (`sessionStorage` until notification API)
3. **Read** — user opens drawer item or marks all read
4. **Resolved** — item removed when underlying condition clears (e.g. bill paid, anomaly cleared)

Stable alert ids: `anomaly:{orderId}`, `bill:{billId}`, `settlement:cooldown:…`, `webhook:fail:{webhookId}`, `site-override:pending:{id}`.

## Role scope

| Role | Billing | Settlement/xPub | Anomalies | Webhooks | Site overrides |
| --- | --- | --- | --- | --- | --- |
| Owner / Administrator | ✓ | ✓ | ✓ | ✓ | ✓ |
| Viewer | read-only bills | — | ✓ | view metadata | — |
| Cashier | — | — | own orders | — | — |

## Implementation

- Feed: `apps/web/src/merchant/merchantAlerts.ts`
- Drawer: `apps/web/src/platform/ui/AlertsDrawer.tsx` (`AlertsSource`, `urgent` flag)
- Shell: `apps/web/src/merchant/MerchantShell.tsx`

Future: server `notification_events` table, D15-backed email dispatch, persist read state in API.
