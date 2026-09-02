# M4-04 — Admin host & vendor access

**Owner:** Kevin (infra). **Implements:** Milestone M4-04.  
**Depends on:** [M4-01-Deploy-Runbook.md](M4-01-Deploy-Runbook.md), [M4-02-Secrets-TLS.md](M4-02-Secrets-TLS.md), [M4-03-Backup-Monitoring.md](M4-03-Backup-Monitoring.md).  
**Follow-ons:** M4-33 ops runbook index · M4-30 platform portal (Andrew).

Phase 1 deploys on **Company A cloud accounts**. Company B (PaymentGate engineering) may need time-bound access for deploy assist and incident response. This doc separates **public product surfaces** from **infrastructure admin paths**, and requires **named, logged** vendor access — not shared root passwords.

---

## 1. Two “admin” surfaces (do not conflate)

| Surface | Who | How | Logged in |
| --- | --- | --- | --- |
| **Platform portal** | Platform Owner / Administrator / Viewer | HTTPS `app.<client>` — session + MFA | `audit_log` (login, privileged API actions) |
| **Merchant / agent portals** | Respective org roles | HTTPS same host, scoped by org | `audit_log` |
| **Ops / jump host** | Company A ops + named Company B engineers | SSH (or SSM Session Manager) via bastion only | Cloud audit + OS auth logs (+ optional session record) |
| **Managed Postgres** | App services only | Private network; TLS `DATABASE_URL` | Provider audit log |
| **Secret manager** | API/watcher IAM roles at runtime | No human standing access in prod | Provider audit log |

**Platform administration** (agents, fee tiers, audit review — UI spec B1–B17) is **application auth**, not SSH. Operators use the portal; engineers use the jump host only when deploy or break-glass requires shell access.

---

## 2. Network layout (test / prod)

```
                    Internet
                        │
          ┌─────────────┼─────────────┐
          │             │             │
     pay / app      api HTTPS    (no SSH)
     (static CDN)   (public LB)
                        │
                 private subnet
          ┌─────────────┼─────────────┐
          │             │             │
      API host     watcher host   managed Postgres
      (no public IP) (no public IP) (private endpoint)
          ▲             ▲
          └────── SSH only via ──────┘
                        │
                 admin jump host
              (bastion / SSM gateway)
                        │
                   VPN or IP allowlist
                        │
              Company A ops / named vendor
```

### Rules

1. **API, watcher, and Postgres** have **no inbound SSH/HTTP from the public internet** except the API load balancer on 443.  
2. **Guest pay** and **merchant web** are static assets — no shell on those hosts in prod if served from object storage + CDN.  
3. **One jump host per environment** (test + prod) — or managed equivalent (AWS SSM, GCP IAP, Azure Bastion).  
4. **Separate VPC / project** for test vs prod (M4-05).  
5. Outbound from app tier: HTTPS to Tron RPC, merchant webhooks, secret manager — default deny otherwise (Company A firewall policy).

---

## 3. Admin jump host

### Purpose

- Deploy artifacts (`git pull`, `pnpm`, systemd restart)  
- Run `pnpm --filter @paymentgate/api migrate`  
- Tail watcher/API logs during incidents  
- Run read-only SQL from [monitoring-queries.sql](examples/monitoring-queries.sql) via `psql` **when approved**

### Hardening checklist

| Control | Test | Prod |
| --- | --- | --- |
| Dedicated small VM or managed bastion | ☐ | ☐ |
| MFA for human login (SSO or TOTP) | ☐ | ☐ |
| No shared accounts (`ubuntu` password login disabled) | ☐ | ☐ |
| SSH key or certificate per named user | ☐ | ☐ |
| `AllowUsers` / IAM policy lists named principals only | ☐ | ☐ |
| Auto-patching / image updates | ☐ | ☐ |
| No `DATABASE_URL` or `SESSION_SECRET` stored on disk long-term | ☐ | ☐ |
| sudo logged (`/var/log/auth.log` or journal) | ☐ | ☐ |

Prefer **session-based** access (SSM Session Manager, IAP) over long-lived SSH keys where Company A standard allows — sessions are easier to audit and revoke.

---

## 4. Named vendor access (Company B)

Contract: deploy on **Company A accounts** ([Phase1-Requirement.md](Phase1-Requirement.md) §3.6). Vendor access is **exception-based**, not standing prod root.

### 4.1 Register named individuals

Maintain a table (Company A ticket or internal access register):

| Field | Example |
| --- | --- |
| Full name | |
| Company | Company B — PaymentGate |
| Role | Kevin (infra) / Andrew (API) / Bruce (watcher) |
| Environments | test only / test + prod break-glass |
| Access method | SSO group `paymentgate-vendor-test` or SSH key fingerprint |
| Approver | Company A security / platform owner |
| Valid from / until | Ticket-linked expiry |
| Last review | Quarterly |

**No** shared `vendor@paymentgate` login. **No** embedding Company B credentials in merchant APK, payment page, or API images.

### 4.2 Default posture by environment

| Env | Company B access | Notes |
| --- | --- | --- |
| **Local** | Full on developer laptop | `.env` gitignored |
| **Test** | Jump host + read-only DB role optional | Primary integration / UAT assist |
| **Prod** | Break-glass only — ticket + Company A approver | Prefer Company A ops executes runbook; vendor guides on call |

Prod secrets ([M4-02](M4-02-Secrets-TLS.md)): vendor engineers **must not** copy prod `SESSION_SECRET`, `DATABASE_URL`, or Tron keys to laptops or chat. Use secret manager injection on hosts Company A controls.

### 4.3 Offboarding

1. Remove SSH key / disable SSO group membership **same day** as contract end or person change.  
2. Rotate any break-glass credential the person could have seen (if applicable).  
3. Review cloud audit trail for activity 30 days prior.

---

## 5. Logging (infra + application)

Infra access logs **complement** — they do not replace — application `audit_log`.

### 5.1 Infrastructure (Company A enables)

| Source | Minimum retention | Use |
| --- | --- | --- |
| Cloud audit (API calls, IAM, console login) | 90 days | Who changed security groups, secrets, snapshots |
| VPC / firewall flow logs | 30 days | Unexpected ingress to private subnet |
| Jump host `auth.log` / sudo | 90 days | SSH session start/end, user, source IP |
| Load balancer access logs | 30 days | Abuse, scan patterns (no secret headers logged) |
| Postgres provider audit | Match backup policy | DDL, failed auth, superuser use |
| Optional: SSH session recording | Per policy | Forensics for break-glass |

**Redact** cookies, `Authorization`, and API HMAC headers in HTTP logs (M4-02 §5).

### 5.2 Application `audit_log` (Andrew — M1-17)

Append-only Postgres table; privileged **product** actions, e.g.:

- `login`, `logout`, MFA events  
- `settlement_put`, `xpub_put`, `matching_mode_put`  
- `webhook_register`, `webhook_delete`  
- `api_key_create`, `api_key_revoke`, `api_key_rotate`  
- `org_create`, `org_user_invite`, `org_user_role`  
- `service_bill_issue`

Platform Owner reviews via portal (M4-30). **Vendor SSH is not written to `audit_log`** — use infra logs above.

Example review query (read-only):

```sql
SELECT created_at, action, actor_user_id, org_id, metadata
FROM audit_log
ORDER BY created_at DESC
LIMIT 100;
```

---

## 6. Access matrix (summary)

| Action | Public internet | Merchant user | Platform portal | Company A ops | Company B vendor |
| --- | --- | --- | --- | --- | --- |
| Pay guest page | ✓ | — | — | — | — |
| Merchant API (HMAC) | ✓ | ✓ (integrator) | — | — | — |
| Portal login | ✓ | ✓ | ✓ (platform role) | ✓ | ✓ (if given user) |
| SSH to API/watcher | ✗ | ✗ | ✗ | via jump | via jump (named) |
| Postgres direct | ✗ | ✗ | ✗ | private + IAM | test only or break-glass |
| Secret manager read | ✗ | ✗ | ✗ | ✓ | test / ticketed prod |
| Backup restore | ✗ | ✗ | ✗ | ✓ | assist only ([M4-03](M4-03-Backup-Monitoring.md)) |

---

## 7. Break-glass procedure

When prod is down and Company B must assist:

1. Company A opens **incident ticket**; names approver and window.  
2. Grant **temporary** jump access to named engineer(s) — max 24 h unless extended in writing.  
3. Engineer connects; actions logged; no secret export off-host.  
4. Changes via runbook ([M4-01](M4-01-Deploy-Runbook.md), [M4-03](M4-03-Backup-Monitoring.md)) — prefer rolling restart over manual DB edits.  
5. Access revoked at end of window; post-incident summary to Company A.

---

## 8. Company A handoff checklist

| # | Item | Test | Prod |
| --- | --- | --- | --- |
| 1 | Private subnets for API, watcher, Postgres | ☐ | ☐ |
| 2 | Jump host or SSM/IAP equivalent | ☐ | ☐ |
| 3 | Named vendor register started | ☐ | ☐ |
| 4 | MFA on jump / cloud console | ☐ | ☐ |
| 5 | Cloud + SSH audit logging enabled | ☐ | ☐ |
| 6 | No shared vendor password | ☐ | ☐ |
| 7 | Prod break-glass policy agreed | ☐ | ☐ |
| 8 | Platform portal uses HTTPS + session (not SSH) | ☐ | ☐ |

---

## 9. Handoff status

| Deliverable | Status |
| --- | --- |
| Network + jump host scaffold | **Done** (this doc) |
| Named vendor register template | **Done** (§4.1) |
| Logging requirements | **Done** (§5) |
| Vendor-specific IaC (security groups, bastion module) | Pending Company A cloud choice |

---

## Related

- Deploy: [M4-01-Deploy-Runbook.md](M4-01-Deploy-Runbook.md)  
- Secrets: [M4-02-Secrets-TLS.md](M4-02-Secrets-TLS.md)  
- Backup access: [M4-03-Backup-Monitoring.md](M4-03-Backup-Monitoring.md)  
- Env isolation: [M4-05-Env-Matrix.md](M4-05-Env-Matrix.md)  
- Roles / platform ops: [Business-Model.md](Business-Model.md)  
- Platform UI: [UI-Page-Spec.md](UI-Page-Spec.md) B17 system health
