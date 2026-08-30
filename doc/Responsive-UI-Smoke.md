# Responsive UI smoke checklist

Widths: **1280** (desktop), **1024** / **768** (tablet), **390** (phone).

## Portal shells (platform / agent / merchant)

- [ ] ≤1100: hamburger appears; sidebar is off-canvas; opens as drawer with backdrop
- [ ] Drawer closes on nav link, backdrop click, Escape, and resize to desktop
- [ ] ≤640: topbar stacks without horizontal page scroll
- [ ] Desktop (≥1101): classic sidebar + collapse toggle still works

## List / split pages

- [ ] Merchants / Agents (platform + agent): stack at ≤1100; selecting a row scrolls to detail
- [ ] Architecture: map stacks; detail usable
- [ ] Compliance: kind KPI cards wrap; order link opens `/platform/orders/:id`
- [ ] Wide tables scroll inside wrappers only

## Detail / forms

- [ ] Order detail (merchant + platform watch-only) stacks on phone
- [ ] Onboard wizards single-column ≤640 with sticky footer actions

## Public

- [ ] Marketing ≤640: menu button reveals Product + Sign in
- [ ] Payment page ≤360/640: QR and address do not overflow

## Cashier APK

- [ ] Login / Home / Create / Pay readable on phone (&lt;360) and tablet (≥600) with max content width
- [ ] Pay QR shrinks on compact phones
