# UI implementation handoff

**Figma:** [Untitled product file](https://www.figma.com/design/VjnnzGqWIo1q2aLRLdA89p/Untitled?node-id=0-1)  
**Lock:** [UI-Style-Lock.md](UI-Style-Lock.md)  
**Pages:** [UI-Page-Spec.md](UI-Page-Spec.md) (Part D = merchant)

## Build order (Kevin first)

| Order | Surface | Owner | Figma | Code |
| --- | --- | --- | --- | --- |
| 1 | Public payment (Pending + states) | Kevin | `e1-*`, `E1-pending-payment` `29:4197` | `apps/payment-page` |
| 2 | Merchant web (M2-60+) | **Bruce** | `d*` (dark) + D11 detail | `apps/web/src/merchant` |
| 3 | Platform + Agent shells | Andrew when assigned | `b*` `c*` | `apps/web` |
| 4 | Cashier POS | Bruce | `g*` | `apps/cashier-apk` |
| 5 | Motion pass | Kevin | page 99 | CSS after screens exist |

Do **not** implement Figma page **98 Archive**. Ignore pink animation sticky notes in product UI.

**Theme:** Style lock is **Institutional Ink** (dark). Implement dark frames (`dN-merchant-*`). Light twins (`dN-light-*`) are optional later — same layout.

---

## Frame → code map (guest pay)

| Frame | Node | State |
| --- | --- | --- |
| `E1-pending-payment` | `29:4197` | Pending Payment |
| `e1-verifying-desktop` | `29:4917` | Verifying |
| `e1-completed-desktop` | `29:4966` | Completed |
| `e1-expired-desktop` | `29:5012` | Expired |
| `e1-anomaly-desktop` | `29:5066` | Payment Anomaly |
| `e1-failed-desktop` | `41:2` | Failed |
| `e1-pending-mode-c` | `41:77` | Mode C exact amount |
| `e2-invalid-desktop` | `29:5115` | Invalid link |

---

## Frame → code map (merchant web) — Bruce M2-60+

Figma page: **01 Product screens — source of truth** (`0:1`).  
Code: `apps/web/src/merchant`. Routes match [UI-Page-Spec.md](UI-Page-Spec.md) Part D.

Open a node: `https://www.figma.com/design/VjnnzGqWIo1q2aLRLdA89p/Untitled?node-id={id-with-dashes}`  
(e.g. `29:2023` → `node-id=29-2023`).

### Phase 1 slice (do these first)

| Task | Spec | Route | Dark frame | Node | Light twin |
| --- | --- | --- | --- | --- | --- |
| M2-60 | D4 Create order | `/merchant/orders/new` | `d4-merchant-create-order` | `29:2023` | `31:486` |
| (support) | D2 Orders list | `/merchant/orders` | `d2-merchant-orders-list` | `29:1750` | `31:188` |
| (support) | D3 Order detail | `/merchant/orders/:id` | `d3-merchant-order-detail` | `29:1888` | `31:338` |
| (support) | D1 Dashboard | `/merchant` | `d1-merchant-dashboard` | `29:1617` | `31:43` |
| M2-61 | D11b Matching | `/merchant/settings/settlement` (modes) | `settlement-matching-modes` | `13:6192` | — |
| M2-61 | Confirm dialog | (modal on D11) | `d11b-matching-save-confirm` | `44:276` | — |
| M2-62 | D11a Address book | `/merchant/settings/settlement` | `settlement-address-book` | `13:5987` | — |
| M2-62 | MFA + cool-down | (flow on D11) | `d11-address-change-mfa` | `44:72` | — |
| M2-63 | D11c xPub / HD | `/merchant/settings/settlement` | `settlement-hd-pool` | `13:6354` | — |
| M2-63 | Settings shell | `/merchant/settings/settlement` | `d11-merchant-settlement` | `29:3177` | `31:1432` |

Nested on HD / xPub frames (not full-page): `xpub-display-block` `13:6413`, `rotate-xpub` `13:6548`.

`d11-merchant-settlement` is the **combined** settlement page (address book + matching + HD/xPub sections). Use the D11 detail frames (`13:*`, `44:*`) when implementing section layout and MFA/confirm overlays.

### Full merchant shell (after M2-60–63)

| Spec | Route | Dark frame | Node | Light twin |
| --- | --- | --- | --- | --- |
| D5 Service bills list | `/merchant/service-bills` | `d5-merchant-service-bills-list` | `29:2136` | `31:613` |
| D6 Bill detail | `/merchant/service-bills/:id` | `d6-merchant-service-bill-detail` | `29:2257` | `31:747` |
| D7 Sites list | `/merchant/sites` | `d7-merchant-sites-list` | `29:2623` | `31:900` |
| D8 Create site | `/merchant/sites/new` | `d8-merchant-create-site` | `29:2757` | `31:1050` |
| D9 Site detail | `/merchant/sites/:id` | `d9-merchant-site-detail` | `29:2902` | `31:1171` |
| D10 Reports | `/merchant/reports` | `d10-merchant-reports` | `29:3035` | `31:1297` |
| D12 Org settings | `/merchant/settings/organization` | `d12-merchant-org` | `29:3377` | `31:1569` |
| D13 Billing | `/merchant/settings/billing` | `d13-merchant-billing` | `29:3499` | `31:1690` |
| D14 API & webhooks | `/merchant/settings/integrations` | `d14-merchant-api-webhooks` | `29:3627` | `31:1839` |
| D15 Notifications | `/merchant/settings/notifications` | `d15-merchant-notification-prefs` | `29:3775` | `31:1980` |
| D16 Team | `/merchant/settings/team` | `d16-merchant-team` | `29:3939` | `31:2155` |
| D17 Cashier web shell | `/merchant` (Cashier role) | `d17-cashier-web-shell` | `29:4062` | `31:2315` |

### Cashier / role rules (do not invent)

- Cashier: Dashboard (own orders), Create order, My orders, Sign out — **no** Settings, Team, API, Service bills, Reports, Sites.
- Cashier **403** on settlement, xPub, matching mode, fees (direct URL too). Frame `d17-*` is the limited shell.
- Matching labels in UI: **Standard** / **Amount fingerprint** / **Memo tag** / **Smart address** (not Mode A/B/C/D/S alone).
- Save matching → confirm: “Applies to **new orders only**.”
- Status badges: Pending Payment, Verifying, Confirmed, Completed, Expired, Payment Anomaly, Failed — **never Paid**.
- No “Mark paid” on anomaly.

### Suggested branch

```
feat-bruce-web-merchant-m2-create-order
```

Then: `feat-bruce-web-merchant-m2-settlement` for M2-61/62/63.

---

## API (Andrew)

| Call | Status |
| --- | --- |
| `POST /v1/orders` | Landed (PR #15). **assignOnCreate wired (PR #30).** Create-order prototype uses it. |
| `GET /v1/orders/{id}/payment` | Landed (PR #16). Public; pay page polls every 5s. |
| CORS | Landed (PR #33). Set `CORS_ALLOWED_ORIGINS` to both `http://localhost:5173` and `http://127.0.0.1:5173` if you use either. |
| Order expiry | Landed (PR #33). Pending past `expires_at` → `expired`. |
| Settlement / matching / xPub / HD pool | OpenAPI + API landed for M2 settings; wire UI to those paths. |
| Webhooks fan-out | Landed (PR fan-out / outbox on main). |

Kevin smoke checklist: [M2-Mid-Gate.md](M2-Mid-Gate.md).

`public/config.js` sets `CRYPTOGATE_API_BASE` (default `http://127.0.0.1:3000`).

Guest URLs: `/pay/{id}` (rewritten to `index.html`) or `/?id={id}`.  
Demo (no id):

- States: `?state=verifying|completed|expired|anomaly|failed`
- Mode C: `?mode=C&amount=245.01`
- Mode D (hidden on USDT Tron): `?mode=D&memo=CG-0847` — memo UI stays hidden
- Mode D demo on supported net: `?mode=D&memo=CG-0847&memoSupported=1`
- Create: `/create-order.html`

Guest page shows amount/asset/network/contract/address/expiry, wrong-network warning, QR, copy amount/address/contract, share link. Mode C uses “Exact payable” + exact-amount warning. Mode D memo only when `memoSupported` (mirrors `packages/domain` for USDT+tron).

## Branch (Kevin)

```
feat-kevin-domain-merchant-figma-map
```
