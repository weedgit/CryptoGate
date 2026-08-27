# M1-T05 — Prototype walkthrough checklist

**Owner:** Kevin verifies. **Milestone:** M1 Day 6 · [Milestone-Task-List.md](Milestone-Task-List.md).  
**Depends on:** M1-40–M1-44 prototypes; Andrew M1 auth/org stubs as available.

Walkthrough demonstrates **roles, login concept, order screen, payment page, and POS wireframes** before M2 feature depth. Mark each item when demonstrated or explicitly deferred with ticket.

**Runnable demo:** [M1-T05-Demo-Script.md](M1-T05-Demo-Script.md) · `node scripts/demo-walkthrough.mjs`

---

## 1. Surfaces to show

| # | Surface | Location | Pass |
| --- | --- | --- | --- |
| 1 | Guest payment page (mock order) | `apps/payment-page/public/` | ☑ 2026-08-27 local — pending / Mode C / verifying / completed / anomaly / expired / Ethereum ERC-20 preview; custody line; wrong-network warn. Live `/pay/{id}` after cashier create. |
| 2 | Cashier web shell | Merchant portal `/merchant` (Cashier role, D17) | ☑ Cashier Dashboard + create order; settlement route **Access restricted** |
| 3 | POS wireframe | `apps/payment-page/public/pos/index.html` | ☑ Login / create / QR / receipt; no settlement edit |
| 4 | Platform / agent / merchant portal routes | `doc/UI-Handoff.md` map | ☑ Platform + agent: MFA step-up (`owner@local.cryptogate`). Merchant owner: forced MFA enroll before settings. Cashier: full terminal. |
| 5 | OpenAPI contract | `packages/api-spec/openapi.yaml` auth + org + order stubs | ☑ v0.3.3 — `/orders` and `/service-bills` are separate paths |

---

## 2. Role stories (conceptual)

| # | Story | Expected |
| --- | --- | --- |
| 1 | **Cashier** creates order | ☑ UI generate invoice + `POST /v1/orders` **201** `pending_payment`; guest `GET /payment` 200. GET/PUT settlement **403**. |
| 2 | **Merchant Owner** | ☑ Settlement GET 200 (API). Web: Owner/Admin must enroll MFA before settings (local `merchant@local.cryptogate`). Cashier cannot open settlement. |
| 3 | **Agent** | ☑ Agent portal MFA step-up for local owner. `POST /v1/orders` **401** `mfa_required` until TOTP (create-order 403 covered by authz tests). |
| 4 | **Platform** | ☑ Login → Two-Factor Auth step-up. Fee tiers remain behind MFA (`/platform/settings/fee-tiers`). |
| 5 | **Guest** | ☑ “Send only USDT on TRON TRC-20 / Ethereum ERC-20. Wrong network may result in lost funds.” |

---

## 3. Architecture talking points

- Watch-only — funds to **merchant** wallet; platform never holds spend keys.
- **Payment orders** vs **service bills** — separate rails.
- Watcher is a **separate process** from API.
- Matching modes B / C / D / S — Mode D off on USDT Tron.

---

## 4. Sign-off

| Field | Value |
| --- | --- |
| Date | 2026-08-27 |
| Attendees | Local agent walkthrough (Kevin checklist) |
| Blockers for M2 | None for this demo. UAT still needs Company A hostnames (M3-T09) and M1-01 written sign-off. |
| M1-01 client scope sign-off linked | ☐ (separate — [M1-01](Milestone-Task-List.md)) |

**Local evidence:** API `http://127.0.0.1:3000/health` ok; portals `http://127.0.0.1:5174/{platform,agent,merchant}`; guest pay `http://127.0.0.1:5173`. `E2E_API_BASE=http://127.0.0.1:3000 node scripts/e2e-smoke.mjs --live` ok. USDT/ethereum create-order still **422** `asset_network_disabled`.

Record outcome in [Phase1-Implementation-Plan.md](Phase1-Implementation-Plan.md) §6 when complete.

---

## Related

- [Phase1-Project-Plan.md](Phase1-Project-Plan.md) M1 exit  
- [M3-T09-Company-A-Handoff.md](M3-T09-Company-A-Handoff.md) — test env after M3
