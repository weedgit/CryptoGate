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

Tier A runs:

- `doc/examples/api-signing-smoke.mjs` (M3-T07)
- `doc/examples/webhook-verify.mjs` (M3-T08)

Tier B adds `node scripts/check.mjs` (domain, matching §2.8, API unit tests, watcher tick, M4-12 in-process load).

Tier C adds:

- `GET {E2E_API_BASE}/health` — expect 200 + `db: ok`
- `POST /v1/service-bills/generate` — expect 401 without session
- `POST /v1/orgs/{id}/setting-overrides` — expect 401 without session
- Optional `E2E_PAYMENT_ORDER_ID` → `GET /v1/orders/{id}/payment` (public guest path)

---

## 2. Environment variables

| Variable | Purpose |
| --- | --- |
| `E2E_API_BASE` | API origin **without** `/v1` suffix, e.g. `https://api-test.example.com` |
| `E2E_PAYMENT_ORDER_ID` | Optional order UUID for guest payment smoke |
| `E2E_SKIP_CHECK` | Set `1` to skip tier B when iterating live-only |

---

## 3. CI vs staging

| Context | Recommended |
| --- | --- |
| **GitHub CI** | `node scripts/check.mjs` (already in workflow) |
| **Pre-release / Kevin gate** | `node scripts/e2e-smoke.mjs --check` |
| **Company A test env** | `--live` after M3-T09 deploy |
| **Restore drill** | Tier C after [M4-T04](M4-T04-Restore-Drill-Report.md) §2 |

---

## 4. Future extensions (not Phase 1 blockers)

- Signed `POST /v1/orders` with test API key + idempotency
- Webhook delivery to `E2E_WEBHOOK_URL` listener
- Playwright merchant login (Andrew portal) — separate package if added

---

## Related

- M3 gate: [M3-Acceptance.md](M3-Acceptance.md)  
- Integration: [M3-02-Integration-Guide.md](M3-02-Integration-Guide.md)  
- Restore: [M4-T04-Restore-Drill-Report.md](M4-T04-Restore-Drill-Report.md)
