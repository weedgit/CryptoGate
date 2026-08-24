# M3-T09 — Company A test environment handoff

**Owner:** Kevin. **Milestone:** M3-T09 ([Milestone-Task-List.md](Milestone-Task-List.md)).  
**Depends on:** Company A cloud accounts, DNS, TLS, managed Postgres.  
**Unblocks:** UAT, merchant integration on test, M4-T04 restore drill, M4-40 pilot prep.

Phase 1 deploys on **Company A accounts** (requirement). This pack is what Kevin sends when Company A is ready to stand up **test/staging** first — prod follows the same pattern with separate secrets.

---

## 1. Document bundle (attach or link)

| Doc | Purpose |
| --- | --- |
| [M4-05-Env-Matrix.md](M4-05-Env-Matrix.md) | Test vs prod matrix + hostname fill-in table |
| [M4-01-Deploy-Runbook.md](M4-01-Deploy-Runbook.md) | Deploy sequence, processes, rollback |
| [M4-02-Secrets-TLS.md](M4-02-Secrets-TLS.md) | TLS surfaces, secret inventory, rotation |
| [M4-03-Backup-Monitoring.md](M4-03-Backup-Monitoring.md) | Backups, restore drill, alerts |
| [M4-04-Admin-Host-Vendor-Access.md](M4-04-Admin-Host-Vendor-Access.md) | Jump host, named vendor access |
| [M4-33-Ops-Runbook-Index.md](M4-33-Ops-Runbook-Index.md) | Daily ops map |
| [M3-02-Integration-Guide.md](M3-02-Integration-Guide.md) | Merchant API, signing, webhooks |
| [M3-03-Webhook-Verify-Example.md](M3-03-Webhook-Verify-Example.md) | Webhook HMAC sample |
| [M4-36-Audit-Bills-v032.md](M4-36-Audit-Bills-v032.md) | OpenAPI v0.3.2 (audit + bill PATCH) |
| [X-01-Fee-Tiers-v033.md](X-01-Fee-Tiers-v033.md) | OpenAPI v0.3.3 fee tiers |
| [M5-08-Cashier-Apk-Install.md](M5-08-Cashier-Apk-Install.md) | POS sideload / MDM / checksum |
| Repo | Delivered source — `main` branch, tag TBD at release |

Repo root: `.env.example` (variable catalog).

---

## 2. Email template (Kevin → Company A)

Copy, adjust `[brackets]`, send when their cloud project is ready.

---

**Subject:** CryptoGate Phase 1 — test environment provisioning checklist

Hi [Company A contact],

Phase 1 source is ready for deployment to your **test/staging** cloud account. CryptoGate runs as **two processes** (HTTP API + chain watcher), shared Postgres, and static guest pay / portal frontends — see the runbook below.

**Please confirm or fill in** the hostname and infrastructure table (§3). Once DNS and TLS are live, we will assist with the first test deploy and smoke checks.

**Hard rules**

- Test and production use **separate** cloud projects, databases, and secrets.
- Do not point staging Cashier APK or pay pages at production API (or vice versa).
- Platform is **watch-only** — no merchant spend keys on our servers.

**Attachments / links**

- Environment matrix: `doc/M4-05-Env-Matrix.md`
- Deploy runbook: `doc/M4-01-Deploy-Runbook.md`
- Secrets & TLS: `doc/M4-02-Secrets-TLS.md`
- Integration guide (merchants): `doc/M3-02-Integration-Guide.md`

**We need from you**

1. Completed §3 table (test column minimum; prod when scheduled)
2. Named ops contact + break-glass policy for vendor assist ([M4-04](M4-04-Admin-Host-Vendor-Access.md))
3. TronGrid (or private Tron) endpoint + API key for **test**
4. Confirmation that managed Postgres backups are enabled on test ([M4-03](M4-03-Backup-Monitoring.md))

**After you reply**, we schedule a deploy window: migrate DB (through **018**; **019** when X-01 fee-tier API lands), start API + watcher, run smoke (health, sample order, webhook test). Staging Cashier APK install: [M5-08](M5-08-Cashier-Apk-Install.md).

Regards,  
[Kevin / Company B]

---

## 3. Company A fill-in table

Return this completed for **test** (prod column optional until cutover).

| Slot | Test value | Prod value (later) |
| --- | --- | --- |
| Cloud provider / project ID | | |
| API public URL | `https://api-test.…/v1` | `https://api.…/v1` |
| `API_PUBLIC_BASE_URL` (no `/v1`) | | |
| Guest pay origin | `https://pay-test.…` | `https://pay.…` |
| Merchant + platform portal origin | `https://app-test.…` | `https://app.…` |
| `CORS_ALLOWED_ORIGINS` (exact list) | | |
| Postgres host (managed) | | |
| Secret manager in use | | |
| Tron RPC URL | | |
| Tron API key name / rotation contact | | |
| TLS cert provider | | |
| Jump host / SSM access | | |
| On-call / alert email | | |
| Support contact for integrators | | |

**Migrations:** API owns schema — run through **`018`** before v0.3.2 audit/bill routes; **`019`** for v0.3.3 fee tiers. **`017`** required before API keys.

---

## 4. Company A provisioning checklist (test)

| # | Item | Test ☐ | Owner |
| --- | --- | --- | --- |
| 1 | Cloud project created (separate from prod) | | Company A |
| 2 | Managed Postgres provisioned | | Company A |
| 3 | Secret manager populated (`SESSION_SECRET`, `DATABASE_URL`, Tron key) | | Company A |
| 4 | TLS on API, pay, portal hostnames | | Company A |
| 5 | DNS records live | | Company A |
| 6 | Two app hosts or containers (API + watcher) | | Company A |
| 7 | Outbound HTTPS (webhooks, Tron) allowed | | Company A |
| 8 | Backup schedule on test DB | | Company A |
| 9 | Uptime probe on `GET /health` | | Company A |
| 10 | Jump host + named vendor register | | Company A |

Detail: [M4-01](M4-01-Deploy-Runbook.md) §3, [M4-03](M4-03-Backup-Monitoring.md), [M4-04](M4-04-Admin-Host-Vendor-Access.md).

---

## 5. Kevin / Andrew — first deploy after fill-in

Repeat per [M4-01](M4-01-Deploy-Runbook.md) §5 on **test** only.

| Step | Action | Pass |
| --- | --- | --- |
| 1 | Inject secrets; **never** commit `.env` | |
| 2 | `pnpm install --frozen-lockfile && pnpm build && pnpm check` | CI green |
| 3 | `pnpm --filter @cryptogate/api migrate` (≥ **018**) | no error |
| 4 | Start **API** then **watcher** (two units) | |
| 5 | Publish pay page + web static assets behind HTTPS | |
| 6 | `GET {API}/health` | 200, `db: ok` |
| 7 | Platform login → create test merchant / order | |
| 8 | Guest pay URL loads; polls `GET …/payment` | |
| 9 | `POST /v1/webhooks/test` (auth) | delivery OK |
| 10 | Watcher ticks in logs | JSON lines |
| 11 | Update [M4-05](M4-05-Env-Matrix.md) §Company A fill-in with real URLs | |
| 12 | Send integrators test base URL + [M3-02](M3-02-Integration-Guide.md) | |
| 13 | Mark M3-T09 **done** on [TEAM-BOARD.md](../TEAM-BOARD.md) | |

Optional: run [monitoring-queries.sql](examples/monitoring-queries.sql) after 24h uptime.

---

## 6. Merchant integrator one-liner (after test is live)

When §3 test URLs are final, send integrators:

> **CryptoGate test API:** `{API}/v1`  
> **Signing / webhooks:** `doc/M3-02-Integration-Guide.md`  
> **Verify sample:** `doc/examples/webhook-verify.mjs`  
> **Assets:** USDT on Tron only (`doc/M3-04-Asset-Networks.md`)  
> Create keys on test via `POST /v1/api-keys` — do not reuse prod keys.

---

## 7. Handoff status

| Deliverable | Status |
| --- | --- |
| This pack + email template | **Done** |
| Company A filled §3 table | **Pending** client |
| First test deploy smoke | **Pending** DNS/TLS/DB |
| M3-T09 acceptance | **Pending** §5 complete |

---

## Related

- M3 acceptance gate: [M3-Acceptance.md](M3-Acceptance.md)  
- Contract freeze: [CONTRACT-FREEZE.md](CONTRACT-FREEZE.md) (OpenAPI **v0.3.2**)
