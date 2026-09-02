# M4-02 — TLS & secrets (Company A test / prod)

**Owner:** Kevin (infra). **Depends on:** [M4-01-Deploy-Runbook.md](M4-01-Deploy-Runbook.md), [M4-05-Env-Matrix.md](M4-05-Env-Matrix.md).  
**Follow-ons:** [M4-03 backup/monitoring](M4-03-Backup-Monitoring.md) · [M4-04 admin host](M4-04-Admin-Host-Vendor-Access.md).

Company A owns cloud accounts. PaymentGate never stores merchant **spend** keys. This doc lists **platform** secrets, TLS surfaces, and rotation — not merchant wallet material.

---

## 1. TLS surfaces

| Surface | Test | Prod | Notes |
| --- | --- | --- | --- |
| Merchant API | `https://api-test.<client>/v1` | `https://api.<client>/v1` | Terminate TLS at load balancer or reverse proxy |
| Guest pay page | `https://pay-test.<client>` | `https://pay.<client>` | Static/Vite build; no API keys in browser |
| Merchant portal | `https://app-test.<client>` | `https://app.<client>` | Session cookie `cg_session` |
| Webhook **outbound** | Merchant HTTPS URL | Same | PaymentGate POSTs to merchant; their cert must be valid in prod |
| Postgres | TLS to managed DB | Same | Prefer `sslmode=require` in `DATABASE_URL` |
| Tron RPC | HTTPS TronGrid / private node | Same | `TRON_RPC_URL`; optional `TRON_API_KEY` header |

**Local dev:** HTTP on localhost is fine. **Test/prod:** HTTPS only for browser-facing hosts. Webhook register allows `http://127.0.0.1` / `localhost` only when API `NODE_ENV !== production`.

### Certificate checklist

- [ ] Auto-renew (Let's Encrypt, ACM, or corporate CA) on all public hostnames  
- [ ] HSTS on API + portal + pay (Company A policy)  
- [ ] TLS 1.2+ only; disable weak ciphers per Company A baseline  
- [ ] `API_PUBLIC_BASE_URL` and `CORS_ALLOWED_ORIGINS` use **https** origins in test/prod  
- [ ] Cashier APK flavors point at **https** API bases in test/prod (`-Ppaymentgate.stagingApi` / `prodApi`)

---

## 2. Secret inventory

| Secret | Where stored | Per-env | Never log | Rotation |
| --- | --- | --- | --- | --- |
| `SESSION_SECRET` | Secret manager → API env | **Yes** — unique local / test / prod | Yes | Rotate + invalidate sessions (planned maintenance) |
| `DATABASE_URL` (password) | Secret manager | **Yes** | Yes | DB user password rotate via managed DB |
| `TRON_API_KEY` | Watcher (+ API if shared) env | **Yes** | Yes | TronGrid key rotate in provider console |
| API key **secret** (`api_keys.secret`) | Postgres (hash at rest preferred) | Per merchant key | **Yes** — shown once on create | `POST …/rotate` or revoke + create |
| Webhook **signingSecret** | Postgres (hashed) | Per endpoint | **Yes** — once on register | Delete webhook + re-register |
| Merchant **xPub** | Postgres (watch-only public material) | Per merchant/network | Treat as sensitive config | MFA + cool-down on change |
| MFA TOTP seeds | Postgres (encrypted/hashed per Andrew) | Per user | **Yes** | User re-enroll |
| Cashier APK **release keystore** | Company A secure store; `keystore.properties` gitignored | Prod signing only | **Yes** | New keystore = new app signing key (Play sideload policy) |
| `SESSION`/cookie value | Client only | N/A | Yes | Logout / session revoke |

**Not platform secrets:** merchant settlement **private** keys, mnemonics, or spend material — merchants control wallets; PaymentGate is watch-only.

---

## 3. Injection pattern (test / prod)

1. **Do not** commit `.env` or paste secrets into tickets/chat.  
2. Store values in Company A secret manager (AWS Secrets Manager, GCP Secret Manager, Azure Key Vault, HashiCorp Vault, etc.).  
3. At process start, inject into **API** and **watcher** separately (two env files or two secret bundles).  
4. Same key names as `.env.example` — only values differ by environment.

Example layout (illustrative):

```
/etc/paymentgate/test/api.env      → SESSION_SECRET, DATABASE_URL, CORS_*, …
/etc/paymentgate/test/watcher.env  → DATABASE_URL, TRON_RPC_URL, TRON_API_KEY, …
/etc/paymentgate/prod/api.env
/etc/paymentgate/prod/watcher.env
```

Watcher needs `DATABASE_URL` and Tron vars; it must **not** receive `SESSION_SECRET` unless required (it is not today).

---

## 4. Cookie & session hardening (prod)

| Setting | Expectation |
| --- | --- |
| `cg_session` | `HttpOnly`; `Secure` when served over HTTPS; `SameSite` per Andrew implementation |
| Session TTL / revoke | `POST /v1/auth/logout` and session revoke invalidate server-side |
| Login rate limit | `RATE_LIMIT_LOGIN_PER_MINUTE` (default 10 / IP) |

---

## 5. Logging & audit

**Never log:** full `SESSION_SECRET`, API HMAC secrets, webhook signing secrets, `DATABASE_URL` passwords, MFA seeds, raw `cg_session` values, or signed webhook bodies with secrets.

**Do log (audit):** login success/fail, API key create/revoke/rotate, settlement/xPub change requests, webhook register/delete, privileged role changes — append-only audit per M1-17.

Redact `Authorization`, cookies, and `X-Api-Key` in HTTP access logs if captured.

---

## 6. Rotation playbooks

### Session secret (platform)

1. Schedule maintenance window.  
2. Set new `SESSION_SECRET` in secret manager; redeploy API.  
3. All existing sessions invalid — users re-login.  
4. Confirm Cashier APK and portals recover.

### Merchant API key

1. `POST /v1/api-keys/{id}/rotate` (Owner/Admin) — new `secret` once.  
2. Update integrator HMAC signer with new secret.  
3. Old `keyId` stops working immediately.

### Webhook signing secret

1. `DELETE /v1/webhooks/{id}`.  
2. `POST /v1/webhooks` — new `signingSecret` once.  
3. Update merchant verifier before disabling old endpoint.

### Tron API key

1. Create new key in TronGrid (or provider).  
2. Update watcher env; rolling restart watcher only.  
3. Revoke old key after traffic stable.

---

## 7. `.env.example` mapping

All variables in repo root `.env.example` are documented there. Secrets-class entries for test/prod:

- `SESSION_SECRET`
- `DATABASE_URL` (contains password)
- `TRON_API_KEY`
- Merchant-provisioned keys live in DB after `POST /v1/api-keys`, not in platform env.

Non-secret config (safe in plain env): `API_HOST`, `API_PORT`, `CORS_ALLOWED_ORIGINS`, rate-limit integers, poll intervals, `WEBHOOK_DELIVERY_ENABLED`, etc.

---

## 8. Handoff checklist (Company A)

| # | Item | Test | Prod |
| --- | --- | --- | --- |
| 1 | TLS certs live on API / pay / portal | ☐ | ☐ |
| 2 | Secret manager populated; no secrets in git | ☐ | ☐ |
| 3 | Test and prod use **different** `SESSION_SECRET` and DB | ☐ | ☐ |
| 4 | `CORS_ALLOWED_ORIGINS` matches exact HTTPS origins | ☐ | ☐ |
| 5 | Watcher has Tron URL + key; no session secret | ☐ | ☐ |
| 6 | APK **staging** → test API only; **prod** → prod API | ☐ | ☐ |
| 7 | Log redaction policy agreed | ☐ | ☐ |

---

## Related

- Deploy sequence: [M4-01-Deploy-Runbook.md](M4-01-Deploy-Runbook.md)  
- Env matrix: [M4-05-Env-Matrix.md](M4-05-Env-Matrix.md)  
- API signing: [M3-01-Signed-Api.md](M3-01-Signed-Api.md)  
- API keys: [M4-11-Api-Keys.md](M4-11-Api-Keys.md)
