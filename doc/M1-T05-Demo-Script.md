# M1-T05 — Demo script (prototype walkthrough)

**Owner:** Kevin. **Checklist:** [M1-T05-Prototype-Walkthrough.md](M1-T05-Prototype-Walkthrough.md).  
**Print URLs:** `node scripts/demo-walkthrough.mjs`

30-minute internal or client walkthrough. No live chain required for sections 1–4; section 5 optional with local API.

---

## 0. Prep (5 min)

```bash
# Terminal A — guest pay (port 5173)
npx pnpm@9.15.0 --filter @cryptogate/payment-page dev

# Terminal B — optional API + DB for live poll
docker compose up -d postgres
node apps/api/scripts/migrate.mjs   # through 018+
node apps/api/src/server.mjs

# Print demo URLs
node scripts/demo-walkthrough.mjs
```

Ensure `CORS_ALLOWED_ORIGINS` in `.env` includes `http://localhost:5173` and/or `http://127.0.0.1:5173` if demoing live poll.

---

## 1. Guest payment page (8 min)

Open each URL; narrate **wrong-network warning**, **exact-pay (Mode C)**, **status** labels (never “Paid”).

| Demo | URL |
| --- | --- |
| Default Tron pending | `http://localhost:5173/?network=tron&amount=245.00&state=pending` |
| Mode C exact amount | `http://localhost:5173/?mode=C&amount=245.01&state=pending` |
| Verifying | `http://localhost:5173/?state=verifying` |
| Completed | `http://localhost:5173/?state=completed` |
| Payment anomaly | `http://localhost:5173/?state=anomaly` |
| Expired | `http://localhost:5173/?state=expired` |
| Ethereum preview (pre-enable) | `http://localhost:5173/?network=ethereum&asset=USDT&state=pending` |

**Talking points:** Polls API only (`GET /v1/orders/{id}/payment`); no chain RPC from browser; custody line on page.

---

## 2. Cashier POS wireframe (5 min)

| Surface | URL |
| --- | --- |
| POS layout | `http://localhost:5173/pos/index.html` |

**Talking points:** Same payment payload as guest page; APK is API client only (M5-08 install doc).

---

## 3. Portal map (5 min)

Walk `doc/UI-Handoff.md` — four portals:

| Portal | Routes (examples) |
| --- | --- |
| Platform | `/platform/agents`, `/platform/settings/fee-tiers` (B8) |
| Agent | `/agent/merchants/new` (C6 commercial) |
| Merchant | `/merchant/orders`, `/merchant/settings/settlement` (D11) |
| Cashier | `/cashier` (D17) — no settlement |

Show `apps/web` locally if Andrew/Bruce dev servers are up; otherwise Figma / handoff doc is enough for M1-T05.

---

## 4. Architecture (5 min)

Use [M1-T05-Prototype-Walkthrough.md](M1-T05-Prototype-Walkthrough.md) §3 plus:

- Open `packages/api-spec/openapi.yaml` — separate `/orders` vs `/service-bills`
- `node scripts/e2e-smoke.mjs` — signing + webhook samples (M3-T07/T08)
- Watcher separate process: `node apps/watcher/src/main.mjs --once`

---

## 5. Optional live path (7 min)

If API + cashier test user exist:

1. Create order (Cashier session or `POST /v1/orders`).
2. Open `http://localhost:5173/pay/{orderId}` — live poll.
3. Show 403 if Cashier hits settlement endpoint (curl or portal).

---

## 6. Sign-off

Complete §4 in [M1-T05-Prototype-Walkthrough.md](M1-T05-Prototype-Walkthrough.md); update Wave 5 in [Phase1-Implementation-Plan.md](Phase1-Implementation-Plan.md).

**Note:** M1-01 client written sign-off is separate — do not conflate with this internal demo.

---

## Related

- [Phase1-Project-Plan.md](Phase1-Project-Plan.md) M1 exit  
- [M5-08-Cashier-Apk-Install.md](M5-08-Cashier-Apk-Install.md)
