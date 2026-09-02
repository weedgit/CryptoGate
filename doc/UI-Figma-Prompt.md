# Figma Work AI — PaymentGate UI Prompt Pack

Use these prompts with **Figma Work AI / Figma Make / AI design assist**. Paste **one prompt at a time**. Start with **Prompt 0 (Design system)**, then portal prompts, then motion passes.

Product reference: [UI-Page-Spec.md](UI-Page-Spec.md). Terminology: payment order, service bill, merchant account, merchant (site), Cashier — never “guest invoice”, “sub-merchant”, or “branch”.

---

## How to use

1. Run **Prompt 0** → generate Design System (colors, type, components, motion tokens).
2. Run **Prompt 1–5** one portal at a time (Platform → Agent → Merchant → Payment page → Cashier APK).
3. Run **Prompt 6** (motion pass) on each frame set after screens exist.
4. Run **Prompt 7** for micro-interactions and empty/error states.
5. Ask Figma AI to **link components** to the design system after each batch.

**Tip:** Attach or paste page IDs from `UI-Page-Spec.md` (e.g. D4 Create payment order) so AI stays scoped.

For tools with a **tight character limit**, use the **Master prompt (short)** below first, then follow up with the numbered prompts for missing portals.

---

## Logo & icon — Figma Maker AI

Use these **before** or **alongside** the UI pack so screens use a real mark. Run **L1** first, then **L2–L4**.

### L1 — Logo system (primary)

```
Create a logo system for PaymentGate — B2B non-custodial crypto payment collection for hotels and retail. Not a consumer wallet, not an exchange, not a meme coin.

Brand feel: modern, professional, institutional fintech × blockchain infrastructure. Calm trust. Stripe-level polish, Coinbase Institutional seriousness — zero casino neon.

Concept (preferred): abstract “watch-only gate” — a geometric portal / arch / aperture that frames a chain node or receipt mark. Suggests: payment passes through to the merchant; platform watches, does not hold. Avoid literal padlocks, cartoon coins, Bitcoin B, rocket, wolf, crown.

Mark rules:
- Primary mark: simple geometric monogram or symbol that works at 16px and on a POS receipt
- Wordmark: “PaymentGate” — distinctive geometric sans; Gate slightly tighter tracking than Crypto; optional “CG” monogram
- Construction: optical grid, consistent stroke, 1–2 shapes max
- Color: teal-cyan #00D4C8 on ink #0B0F14; also pure white and pure black versions
- No gradients inside the mark at small sizes; optional soft gradient only on oversized brand hero
- Avoid: purple, gold foil crypto cliché, 3D chrome, gloss, drop shadows, emoji, circuit-board overload

Deliver on one Figma page “Brand — Logo”:
1) Primary logo (symbol + wordmark) horizontal
2) Stacked logo (symbol above wordmark)
3) Symbol only
4) CG monogram
5) Clear space and minimum size
6) Color variants: teal-on-ink, teal-on-white, white-on-ink, black-on-white, single-color
7) Wrong examples crossed out (stretched, recolored randomly, low contrast)

Annotate grid and rationale in short sticky notes.
```

### L2 — App icon / favicon set

```
Using the PaymentGate logo mark from the previous frame, design an app icon and favicon set.

Surfaces:
- App icon 1024×1024 (master)
- iOS-style rounded square safe zone
- Android adaptive (foreground + flat background)
- Favicon 32 / 16 (must stay legible)
- POS / Android Cashier APK launcher icon
- Notification small icon (monochrome silhouette)

Rules:
- Use ONLY the symbol or CG monogram — no full wordmark on the icon
- Background: ink #0B0F14 or soft radial from #12181F; glyph in #00D4C8 or white
- Corner radius per platform guidelines; keep glyph inside safe area
- At 16px: simplify to 2–3 pixels of contrast; drop fine inner detail
- No text, no photo, no 3D bevel

Deliver frame set “Brand — Icons” with each size labeled and a monochrome mask version.
```

### L3 — Short master (tight character limit)

```
Design PaymentGate logo + icons. B2B non-custodial crypto payments (watch-only gate). Style: pro fintech, ink #0B0F14, teal #00D4C8. Geometric gate/portal mark + “PaymentGate” wordmark + CG monogram. Simple, sharp at 16px. No purple, neon, coins, Bitcoin B, 3D chrome, emoji.

Deliver: horizontal logo, stacked, symbol-only, CG monogram, clear space, color variants (teal-on-ink, white-on-ink, black-on-white). Icons: 1024 app, favicon 32/16, POS launcher, mono notification. Safe zones labeled.
```

### L4 — Refinement follow-ups

Paste one at a time after L1/L2:

```
Tighten the PaymentGate mark: fewer nodes, stronger silhouette, better 16px legibility. Keep teal #00D4C8 on ink.
```

```
Create an animated logo intro concept for Figma: gate aperture opens 400ms, teal node pulses once, wordmark fades in. Calm, not flashy. Spec durations on stickies.
```

```
Generate social/og lockups: PaymentGate symbol + short tagline “Merchant crypto collection. Watch-only.” 1200×630 and 1080×1080.
```

```
Export checklist frame: SVG logo, PNG @1x/2x, app icon 1024, favicon ICO/PNG, maskable Android, dark/light.
```

---

## Master prompt (short) — tight character limit

Paste this as a single brief (~half the length of Prompt 8):

```
Design PaymentGate Phase 1 UI: B2B non-custodial crypto collection (USDT). Portals: Platform, Agent, Merchant (+ site, Cashier role), public Payment Page, Service Bill checkout, Cashier Android POS.

Style: modern pro fintech/blockchain — ink #0B0F14–#12181F, accent teal #00D4C8, warn amber #F5B942, success #2EE59D, anomaly #FF5A6A. Glass panels, soft chain-grid, mono for amounts/addresses. Avoid purple gradients, neon overload, emoji, pill spam, confetti.

Deliver:
1) Design system: colors, type, spacing, components + motion tokens (120/280/600ms; ease-out; spring on status)
2) Key screens: dashboards; order list/create/detail; settlement (address cool-down, matching modes Standard/Amount fingerprint/Memo/Smart address, xPub/HD pool); service bills (amber rail) SEPARATE from payment orders (teal); team; API/webhooks; audit (platform)
3) Public pay page: amount, NETWORK, QR, address, expiry, wrong-network warning; states Pending/Verifying/Completed/Expired/Anomaly
4) POS: login, create, big QR cashier + customer screen, receipt + anomaly receipt; no Mark paid
5) Motion sticker sheet: KPI stagger, status morph, confirm ring, QR scan-line, cool-down bar, drawer stagger
6) Notifications + banners: cool-down, anomaly, overdue bill, network maintenance, webhook fail

Rules: Cashier no settlement/xPub/matching; Agent no create order; MFA on address/xPub; no Mark paid. Desktop 1440; pay+POS portrait. Annotate animations on frames. Terms: payment order, service bill, merchant (site), Cashier.
```

**Follow-ups if truncated** (paste one at a time):

```
Expand missing Platform screens: agents, fee tiers, compliance override, audit, system health. Same PaymentGate design system.
```

```
Expand Merchant settlement: address book cool-down, matching mode cards, Mode S HD pool FREE/IN_USE/COOLDOWN. Annotate motion.
```

```
Animation pass: status badge morph, Verifying ring, QR scale-in + scan-line, KPI count-up, notification drawer stagger, anomaly pulse. Spec durations on stickies.
```

---

## Prompt 0 — Design system (run first)

```
You are designing the design system for PaymentGate Phase 1 — a B2B non-custodial crypto payment collection platform for hotels, travel, transport, and retail.

BRAND PERSONALITY
- Modern, professional, trustworthy fintech + blockchain infrastructure
- Premium SaaS (think Stripe Dashboard × Coinbase Institutional), not meme crypto, not neon cyberpunk clutter
- Calm confidence: merchants trust order state; no casino vibes

VISUAL DIRECTION (LOCK THIS)
- Primary theme: deep charcoal / ink (#0B0F14 to #12181F) surfaces with soft luminous accents
- Accent: electric teal-cyan (#00D4C8) for primary actions and “on-chain live” signals
- Secondary accent: soft amber (#F5B942) for warnings, cool-downs, pending
- Success: mint emerald (#2EE59D); Danger/anomaly: coral red (#FF5A6A); Info: cool blue (#5B8CFF)
- Avoid: purple-to-indigo gradients, purple-on-white, cream paper + terracotta, flat single-color white SaaS, neon glow overload, emoji icons, rounded-full pill spam, multi-layer drop shadows
- Backgrounds: subtle radial gradients + fine noise/grid mesh (blockchain lattice), not flat fills; light mode variant for merchant back-office optional but same tokens
- Cards: use sparingly — only for interactive containers; prefer open sections with hairline dividers and glass panels (8–12% white opacity, 12–16px blur)
- Corners: 12–16px for panels, 8px for controls; never fully circular pills for primary buttons
- Icons: thin geometric line icons (1.5px), crypto-aware (QR, chain, wallet address) without cartoon coins

TYPOGRAPHY
- Display / brand: distinctive geometric sans (e.g. Satoshi, Clash Display, or similar) for “PaymentGate” wordmark and hero numbers
- UI body: clean neo-grotesk (e.g. Inter is OK only if paired with strong display; prefer Geist / IBM Plex Sans / Suisse-like)
- Mono for addresses, tx hashes, order IDs, amounts: JetBrains Mono or IBM Plex Mono
- Hierarchy: Order status and payable amount are the loudest numbers on payment screens

MOTION TOKENS (define as variables)
- Duration: micro 120ms, UI 200–280ms, emphasis 400–600ms, page 700–900ms
- Easing: ease-out for entrances, ease-in-out for morphs, spring (stiffness 280, damping 24) for status chips
- Stagger: 40–60ms between list rows / KPI cards
- Loop: live pulse 1.6s infinite for “watching chain” / Verifying

CREATE IN FIGMA
1. Color styles + semantic tokens (bg, surface, border, text, accent, status)
2. Type styles (display XL, H1–H4, body, caption, mono)
3. Spacing scale 4/8/12/16/24/32/48/64
4. Component library with variants AND motion notes on each:
   - Button (primary, secondary, ghost, danger, loading)
   - Input, select, amount keypad
   - Status badge (Pending Payment, Verifying, Confirmed, Completed, Expired, Payment Anomaly, Failed)
   - Toast / banner / alert strip
   - Notification item
   - Data table row
   - Modal / MFA step-up
   - Org switcher
   - QR panel
   - Countdown timer
   - Confirmation progress (n/N blocks)
   - Empty state
   - Skeleton loader
5. Animation sticker sheet: show before/after + arrows describing motion for every component above

Output: one “00 Design System” page with clear frames and labels.
```

---

## Prompt 1 — Platform portal

```
Using the PaymentGate Design System, design HIGH-FIDELITY desktop screens (1440×900) for the PLATFORM shell (PaymentGate operator).

Style: modern professional blockchain SaaS, dark luminous UI, teal accent, glass panels, rich motion-ready layouts.

Screens (label frames with IDs):
B1 Platform dashboard — KPI cards (merchants, agents, volume, fees, anomalies, overdue bills), volume chart, system alerts (watcher lag, network maintenance), recent audit, quick actions
B2 Agent accounts list — search, filters, table, Onboard agent CTA
B3 Agent detail — tabs: Overview, Merchants, Volume, Service bills, Commissions, Team, Audit
B4 Onboard agent wizard — multi-step (type → details → commercial → owner invite → review)
B5 Merchants list (platform-wide)
B6 Merchant detail (platform view) — settlement READ-ONLY, compliance actions
B7 Compliance override modal — MFA, reason required, danger styling
B8 Fee tiers & pricing — Small/Mid/Enterprise bands, “next billing period” banner
B9–B10 Service bills list + detail (NEVER mix with payment orders visually — different icon color system)
B13 Global settings — max agent depth, networks, security
B14 Audit log — immutable, filters, no delete
B15 Platform team — Owner-only invite
B16 Network catalog — maintenance toggles, watcher health
B17 System health — API, watcher lag, webhook backlog

Global chrome on every screen: org switcher (Platform badge), notification bell with unread badge, user menu.

Also design:
A1 Login, A4 MFA challenge, A5 MFA enrollment, A9 Notification center drawer with sample items (address cool-down, anomaly, overdue bill, network maintenance)

Visual rules:
- Separate “Service bill” rail: amber/slate treatment vs teal “Payment order” rail
- Status badges match design system
- Include realistic sample data (USDT Tron, order #CG-2026-…)
- Annotate intended animations in pink sticky notes on each frame (what moves, duration)

Do NOT include: purple gradients, meme crypto art, “Mark paid” buttons, custody wallet metaphors.
```

---

## Prompt 2 — Agent portal

```
Using PaymentGate Design System, design desktop screens (1440×900) for the AGENT portal (channel partner / ISO reseller).

Agent users NEVER create payment orders — hide any create-order CTA.

Screens:
C1 Agent dashboard — merchant count, subtree volume, open service bills, commission MTD, alerts
C2–C4 Agent (sub) list, detail, onboard wizard (disable with tooltip if max depth reached)
C5–C7 Merchants list, onboard wizard (tier + volume fee WITHIN platform band slider), merchant detail
C8 Volume fee edit modal — band min/max visual, “applies next billing period”
C9 Service bills subtree (read-only)
C10 Commission statements (separate from service bills)
C11 Team, C12 Settings

Emphasize:
- Fee band slider with locked min/max marks
- Read-only merchant settlement with “Managed by merchant” labels
- Professional reseller dashboard feel; same dark blockchain language as Platform

Add pink sticky notes describing motion: KPI count-up, fee slider spring, wizard step transitions.
```

---

## Prompt 3 — Merchant portal (+ site)

```
Using PaymentGate Design System, design desktop screens (1440×900) for the MERCHANT portal (and note Merchant (site) variants).

Role-aware nav:
- Owner/Admin/Viewer: full ops
- Cashier: ONLY Dashboard (own), Create order, My orders — NO Settings, Team, API, Service bills

Screens:
D1 Dashboard — site selector (multi-location), KPIs, alerts (cool-down, anomaly, overdue bill, network maintenance)
D2 Orders list — filters, status badges, export
D3 Order detail — summary, payment fields, QR, on-chain confirmations progress, timeline, anomaly panel (NO Mark paid)
D4 Create payment order — amount, asset, network, validity; show matching mode in effect (Standard / Amount fingerprint / Memo tag / Smart address)
D5–D6 Service bills list + detail + Pay CTA (visually SEPARATE from payment orders)
D7–D9 Sites (multi-location), create site, site detail + override approval queue
D10 Reports
D11 Settlement settings — address book, matching mode cards, xPub + HD pool FREE/IN_USE/COOLDOWN, order policies
D12–D15 Org, billing (read-only rate), API keys & webhooks (secret once, test webhook), notification prefs
D16 Team (Owner only)

Critical UX:
- Address cool-down banner with live countdown
- Matching mode as large selectable cards with short explanations
- Mode C: fingerprint amount callout
- Mode S: HD pool state chips with subtle pulse on IN_USE
- Anomaly: coral panel with clear merchant guidance

Cashier-limited layout: separate frame “Cashier web shell” with reduced nav.

Annotate animations: table row stagger, status badge morph Pending→Verifying→Completed, QR fade-in on create success.
```

---

## Prompt 4 — Public payment page (guest)

```
Design the PUBLIC payment page for PaymentGate (apps/payment-page). Mobile-first 390×844 AND desktop 1280×800. NO login. NO merchant admin chrome.

Goal: one clear composition — guest must pay correctly on the right network.

Hero content (first viewport only):
- Merchant (+ site) name
- Large payable amount (mono)
- Asset + NETWORK (network is as loud as amount)
- QR (dominant)
- Receive address with copy
- Countdown expiry
- Persistent wrong-network warning

States as separate frames:
E1 Pending Payment
E1 Verifying (confirmation n/N ring animation description)
E1 Completed (calm success — not confetti party)
E1 Expired (greyed QR)
E1 Payment Anomaly (payer-safe message)
E1 Failed
E2 Invalid link / network maintenance

Also design Mode C exact-amount warning strip and Mode D memo strip.

Motion (describe + prototype-ready):
- QR soft scale-in + shimmer scan line loop (subtle)
- Countdown ticks
- Verifying: orbital ring / block confirmations filling
- Copy address: checkmark micro-burst
- Completed: amount settles with gentle spring; chain checkmark draws

Avoid card-heavy layout; full-bleed atmospheric background with soft chain-grid. Brand “PaymentGate” secondary, merchant name primary for trust.
```

---

## Prompt 5 — Cashier Android POS (APK)

```
Design Cashier Android POS UI for PaymentGate (portrait handheld POS). Frames at 1080×1920 and optional second-screen 720×1280.

Screens:
G1 Login (server environment badge Test/Prod)
G2 Home — Create order CTA, today’s orders, online indicator
G3 Create order — amount keypad, asset, network
G4 Active order cashier screen — HUGE amount, network, QR, countdown, wrong-network banner, live status (no Mark paid)
G5 Customer-facing second screen — QR + amount + network + warning only
G6 Completed → print prompt
G7 Receipt layout (thermal width mock 58mm): order #, amount, asset, network, address, status, tx hash; SEPARATE anomaly receipt template (red header)
G8 Today’s orders (own only)
G9 Minimal settings (reprint, version, logout) — NO wallet/xPub/matching

POS UX:
- Large touch targets (min 48dp)
- High contrast for counter lighting
- Keep-awake implied (status bar)
- Offline: full-screen cannot create order

Motion:
- Keypad press ripples
- Status transitions color morph
- Print success toast
- Anomaly: attention pulse (not celebratory)
```

---

## Prompt 6 — Global motion / animation pass

```
Animation director pass for PaymentGate Figma file. For EVERY major component and screen transition, add a Motion Spec frame or sticky notes with:

1. Trigger (hover / tap / load / status change / websocket update)
2. Properties (opacity, y, scale, blur, color, path draw)
3. Duration + easing (use design system motion tokens)
4. Reduced-motion fallback (instant state, no loops)

REQUIRED ANIMATIONS (implement as prototypes or detailed specs):

NAV & SHELL
- Sidebar / nav item active: 200ms underline slide
- Org switcher open: 240ms scale+fade from top
- Notification drawer: slide from right 320ms + list stagger 50ms
- Session timeout modal: backdrop fade 200ms, dialog spring in

DATA
- KPI cards on dashboard load: stagger fade-up 60ms, numbers count-up 600ms
- Table rows: enter stagger; hover row subtle translateX 4px + border accent
- Skeleton → content: crossfade 200ms
- Charts: draw line path 800ms ease-out

STATUS SYSTEM (critical)
- Badge morph between Pending Payment → Verifying → Confirmed → Completed
- Verifying: soft breathing glow + confirmation ring progress
- Payment Anomaly: coral edge pulse 3× then settle (alarm, not celebration)
- Expired: desaturate + opacity 0.6

PAYMENT / QR
- QR appear: scale 0.92→1 + fade 280ms
- Optional continuous scan-line (opacity 0.15, 1.8s loop) — disable for reduced motion
- Copy button: icon swap to check 150ms
- Countdown last 60s: amber; last 10s: coral pulse

FORMS & FLOWS
- Wizard steps: horizontal slide 300ms
- MFA code inputs: auto-advance focus
- Primary button loading: spinner morph from label
- Success toast: slide from top + progress dismiss bar

SETTLEMENT SECURITY
- Cool-down banner: continuous thin progress bar for remaining time
- Dangerous modal: red rim draw-on 400ms

POS
- Amount keypad: tactile scale 0.96 on press
- Customer screen QR: same as payment page but larger

Create a single page “99 Motion Spec” documenting all of the above with example components.
```

---

## Prompt 7 — Micro-interactions, empty states, alarms

```
Expand PaymentGate UI with polished micro-states and alarms. Same design system.

For each portal, add frames:
- Empty states (no orders, no agents, no bills) — one illustration style: abstract chain nodes, not cute mascots
- Loading skeletons matching final layouts
- Inline validation errors
- Toast variants: success, warning, error, info
- Full-page 403 / 404
- Network maintenance global banner
- Service bill overdue banner
- Settlement cool-down banner with countdown
- Webhook failure alert row
- Printer error toast (POS)
- Offline POS blocking screen

Notification center populated with ALL types from product:
settlement pending/activated, xPub change, site override approve/deny, payment anomaly, webhook failed, service bill issued/overdue, commission statement, compliance override, enterprise rate pending, API key expiring, network maintenance

Make every interactive component feel “alive”: hover, focus ring (teal 2px), pressed, disabled, loading.
```

---

## Prompt 8 — One-shot mega prompt (if AI accepts long context)

Use only if the tool allows a long single brief; otherwise prefer Prompts 0–7.

```
Design a complete Figma UI kit + key screens for PaymentGate Phase 1: non-custodial B2B crypto collection (USDT etc.). Portals: Platform, Agent, Merchant (incl. site + Cashier role), public Payment Page, Service Bill checkout, Cashier Android POS.

Aesthetic: modern professional blockchain/fintech — deep ink surfaces, teal-cyan accents, amber warnings, glass panels, subtle grid, mono for addresses. Avoid purple SaaS clichés, neon overload, emoji.

Deliver:
1) Design system with motion tokens
2) Core screens per portal (dashboard, lists, order create/detail, settlement settings with matching modes B/C/D/S, service bills separate from payment orders, audit, team)
3) Public pay page all statuses
4) POS cashier + customer screen + receipt
5) Motion sticker sheet for components and status transitions
6) Notification center + system banners + empty/loading/error

Invariants reflected in UI: no Mark paid; Cashier cannot see settlement/xPub/matching; Agent cannot create payment orders; Payment Anomaly explicit; wrong-network warnings always visible on pay surfaces; MFA for address/xPub changes; cool-down countdowns.

Annotate animations on every frame. Desktop 1440 and mobile/POS portrait where relevant.
```

---

## Motion cheat-sheet (paste into any follow-up)

```
Prefer: fade + translateY(8→0), scale(0.98→1), color morph on status, staggered lists, spring on badges, path-draw on success check, progress rings for confirmations, subtle QR scan-line, countdown urgency color shift.

Avoid: bounce-everywhere, parallax noise, infinite neon glow, confetti on payment Completed (use calm settle instead), autoplaying loud motion that blocks reading amount/network.
```

---

## Figma AI follow-ups (short)

After screens exist, paste individually:

1. `Upgrade all primary buttons to include hover, pressed, loading, and success micro-animations per motion tokens.`
2. `Add prototype connections: Login → MFA → Dashboard; Create order → Order detail with QR; Pending → Verifying → Completed status morph.`
3. `Generate light-mode companion for Merchant portal only, keeping the same tokens and accents.`
4. `Create a component set for StatusBadge with animated variants for each order status.`
5. `Redesign matching mode picker as four cinematic cards with icon motion on select.`
6. `Make Service bill pages visually distinct from Payment order pages (amber rail vs teal rail) across the whole file.`

---

## Document history

| Date | Change |
| --- | --- |
| 2026-08-22 | Initial Figma Work AI prompt pack for PaymentGate Phase 1 |
| 2026-08-22 | Added short master prompt for tight character limits |
| 2026-08-22 | Added logo & icon prompts for Figma Maker AI |
