# M4-03 — DB backup, restore & monitoring alerts

**Owner:** Kevin (infra). **Implements:** Milestone M4-03.  
**Depends on:** [M4-01-Deploy-Runbook.md](M4-01-Deploy-Runbook.md), [M4-05-Env-Matrix.md](M4-05-Env-Matrix.md).  
**Follow-ons:** M4-04 admin host · M4-33 ops polish · M4-T04 restore drill sign-off.

Company A owns cloud accounts. This doc defines **what to back up**, **how to restore**, and **which alerts to wire** for test and prod. It does not lock a monitoring vendor — use Company A standard (CloudWatch, Datadog, Grafana, UptimeRobot, PagerDuty, etc.).

---

## 1. Scope

| Component | Stateful? | Backup / monitor |
| --- | --- | --- |
| **Postgres** | **Yes** — orders, orgs, webhooks, audit, API keys (hashed), Mode S pool | Automated snapshots + PITR; restore drill |
| API process | No | Uptime probe on `GET /health` |
| Watcher process | No | Process uptime + JSON tick logs |
| Guest pay / merchant web | Static build | Redeploy from git; no DB |
| Secret manager | Outside DB | M4-02 — not restored from Postgres dump |

**Invariant:** API and watcher share one Postgres but run as **separate processes**. During restore, stop both before pointing at a restored database to avoid split-brain writes.

---

## 2. Backup strategy

### 2.1 Test and production (managed Postgres)

Use the cloud provider’s **managed Postgres** backup features (RDS, Cloud SQL, Azure Database for PostgreSQL, etc.):

| Control | Test | Prod | Notes |
| --- | --- | --- | --- |
| Automated snapshots | Daily minimum | Daily + continuous if offered | Separate instances per env (M4-05) |
| Point-in-time recovery (PITR / WAL) | Enable if available | **Required** | Lowers RPO below daily snapshot |
| Encryption at rest | Provider default | Provider default | |
| Retention | 7 days (minimum) | 14–30 days (Company A policy) | Include compliance hold if needed |
| Cross-region copy | Optional | Recommended for prod DR | Company A choice |
| Access to backups | Named ops roles only | Same + break-glass | M4-04 vendor access |

**Targets (fill with Company A SLA):**

| Metric | Suggested starting point |
| --- | --- |
| **RPO** (max data loss) | ≤ 15 min with PITR; ≤ 24 h with snapshots only |
| **RTO** (time to restore service) | ≤ 4 h for full DB restore + smoke |

### 2.2 Logical backup (optional supplement)

Use for migration between providers, pre-migration safety, or offline archive. **Not** a substitute for managed PITR in prod.

```bash
# From a host that can reach Postgres (TLS URL from secret manager)
export DATABASE_URL='postgresql://user:pass@host:5432/cryptogate?sslmode=require'

pg_dump "$DATABASE_URL" \
  --format=custom \
  --no-owner \
  --file="cryptogate-$(date +%Y%m%d-%H%M)-${ENV}.dump"

# Verify archive (does not restore)
pg_restore --list "cryptogate-*.dump" | head
```

Store `.dump` files in encrypted object storage; **never** commit dumps to git.

### 2.3 Local development

Docker Compose volume `cryptogate_pgdata` holds dev data only. Optional before destructive experiments:

```bash
docker compose exec -T postgres pg_dump -U cryptogate -d cryptogate -Fc > /tmp/cryptogate-local.dump
```

---

## 3. Data that must survive restore

Restoring Postgres must preserve:

- **Payment orders** — status, receive address, tx hash, matching mode, amounts  
- **Webhook** endpoints, deliveries, and outbox (pending retries may resume)  
- **`audit_log`** — append-only; required for compliance review  
- **Org tree**, users, sessions (users re-login if `SESSION_SECRET` rotated separately)  
- **API keys** — hashed secrets at rest; plaintext secrets are **not** recoverable from DB  
- **Mode S HD pool** slot state (`FREE` / `IN_USE` / `COOLDOWN`)  
- **Schema version** — Andrew’s migrations under `apps/api/migrations/`

After restore, **reconcile chain state**: watcher will re-poll Tron for open/verifying orders. Do not mark orders Completed manually without on-chain evidence.

---

## 4. Restore procedures

### 4.1 Test restore drill (M4-T04)

Run **at least once** in the **test** environment before prod go-live. Record elapsed time and issues.

| Step | Action |
| --- | --- |
| 1 | Announce drill window; no prod impact |
| 2 | Capture baseline: `GET {API}/health` → `db: ok`; note max migration file (e.g. `017_*`) |
| 3 | Create backup: provider snapshot **or** `pg_dump` (§2.2) |
| 4 | **Stop** API and watcher (`systemd stop` or scale to 0) |
| 5 | Restore to a **new** test DB instance **or** in-place per provider runbook |
| 6 | Update test `DATABASE_URL` in secret manager if hostname changed |
| 7 | `pnpm --filter @cryptogate/api migrate` — idempotent forward-only |
| 8 | Start watcher, then API |
| 9 | Smoke (§4.3) + run [monitoring queries](examples/monitoring-queries.sql) |
| 10 | File drill report: RTO achieved, gaps, owner sign-off |

**Pass criteria:** health OK, sample order readable, pending webhook count stable, watcher ticks without crash.

### 4.2 Production emergency restore

1. **Incident commander** (Company A) declares DB restore.  
2. **Stop API and watcher** immediately.  
3. Restore Postgres via **PITR to incident time** or latest clean snapshot (provider console / CLI).  
4. If restored to a **new** endpoint, update prod `DATABASE_URL`; redeploy API + watcher.  
5. Run `migrate` once (handles any drift if restore predates a migration deploy).  
6. Start **watcher first**, then **API** (chain catch-up before new HTTP traffic if possible).  
7. Execute smoke + monitoring queries; watch webhook backlog and orders stuck in `verifying`.  
8. Post-incident: audit log review, merchant comms if order visibility was affected, update runbook.

**Do not** restore a prod snapshot into the test app (or vice versa) — secrets and merchant keys must stay env-isolated (M4-05).

### 4.3 Smoke after any restore

| Check | Expect |
| --- | --- |
| `GET {API}/health` | HTTP 200; `"status":"ok"`; `"db":"ok"` |
| `SELECT id FROM schema_migrations ORDER BY applied_at DESC LIMIT 1` | Matches latest file in `apps/api/migrations/` |
| Watcher stdout | JSON tick every `WATCHER_POLL_INTERVAL_MS` (default 5s) |
| `POST /v1/webhooks/test` (auth) | Delivery reaches merchant HTTPS URL |
| Open orders | Count matches pre-restore sanity sample |

CLI health (no HTTP): `node apps/api/src/health.mjs` — use only when API process is down but you need a local stub check.

### 4.4 Local Docker restore (developers)

```bash
docker compose stop postgres
docker volume rm cryptogate_pgdata   # destructive
docker compose up -d postgres
# wait for healthy
pg_restore --dbname="postgresql://cryptogate:cryptogate@127.0.0.1:5432/cryptogate" \
  --no-owner --clean --if-exists /tmp/cryptogate-local.dump
pnpm --filter @cryptogate/api migrate
```

---

## 5. Monitoring surfaces

Phase 1 does not ship a bundled APM product. Company A wires probes and log alerts against the signals below.

### 5.1 API HTTP probe

**Endpoint:** `GET {API_PUBLIC_BASE_URL}/health`  
**Interval:** 60s (30s prod optional)  
**Pass:** HTTP 200 and JSON:

```json
{
  "service": "cryptogate-api",
  "status": "ok",
  "db": "ok",
  "timestamp": "…"
}
```

**Fail / alert:**

- Non-200 or timeout (3 consecutive → page)  
- `"status":"degraded"` or `"db":"error"` → **P1** (DB connectivity)  
- `"db":"skipped"` only acceptable when `DATABASE_URL` intentionally unset (not prod)

Implementation: `apps/api/src/health-payload.mjs` runs `SELECT 1` when `checkDb: true` on HTTP.

### 5.2 Process health (API + watcher)

| Signal | Source | Alert if |
| --- | --- | --- |
| API unit running | systemd / k8s / container orchestrator | not `active` / restarts > 3 in 15 min |
| Watcher unit running | same | not `active` / restarts > 3 in 15 min |
| Two separate units | M4-01 | either dependency missing |

### 5.3 Watcher lag and chain ingest (log-based)

Watcher emits **one JSON line per tick** to stdout (`apps/watcher/src/loop.mjs`).

Example tick fields:

```json
{
  "service": "cryptogate-watcher",
  "tick": 42,
  "at": "2026-08-24T16:00:00.000Z",
  "pollIntervalMs": 5000,
  "chain": { "tron": { "mode": "trongrid", "ok": true } },
  "ingest": {
    "mode": "match+confirm",
    "ingestError": null,
    "openOrders": 3
  }
}
```

| Alert | Severity | Condition (tune to env) |
| --- | --- | --- |
| Watcher silent | **P1** | No line with `"service":"cryptogate-watcher"` and `"tick":` for **> 2 ×** (`WATCHER_POLL_INTERVAL_MS` + 30s backoff budget) — default **~2 min** |
| Ingest error | **P2** | `"ingest":{"mode":"error"` or `"ingestError":` non-null sustained 5 min |
| RPC backoff storm | **P2** | `event":"rpc-backoff"` more than 10 times in 10 min |
| Tron unhealthy | **P2** | `chain.tron.ok === false` for 5 min |
| DB not configured | **Info** | ingest note mentions `DATABASE_URL` — expected only in misconfig prod |

**Watcher lag definition (ops):** time since last successful tick with `ingest.mode` ≠ `error`. Platform UI “system health” (B17) may surface this later; until then, log alerts suffice.

### 5.4 Webhook delivery backlog

Worker: `apps/api/src/webhooks/webhook-delivery-job.mjs` (interval `WEBHOOK_DELIVERY_INTERVAL_MS`, default 5s).

| Alert | Severity | Condition |
| --- | --- | --- |
| Pending backlog | **P2** | `pending` rows with `next_retry_at < now() - interval '15 minutes'` — count **> 10** |
| Stuck failed | **P3** | `failed` deliveries increasing hour-over-hour |

Run queries in [doc/examples/monitoring-queries.sql](examples/monitoring-queries.sql).

### 5.5 Order and anomaly sanity (daily or on-call dashboard)

Optional **P3** checks (not paging unless prod pilot):

- Open orders past expiry still `pending_payment` (expiry job mis-run)  
- Count of `payment_anomaly` in last 24 h (business signal, not infra)  
- Audit log append rate drops to zero during business hours  

---

## 6. Alert routing

| Severity | Examples | Route |
| --- | --- | --- |
| **P1** | API down, DB degraded, watcher silent | On-call engineer; 24×7 during pilot |
| **P2** | Ingest errors, webhook backlog, Tron backoff | Business-hours on-call + ticket |
| **P3** | Elevated anomalies, disk warnings | Ticket next business day |

Include **test** env alerts routed to a lower-noise channel so integrations are verified before prod.

---

## 7. Logs and retention

| Log type | Location | Retention |
| --- | --- | --- |
| API access / app logs | Company A log stack | Per Company A policy (e.g. 30–90 days) |
| Watcher JSON ticks | stdout → log agent | 7–14 days minimum for lag debugging |
| **`audit_log` table** | Postgres | **Do not truncate** — compliance (M1-17) |
| Postgres provider logs | Cloud console | Match backup retention |

**Never log:** secrets per [M4-02-Secrets-TLS.md](M4-02-Secrets-TLS.md) §5.

---

## 8. Company A handoff checklist

| # | Item | Test | Prod |
| --- | --- | --- | --- |
| 1 | Automated Postgres snapshots enabled | ☐ | ☐ |
| 2 | PITR / WAL enabled (prod) | ☐ | ☐ |
| 3 | Restore drill completed (M4-T04) | ☐ | N/A until prod cutover |
| 4 | `GET /health` synthetic monitor | ☐ | ☐ |
| 5 | Watcher process + log-based lag alert | ☐ | ☐ |
| 6 | Webhook backlog query scheduled | ☐ | ☐ |
| 7 | Alert routes documented (P1/P2) | ☐ | ☐ |
| 8 | Backup access restricted (M4-04) | ☐ | ☐ |

---

## 9. Handoff status

| Deliverable | Status |
| --- | --- |
| Backup strategy + RPO/RTO scaffold | **Done** (this doc) |
| Restore + drill procedure | **Done** (§4) |
| Monitoring alert catalog | **Done** (§5–6) |
| Example SQL | **Done** — [examples/monitoring-queries.sql](examples/monitoring-queries.sql) |
| Vendor-specific IaC | Pending Company A cloud choice |

---

## Related

- Deploy: [M4-01-Deploy-Runbook.md](M4-01-Deploy-Runbook.md)  
- Secrets: [M4-02-Secrets-TLS.md](M4-02-Secrets-TLS.md)  
- Env matrix: [M4-05-Env-Matrix.md](M4-05-Env-Matrix.md)  
- M4 acceptance restore test: Milestone task **M4-T04** in [Milestone-Task-List.md](Milestone-Task-List.md)  
- Watcher contract: [Watcher-Order-Status-Contract.md](Watcher-Order-Status-Contract.md)
