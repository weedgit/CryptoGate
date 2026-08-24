# M4-05 — Test vs production environment matrix

**Owner:** Kevin. **Lives in:** integration guide §1 ([M3-02-Integration-Guide.md](M3-02-Integration-Guide.md)).  
**Unblocks:** M3-T09 (Company A test-env handoff). Deploy steps: [M4-01-Deploy-Runbook.md](M4-01-Deploy-Runbook.md).

Three logical environments. Hostnames below are **placeholders** — Company A fills real DNS when cloud accounts are ready.

| | **Local** (dev) | **Test / staging** | **Production** |
| --- | --- | --- | --- |
| Purpose | Developer machines | Company A UAT + merchant integration | Live merchant collection |
| Cloud account | Developer laptop / docker-compose | Company A **test** project | Company A **prod** project |
| `NODE_ENV` | `development` (or unset) | `production` (hardened) or `staging` | `production` |
| API base | `http://127.0.0.1:3000/v1` | `https://api-test.<client>/v1` | `https://api.<client>/v1` |
| `API_PUBLIC_BASE_URL` | `http://localhost:3000` | HTTPS test API origin | HTTPS prod API origin |
| Guest pay | `http://localhost:5173` | `https://pay-test.<client>` | `https://pay.<client>` |
| `PAYMENT_PAGE_BASE_URL` | `http://localhost:5173` | Test pay origin | Prod pay origin |
| `CORS_ALLOWED_ORIGINS` | localhost + 127.0.0.1 `:5173` | Exact test pay (+ merchant web) origins | Exact prod pay (+ merchant web) origins |
| Postgres | docker-compose `DATABASE_URL` | Managed DB **test** (separate) | Managed DB **prod** (separate) |
| Watcher | Same host, separate process | Same VPC as test API; own process | Same VPC as prod API; own process |
| `TRON_RPC_URL` | Optional / stub | TronGrid (or private) — **testnet or mainnet with tiny amounts** | Mainnet TronGrid / private node |
| `TRON_API_KEY` | Optional | Test TronGrid key | Prod TronGrid key (separate quota) |
| API keys (`cgk_…`) | Seed / `POST /api-keys` on local DB | **Test-only** keys; never reuse in prod | **Prod-only** keys; rotate via M4-11 |
| Webhook signing secrets | Local; HTTP localhost OK | HTTPS callbacks; secrets from test register | HTTPS only; secrets from prod register |
| Session cookie | `cg_session` | Same name; **Secure** + HTTPS | Same; **Secure** + HTTPS |
| `SESSION_SECRET` | `.env` local | Secret manager (test) | Secret manager (prod) — **different value** |
| Rate limits | Domain defaults | Same defaults unless tuned | Same; raise only with monitoring |
| Cashier APK | Emulator `10.0.2.2:3000/v1` | Flavor **`staging`** (`-Pcryptogate.stagingApi=…`) | Flavor **`prod`** (`-Pcryptogate.prodApi=…`) |
| Merchant web | `apps/web` Vite local | Test origin in CORS | Prod origin in CORS |
| Settlement / xPub | Dev wallets | Merchant **test** addresses | Merchant **production** addresses |
| Service bills | Stub OK | Platform billing wallet **test** | Platform billing wallet **prod** |
| Logs / PII | Verbose OK | Redact secrets; no HMAC secrets | Redact; retain per Company A policy |
| Backups | Optional | Test restore drill OK | Required (M4-03) |
| Monitoring | Optional | Basic uptime + watcher lag | Required (M4-03) |

## Hard rules (all environments)

1. **Never** copy prod API secrets, webhook secrets, or `SESSION_SECRET` into test/local.
2. **Never** point a staging APK or pay page at prod API (and vice versa).
3. Watcher stays a **separate process** from API in every env.
4. Guest `GET /orders/{id}/payment` stays public; do not require API keys on the pay page.
5. Fulfillment = signed webhooks (or signed order GET) — not browser redirect.
6. Only **USDT / tron** until Kevin enables another `ASSET_NETWORK_REGISTRY` row.

## Merchant integrator checklist

| Step | Local | Test | Prod |
| --- | --- | --- | --- |
| Base URL | `.env` / OpenAPI server | Company A test host | Company A prod host |
| Create API key | `POST /v1/api-keys` | Same on test | Same on prod (new key) |
| Register webhook | localhost HTTP allowed | HTTPS URL | HTTPS URL |
| Verify HMAC | `doc/examples/webhook-verify.mjs` | Same sample + test secret | Same sample + prod secret |
| Cashier build | debug / emulator | `staging` flavor | `prod` flavor |
| Assets | USDT tron | USDT tron | USDT tron |

## Company A fill-in (M3-T09)

When cloud DNS and TLS are ready, replace placeholders and send this table to integrators:

| Slot | Test value | Prod value |
| --- | --- | --- |
| API | `https://api-test.…/v1` | `https://api.…/v1` |
| Pay page | `https://pay-test.…` | `https://pay.…` |
| Merchant portal | `https://app-test.…` | `https://app.…` |
| Tron RPC | | |
| Support contact | | |

## Related

- Deploy / runbook: [M4-01-Deploy-Runbook.md](M4-01-Deploy-Runbook.md)
- Secrets & TLS: [M4-02-Secrets-TLS.md](M4-02-Secrets-TLS.md)
- Backup & monitoring: [M4-03-Backup-Monitoring.md](M4-03-Backup-Monitoring.md)
- Admin host & vendor access: [M4-04-Admin-Host-Vendor-Access.md](M4-04-Admin-Host-Vendor-Access.md)
- Env var catalog: repo root `.env.example`
- Cashier flavors: `doc/Cashier-Apk.md`, `apps/cashier-apk` M4-23
- Signing / webhooks: [M3-01-Signed-Api.md](M3-01-Signed-Api.md)
- M3 gate: [M3-Acceptance.md](M3-Acceptance.md)
