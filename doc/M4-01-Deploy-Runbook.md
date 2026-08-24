# M4-01 — Deploy & runbook (Company A accounts)

**Owner:** Kevin (infra). **Implements:** Milestone M4-01.  
**Env matrix:** [M4-05-Env-Matrix.md](M4-05-Env-Matrix.md).  
**Follow-ons:** M4-02 secrets/TLS · M4-03 backup/monitoring · M4-04 admin host · [M4-33 ops index](M4-33-Ops-Runbook-Index.md).

See [M4-02-Secrets-TLS.md](M4-02-Secrets-TLS.md) for TLS surfaces, secret inventory, and rotation.

Phase 1 ships as **source that Company A deploys** on **Company A cloud accounts** (requirement). This runbook is the deploy scaffold — not a locked cloud vendor. Fill the placeholders when DNS/TLS/DB are provisioned.

---

## 1. Invariants (do not violate in prod)

1. **API and watcher are separate processes** — never one binary that both serves HTTP and polls the chain.  
2. **Watch-only** — no merchant spend keys, no sweeping, no signing for merchants.  
3. **Separate secrets** per local / test / prod (session, API keys, webhook secrets, Tron API key).  
4. Guest pay and cashier APK point at the **same** env’s API base — never mix staging APK → prod API.  
5. Fulfillment = **signed webhooks** (or signed order GET) — not browser redirect.

---

## 2. Processes to run

| Process | Package | Command (from repo root) | Role |
| --- | --- | --- | --- |
| Postgres | — | Managed DB in test/prod; `docker compose up -d` locally | Shared `DATABASE_URL` |
| API | `@cryptogate/api` | `pnpm --filter @cryptogate/api migrate` then `pnpm --filter @cryptogate/api start` | HTTP `/v1`, webhooks worker if enabled |
| Watcher | `@cryptogate/watcher` | `pnpm --filter @cryptogate/watcher start` | Chain ingest + match + confirmations |
| Guest pay | `@cryptogate/payment-page` | Static/Vite build behind HTTPS CDN or reverse proxy | Public pay URLs |
| Merchant web | `@cryptogate/web` | Vite build behind HTTPS | Portal (Bruce) |
| Cashier APK | `apps/cashier-apk` | Gradle **staging** / **prod** flavors | POS client only |

Node **≥ 20**. Install: `npx pnpm@9.15.0 install` then `pnpm build` as needed.

**Migrations:** always run API migrate before new routes (e.g. **017** for API keys). Watcher uses the same DB; it does not own migrations.

---

## 3. Company A provision checklist

| # | Item | Test | Prod | Owner |
| --- | --- | --- | --- | --- |
| 1 | Cloud project / account | ☐ | ☐ | Company A |
| 2 | Managed Postgres (separate instances) | ☐ | ☐ | Company A |
| 3 | Secrets manager (or sealed env) | ☐ | ☐ | Company A + Kevin note M4-02 |
| 4 | TLS certs for API + pay + portal hosts | ☐ | ☐ | Company A |
| 5 | DNS → `api-test` / `api`, `pay-test` / `pay`, portal | ☐ | ☐ | Company A (fill [M4-05](M4-05-Env-Matrix.md) slots) |
| 6 | App hosts / containers for **API** and **watcher** (two services) | ☐ | ☐ | Company A / Kevin assist |
| 7 | Outbound HTTPS for webhooks + Tron RPC | ☐ | ☐ | Company A |
| 8 | TronGrid (or private) endpoint + API key | ☐ | ☐ | Company A |
| 9 | Backup schedule + restore drill | ☐ | ☐ | [M4-03](M4-03-Backup-Monitoring.md) §2–4 |
| 10 | Uptime + watcher-lag alerts | ☐ | ☐ | [M4-03](M4-03-Backup-Monitoring.md) §5 |
| 11 | Named vendor access + admin jump host | ☐ | ☐ | [M4-04](M4-04-Admin-Host-Vendor-Access.md) |

**Terraform / IaC:** not locked to a vendor in Phase 1. When Company A picks AWS / GCP / Azure / other, add IaC under `infra/` (Kevin) as a follow-up PR. Until then, this runbook + container/VM commands are the deploy path.

---

## 4. Required env (prod-shaped)

Copy from `.env.example`. Minimum for a live USDT Tron env:

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | Managed Postgres URL (TLS preferred) |
| `API_HOST` / `API_PORT` | Bind address inside the host/container |
| `API_PUBLIC_BASE_URL` | Public HTTPS origin (no trailing path) |
| `SESSION_SECRET` | Long random; **unique per env** |
| `CORS_ALLOWED_ORIGINS` | Exact pay + portal origins |
| `PAYMENT_PAGE_BASE_URL` | Public pay origin |
| `TRON_RPC_URL` | e.g. TronGrid base URL |
| `TRON_API_KEY` | Optional but recommended for rate limits |
| `WEBHOOK_DELIVERY_ENABLED` | `1` in test/prod when delivering |
| `ORDER_EXPIRY_ENABLED` | Usually on |

Do **not** commit `.env`. Prefer secret manager injection at process start (M4-02).

---

## 5. Deploy sequence (test or prod)

Repeat per environment. Prefer test first.

```bash
# 1) Install & build on the build host (or CI artifact)
npx pnpm@9.15.0 install --frozen-lockfile
npx pnpm@9.15.0 build
node scripts/check.mjs   # contract gate

# Or one-shot local / staging-shaped deploy:
node scripts/deploy-wave5.mjs
# Company A test host: set DATABASE_URL + API_PUBLIC_BASE_URL, then same script.

# 2) Configure secrets (inject DATABASE_URL, SESSION_SECRET, …)

# 3) Migrate (API owns schema) — include 017 before /v1/api-keys
pnpm --filter @cryptogate/api migrate

# 4) Start API (systemd / container / process manager)
pnpm --filter @cryptogate/api start

# 5) Start watcher as a *second* unit (same DATABASE_URL, own restart policy)
pnpm --filter @cryptogate/watcher start

# 6) Publish payment-page + web static assets behind HTTPS
# 7) Point DNS; verify TLS
```

### Smoke after deploy

| Check | Expect |
| --- | --- |
| `GET {API}/health` (or `/v1` health route used in CI) | 200 |
| `GET {API}/v1/orders/{id}/payment` on a known order | Public JSON; no session |
| Watcher logs | Ticks without crash; Tron errors backoff |
| `POST /v1/webhooks/test` (auth) | Delivery reaches merchant HTTPS URL |
| Cashier **staging** APK → test API only | Login + create order — install per [M5-08-Cashier-Apk-Install.md](M5-08-Cashier-Apk-Install.md) |

---

## 6. Process manager sketch (systemd)

Illustrative only — adjust user/paths:

```ini
# /etc/systemd/system/cryptogate-api.service
[Service]
WorkingDirectory=/opt/cryptogate
EnvironmentFile=/etc/cryptogate/api.env
ExecStart=/usr/bin/node apps/api/src/server.mjs
Restart=always

# /etc/systemd/system/cryptogate-watcher.service
[Service]
WorkingDirectory=/opt/cryptogate
EnvironmentFile=/etc/cryptogate/watcher.env
ExecStart=/usr/bin/node apps/watcher/src/main.mjs --loop
Restart=always
```

Use **two** units. Restarting API must not stop the watcher (and vice versa).

---

## 7. Rollback

1. Stop new deploys; keep watcher running if chain lag is acceptable.  
2. Redeploy previous known-good git tag / artifact.  
3. DB migrations: **do not** auto-down; Andrew documents forward-fix if a migration must be undone.  
4. Revoke compromised API keys via `DELETE /v1/api-keys/{id}` (or rotate); rotate webhook endpoints by delete + re-register.

---

## 8. Local vs Company A

| | Local | Company A test/prod |
| --- | --- | --- |
| Postgres | `docker compose up -d` | Managed |
| Secrets | `.env` (gitignored) | Secret manager |
| TLS | Optional | Required |
| Hosts | Laptop | Company A VMs/containers |

Local compose file: repo root `docker-compose.yml` (Postgres only).

---

## 9. Handoff status

| Deliverable | Status |
| --- | --- |
| This runbook | **Done** (scaffold) |
| Env matrix | Done — M4-05 |
| IaC (`infra/`) | Pending Company A cloud choice |
| Secrets / TLS detail | Done — [M4-02-Secrets-TLS.md](M4-02-Secrets-TLS.md) |
| Backup / monitoring | Done — [M4-03-Backup-Monitoring.md](M4-03-Backup-Monitoring.md) |
| Admin host / vendor access | Done — [M4-04-Admin-Host-Vendor-Access.md](M4-04-Admin-Host-Vendor-Access.md) |
| Ops index | Done — [M4-33-Ops-Runbook-Index.md](M4-33-Ops-Runbook-Index.md) |

**M3-T09:** send [M3-T09-Company-A-Handoff.md](M3-T09-Company-A-Handoff.md) when Company A is ready; they fill §3 then Kevin assists first test deploy.
