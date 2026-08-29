# Merchant alerts (A9)

In-app alert taxonomy for the merchant portal bell drawer. Aligns with `UI-Page-Spec.md` §A9 and `D15` notification preferences.

## Surfaces

| Surface | Role |
| --- | --- |
| **Topbar bell** (all portals) | Opens alerts drawer; badge = unread count (merchant excludes billing) |
| **Unresolved float** (all portal pages) | Glass pill dock, bottom-right (slightly raised), animated; also opens drawer |
| **Alerts drawer** | Action queue — unread badge counts non-billing unread items on merchant (billing stays in drawer / critical float) |
| **Login summary toast** | Tier A only (`urgent: true`) — once per browser session |
| **Dashboard billing banner** | Critical row when a service bill is `issued` or `overdue` |
| **D15 preferences** | Future email/in-app toggles — not the same as the drawer queue |
| **Webhooks** | Merchant-system integration — only surface in drawer after repeated delivery failure |

## Tiers

### Tier A — urgent / critical (toast + drawer + banner)

- Payment anomaly
- Settlement / xPub cool-down active
- Service bill **issued** or **overdue** (unpaid platform billing)
- Site override approval (parent Owner)
- Webhook delivery failed ≥ 5 attempts on latest delivery

### Tier B — drawer (+ banner if still open)

- Site override pending (site account — waiting on parent Owner)

### Informational (drawer only — `unresolved: false`)

- Site override approved/denied (site account, last 7 days)

### Excluded

- Static network/marketing copy
- Completed payments
- “No anomalies” placeholders
- Product feedback
- Webhook failures for Viewer (cannot manage integrations — would stick forever)

## Lifecycle

1. **Detected** — client derives condition from API on refresh (~60s), login, drawer open, or anomaly resolve
2. **Unread** — not in per-user read set (`sessionStorage` until notification API)
3. **Read** — user opens drawer item or marks all read (badge only)
4. **Resolved** — item removed when underlying condition clears (e.g. bill paid, anomaly cleared, cool-down ends)

Stable alert ids: `anomaly:{orderId}`, `bill:{billId}`, `settlement:cooldown:…`, `webhook:fail:{webhookId}`, `site-override:pending:{id}`.

## Role scope (who can clear)

| Alert | Owner | Administrator | Viewer | Cashier |
| --- | --- | --- | --- | --- |
| Payment anomaly | Resolve any on org | Resolve any on org | View only (`actionable: false`) | Resolve **own** orders only |
| Service bill issued/overdue | Pay | Pay | View only | Not shown |
| Settlement / xPub cool-down | Wait (auto-clears) | Wait | Wait | Not shown |
| Site override pending (parent) | Approve/deny | — (Owner only) | — | — |
| Site override pending (site) | Wait for parent Owner | Wait | Wait | Not shown |
| Webhook ≥5 fails | Fix integrations | Fix integrations | Not shown | Not shown |

Banner copy uses `actionable: false` when the signed-in role cannot clear the condition (escalate to Owner/Admin, or wait for cool-down / parent).

## Implementation

- Feed: `apps/web/src/merchant/merchantAlerts.ts`
- Banner: `apps/web/src/shared/UnresolvedAlertsBanner.tsx` (merchant / agent / platform shells)
- Drawer: `apps/web/src/platform/ui/AlertsDrawer.tsx` (`AlertsSource`, `urgent` / `unresolved` / `actionable`)
- Shell: `apps/web/src/merchant/MerchantShell.tsx`
- Platform/agent health: `apps/web/src/shared/platformHealthAlerts.ts`

Future: server `notification_events` table, D15-backed email dispatch, persist read state in API.
