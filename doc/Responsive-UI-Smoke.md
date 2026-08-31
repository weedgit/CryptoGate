# Responsive UI smoke checklist

Widths: **1280** (desktop), **1024** / **768** (tablet), **390** (phone).

Automated selector smoke: `node --test apps/web/test/responsive-ui-smoke.test.mjs`

## Portal shells (platform / agent / merchant)

- [x] ≤1100: hamburger appears; sidebar is off-canvas; opens as drawer with backdrop
- [x] Drawer closes on nav link, backdrop click, Escape, and resize to desktop
- [x] ≤1100: collapsed desktop preference still shows **labels** in the drawer (Platform / Agent)
- [x] ≤640: topbar stacks without horizontal page scroll; period pills/dates wrap
- [x] Desktop (≥1101): classic sidebar + collapse toggle still works

## List / split pages

- [x] Merchants / Agents (platform + agent): stack at ≤1100; selecting a row scrolls to detail
- [x] Architecture: map stacks; detail usable; metrics 1-col at ≤390
- [x] Compliance: kind KPI cards wrap (2-col ≤640, 1-col ≤390); order link opens `/platform/orders/:id`
- [x] Wide tables scroll inside wrappers only

## Detail / forms

- [x] Order detail (merchant + platform watch-only) stacks on phone
- [x] Onboard wizards (`.b4-wizard`) single-column ≤1100 with sticky wrap footer ≤640

## Dashboards

- [x] Platform overview grid → 1 col ≤1100
- [x] Merchant KPIs → 2 col ≤1100, 1 col ≤640
- [x] Merchant recent orders / sites: horizontal scroll wrapper (no page clip)

## Public

- [x] Payment page ≤360/640: QR and address do not overflow
- [ ] Marketing ≤640: menu button reveals Product + Sign in (re-check when marketing tree is present)

## Cashier APK

- [ ] Login / Home / Create / Pay readable on phone (&lt;360) and tablet (≥600) with max content width
- [ ] Pay QR shrinks on compact phones
