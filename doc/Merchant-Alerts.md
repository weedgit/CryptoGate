# Merchant alerts (A9)

In-app alert taxonomy for the merchant portal bell drawer. Aligns with `UI-Page-Spec.md` §A9 and `D15` notification preferences.

## Surfaces

| Surface | Role |
| --- | --- |
| **Topbar bell** (all portals) | Opens alerts drawer; badge = unread count (merchant excludes billing) |
| **Unresolved dock** (all portal pages) | Glass pill, bottom-right, animated; opens drawer. Copy: “N alerts need your attention” (user can act) · “Owner or Admin must clear N alerts” (escalate) · “N alerts waiting to clear” (all `waiting`, label “In progress”) |
| **Alerts drawer** | Action queue — unread badge counts non-billing unread items on merchant (billing stays in drawer / dock) |
| **Login summary toast** | Tier A only (`urgent: true`) — once per browser session |
| **Toast** (single app-wide slot) | One-time results of the user’s own action (saved, invitation sent, validation / permission errors). Not an alert — never enters the drawer |
| **Sidebar role card** | Role + permissions (“You can” / “Owner only” / “Hidden for Viewers / Cashiers”). Replaces role banners; actions a role cannot take stay hidden |
| **D15 preferences** | In-app toggles filter drawer items by event type; account-state alerts (setup, activation, suspension, maintenance) are never filtered |
| **Webhooks** | Merchant-system integration — only surface in drawer after repeated delivery failure |

There are **no page banners** for these conditions (no shell Watch-only / activation / cashier / viewer banners, no dashboard alerts box, no Service bills activation callout).

## Tiers

### Tier A — urgent / critical (login toast + drawer + dock)

- Finish account setup (watch-only) — all roles, including Cashier
- Activation fee — issued / overdue (“Pay activation fee”) or draft (“being prepared”, `waiting`)
- Account suspended — reason from `statusReason`; links to the bill when `statusReasonBillId` is set
- Payment anomaly
- Settlement / xPub cool-down active (`waiting`)
- Service bill **issued** or **overdue** (unpaid platform billing; activation bills use the activation alert)
- Webhook delivery failed ≥ 5 attempts on latest delivery

### Tier B — drawer + dock (not urgent)

- Network maintenance — per network, until the window ends (`waiting`)

### Informational (drawer only — `unresolved: false`)

_(reserved)_

### Excluded

- Static network/marketing copy
- Completed payments
- “No anomalies” placeholders
- Product feedback
- Site override requests (sites inherit only)
- Webhook failures for Viewer (cannot manage integrations — would stick forever)

## Lifecycle

1. **Detected** — client derives condition from API on refresh (~60s), login, drawer open, or anomaly resolve
2. **Unread** — not in per-user read set (`sessionStorage` until notification API)
3. **Read** — user opens drawer item or marks all read (badge only)
4. **Resolved** — item removed when underlying condition clears (e.g. bill paid, anomaly cleared, cool-down ends)

Stable alert ids: `setup:{orgId}`, `activation:{orgId}`, `suspended:{orgId}`, `maintenance:{network}`, `anomaly:{orderId}`, `bill:{billId}`, `settlement:cooldown:…`, `xpub:cooldown:…`, `webhook:fail:{webhookId}`.

## Role scope (who can clear)

| Alert | Owner | Administrator | Viewer | Cashier |
| --- | --- | --- | --- | --- |
| Finish account setup | Finish setup | Finish setup | Finish setup | Finish setup |
| Activation fee | Pay | Pay | View only | View only (no bill link) |
| Account suspended | Pay linked bill | Pay linked bill | View only | View only |
| Network maintenance | Wait | Wait | Wait | Wait |
| Payment anomaly | Resolve any on org | Resolve any on org | View only (`actionable: false`) | Resolve **own** orders only |
| Service bill issued/overdue | Pay | Pay | View only | Not shown |
| Settlement / xPub cool-down | Wait (auto-clears) | Wait | Wait | Not shown |
| Webhook ≥5 fails | Fix integrations | Fix integrations | Not shown | Not shown |

Dock copy uses `actionable: false` when the signed-in role cannot clear the condition (escalate to Owner/Admin) and `waiting: true` when the condition clears on its own (cool-down, maintenance, activation draft).

## Agent and platform condition alerts

Same dock / drawer, fed into the shared platform store (`upsertPlatformAlert` / `clearPlatformAlert`) every 60 s, on drawer open, and when setup state changes:

| Alert | Portal | Who can act |
| --- | --- | --- |
| Finish account setup (`agent:setup:{orgId}`) | Agent | All roles |
| Payout wallet change pending (`agent:payout:cooldown:{orgId}`) | Agent | Wait |
| Confirm commission receipt, 7+ days (`agent:commissions:stuck:{orgId}`) | Agent | Owner, Administrator |
| Commissions awaiting agent confirm, 7+ days (`platform:commissions:stuck`) | Platform | Wait / follow up |
| API / database / webhook health (`sys-*`) | Platform, Agent | Owner, Administrator |

Orphan orgs stay an inline notice on the Architecture page (needs the full org tree).

## Implementation

- Merchant feed: `apps/web/src/merchant/merchantAlerts.ts`
- Agent feed: `apps/web/src/agent/agentAlerts.ts`; platform feed: `apps/web/src/platform/platformConditionAlerts.ts` (both via `apps/web/src/shared/conditionAlerts.ts`)
- Dock: `apps/web/src/shared/UnresolvedAlertsBanner.tsx` (merchant / agent / platform shells)
- Drawer: `apps/web/src/platform/ui/AlertsDrawer.tsx` (`AlertsSource`, `urgent` / `unresolved` / `actionable` / `waiting`)
- Setup modal from the alert: `apps/web/src/auth/OrgSetupModalHost.tsx` (`?setup=1`)
- Toast: `apps/web/src/shared/toast.ts` + `ToastHost.tsx`; `AuthToast` is the page-level adapter; `apiFetch` toasts non-GET `403` messages
- Role card: `apps/web/src/shared/SidebarRoleCard.tsx` + `rolePermissions.ts`
- Platform/agent health: `apps/web/src/shared/platformHealthAlerts.ts`

Future: server `notification_events` table, D15-backed email dispatch, persist read state in API.
