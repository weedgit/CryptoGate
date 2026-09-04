# UAT client review — demo logins

**Environment:** TRON Nile testnet · password for all accounts below: **`User1234567890!`**

Use these accounts for user-guide screenshots. Data includes 3 months of payment orders, service bills, commission invoices, platform team, and two agent trees under PaymentGate.

---

## Platform portal

| Role | Email | Notes |
|------|-------|--------|
| **Platform Owner** | `own.platform@paymentgate.io` | Full access — dashboard, architecture, commissions, service bills |
| Platform Admin | `admin.platform@paymentgate.io` | Team page, settings |
| Platform Viewer | `view.platform@paymentgate.io` | Read-only |

**URLs:** Platform `https://platform-cg.boostbunny.io/` · local `http://127.0.0.1:5174/platform`

**Architecture tree (expected):**

```
PaymentGate (platform)
├── Kevin Agent → Kevin Sub-Agent → 10+ merchants
└── Atlas Agent → Atlas Sub-Agent → 4 merchants (+ multi-location sites)
```

Merchants always sit under an **agent** or **sub-agent** (Phase 1 design — not directly under platform).

---

## Agent portal

| Role | Email | Org |
|------|-------|-----|
| **Kevin Agent Owner** | `own.agent@paymentgate.io` | Kevin Agent (15% commission) |
| Kevin Agent Admin | `admin.agent@paymentgate.io` | Kevin Agent |
| **Atlas Agent Owner** | `own.atlas@paymentgate.io` | Atlas Agent (18% commission) |
| Atlas Sub-Agent Owner | `own.atlas-sub@paymentgate.io` | Atlas Sub-Agent |

**URL:** Agent portal on same host (`/agent`).

---

## Multi-merchant (recommended for merchant guide)

| Role | Email | Org |
|------|-------|-----|
| **Multi merchant owner** | `own.multi@paymentgate.io` | Kevin Multi Merchant (Casablanca + Marrakech sites) |
| Atlas multi owner | `own.atlas-multi@paymentgate.io` | Atlas Multi Merchant (2 sites) |

---

## Cashier (POS / order create)

| Role | Email | Org |
|------|-------|-----|
| **Kevin Multi cashier A** | `cashier.multi.a@paymentgate.io` | Kevin Multi Merchant |
| Kevin Single cashier A | `cashier.single.a@paymentgate.io` | Kevin Single Merchant |
| Atlas Casablanca cashier A | `cashier.atlas-casa.a@paymentgate.io` | Atlas Merchant · Casablanca |

Each merchant has cashiers **a–e** (`cashier.{merchant-key}.{a|b|c|d|e}@paymentgate.io`).

**URL:** Merchant portal `https://merchant-cg.boostbunny.io/`

---

## Dashboard screenshot tips

| Widget | What to select | Expected after seed |
|--------|----------------|---------------------|
| **Invoices — Paid** | Period **7d** or **1m** | Several paid service bills |
| **Invoices — Overdue** | Any period | 2+ overdue bills |
| **Grow** | **1m** | New merchants / agents / cashiers from audit log |
| **Funds — Total / Fees** | **1m** | Non-zero settled volume + volume fees |
| **Commissions** | Platform → Commissions | Kevin Agent + Atlas Agent rows; Sep 2026 issued |

---

## Nile wallets (settlement / test pay)

| Purpose | Address |
|---------|---------|
| Platform billing (service bill Rx) | `TQC9shK5PcXdma5UkizSrLq1L6tQqUsKL` |
| Fund test payer | `TKHT1GJK6PE5L2FLGQKWsXt4JYvNzTjYjE` |
| Kevin Multi settlement | `TPQJjsofWLs38vU3n7T5jvGYHVirKGybuu` |
| Atlas Casablanca settlement | `TFF1phE6HH3W9ez6vmq4bbKaLGKzQMMQR` |

Full map: `scripts/seed-nile-wallets.mjs`

---

## Re-seed (clean)

```bash
node scripts/seed-uat.mjs
```

Steps: `seed-local` → `seed-kevin-uat` → `seed-kevin-uat-rich` → `seed-kevin-uat-client-demo`
