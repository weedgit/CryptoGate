# Merchant Dashboard — Wireframe Checklist + Figma Prompt

**Screen ID:** D1  
**Route:** `/merchant`  
**Priority:** P0 — design this before Platform/Agent dashboards  
**Shell:** Left sidebar + top bar (Classic SaaS)

---

## Figma frame names

Create these frames (desktop 1440×900 + mobile 390×844 where noted):

| Frame | Purpose |
| --- | --- |
| `D1 Merchant Dashboard — Owner` | Full ops board (default design target) |
| `D1 Merchant Dashboard — Cashier` | Scoped KPIs + own orders only |
| `D1 Merchant Dashboard — Empty` | No orders yet + Create CTA |
| `D1 Merchant Dashboard — Alerts stacked` | Multiple banners visible |
| `D1 Merchant Dashboard — Multi-site` | Sites summary section shown |
| `D1 Merchant Dashboard — Mobile` | Same hierarchy, stacked |

Optional variants: `Viewer` (read-only, no Create), `Admin` (same as Owner minus team-owner-only actions if any on this page — usually identical to Owner on D1).

---

## Wireframe checklist (top → bottom)

### A. App chrome (not unique to D1, but lock it)

- [ ] **Sidebar:** Dashboard (active) · Orders · Create order · Sites (if multi) · Settlement · Networks · Team · API · Service bills · Settings · Sign out  
- [ ] **Cashier sidebar only:** Dashboard · Create order · My orders · Sign out  
- [ ] **Top bar left:** Merchant name / org  
- [ ] **Top bar center:** Period chips `Today` | `7d` | `MTD` + custom from/to date inputs  
- [ ] **Top bar right:** Refresh · Create payment order (primary CTA; hide for Viewer; Cashier label: Create Order)

### B. Alert banners (stack by priority; hide if none)

Show only active items. Suggested order (top = most urgent):

| Priority | Banner | Who sees | Tone |
| --- | --- | --- | --- |
| 1 | Settlement address cool-down in progress | O/A/V | Warn |
| 2 | xPub / HD pool cool-down | O/A/V | Warn |
| 3 | Network maintenance (named networks) | All | Warn |
| 4 | Overdue service bills (count) | O/A/V | Amber (billing) |
| 5 | Open payment anomalies (count) | All (C: own) | Anomaly red |

- [ ] Each banner: short title + one line body + optional deep-link  
- [ ] Copy rule: anomalies say **Resolve with a note** — never “Mark paid”  
- [ ] Cashier: no overdue service-bill banner  

### C. KPI row

**Owner / Administrator / Viewer** (5 cards):

| Card | Value | Note |
| --- | --- | --- |
| Completed volume | `$X,XXX.XX` (period) | Teal accent; mono amount |
| Platform fee (est.) | `$X.XX` | From effective volume fee % |
| Tier | `Starter` + `X.XX%` | Tier name + fee % |
| Open orders | `N` | Pending Payment + Verifying |
| Anomalies | `N` | Click → anomalies / orders filtered |

**Cashier** (3 cards only):

| Card | Value |
| --- | --- |
| Completed volume | period, own scope |
| Open orders | own |
| Anomalies | own |

- [ ] Cards in one horizontal row on desktop; wrap 2-col on tablet; stack on mobile  
- [ ] Optional subtle count-up on load  
- [ ] Do **not** add extra KPIs (sessions, webhook fails, charts) on D1  

### D. Network status strip (O/A/V only — hide for Cashier)

- [ ] Horizontal row of **asset icon + network label + orderability lamp**  
- [ ] Lamp states: e.g. Open / Paused / Degraded (match product lamps)  
- [ ] Click / “Networks” link → Networks page  
- [ ] Compact; not a full table  

### E. Split panels (main body)

**Left — Recent payment orders**

- [ ] Title + “View all” → Orders list  
- [ ] Rows (~5–8): order # or merchant ref · amount+asset · network · status badge · time  
- [ ] Status badges: Pending Payment, Verifying, Confirmed, Completed, Expired, Payment Anomaly, Failed  
- [ ] Row click → Order detail  
- [ ] Cashier: **own orders only**  

**Right — Open anomalies**

- [ ] Title + count  
- [ ] Rows: order ref · plain-language reason · expected vs received (if known) · Resolve CTA  
- [ ] Empty: “No open anomalies” (calm, not celebratory confetti)  
- [ ] Cashier: own only  

### F. Sites summary (O/A/V, only if child sites exist)

- [ ] Section title: Sites / Locations  
- [ ] Per site: name · orders in period · volume · anomalies  
- [ ] Click site → Sites or filtered orders  
- [ ] Hide entire section for single-location merchants and for Cashier  

### G. Empty / edge states

- [ ] **Empty orders:** illustration or quiet empty + “Create payment order”  
- [ ] **Loading:** skeleton for KPI + tables (no flash of zeros then real numbers if avoidable)  
- [ ] **Error:** inline banner + Retry  
- [ ] **Viewer:** no Create CTA; read-only feel  

---

## Layout sketch (desktop)

```
┌─ Sidebar ─┬─ Top: [Merchant]  [Today|7d|MTD|dates]  [↻] [+ Create] ─┐
│ Dashboard │                                                         │
│ Orders    │  ▓ Alert banners (0–N stacked)                          │
│ …         │                                                         │
│           │  [ Vol ] [ Fee ] [ Tier ] [ Open ] [ Anomalies ]         │
│           │                                                         │
│           │  ○ USDT·TRON Open  ○ ETH·ETH Open  ○ …  → Networks       │
│           │                                                         │
│           │  ┌ Recent orders ─────┐  ┌ Open anomalies ────┐         │
│           │  │ …                  │  │ …                  │         │
│           │  └────────────────────┘  └────────────────────┘         │
│           │                                                         │
│           │  Sites: Site A · Site B · …   (if multi-location)       │
└───────────┴─────────────────────────────────────────────────────────┘
```

---

## Do / Don’t (this screen only)

| Do | Don’t |
| --- | --- |
| One composition: alerts → KPIs → networks → work queues | Dashboard of 12 unrelated widgets |
| Teal for payment KPIs; amber only for billing alert | Mix service-bill checkout into this page |
| Hide forbidden actions by role | Grey out Create for Cashier incorrectly (Cashier **can** create) |
| Status vocabulary from product | Label anything “Paid” |
| Sites as light summary | Full org tree / agent hierarchy here |

---

## Figma AI prompt (paste once)

```
Design PaymentGate Merchant Dashboard (screen D1) — B2B non-custodial crypto payment collection. Classic SaaS: left sidebar + top bar. Desktop 1440 and mobile 390.

Product: merchants receive crypto into THEIR wallet; platform only watches and matches. Not an exchange, not a wallet app.

Visual: Institutional ink — background #0B0F14, surfaces #12181F / #1E2A36 borders, primary accent teal-cyan #00D4C8, warn amber #FFB703, anomaly #FF5A6A, muted text #8A9BB0. Type: Outfit for UI, Geist or IBM Plex Mono for amounts. Soft glass panels, 12px radius. No purple gradients, no emoji, no confetti, no meme crypto look.

Top bar: merchant name; period chips Today / 7d / MTD + date range; Refresh; primary button “Create payment order”.

Body top→bottom:
1) Stacked alert banners (examples): settlement cool-down; network maintenance; overdue service bills (amber); payment anomalies (red). Short copy; anomalies say “Resolve with a note” — never “Mark paid”.
2) KPI cards in a row: Completed volume | Platform fee (est.) | Tier + fee% | Open orders | Anomalies. Mono amounts. Teal accent on volume.
3) Compact network status strip: asset+network icons with Open/Paused lamps; link to Networks.
4) Two equal panels: Recent payment orders (ref, amount, network, status badge) | Open anomalies (reason, resolve).
5) Optional Sites summary row if multi-location (orders, volume, anomalies per site).

Also provide a Cashier variant: only 3 KPIs (volume, open orders, anomalies); no fee/tier; no network strip; no service-bill banner; sidebar only Dashboard / Create order / My orders; lists scoped to own orders.

Empty state frame: no orders yet + Create CTA.

Statuses allowed: Pending Payment, Verifying, Confirmed, Completed, Expired, Payment Anomaly, Failed — never “Paid”.

Keep first viewport calm and ops-focused — not a chart zoo. One job: show collection health and what needs attention.
```

---

## After Merchant D1

Reuse the same chrome + KPI language for:

1. `C1 Agent Dashboard` — merchants, subtree volume, commission, bills  
2. `B1 Platform Dashboard` — merchants/agents, volume chart, fee collected, anomalies, overdue bills  

Do not start those until Merchant D1 is approved.
