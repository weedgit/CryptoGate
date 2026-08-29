# UI Page Specification — Phase 1

Complete page inventory for UI/UX design. Covers every portal, role, public surface, and cashier APK screen.

**Sources:** [Business-Model.md](Business-Model.md), [Phase1-Project-Plan.md](Phase1-Project-Plan.md), [Phase1-Requirement.md](Phase1-Requirement.md).

**Conventions**

- **Payment order** and **service bill** are never combined on one page or checkout flow.
- Product copy uses canonical terms only (no guest invoice, sub-merchant, branch, platform admin).
- Role abbreviations: **O** Owner · **A** Administrator · **V** Viewer · **C** Cashier.
- **✓** = role has access; **—** = no access; **R** = read-only.

**Apps**

| App | Audience |
| --- | --- |
| `apps/web` — Platform shell | Platform users |
| `apps/web` — Agent shell | Agent account users |
| `apps/web` — Merchant shell | Merchant + Merchant (site) users |
| `apps/payment-page` | Payer (no login) |
| Service bill checkout | Merchant payer of platform fees (linked from portal) |
| `apps/cashier-apk` | Cashier on POS device |
| `apps/web` — `/` marketing | Public advertise / broadcast entry (pre-auth) |
| `apps/web` — `/login` | Portal picker (Merchant / Agent / Platform) |

---

## Part M0 — Public marketing (pre-auth)

### M0. Marketing landing

| | |
| --- | --- |
| **Route** | `/` |
| **Access** | Public (no session) |

**Content**

- Brand (gate mark + CryptoGate) · Product anchor · **Sign in** CTA
- Hero: watch-only / merchant-controlled positioning; USDT Tron live rail
- Glass **payment order** mock (TRC-20, 19 confirmations, **Completed** — never “Paid”)
- Product pillars: watch-only · honest order state · counter / POS
- Audience pills (hotels, travel, retail, sites, agents)
- Soft ink + grid background — **not** the portal login radar scene
- Footer: support contact

**Out of scope on this page**

- Settlement / xPub / matching settings
- Live chain telemetry claimed as production metrics
- Guest payment checkout (that is `apps/payment-page`)

### M0b. Sign-in hub

| | |
| --- | --- |
| **Route** | `/login` |
| **Access** | Public (pre-auth) |

**Content**

- Choose portal: Merchant · Agent · Platform → existing portal login (`/merchant`, `/agent`, `/platform`)
- Back link to `/`
- Note: guest pay links do not require sign-in

---

## Part A — Global (all authenticated portals)

### A1. Login

| | |
| --- | --- |
| **Route** | `/merchant`, `/agent`, or `/platform` (unauthenticated) — entry also via `/login` hub |
| **Access** | All users (pre-auth) |

**Content**

- Email or username field
- Password field (show/hide toggle)
- “Remember this device” checkbox (optional; document security tradeoff)
- **Sign in** button
- **Forgot password** link → A2
- Environment badge: **Test** / **Production** (when URL or config indicates)
- Footer: support contact, terms link placeholder

**States & notifications**

- Inline error: invalid credentials (generic message — do not reveal which field failed)
- Inline error: account locked / too many attempts + retry-after time
- Banner: scheduled maintenance window (if configured)
- Redirect toast after logout: “You have been signed out.”

---

### A2. Forgot password

| | |
| --- | --- |
| **Route** | `/forgot-password` |
| **Access** | Pre-auth |

**Content**

- Email field
- **Send reset link** button
- Back to login link

**States**

- Success message: “If an account exists, we sent a reset link.” (same copy whether or not email exists)
- Rate-limit error with cooldown timer

---

### A3. Reset password

| | |
| --- | --- |
| **Route** | `/reset-password?token=…` |
| **Access** | Pre-auth (valid token) |

**Content**

- New password + confirm password
- Password policy checklist (live): min length, complexity rules
- **Reset password** button

**States**

- Token expired / invalid error + link to A2
- Success → redirect to A1 with success banner

---

### A4. MFA challenge (login step-up)

| | |
| --- | --- |
| **Route** | `/login/mfa` |
| **Access** | Users with MFA enrolled (merchant/agent Owner & Administrator; optional others) |

**Content**

- TOTP 6-digit code input (or agreed MFA method)
- **Verify** button
- “Use backup code” link (if backup codes supported)
- “Trust this device for 30 days” checkbox (optional)

**States**

- Invalid code error; lockout after N failures
- Clock-skew hint: “Check that your device time is correct.”

---

### A5. MFA enrollment

| | |
| --- | --- |
| **Route** | `/settings/security/mfa` or forced wizard after first Owner/Admin login |
| **Access** | O, A (required for merchant/agent Owner & Administrator per plan) |

**Content**

- QR code for authenticator app
- Manual secret key (copy button)
- Verification code input to confirm enrollment
- **Download backup codes** button (one-time display)
- Checkbox: “I have saved my backup codes”

**States**

- Forced enrollment banner on dashboard until complete (Owner/Admin)
- Success toast: “MFA enabled.”

---

### A6. Org / account switcher

| | |
| --- | --- |
| **Location** | Header on all authenticated pages |
| **Access** | Users with membership in multiple org accounts |

**Content**

- Current org name + type badge (Platform / Agent / Agent (sub) / Merchant / Merchant (site))
- Dropdown list of other orgs user belongs to
- Role label beside each entry (Owner, Administrator, Viewer, Cashier)
- **Sign out** action

**States**

- Single-org users: show org name without dropdown
- Site users: show parent merchant name + site name (e.g. “Retail Group — Downtown Store”)

---

### A7. Session timeout warning (modal)

| | |
| --- | --- |
| **Trigger** | Inactivity approaching limit |
| **Access** | All authenticated sessions |

**Content**

- “Your session will expire in **M:SS**.”
- **Stay signed in** button (extends session)
- **Sign out** button

**States**

- Auto logout → redirect A1 with “Session expired” banner

---

### A8. Global header (authenticated)

**Elements (all portals)**

- Org switcher (A6)
- **Notifications** bell icon + unread count badge → A9
- User menu: profile name, role, link to personal security settings, sign out
- Optional: **Help** / documentation link

---

### A9. Notification center (drawer or page)

| | |
| --- | --- |
| **Route** | `/notifications` or header drawer |
| **Access** | All authenticated roles (content scoped by org) |

**Notification types (examples)**

| Type | Audience | Example copy |
| --- | --- | --- |
| Settlement address change pending | Merchant O, A | “New settlement address activates in **23h**.” |
| Settlement address activated | Merchant O, A | “Settlement address for USDT (Tron) is now active.” |
| Settlement address change alert | Merchant O | “Administrator **name** requested address change — review in Settings.” |
| xPub change pending / activated | Merchant O, A | Same pattern as address |
| Site override approval requested | Merchant O (parent) | “Site **Downtown** requested wallet override — **Approve** / **Deny**.” |
| Site override approved / denied | Site O, A | Result of approval flow |
| Payment Anomaly | Merchant O, A, C (own order) | “Order **#12345** — Amount received was less than expected. Expected 10 USDT, received 9. Open the order… Resolve with a note.” |
| Webhook delivery failed | Merchant O, A | “Webhook not reaching your server — **host** failed 5 times…” |
| Service bill issued | Merchant O, A | “Bill **Aug 2026** ready — due **date**. Platform fees, not a customer payment.” |
| Service bill overdue | Merchant O, A | “Service bill overdue — pay to avoid account restriction.” |
| Commission statement | Agent O, A | “Commission statement **Aug 2026** available.” |
| Compliance override | Merchant O, A | “Platform applied compliance override to settlement settings (logged).” |
| Enterprise rate pending | Platform O | “Enterprise rate request from Agent **X** — review.” |
| API key expiring | O, A | “API key **…abc** expires in 7 days.” |
| Network maintenance | All merchants | “USDT (Tron) deposits paused until **time**.” |

**Drawer content**

- Filter: All / Payments / Billing / Security / System
- Mark all read
- Empty state: “No notifications”
- Each item: icon, title, body, timestamp, deep link to relevant page

---

### A10. Personal profile & security (user-level, not org)

| | |
| --- | --- |
| **Route** | `/me` or `/profile` |
| **Access** | All authenticated users |

**Sections**

1. **Profile** — display name, email (read-only or change with verification), language/timezone
2. **Password** — change password (current + new + confirm); policy checklist
3. **MFA** — link to A5; status badge Enabled/Disabled
4. **Active sessions** — list devices, IP, last active; **Revoke** per session; **Revoke all other sessions**
5. **Login history** — last 20 logins: time, IP, user agent, success/fail

**Notifications**

- Toast on password change: “Password updated. Other sessions revoked.” (if policy)
- Toast on session revoke success

---

### A11. Access denied / 403

| | |
| --- | --- |
| **Route** | Any forbidden route |
| **Access** | All |

**Content**

- “You don’t have permission to view this page.”
- Current role displayed
- Link back to dashboard
- Support contact

---

### A12. Not found / 404

**Content**

- Friendly 404 message
- Link to dashboard or home

---

## Part B — Platform shell (`apps/web/src/platform`)

Platform users: **O**, **A**, **V**. Platform users do **not** create payment orders.

### B1. Platform dashboard

| | |
| --- | --- |
| **Route** | `/platform` |
| **Access** | O ✓ · A ✓ · V R |

**Content**

- **KPI cards:** total merchants, total agents, payment-order volume (period), platform fee collected (period), open anomalies count, overdue service bills count
- **Chart:** daily confirmed payment-order volume (platform-wide)
- **Chart:** service bill collection rate
- **Alerts panel** (critical):
  - Watcher lag / chain ingest degraded
  - Pen-test or security findings open (internal)
  - Networks in maintenance mode
- **Recent audit events** (last 10) + link to B14
- **Quick actions** (O, A): Onboard agent (B4), Issue service bill (B10), View overdue bills (B9)

**Banners**

- Read-only mode banner for **V**
- “Enterprise rate approval queue: **N** pending” (O)

---

### B2. Agent accounts — list

| | |
| --- | --- |
| **Route** | `/platform/agents` |
| **Access** | O ✓ · A ✓ · V R |

**Content**

- Search by name, ID, email
- Filters: status (active/suspended), parent (top-level / under agent X)
- Table columns: name, type (Agent / Agent (sub)), parent agent, depth level, merchant count, volume (period), status, created date
- Row actions (O, A): View (B3), **Pause** / **Run** (resume), **Delete** (empty agents only), Edit fee band assignment
- **+ Onboard agent** (O, A) → B4
- Status column: Active / Paused (`OrgAccount.status`)

**Empty state:** “No agent accounts yet.”

---

### B3. Agent account — detail

| | |
| --- | --- |
| **Route** | `/platform/agents/:id` |
| **Access** | O ✓ · A ✓ · V R |

**Tabs**

1. **Overview** — contact, billing email, status, parent agent, depth, assigned tier defaults, commission %
2. **Merchants** — subtree merchant list (read-only links to B6)
3. **Volume** — charts scoped to agent subtree
4. **Service bills** — bills issued to merchants under this agent (B9 view)
5. **Commission statements** — monthly statements paid to agent
6. **Team** — users on this agent org (read-only for platform; link note “Managed by agent Owner”)
7. **Audit** — filtered audit for this agent

**Actions (O, A):** Suspend agent, Edit commission rate, Add note (internal)

---

### B4. Onboard agent account (wizard)

| | |
| --- | --- |
| **Route** | `/platform/agents/new` |
| **Access** | O ✓ · A ✓ |

**Steps**

1. **Type** — Agent (top-level under Platform) or Agent (sub) under parent (dropdown; disabled if max depth reached)
2. **Details** — legal name, display name, billing email, country
3. **Commercial** — commission % on platform fee; default merchant tier band
4. **Owner user** — invite first Owner (email)
5. **Review** — summary + **Create**

**Validation**

- Block creation if max agent depth exceeded — inline error + link to B13
- Success → B3 with “Invitation sent” toast

---

### B5. Merchants — list (platform-wide)

| | |
| --- | --- |
| **Route** | `/platform/merchants` |
| **Access** | O ✓ · A ✓ · V R |

**Content**

- Search, filters: agent, tier (Small/Mid/Enterprise), structure (single/multi-location), status
- Columns: merchant name, agent, tier, structure, volume (period), effective volume fee %, open anomalies, status
- Row actions (O, A): View (B6), **Pause** / **Run**, **Delete** (empty merchants only)
- **+ Onboard merchant** (O, A) → wizard under chosen parent agent

**Empty state:** “No merchant accounts visible.”

---

### B6. Merchant account — detail (platform view)

| | |
| --- | --- |
| **Route** | `/platform/merchants/:id` |
| **Access** | O ✓ · A ✓ · V R |

**Tabs**

1. **Overview** — structure, agent, tier, effective rate, status
2. **Sites** — merchant (site) list if multi-location
3. **Settlement settings** — **read-only**: addresses, xPub presence (not secret), matching mode — **no private keys**
4. **Volume & orders** — aggregate stats; link to anomaly list
5. **Service bills** — history
6. **Compliance** — override log

**Actions (O only unless noted)**

- **Compliance override** settlement address or matching mode (B7) — O, A (logged)
- Suspend merchant
- Approve Enterprise custom rate (O only)
- Force password reset for merchant Owner (if policy)

---

### B7. Compliance override (modal / page)

| | |
| --- | --- |
| **Access** | O ✓ · A ✓ (all actions logged) |

**Content**

- Merchant name, current setting summary
- Override type: settlement address / matching mode / suspend order create
- Reason (required textarea)
- Ticket / case ID (optional)
- MFA step-up required
- **Apply override** — confirmation dialog with irreversibility note

**Notifications**

- Merchant sees A9 “Compliance override” notification
- Audit event immutable

---

### B8. Fee tiers & global pricing

| | |
| --- | --- |
| **Route** | `/platform/settings/fee-tiers` |
| **Access** | O ✓ (edit) · A R · V R |

**Content per tier (Small / Mid / Enterprise)**

- Monthly subscription amount (USD)
- Volume fee min % and max %
- Default signup rate (within band)
- Tier assignment rules description (editable help text)

**Enterprise pending approvals** sub-table → approve/deny (O only)

**Banners**

- “Changes apply to **next billing period** only” (persistent info)
- Unsaved changes warning on navigate away

---

### B9. Service bills — list (platform)

| | |
| --- | --- |
| **Route** | `/platform/service-bills` |
| **Access** | O ✓ · A ✓ · V R |

**Content**

- Filters: status (draft/issued/paid/overdue), period, merchant, agent
- Columns: bill ID, merchant, period, subscription line, volume fee line, total, status, due date
- Actions (O, A): View (B10), Issue, Adjust, Mark paid (off-chain), Void (draft only)

**Never show** payment-order checkout on this page.

---

### B10. Service bill — detail / issue / adjust

| | |
| --- | --- |
| **Route** | `/platform/service-bills/:id` |
| **Access** | O ✓ · A ✓ · V R |

**Content**

- **Invoice face** (finance layout — see [Service-Bill-Invoice-Phase1.md](Service-Bill-Invoice-Phase1.md)):
  - Parties: platform seller (config) + merchant buyer (name, legal name, billing email, country, org ID)
  - Document meta: bill ID, status, issue date, due date, period, currency
  - Line items: subscription (tier snapshot), volume fee (`billed volume × rate%`), adjustment reason badge, totals / paid / balance
  - Remittance: service-bill checkout / platform billing wallet — **not** guest payment page
  - Receipt when paid: paid at, payment reference, amount
  - **Print** → browser PDF of invoice panel only
- Ops sidebar: bill state timeline; Platform actions Issue / Adjust / Mark paid / Void (O, A) — reason required for adjustments
- Rate / volume math frozen on bill at issue (do not re-read live commercial)

**Never show** payment-order checkout or agent commission on this page.

---

### B11. Platform billing wallet settings

| | |
| --- | --- |
| **Route** | `/platform/settings/billing-wallet` |
| **Access** | O ✓ · A R |

**Content (B11-lite)**

- Invoice seller name + billing contact email
- Service-bill remittance `payTo` (wallet / instruction string) + preview
- Rotation / audit note (`billing_wallet_put`)
- Checkout and platform invoice face prefer live settings over env

Phase 1 does **not** require a full multi-asset wallet catalog; one remittance string is enough.

---

### B12. Agent commission — statements & payouts

| | |
| --- | --- |
| **Route** | `/platform/commissions` |
| **Access** | O ✓ · A ✓ · V R |

**Content**

- Period selector
- Table: agent, platform fee collected (subtree), commission %, commission amount, payout status
- Mark paid, export CSV
- Drill-down to B3 commission tab

---

### B13. Global platform settings

| | |
| --- | --- |
| **Route** | `/platform/settings` |
| **Access** | O ✓ (edit) · A partial · V R |

**Sections**

| Section | Fields | O | A |
| --- | --- | --- | --- |
| **Org policy** | Max agent nesting depth (default 2) | edit | view |
| **Security** | Password policy, session timeout, MFA required roles | edit | view |
| **Networks** | Enabled assets/networks, maintenance toggles, confirmation counts | edit | edit |
| **Notifications** | Email templates for bill issued, address change alert | edit | view |
| **API** | Platform-wide rate limits | edit | view |

**Alerts**

- Changing max agent depth: confirmation modal + audit warning
- Network maintenance toggle: “Merchants will see deposit pause banner”

---

### B14. Audit log (platform)

| | |
| --- | --- |
| **Route** | `/platform/audit` |
| **Access** | O ✓ · A ✓ · V R |

**Content**

- Filters: date range, actor, action type, org, resource
- Columns: timestamp, actor, role, action, resource, IP, detail JSON (collapsed)
- Export CSV
- **No delete** — UI has no delete control; footnote explains immutability

---

### B15. Platform team management

| | |
| --- | --- |
| **Route** | `/platform/settings/team` |
| **Access** | O ✓ (invite/remove Admin & Viewer) · A — · V — |

**Content**

- Member table: name, email, role, MFA status, last login
- **Invite** — email + role (Administrator or Viewer only; cannot create second Owner via UI unless transfer flow)
- **Remove** member — confirm dialog
- **Transfer ownership** (O only) — separate dangerous-action flow with MFA

**Banner for A:** “Only the Owner can add or remove team members.”

---

### B16. Network & asset catalog

| | |
| --- | --- |
| **Route** | `/platform/settings/networks` |
| **Access** | O ✓ · A ✓ · V R |

**Per asset/network row**

- Asset, network, contract address, decimals, min amount, confirmations required
- Status: active / maintenance / disabled
- **Maintenance mode** — start/end time, banner message shown to merchants
- Watcher health indicator

---

### B17. System health (internal ops)

| | |
| --- | --- |
| **Route** | `/platform/ops/health` |
| **Access** | O ✓ · A ✓ |

**Content**

- API uptime, watcher lag, queue depth, webhook retry backlog
- Per-chain last block processed
- Error rate chart
- Link to runbook (doc)

---

## Part C — Agent shell (`apps/web/src/agent`)

Agent users: **O**, **A**, **V**. Agents do **not** create payment orders.

### C1. Agent dashboard

| | |
| --- | --- |
| **Route** | `/agent` |
| **Access** | O ✓ · A ✓ · V R |

**Content**

- KPIs: merchant count, subtree volume, open service bills, commission (MTD)
- Chart: volume by merchant (top N)
- **Quick actions** (O, A): Onboard merchant (C5), Onboard agent sub (C4) if depth allows
- Alerts: merchants with overdue service bills, Enterprise rate pending platform approval

---

### C2. Agent (sub) accounts — list

| | |
| --- | --- |
| **Route** | `/agent/agents` |
| **Access** | O ✓ · A ✓ · V R |

**Content**

- Child agent accounts only
- Same table pattern as B2 (scoped)
- **+ Onboard agent (sub)** disabled with tooltip if max depth reached

---

### C3. Agent (sub) — detail

Same structure as B3, scoped to subtree. No platform-only compliance override.

---

### C4. Onboard agent (sub) wizard

Like B4 but parent fixed to current agent. Depth check against platform max.

---

### C5. Merchants — list (agent subtree)

| | |
| --- | --- |
| **Route** | `/agent/merchants` |
| **Access** | O ✓ · A ✓ · V R |

**Content**

- Merchants under this agent (and sub-agents if applicable)
- Columns: name, tier, structure, volume fee % (effective), volume, status
- **+ Onboard merchant** (O, A) → C6

---

### C6. Onboard merchant wizard

| | |
| --- | --- |
| **Access** | O ✓ · A ✓ |

**Steps**

1. Structure: single-location / multi-location
2. Business details: name, country, billing contact
3. **Tier** — Small / Mid / Enterprise (Enterprise → “Requires platform approval” flag)
4. **Volume fee %** — slider or input bounded by platform min/max for tier; show band visually
5. Invite merchant **Owner** email
6. Review + **Create**

**Notifications**

- Enterprise: “Submitted for platform approval” banner
- Merchant Owner invite email triggered

---

### C7. Merchant — detail (agent view)

| | |
| --- | --- |
| **Route** | `/agent/merchants/:id` |
| **Access** | O ✓ · A ✓ · V R |

**Tabs:** Overview, Sites, Volume, Service bills, Commission attribution

**Read-only:** settlement addresses, API keys, webhooks, credentials — **explicit “Managed by merchant”** labels

**Editable (O, A):** volume fee % within band (next period), tier request (non-Enterprise)

---

### C8. Volume fee — edit (modal)

| | |
| --- | --- |
| **Access** | O ✓ · A ✓ |

**Content**

- Current vs new rate
- Platform band indicator (min–max)
- Effective date: **next billing period** (auto-display)
- Reason (optional)
- Confirm

---

### C9. Service bills — subtree view

| | |
| --- | --- |
| **Route** | `/agent/service-bills` |
| **Access** | O ✓ · A ✓ · V R |

**Content**

- All service bills for merchants in subtree
- Read-only detail; no issue/adjust (platform only)
- Filter overdue for collections follow-up

---

### C10. Commission statements

| | |
| --- | --- |
| **Route** | `/agent/commissions` |
| **Access** | O ✓ · A ✓ · V R |

**Content**

- Monthly statements: platform fee base, commission %, amount, payout status, PDF
- Not the same as merchant service bills — separate table and copy

---

### C11. Agent team management

| | |
| --- | --- |
| **Route** | `/agent/settings/team` |
| **Access** | O ✓ · A — · V — |

Same pattern as B15 for agent org users.

---

### C12. Agent settings

| | |
| --- | --- |
| **Route** | `/agent/settings` |
| **Access** | O ✓ · A partial · V R |

**Sections:** Profile (org display name, billing email), notification preferences, API keys (if agent-level integrations), branding placeholder (Phase 1 optional)

---

## Part D — Merchant shell (`apps/web/src/merchant`)

Applies to **merchant account** (parent) and **merchant (site) account** contexts. UI shows site picker when multi-location.

**Roles:** O, A, V, C (Cashier — limited nav).

### D0. Merchant navigation (role-aware)

| Nav item | O | A | V | C |
| --- | --- | --- | --- | --- |
| Dashboard | ✓ | ✓ | R | ✓ (limited) |
| Payment orders | ✓ | ✓ | R | own only |
| Create order | ✓ | ✓ | — | ✓ |
| Service bills | ✓ | R | R | — |
| Sites | ✓ parent only | ✓ | R | — |
| Reports | ✓ | ✓ | R | — |
| Settings | ✓ | ✓ | R | — |
| Team | O only | — | — | — |
| API & webhooks | ✓ | ✓ | R | — |

Cashier nav: Dashboard (own orders), Create order, My orders, Sign out — **no Settings, Team, API, Service bills.**

---

### D1. Merchant dashboard

| | |
| --- | --- |
| **Route** | `/merchant` |
| **Access** | O, A, V, C (scoped) |

**Content**

- **Site selector** (multi-location parent): All sites / per site — filters all widgets
- KPIs: today’s orders, completed volume, pending count, anomaly count, expiring soon
- **Effective volume fee %** and tier badge (O, A, V) — not shown to C
- Recent payment orders table (C: own only)
- **Alerts banner** (priority order):
  - Settlement address cool-down pending
  - xPub change pending
  - Site override awaiting parent Owner approval (parent O)
  - Network maintenance (asset/network)
  - Service bill overdue (O, A)
  - Webhook delivery failures (O, A)

---

### D2. Payment orders — list

| | |
| --- | --- |
| **Route** | `/merchant/orders` |
| **Access** | O, A, V (all in scope); C (own only) |

**Content**

- Filters: status, date range, asset, network, site, created by, matching mode, anomaly flag
- Columns: order #, **merchant reference**, expires, amount, asset, network, receive address (truncated), matching mode, status
- Bulk export CSV (O, A, V — not C) — includes merchant_reference
- Row click → D3
- Status badges: Pending Payment, Verifying, Confirmed, Completed, Expired, Payment Anomaly, Failed

**Empty state:** “No payment orders yet” + **Create order** CTA (if permitted)

---

### D3. Payment order — detail

| | |
| --- | --- |
| **Route** | `/merchant/orders/:id` |
| **Access** | Scoped; C only if `created_by` self |

**Sections**

1. **Invoice / receipt face** — finance document (Print → PDF) — [Payment-Order-Invoice-Phase1.md](Payment-Order-Invoice-Phase1.md)
   - Display order #, full id, status, created, expires, asset/network, matching mode
   - Seller = merchant org; buyer = guest payer (Phase 1)
   - Lines: payable / received / balance; remittance = merchant receive address
   - On-chain proof when tx known; anomaly block when flagged
2. **Live gateway** — QR, copy address, validity timer, guest payment page link
3. **On-chain** — confirmations progress, tx hash (auto-poll every 5s while `pending_payment` / `verifying`; stop on terminal status)
4. **Timeline** — status history with timestamps
5. **Webhook log** — delivery attempts, response codes (O, A) — when shipped

**Actions**

- **Print invoice** (document panel only)
- **Cancel order** (pending only) — O, A any on org; C own only — frees Mode B amount / Mode D memo create locks
- **Copy** payment details
- **Resend webhook** (O, A)
- Anomaly: **no “Mark paid”** button — plain-language reason + expected/received + **Resolve anomaly** (required note) → cancelled; invoice keeps reason + staff note

**Anomaly detail panel**

- Reason in plain language (underpay / overpay / wrong network / late pay / same-amount collision / …)
- Expected vs received amounts when known
- Suggested merchant actions (manual reconciliation)
- **Resolve** with required note (O/A any on org; C own) — closes ticket; leaves anomaly list and urgent alerts
- Anomalies do **not** block creating a new order for the same amount (Mode B) or memo (Mode D)

**Never** show service-bill remittance or platform billing wallet on this page.

---

### D4. Create payment order

| | |
| --- | --- |
| **Route** | `/merchant/orders/new` |
| **Access** | O ✓ · A ✓ · C ✓ |

**Form fields**

- Amount (fiat or crypto display per product decision)
- Asset (dropdown — enabled only)
- Network (dropdown — filtered by asset)
- Validity period (preset: 15m / 30m / 1h / custom)
- **Merchant reference** (optional, max 200 — PO / table / internal “for what”; stored on order, shown on invoice + CSV)
- Site (if parent merchant creating for a site)
- Optional metadata: customer label (internal, via merchantMetadata when needed)

**Read-only info shown before submit**

- Matching mode in effect (merchant default): Standard / Amount fingerprint / Memo tag / Smart address
- Mode C note: “Payable amount may differ (fingerprint)”
- Settlement preview: address type main vs derived (after create)

**Submit** → D3 with success + show QR immediately

**Validation errors**

- Asset/network disabled (maintenance)
- Mode C: no free fingerprint slot
- Mode S: xPub not configured → block with link to D11

---

### D5. Service bills — list (merchant)

| | |
| --- | --- |
| **Route** | `/merchant/service-bills` |
| **Access** | O ✓ · A ✓ · V R · C — |

**Content**

- Separate visual treatment from payment orders (different color/icon system)
- Columns: bill ID, period, subscription, volume fee, total, status, due date
- **Pay** → D6 checkout (separate from payment order)
- Download PDF

**Banner:** “Service bills pay for CryptoGate software. Customer payments go to your wallet separately.”

---

### D6. Service bill — detail & checkout

| | |
| --- | --- |
| **Route** | `/merchant/service-bills/:id` |
| **Access** | O ✓ · A ✓ · V R |

**Content**

- Same **Invoice face** as B10 (read-only) — [Service-Bill-Invoice-Phase1.md](Service-Bill-Invoice-Phase1.md)
- **Pay service bill** — launches **service bill checkout** (Part G) — platform billing wallet
- Print invoice
- Overdue warning styling + consequences note (from contract)

---

### D7. Sites — list (multi-location parent only)

| | |
| --- | --- |
| **Route** | `/merchant/sites` |
| **Access** | O ✓ · A ✓ · V R · C — |

**Content**

- Table: site name, status, default inherit/overrides summary, volume (period)
- **+ Add merchant (site) account** (O, A) → D8

---

### D8. Create / edit merchant (site)

| | |
| --- | --- |
| **Access** | O ✓ · A ✓ |

**Fields:** site name, address (physical), timezone, invite site Owner email

**Inheritance panel:** wallet, xPub, matching mode, order retention — **Inherit parent** default toggles

---

### D9. Site — detail (parent view)

| | |
| --- | --- |
| **Route** | `/merchant/sites/:id` |
| **Access** | O, A, V on parent |

**Tabs:** Overview, Orders (site-scoped), Settings overrides, Team

**Override approval queue (parent O):** pending site requests with Approve/Deny

---

### D10. Reports & export

| | |
| --- | --- |
| **Route** | `/merchant/reports` |
| **Access** | O ✓ · A ✓ · V R · C — |

**Content**

- Date range (by order **created** date), site filter with org names
- KPIs: completed volume, orders in range, anomaly count
- Breakdowns: by status (count + volume), asset/network, **site**, **day**, cashier (email when known), matching mode
- CSV export: org_name, merchant_reference, received_amount, created_by_email (Cashier 403)
- Schedule export (Phase 1 optional — if cut, hide)

---

### D11. Settings — settlement & matching

| | |
| --- | --- |
| **Route** | `/merchant/settings/settlement` |
| **Access** | O ✓ · A ✓ · V R · C — |

**Sub-sections**

#### D11a. Payment address book

- Table per asset/network: address, label, status (**Active** / **Pending cool-down** / **Retired**), last changed
- **Add / Change address** (O, A):
  - MFA step-up
  - New address field + network validation
  - **Second approval** (O must approve if initiator is A — or dual control per policy)
  - Cool-down period countdown displayed prominently
  - **Alert email** to all Owners on request
- During cool-down: banner on all pages — “New address activates **date/time**.”
- Cashier: **page hidden**; direct URL → 403

#### D11b. Matching mode

- Radio cards:
  - **Standard** (default) — short explanation
  - **Amount fingerprint** — collision avoidance via unique amounts; exact-pay warning
  - **Memo tag** — disabled with tooltip on unsupported networks (USDT Tron/ETH/BSC/etc.)
  - **Smart address** — main + HD on conflict; link to xPub section
- Dangerous combo validation messages (Mode S + C)
- Save → confirm dialog: “Applies to **new orders only**.”
- Cashier: hidden

#### D11c. xPub (Smart address / Mode S)

- Per asset/network: xPub field (masked partial), validation status, derived address count
- **Register / Replace xPub** (O, A): MFA, cool-down, audit — same bar as address
- HD pool summary: FREE / IN_USE / COOLDOWN counts (read-only list expandable)
- Warning copy: consolidation is merchant responsibility; CryptoGate does not sweep
- Cashier: hidden

#### D11d. Order policies

- Default order validity
- Order delete / retention period
- Underpay tolerance (Mode B; disabled or capped when Mode C active)

---

### D12. Settings — organization

| | |
| --- | --- |
| **Route** | `/merchant/settings/organization` |
| **Access** | O ✓ · A ✓ · V R |

**Fields:** display name, billing contact, structure (read-only), timezone, receipt defaults (address truncation on slips)

---

### D13. Settings — fee & billing

| | |
| --- | --- |
| **Route** | `/merchant/settings/billing` |
| **Access** | O ✓ · A R · V R |

**Content**

- Current tier, effective volume fee %, next period rate if scheduled change
- Agent name (if any)
- Link to D5 service bills
- **Not editable** by merchant — display only (changes via agent/platform)

---

### D14. Settings — API keys & webhooks

| | |
| --- | --- |
| **Route** | `/merchant/settings/integrations` |
| **Access** | O ✓ · A ✓ · V R · C — |

**API keys**

- Create key: name, scope, IP allowlist (optional), expiry
- Show secret **once** on create
- Revoke key — confirm
- Last used timestamp

**Webhooks**

- Register URL, event types (order status changes)
- Signing secret (rotate flow)
- **Send test event** button
- Delivery log: last 50 with status, latency, response

---

### D15. Settings — notifications preferences

| | |
| --- | --- |
| **Route** | `/merchant/settings/notifications` |
| **Access** | O ✓ · A ✓ |

**Toggles (email and/or in-app per row)**

- Payment completed
- Payment anomaly
- Settlement address change / activation
- xPub change
- Webhook failures
- Service bill issued / overdue
- Site override requests (parent Owner)

---

### D16. Team management

| | |
| --- | --- |
| **Route** | `/merchant/settings/team` |
| **Access** | O ✓ only |

**Content**

- Members: name, email, role (Administrator, Viewer, Cashier), site assignment (for Cashier), MFA status, status
- **Invite** — role, site if Cashier
- **Remove** / **Change role** — confirm
- Banner for A if they visit: “Only the Owner manages team members.”

---

### D17. Merchant (site) context differences

When logged into a **merchant (site) account**, same pages as D1–D16 with these changes:

| Page | Site context behavior |
| --- | --- |
| D1 Dashboard | No site selector; single site KPIs |
| D2 Orders | Site-scoped only |
| D7 Sites | Hidden (parent only) |
| D11 Settlement | Shows inherit vs override; **Request override** → parent O approval flow |
| D13 Billing | Bills may roll up to parent; show “Billed to parent merchant” if applicable |
| D16 Team | Site team only (Cashiers for this site) |

**Site override request flow (site O/A)**

- Request wallet / matching / retention override
- Status: Pending parent approval / Approved / Denied
- Notification to parent Owner (A9)

---

## Part E — Public payment page (`apps/payment-page`)

**No login.** Payer-facing.

### E1. Payment order checkout

| | |
| --- | --- |
| **Route** | `/pay/:orderId` or token URL |
| **Access** | Public |

**Content (prominent)**

- Trusted merchant badge (no merchant display name on the face)
- **Payable amount** (large) — Mode C exact fingerprint
- Asset + **network** (large, color-coded)
- Token contract address (copy) for tokens
- **Receive address** (copy button)
- QR code encodes the **receive address** by default (**Address only**). Segmented control under the QR: **With amount** (HTTPS pay-page URL so a camera opens amount/asset) · **Address only** (bare receive address for exchange/wallet scanners). API `qrPayload` remains the pay-page URL for POS clients that encode it; the guest page default is address-only. Optional API `walletUri` for network URI parsers.
- Countdown: **Expires in MM:SS**
- Order reference # (small)

**Warnings**

- Mode C: “Pay **exactly {amount}**. Do not round.”
- Mode D: “Include memo: **{memo}**” when supported
- Network is shown on the network pill / QR mark (no separate wrong-network banner)

**States**

| State | UI |
| --- | --- |
| Pending Payment | QR + countdown active; progress panel shows 0/N confirmations + flow at **Created** |
| Verifying | Verifying badge; confirmation segments fill + flow step **Verifying** with directional animation |
| Confirmed / Completed | Teal “Payment received” + Completed badge; confirmations full + flow at **Confirmed** |
| Expired | Greyed QR, “This order has expired” + contact merchant |
| Payment Anomaly | “Payment received but could not be matched automatically” — payer-safe message |
| Failed | Error explanation |

**Progress panel** (below warnings, above order ref) — simpler than merchant D3:

- **Blockchain confirmations** — segmented bar + `n / N` count from the order’s asset/network registry (e.g. USDT Tron **19**, Ethereum **12**, BSC **15**); short status note
- **Horizontal flow** — Created → Detected → Verifying → Confirmed (diamond nodes, chevron direction, motion while verifying)

Merchant **Orders → detail** keeps the fuller vertical timeline and tx-hash panel.

**Actions**

- Copy address, copy amount, copy link
- Share (mobile Web Share API if available)
- Language selector (if i18n Phase 1)

**No**

- Login, merchant admin links, service bill content, “Mark paid” for payer

---

### E2. Payment page — error states

| Route | Content |
| --- | --- |
| Invalid order ID | “Payment link not found.” |
| Network maintenance | “This network is temporarily unavailable.” |

---

## Part F — Service bill checkout (separate from E)

### F1. Service bill payment checkout

| | |
| --- | --- |
| **Route** | `/pay-service-bill/:billId` (tokenized) |
| **Access** | Merchant O/A via link from D6; no payer guest |

**Content**

- Header: **Service bill** (not payment order)
- Platform branding
- Bill #, period, line items, total due
- Platform **billing wallet** address + QR (separate from merchant settlement)
- Same network warnings as E1
- Status: unpaid / confirming / paid

**Never** show merchant customer order fields on this page.

---

## Part G — Cashier APK (`apps/cashier-apk`)

Cashier role only. Kotlin native preferred.

### G1. Login

- Server URL (test/prod config or build flavor)
- Email/username, password
- **Sign in**
- Network error state: full-screen “Cannot reach server” — no offline create
- Session timeout → G1

**Not in APK:** MFA enrollment, settlement settings, xPub

---

### G2. Home / shift start

- Cashier name, site name
- **Create order** (primary CTA)
- **Today’s orders** (own only)
- Connection indicator (online/offline)
- Logout

---

### G3. Create order

- Amount keypad
- Asset picker (merchant-enabled list)
- Network picker
- Validity (merchant default or presets)
- **Merchant reference** (optional — PO / table / check #; max 200)
- **Create** → G4

**Mode B same-amount create lock**

- If another **live** open order (`pending_payment` / `verifying` / `confirmed`) already uses the same payable amount on the main settlement address → **do not create**
- **Payment Anomaly** does not block create (reconcile separately; new same-amount ticket allowed)
- API `409 mode_b_amount_in_use` with `details.blockingOrder` (order #, creator email, status)
- UI: explain collision, show first order (by who + `#CG-…`), link to that order; poll until first is finished/cancelled/expired; then show **Continue** to retry create
- Suggest change amount or ask Owner for Amount fingerprint / Smart address

**Blocked states**

- Network maintenance toast
- API error with retry
- Mode B amount-in-use panel (above)

---

### G4. Order active — cashier screen

**Large display**

- Payable amount, asset, network
- Merchant reference when set (POS-only label; not on guest pay page)
- Contract (if token)
- Receive address (truncated + expand)
- QR code (large)
- Countdown expiry
- Wrong-network warning banner (persistent)

**Status line**

- Pending Payment / Verifying (**n/N** confirmations) / Completed / Expired / **Payment Anomaly** / Failed

**Actions**

- Cancel order (if allowed)
- **No “Mark paid”**

---

### G5. Customer-facing display (second screen)

- QR only + amount + network + wrong-network warning
- No staff controls
- Mirrors G4 payment fields

---

### G6. Order completed

- Success screen (brief) → auto-offer print
- **Print receipt** (thermal)
- **New order** CTA

---

### G7. Receipt (thermal print layout)

**Fields**

- Merchant + site name
- Order #
- Date/time
- Payable amount, asset, network
- Destination address (full or truncated per merchant setting)
- Status: Completed
- Tx hash (when known)
- Footer: non-custodial disclaimer (short)

**Anomaly receipt** (distinct template)

- Status: Payment Anomaly
- “Do not treat as completed sale — contact supervisor”

---

### G8. Today’s orders (cashier scope)

- List: own orders today only
- Tap → G4 read-only
- **Reprint last receipt**

---

### G9. APK settings (minimal)

- **Reprint last receipt**
- App version, device ID
- **Logout**
- **No** settlement, xPub, matching, API keys

---

### G10. APK alarms & toasts

| Event | UX |
| --- | --- |
| Session expiring | Modal: extend / logout |
| Network lost during active order | Red banner; pause countdown display note |
| Order expired | Sound optional + visual transition |
| Payment Anomaly | Red status + supervisor message |
| Printer error | Toast + retry print |
| Second screen disconnected | Warning on cashier screen only |

---

## Part H — Shared modals & confirmation patterns

Use consistently across portals.

| Pattern | Use |
| --- | --- |
| **MFA step-up** | Address change, xPub change, compliance override, API secret reveal |
| **Dangerous action** | Revoke API key, remove team member, void service bill, suspend merchant |
| **Cool-down confirm** | “This change takes effect in **24h**.” |
| **Owner approval** | Site override, Administrator-initiated address change |
| **Next period notice** | Fee rate changes |
| **Irreversible** | Ownership transfer |

---

## Part I — Empty, loading, and system-wide banners

### Loading

- Skeleton tables on list pages
- Spinner on order detail when polling Verifying → Completed

### Empty states

- Every list page: illustration + one-line copy + primary CTA where role permits

### System banners (top of shell)

| Banner | Who sees |
| --- | --- |
| Network maintenance | Merchants, cashiers, payment page E1 |
| Service bill overdue | Merchant O, A |
| Address cool-down pending | Merchant O, A, V |
| Compliance override active | Merchant O, A |
| Test environment | All (amber) |

---

## Part J — Role × page access matrix (summary)

| Page group | Plat O/A/V | Agent O/A/V | Merch O/A/V/C | Site O/A/V/C |
| --- | --- | --- | --- | --- |
| Dashboard | B1 | C1 | D1 | D1 |
| Payment orders | — | — | D2–D4 | D2–D4 |
| Service bills | B9–B10 | C9 | D5–D6 | D5–D6 |
| Agents / merchants mgmt | B2–B6 | C2–C7 | — | — |
| Sites | — | — | D7–D9 | — |
| Settlement settings | — | — | D11 | D11* |
| API/webhooks | — | — | D14 | — |
| Team | B15 | C11 | D16 | D16 |
| Audit | B14 | — | — | — |
| Fee tiers / global | B8, B13 | — | — | — |
| Public pay | E1 | E1 | E1 | E1 |
| Cashier APK | — | — | G1–G10 | G1–G10 |

\*Site: override request flow; parent O approves.

---

## Part K — UI copy prohibitions (Phase 1)

Do not use in any user-facing string:

- Guest invoice, platform admin, sub-merchant, branch, location account, sub-agent, reader, company (ambiguous), business (alone)

Use: **payment order**, **service bill**, **merchant account**, **merchant (site) account**, **agent (sub) account**, **Owner / Administrator / Viewer / Cashier**, **Platform**.

---

## Document history

| Date | Change |
| --- | --- |
| 2026-08-22 | Initial UI page specification for Phase 1 design |
