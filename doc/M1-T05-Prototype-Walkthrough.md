# M1-T05 — Prototype walkthrough checklist

**Owner:** Kevin verifies. **Milestone:** M1 Day 6 · [Milestone-Task-List.md](Milestone-Task-List.md).  
**Depends on:** M1-40–M1-44 prototypes; Andrew M1 auth/org stubs as available.

Walkthrough demonstrates **roles, login concept, order screen, payment page, and POS wireframes** before M2 feature depth. Mark each item when demonstrated or explicitly deferred with ticket.

**Runnable demo:** [M1-T05-Demo-Script.md](M1-T05-Demo-Script.md) · `node scripts/demo-walkthrough.mjs`

---

## 1. Surfaces to show

| # | Surface | Location | Pass |
| --- | --- | --- | --- |
| 1 | Guest payment page (mock order) | `apps/payment-page/public/` | ☐ |
| 2 | Cashier web shell | Merchant portal `/cashier` (Bruce D17) or wireframe | ☐ |
| 3 | POS wireframe | `apps/payment-page/public/pos/index.html` | ☐ |
| 4 | Platform / agent / merchant portal routes | `doc/UI-Handoff.md` map | ☐ |
| 5 | OpenAPI contract | `packages/api-spec/openapi.yaml` auth + org + order stubs | ☐ |

---

## 2. Role stories (conceptual)

| # | Story | Expected |
| --- | --- | --- |
| 1 | **Cashier** creates order | Amount + network; QR from API payment payload — no settlement edit |
| 2 | **Merchant Owner** | Settings for matching mode / settlement — not available to Cashier |
| 3 | **Agent** | Onboard merchant concept; **cannot** create merchant payment orders |
| 4 | **Platform** | Agent list, fee tier concept (B8 stub OK pre–X-01 API) |
| 5 | **Guest** | Wrong-network warning visible on pay page |

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
| Date | |
| Attendees | |
| Blockers for M2 | |
| M1-01 client scope sign-off linked | ☐ (separate — [M1-01](Milestone-Task-List.md)) |

Record outcome on `TEAM-BOARD.md` row **M1-T05** when complete.

---

## Related

- [Phase1-Project-Plan.md](Phase1-Project-Plan.md) M1 exit  
- [M3-T09-Company-A-Handoff.md](M3-T09-Company-A-Handoff.md) — test env after M3
