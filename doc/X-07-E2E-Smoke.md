# X-07 — E2E integration smoke suite

**Owner:** Kevin. **Milestone:** X-07 ([Milestone-Task-List.md](Milestone-Task-List.md)).  
**Runner:** `scripts/e2e-smoke.mjs` · root `pnpm run e2e`

Layered smoke for Phase 1: **offline samples** (always), **contract gate** (CI), optional **live API** when staging is up. Not a browser E2E framework — HTTP + script orchestration only.

---

## 1. Tiers

| Tier | Command | Needs |
| --- | --- | --- |
| **A — samples** | `node scripts/e2e-smoke.mjs` | Node 20+ only |
| **B — contract** | `node scripts/e2e-smoke.mjs --check` | + `pnpm install`, TypeScript |
| **C — live API** | `E2E_API_BASE=https://api-test.example node scripts/e2e-smoke.mjs --live` | Running API + TLS |
| **C+ machine** | same + `E2E_API_KEY_ID` / `E2E_API_SECRET` | Merchant API key (mint locally below) |

Tier A runs:

- `doc/examples/api-signing-smoke.mjs` (M3-T07)
- `doc/examples/webhook-verify.mjs` (M3-T08)

Tier B adds `node scripts/check.mjs` (domain, matching §2.8, API unit tests, watcher tick, M4-12 in-process load).

Tier C adds:

- `GET {E2E_API_BASE}/health` — expect 200 + `db: ok`
- `POST /v1/service-bills/generate` — expect 401 without session
- `POST /v1/orgs/{id}/setting-overrides` — expect 401 without session
- `POST /v1/orders` without session/key — expect 401
- Optional `E2E_PAYMENT_ORDER_ID` → `GET /v1/orders/{id}/payment` (public guest path)

**C+ machine** (when key env set — `scripts/e2e-live-machine.mjs`):

1. Signed `POST /v1/orders` (HMAC + `Idempotency-Key`) → 201  
2. Guest `GET /v1/orders/{id}/payment`  
3. Ephemeral webhook listener on `127.0.0.1`  
4. Signed register + `POST /v1/webhooks/test` → delivery verified (HMAC)  
5. Disable webhook  

Local mint (prints exports; **do not commit** secrets):

```bash
node scripts/e2e-mint-api-key.mjs
# eval the exported lines, then:
E2E_API_BASE=http://127.0.0.1:3000 node scripts/e2e-smoke.mjs --live
```

---

## 2. Environment variables

| Variable | Purpose |
| --- | --- |
| `E2E_API_BASE` | API origin **without** `/v1` suffix, e.g. `https://api-test.example.com` |
| `E2E_PAYMENT_ORDER_ID` | Optional order UUID for guest payment smoke |
| `E2E_API_KEY_ID` / `E2E_API_SECRET` | Optional machine HMAC for signed create + webhook |
| `E2E_ORDER_AMOUNT` | Optional create amount (default `1.01`) |
| `E2E_WEBHOOK_WAIT_MS` | Max wait for delivery worker (default `20000`) |
| `E2E_SKIP_CHECK` | Set `1` to skip tier B when iterating live-only |

---

## 3. CI vs staging

| Context | Recommended |
| --- | --- |
| **GitHub CI** | `node scripts/check.mjs` (already in workflow) |
| **Pre-release / Kevin gate** | `node scripts/e2e-smoke.mjs --check` |
| **Company A test env** | `--live` after M3-T09 deploy; add machine keys from secret manager |
| **Restore drill** | Tier C after [M4-T04](M4-T04-Restore-Drill-Report.md) §2 |

---

## 4. Out of scope (optional later)

- Playwright merchant login (Andrew portal) — separate package if added  
- Full on-chain pay → Completed in CI (needs funded test wallet)

---

## Related

- M3 gate: [M3-Acceptance.md](M3-Acceptance.md)  
- Integration: [M3-02-Integration-Guide.md](M3-02-Integration-Guide.md)  
- Restore: [M4-T04-Restore-Drill-Report.md](M4-T04-Restore-Drill-Report.md)
